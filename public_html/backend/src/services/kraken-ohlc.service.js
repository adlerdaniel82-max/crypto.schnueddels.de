"use strict";

const https = require("https");

const BASE_URL = "https://api.kraken.com/0/public/OHLC";
const TIMEFRAME_TO_INTERVAL = {
  "5m": 5,
  "15m": 15,
  "1h": 60,
  "4h": 240,
  "1d": 1440
};

async function fetchCandles(exchangeSymbol, timeframe) {
  const interval = TIMEFRAME_TO_INTERVAL[timeframe];
  if (!interval) {
    throw badRequest(`unsupported_timeframe:${timeframe}`);
  }

  const url = `${BASE_URL}?pair=${encodeURIComponent(exchangeSymbol)}&interval=${interval}`;
  const payload = await fetchJson(url);
  if (!payload || !Array.isArray(payload.error) || payload.error.length) {
    throw serviceUnavailable((payload && payload.error && payload.error.join(",")) || "kraken_ohlc_error");
  }

  const result = payload.result || {};
  const pairKey = Object.keys(result).find((key) => key !== "last");
  if (!pairKey || !Array.isArray(result[pairKey])) {
    throw serviceUnavailable("kraken_ohlc_missing_pair");
  }

  const intervalSeconds = interval * 60;
  const currentBucketOpen = Math.floor(Date.now() / 1000 / intervalSeconds) * intervalSeconds;

  return result[pairKey]
    .map((row) => normalizeRow(row, timeframe, intervalSeconds))
    .filter((row) => row.openTimestamp < currentBucketOpen);
}

function normalizeRow(row, timeframe, intervalSeconds) {
  const openTimestamp = Number(row[0]);
  return {
    timeframe,
    openTimestamp,
    openTime: toSqlDateTime(openTimestamp),
    closeTime: toSqlDateTime(openTimestamp + intervalSeconds),
    openPrice: Number(row[1]),
    highPrice: Number(row[2]),
    lowPrice: Number(row[3]),
    closePrice: Number(row[4]),
    volume: Number(row[6]),
    tradesCount: Number(row[7]),
    rawPayload: row
  };
}

function toSqlDateTime(unixSeconds) {
  return new Date(unixSeconds * 1000).toISOString().slice(0, 19).replace("T", " ");
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
  fetchCandles,
  TIMEFRAME_TO_INTERVAL
};
