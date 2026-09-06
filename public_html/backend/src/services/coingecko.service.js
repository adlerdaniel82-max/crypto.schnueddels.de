"use strict";

const https = require("https");

const BASE_URL = "https://api.coingecko.com/api/v3";
const TIMEFRAME_SECONDS = {
  "5m": 300,
  "15m": 900,
  "1h": 3600,
  "4h": 14400,
  "1d": 86400
};
const RESOLUTION_CACHE = new Map();

async function fetchCandles({ baseAsset, coinName, quoteAsset, timeframe }) {
  const coinId = await resolveCoinId({ baseAsset, coinName, quoteAsset });
  const series = await fetchSeries(coinId, quoteAsset, timeframe);
  return buildCandlesFromSeries(series, timeframe, coinId);
}

async function resolveCoinId({ baseAsset, coinName, quoteAsset }) {
  const cacheKey = `${String(baseAsset).toUpperCase()}::${String(coinName).toLowerCase()}::${String(quoteAsset).toUpperCase()}`;
  if (RESOLUTION_CACHE.has(cacheKey)) {
    return RESOLUTION_CACHE.get(cacheKey);
  }

  const symbol = String(baseAsset || "").trim().toLowerCase();
  const name = String(coinName || "").trim().toLowerCase();
  const vsCurrency = String(quoteAsset || "EUR").trim().toLowerCase();
  const url = `${BASE_URL}/coins/markets?vs_currency=${encodeURIComponent(vsCurrency)}&symbols=${encodeURIComponent(symbol)}&include_tokens=all&per_page=50&page=1&precision=full`;
  const result = await fetchJson(url);

  if (!Array.isArray(result) || !result.length) {
    throw serviceUnavailable("coingecko_coin_not_found");
  }

  const ranked = result
    .map((item) => ({
      item,
      score: rankCoinCandidate(item, symbol, name)
    }))
    .sort((left, right) => {
      if (right.score !== left.score) {
        return right.score - left.score;
      }

      const leftRank = Number.isFinite(Number(left.item.market_cap_rank)) ? Number(left.item.market_cap_rank) : Number.MAX_SAFE_INTEGER;
      const rightRank = Number.isFinite(Number(right.item.market_cap_rank)) ? Number(right.item.market_cap_rank) : Number.MAX_SAFE_INTEGER;
      return leftRank - rightRank;
    });

  const best = ranked[0];
  if (!best || !best.item || !best.item.id) {
    throw serviceUnavailable("coingecko_coin_not_found");
  }

  RESOLUTION_CACHE.set(cacheKey, best.item.id);
  return best.item.id;
}

async function fetchSeries(coinId, quoteAsset, timeframe) {
  const vsCurrency = String(quoteAsset || "EUR").trim().toLowerCase();
  const url = buildMarketChartUrl(coinId, vsCurrency, timeframe);
  const payload = await fetchJson(url);

  if (!payload || !Array.isArray(payload.prices) || !payload.prices.length) {
    throw serviceUnavailable("coingecko_market_chart_missing");
  }

  return {
    prices: payload.prices,
    volumes: Array.isArray(payload.total_volumes) ? payload.total_volumes : []
  };
}

function buildMarketChartUrl(coinId, vsCurrency, timeframe) {
  if (timeframe === "5m" || timeframe === "15m") {
    return `${BASE_URL}/coins/${encodeURIComponent(coinId)}/market_chart?vs_currency=${encodeURIComponent(vsCurrency)}&days=1`;
  }

  return `${BASE_URL}/coins/${encodeURIComponent(coinId)}/market_chart?vs_currency=${encodeURIComponent(vsCurrency)}&days=90&interval=hourly`;
}

function buildCandlesFromSeries(series, timeframe, coinId) {
  const bucketSeconds = TIMEFRAME_SECONDS[timeframe];
  if (!bucketSeconds) {
    throw badRequest(`unsupported_timeframe:${timeframe}`);
  }

  const volumeMap = new Map(
    series.volumes.map((entry) => [Number(entry[0]), Number(entry[1])])
  );
  const buckets = new Map();
  const currentBucketOpen = Math.floor(Date.now() / 1000 / bucketSeconds) * bucketSeconds;

  series.prices.forEach((entry) => {
    const timestampMs = Number(entry[0]);
    const price = Number(entry[1]);
    if (!Number.isFinite(timestampMs) || !Number.isFinite(price) || price <= 0) {
      return;
    }

    const timestampSeconds = Math.floor(timestampMs / 1000);
    const bucketOpen = Math.floor(timestampSeconds / bucketSeconds) * bucketSeconds;
    if (bucketOpen >= currentBucketOpen) {
      return;
    }

    if (!buckets.has(bucketOpen)) {
      buckets.set(bucketOpen, {
        openTimestamp: bucketOpen,
        prices: [],
        volumeSamples: []
      });
    }

    const bucket = buckets.get(bucketOpen);
    bucket.prices.push(price);
    if (volumeMap.has(timestampMs)) {
      bucket.volumeSamples.push(volumeMap.get(timestampMs));
    }
  });

  return Array.from(buckets.values())
    .sort((left, right) => left.openTimestamp - right.openTimestamp)
    .map((bucket) => {
      const openPrice = bucket.prices[0];
      const closePrice = bucket.prices[bucket.prices.length - 1];
      const highPrice = Math.max(...bucket.prices);
      const lowPrice = Math.min(...bucket.prices);
      const averageVolume = bucket.volumeSamples.length
        ? bucket.volumeSamples.reduce((sum, value) => sum + value, 0) / bucket.volumeSamples.length
        : 0;

      return {
        timeframe,
        openTimestamp: bucket.openTimestamp,
        openTime: toSqlDateTime(bucket.openTimestamp),
        closeTime: toSqlDateTime(bucket.openTimestamp + bucketSeconds),
        openPrice,
        highPrice,
        lowPrice,
        closePrice,
        volume: averageVolume,
        tradesCount: null,
        rawPayload: {
          provider: "coingecko",
          coin_id: coinId,
          samples: bucket.prices.length,
          volume_mode: "rolling_average"
        }
      };
    });
}

function rankCoinCandidate(item, symbol, name) {
  let score = 0;
  const itemSymbol = String(item.symbol || "").toLowerCase();
  const itemName = String(item.name || "").toLowerCase();

  if (itemSymbol === symbol) {
    score += 100;
  }
  if (itemName === name) {
    score += 80;
  } else if (name && itemName.includes(name)) {
    score += 40;
  }
  if (item.id && String(item.id).toLowerCase().includes(symbol)) {
    score += 15;
  }

  return score;
}

function fetchJson(url) {
  return new Promise((resolve, reject) => {
    const request = https.get(url, (response) => {
      if (response.statusCode && response.statusCode >= 400) {
        response.resume();
        reject(serviceUnavailable(`coingecko_http_${response.statusCode}`));
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
          reject(serviceUnavailable("coingecko_invalid_json"));
        }
      });
    });

    request.on("error", () => {
      reject(serviceUnavailable("coingecko_unreachable"));
    });
    request.setTimeout(10000, () => {
      request.destroy(serviceUnavailable("coingecko_timeout"));
    });
  });
}

function toSqlDateTime(unixSeconds) {
  return new Date(unixSeconds * 1000).toISOString().slice(0, 19).replace("T", " ");
}

function badRequest(message) {
  const error = new Error(message);
  error.statusCode = 400;
  return error;
}

function serviceUnavailable(message) {
  const error = new Error(message);
  error.statusCode = 503;
  return error;
}

module.exports = {
  fetchCandles
};
