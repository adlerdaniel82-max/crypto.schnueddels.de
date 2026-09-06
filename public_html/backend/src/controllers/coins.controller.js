"use strict";

const path = require("path");
const { execFile } = require("child_process");
const coinsRepository = require("../repositories/coins.repository");
const krakenPairsService = require("../services/kraken-pairs.service");
const TIMEFRAMES = new Set(["5m", "15m", "1h", "4h", "1d"]);
const REFRESH_SCRIPT = path.resolve(__dirname, "../../../../private/.scripts/refresh_market.sh");

async function listCoins(req, res, next) {
  try {
    const items = await coinsRepository.listActiveCoins();
    res.json({ items });
  } catch (error) {
    next(error);
  }
}

async function getCoin(req, res, next) {
  try {
    const coin = await coinsRepository.getCoinBySymbol(req.params.symbol);
    if (!coin) {
      res.status(404).json({ error: "coin_not_found" });
      return;
    }

    res.json(coin);
  } catch (error) {
    next(error);
  }
}

async function listCoinCandles(req, res, next) {
  try {
    const symbol = req.params.symbol || req.query.symbol;
    if (!symbol) {
      res.status(400).json({ error: "missing_symbol" });
      return;
    }

    const timeframe = req.query.timeframe || "4h";
    if (!TIMEFRAMES.has(timeframe)) {
      res.status(400).json({ error: "invalid_timeframe" });
      return;
    }
    const limit = req.query.limit || 120;
    const items = await coinsRepository.getCoinCandles(symbol, timeframe, limit);
    res.json({
      symbol,
      timeframe,
      items
    });
  } catch (error) {
    next(error);
  }
}

async function listAllCoins(req, res, next) {
  try {
    const items = await coinsRepository.listAllCoins();
    res.json({ items });
  } catch (error) {
    next(error);
  }
}

async function listKrakenPairs(req, res, next) {
  try {
    const quoteAsset = String(req.query.quote_asset || "EUR").trim().toUpperCase();
    const items = await krakenPairsService.listAvailablePairs({ quoteAsset });
    res.json({ items });
  } catch (error) {
    if (error.statusCode) {
      res.status(error.statusCode).json({ error: error.message });
      return;
    }

    next(error);
  }
}

async function createCoin(req, res, next) {
  try {
    const payload = normalizeCoinPayload(req.body || {});
    const validation = await krakenPairsService.validatePair(payload);
    if (!validation.ok) {
      res.status(validation.error === "kraken_pair_not_online" ? 409 : 400).json({
        error: validation.error,
        pair: validation.pair || null
      });
      return;
    }

    const insertId = await coinsRepository.createCoin(payload);
    const items = await coinsRepository.listAllCoins();
    const created = items.find((item) => item.id === insertId) || null;

    res.status(201).json({
      item: created
    });
  } catch (error) {
    if (error.code === "ER_DUP_ENTRY") {
      res.status(409).json({ error: "coin_already_exists" });
      return;
    }

    if (error.statusCode) {
      res.status(error.statusCode).json({ error: error.message });
      return;
    }

    next(error);
  }
}

async function updateCoinState(req, res, next) {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) {
      res.status(400).json({ error: "invalid_coin_id" });
      return;
    }

    const payload = normalizeCoinUpdatePayload(req.body || {});
    const updated = await coinsRepository.updateCoinAdminSettings(id, payload);
    if (!updated) {
      res.status(404).json({ error: "coin_not_found" });
      return;
    }

    const items = await coinsRepository.listAllCoins();
    const coin = items.find((item) => item.id === id) || null;
    res.json({ item: coin });
  } catch (error) {
    next(error);
  }
}

async function deleteCoin(req, res, next) {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) {
      res.status(400).json({ error: "invalid_coin_id" });
      return;
    }

    const deleted = await coinsRepository.deleteCoin(id);
    if (!deleted) {
      res.status(404).json({ error: "coin_not_found" });
      return;
    }

    res.status(204).end();
  } catch (error) {
    next(error);
  }
}

async function refreshMarket(req, res, next) {
  try {
    const result = await runRefreshMarket();
    res.json({
      ok: true,
      stdout: result.stdout.slice(-2000)
    });
  } catch (error) {
    if (error.statusCode) {
      res.status(error.statusCode).json({ error: error.message });
      return;
    }

    next(error);
  }
}

function normalizeCoinPayload(body) {
  const baseAsset = String(body.base_asset || "").trim().toUpperCase();
  const quoteAsset = String(body.quote_asset || "EUR").trim().toUpperCase();
  const name = String(body.name || "").trim();
  const exchangeSymbol = String(body.exchange_symbol || "").trim().toUpperCase();
  const defaultTimeframe = String(body.default_timeframe || "4h").trim();
  const sortOrder = Number(body.sort_order || 100);
  const isActive = body.is_active === undefined ? true : Boolean(body.is_active);

  if (!/^[A-Z0-9]{1,12}$/.test(baseAsset)) {
    throw badRequest("invalid_base_asset");
  }

  if (!/^[A-Z0-9]{2,12}$/.test(quoteAsset)) {
    throw badRequest("invalid_quote_asset");
  }

  if (!name || name.length > 128) {
    throw badRequest("invalid_name");
  }

  if (!/^[A-Z0-9._-]{3,32}$/.test(exchangeSymbol)) {
    throw badRequest("invalid_exchange_symbol");
  }

  if (!TIMEFRAMES.has(defaultTimeframe)) {
    throw badRequest("invalid_default_timeframe");
  }

  if (!Number.isInteger(sortOrder) || sortOrder < 1 || sortOrder > 9999) {
    throw badRequest("invalid_sort_order");
  }

  return {
    symbol: `${baseAsset}/${quoteAsset}`,
    baseAsset,
    quoteAsset,
    name,
    exchangeSymbol,
    defaultTimeframe,
    isActive,
    sortOrder
  };
}

function normalizeCoinUpdatePayload(body) {
  const payload = {};

  if (body.is_active !== undefined) {
    payload.isActive = Boolean(body.is_active);
  }

  if (body.default_timeframe !== undefined) {
    const defaultTimeframe = String(body.default_timeframe || "").trim();
    if (!TIMEFRAMES.has(defaultTimeframe)) {
      throw badRequest("invalid_default_timeframe");
    }

    payload.defaultTimeframe = defaultTimeframe;
  }

  if (body.sort_order !== undefined) {
    const sortOrder = Number(body.sort_order);
    if (!Number.isInteger(sortOrder) || sortOrder < 1 || sortOrder > 9999) {
      throw badRequest("invalid_sort_order");
    }

    payload.sortOrder = sortOrder;
  }

  if (body.strategy_key !== undefined) {
    const strategyKey = body.strategy_key ? String(body.strategy_key).trim() : null;
    if (strategyKey && !/^[a-z0-9_-]{1,64}$/.test(strategyKey)) {
      throw badRequest("invalid_strategy_key");
    }

    payload.strategyKey = strategyKey;
  }

  if (!Object.keys(payload).length) {
    throw badRequest("invalid_update_payload");
  }

  return payload;
}

function badRequest(message) {
  const error = new Error(message);
  error.statusCode = 400;
  return error;
}

function runRefreshMarket() {
  return new Promise((resolve, reject) => {
    execFile(REFRESH_SCRIPT, {
      cwd: path.resolve(__dirname, "../.."),
      timeout: 120000,
      maxBuffer: 1024 * 1024
    }, (error, stdout, stderr) => {
      if (error) {
        const refreshError = new Error(stderr || error.message || "refresh_market_failed");
        refreshError.statusCode = 500;
        reject(refreshError);
        return;
      }

      resolve({ stdout, stderr });
    });
  });
}

module.exports = {
  listCoins,
  getCoin,
  listCoinCandles,
  listAllCoins,
  listKrakenPairs,
  createCoin,
  updateCoinState,
  deleteCoin,
  refreshMarket
};
