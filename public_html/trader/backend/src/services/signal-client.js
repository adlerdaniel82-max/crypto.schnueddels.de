"use strict";

const env = require("../config/env");

async function fetchCoins() {
  const response = await fetch(`${env.signalBaseUrl}/api/coins`, {
    headers: { Accept: "application/json" },
    signal: AbortSignal.timeout(10000)
  });

  if (!response.ok) {
    throw new Error(`signal_api_error_${response.status}`);
  }

  const data = await response.json();
  return Array.isArray(data.items) ? data.items : [];
}

function getPrimaryTimeframe(mode) {
  return mode === "short" ? "4h" : "1d";
}

function getEntryTimeframe(mode) {
  return mode === "short" ? "1h" : "4h";
}

function getEntryReadyCoins(coins, mode) {
  const primary = getPrimaryTimeframe(mode);
  const entry = getEntryTimeframe(mode);
  return coins.filter((coin) => {
    const tfPrimary = coin.timeframes && coin.timeframes[primary];
    const tfEntry = coin.timeframes && coin.timeframes[entry];
    return tfPrimary && tfEntry &&
      tfPrimary.signal_type === "buy" &&
      tfEntry.signal_type === "buy";
  });
}

function getEntrySignalContract(coin, mode) {
  const entry = getEntryTimeframe(mode);
  const tfEntry = coin.timeframes && coin.timeframes[entry];
  if (!tfEntry) {
    return null;
  }

  return tfEntry.signal_contract || {
    type: tfEntry.signal_type || null,
    blockers: [],
    risk: {
      riskExceeded: false
    }
  };
}

function hasSellSignal(coin, mode) {
  return getSellSignalDetails(coin, mode).active;
}

function getSellSignalDetails(coin, mode) {
  const primary = getPrimaryTimeframe(mode);
  const entry = getEntryTimeframe(mode);
  const tfPrimary = coin.timeframes && coin.timeframes[primary];
  const tfEntry = coin.timeframes && coin.timeframes[entry];
  const hits = [];

  if (tfPrimary && tfPrimary.signal_type === "sell") {
    hits.push({ timeframe: primary, signalCreatedAt: tfPrimary.signal_created_at || null });
  }

  if (tfEntry && tfEntry.signal_type === "sell") {
    hits.push({ timeframe: entry, signalCreatedAt: tfEntry.signal_created_at || null });
  }

  return {
    active: hits.length > 0,
    timeframe: hits[0] ? hits[0].timeframe : null,
    signalCreatedAt: hits[0] ? hits[0].signalCreatedAt : null,
    hits
  };
}

function getLongTermTrend(coin, mode) {
  const primary = getPrimaryTimeframe(mode);
  const candidates = ["1w", "1d", primary].filter((timeframe, index, list) => list.indexOf(timeframe) === index);

  for (const timeframe of candidates) {
    const tf = coin.timeframes && coin.timeframes[timeframe];
    if (!tf) continue;

    return {
      timeframe,
      signalType: tf.signal_type || null,
      positive: isPositiveTrend(tf)
    };
  }

  return {
    timeframe: null,
    signalType: null,
    positive: false
  };
}

function isPositiveTrend(timeframeData) {
  if (!timeframeData) return false;
  if (timeframeData.signal_type === "buy") return true;

  if (timeframeData.signal_type !== "watch") return false;

  const closePrice = timeframeData.close_price != null ? Number(timeframeData.close_price) : null;
  const emaSlow = timeframeData.ema_slow != null ? Number(timeframeData.ema_slow) : null;
  const rsi = timeframeData.rsi_value != null ? Number(timeframeData.rsi_value) : null;

  return closePrice != null &&
    emaSlow != null &&
    rsi != null &&
    closePrice >= emaSlow &&
    rsi >= 50;
}

function getClosePrice(coin, timeframe) {
  const tf = coin.timeframes && coin.timeframes[timeframe];
  return tf && tf.close_price != null ? Number(tf.close_price) : null;
}

async function isSignalApiReachable() {
  try {
    const response = await fetch(`${env.signalBaseUrl}/api/health`, {
      signal: AbortSignal.timeout(3000)
    });
    return response.ok;
  } catch {
    return false;
  }
}

module.exports = {
  fetchCoins,
  getPrimaryTimeframe,
  getEntryTimeframe,
  getEntryReadyCoins,
  getEntrySignalContract,
  getSellSignalDetails,
  getLongTermTrend,
  hasSellSignal,
  getClosePrice,
  isSignalApiReachable
};
