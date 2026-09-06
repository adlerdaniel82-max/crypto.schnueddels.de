"use strict";

const https = require("https");

const KRAKEN_ASSET_PAIRS_URL = "https://api.kraken.com/0/public/AssetPairs";
const CACHE_TTL_MS = 10 * 60 * 1000;

let cache = {
  expiresAt: 0,
  pairs: []
};

async function validatePair({ baseAsset, quoteAsset, exchangeSymbol }) {
  const pairs = await listPairs();
  const normalizedBase = normalizeAssetCode(baseAsset);
  const normalizedQuote = normalizeAssetCode(quoteAsset);
  const normalizedExchangeSymbol = String(exchangeSymbol || "").trim().toUpperCase();

  const byExchangeSymbol = pairs.find((pair) => pair.matchesSymbol(normalizedExchangeSymbol));
  if (byExchangeSymbol) {
    if (!byExchangeSymbol.isOnline) {
      return {
        ok: false,
        error: "kraken_pair_not_online",
        pair: pairSummary(byExchangeSymbol)
      };
    }

    if (byExchangeSymbol.baseAsset !== normalizedBase || byExchangeSymbol.quoteAsset !== normalizedQuote) {
      return {
        ok: false,
        error: "kraken_pair_mismatch",
        pair: pairSummary(byExchangeSymbol)
      };
    }

    return {
      ok: true,
      pair: pairSummary(byExchangeSymbol)
    };
  }

  const byAssets = pairs.find((pair) => pair.baseAsset === normalizedBase && pair.quoteAsset === normalizedQuote);
  if (byAssets) {
    return {
      ok: false,
      error: byAssets.isOnline ? "kraken_exchange_symbol_unknown" : "kraken_pair_not_online",
      pair: pairSummary(byAssets)
    };
  }

  return {
    ok: false,
    error: "kraken_pair_unavailable"
  };
}

async function listAvailablePairs({ quoteAsset } = {}) {
  const pairs = await listPairs();
  const normalizedQuote = quoteAsset ? normalizeAssetCode(quoteAsset) : "";

  return pairs
    .filter((pair) => pair.isOnline)
    .filter((pair) => !normalizedQuote || pair.quoteAsset === normalizedQuote)
    .filter((pair) => pair.baseAsset && pair.quoteAsset)
    .map((pair) => ({
      ...pairSummary(pair),
      symbol: `${pair.baseAsset}/${pair.quoteAsset}`,
      name: resolveAssetName(pair.baseAsset)
    }))
    .sort((a, b) => a.symbol.localeCompare(b.symbol, "de"));
}

async function listPairs() {
  if (cache.expiresAt > Date.now() && cache.pairs.length) {
    return cache.pairs;
  }

  const response = await fetchJson(KRAKEN_ASSET_PAIRS_URL);
  if (!response || !Array.isArray(response.error) || response.error.length) {
    const message = Array.isArray(response && response.error) ? response.error.join(", ") : "kraken_api_error";
    throw serviceUnavailable(message || "kraken_api_error");
  }

  const result = response.result || {};
  const pairs = Object.entries(result).map(([restKey, pair]) => normalizePair(restKey, pair));

  cache = {
    expiresAt: Date.now() + CACHE_TTL_MS,
    pairs
  };

  return pairs;
}

function normalizePair(restKey, pair) {
  const wsname = String(pair.wsname || "").toUpperCase();
  const wsParts = wsname.includes("/") ? wsname.split("/") : [];
  const wsBase = wsParts[0] || "";
  const wsQuote = wsParts[1] || "";
  const baseAsset = normalizeAssetCode(wsBase || pair.base);
  const quoteAsset = normalizeAssetCode(wsQuote || pair.quote);
  const altname = String(pair.altname || "").toUpperCase();

  return {
    restKey: String(restKey).toUpperCase(),
    altname,
    wsname,
    baseAsset,
    quoteAsset,
    isOnline: String(pair.status || "").toLowerCase() === "online",
    matchesSymbol(symbol) {
      return symbol === this.restKey || symbol === this.altname;
    }
  };
}

function pairSummary(pair) {
  return {
    rest_key: pair.restKey,
    altname: pair.altname,
    wsname: pair.wsname,
    base_asset: pair.baseAsset,
    quote_asset: pair.quoteAsset
  };
}

function normalizeAssetCode(value) {
  const input = String(value || "")
    .trim()
    .toUpperCase()
    .replace(/\s+/g, "")
    .replace(/\//g, "");

  const aliasMap = {
    XBT: "BTC",
    XXBT: "BTC",
    XDG: "DOGE",
    XXDG: "DOGE",
    XETH: "ETH",
    XXRP: "XRP",
    ZEUR: "EUR",
    ZUSD: "USD",
    ZGBP: "GBP",
    ZCAD: "CAD",
    ZJPY: "JPY",
    ZCHF: "CHF",
    ZAUD: "AUD"
  };

  return aliasMap[input] || input;
}

function resolveAssetName(baseAsset) {
  const names = {
    "1INCH": "1inch",
    AAVE: "Aave",
    ADA: "Cardano",
    ALGO: "Algorand",
    APE: "ApeCoin",
    ATOM: "Cosmos",
    AVAX: "Avalanche",
    BCH: "Bitcoin Cash",
    BTC: "Bitcoin",
    COMP: "Compound",
    DOGE: "Dogecoin",
    DOT: "Polkadot",
    ETC: "Ethereum Classic",
    ETH: "Ethereum",
    FIL: "Filecoin",
    ICP: "Internet Computer",
    LINK: "Chainlink",
    LTC: "Litecoin",
    MANA: "Decentraland",
    MATIC: "Polygon",
    MKR: "Maker",
    NEAR: "NEAR Protocol",
    OP: "Optimism",
    PAXG: "PAX Gold",
    SAND: "The Sandbox",
    SHIB: "Shiba Inu",
    SOL: "Solana",
    SUI: "Sui",
    UNI: "Uniswap",
    USDC: "USD Coin",
    USDT: "Tether",
    XLM: "Stellar",
    XMR: "Monero",
    XRP: "Ripple",
    XTZ: "Tezos"
  };

  return names[baseAsset] || baseAsset;
}

function fetchJson(url) {
  return new Promise((resolve, reject) => {
    const request = https.get(url, (response) => {
      if (response.statusCode && response.statusCode >= 400) {
        response.resume();
        reject(serviceUnavailable(`kraken_http_${response.statusCode}`));
        return;
      }

      let body = "";
      response.setEncoding("utf8");

      response.on("data", (chunk) => {
        body += chunk;
      });

      response.on("end", () => {
        try {
          resolve(JSON.parse(body));
        } catch (error) {
          reject(serviceUnavailable("kraken_invalid_json"));
        }
      });
    });

    request.on("error", () => {
      reject(serviceUnavailable("kraken_unreachable"));
    });

    request.setTimeout(10000, () => {
      request.destroy(serviceUnavailable("kraken_timeout"));
    });
  });
}

function serviceUnavailable(message) {
  const error = new Error(message);
  error.statusCode = 503;
  return error;
}

module.exports = {
  listAvailablePairs,
  validatePair
};
