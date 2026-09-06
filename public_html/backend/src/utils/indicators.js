"use strict";

function average(values) {
  if (!Array.isArray(values) || !values.length) {
    return null;
  }

  const total = values.reduce((sum, value) => sum + Number(value), 0);
  return total / values.length;
}

function ema(values, period) {
  if (!Array.isArray(values) || !values.length || !period || period <= 0) {
    return null;
  }

  const multiplier = 2 / (period + 1);
  let current = Number(values[0]);

  for (let index = 1; index < values.length; index += 1) {
    const value = Number(values[index]);
    current = (value - current) * multiplier + current;
  }

  return current;
}

function emaSeries(values, period) {
  if (!Array.isArray(values) || !values.length || !period || period <= 0) {
    return [];
  }

  const series = [];
  const multiplier = 2 / (period + 1);
  let current = Number(values[0]);

  series.push(current);

  for (let index = 1; index < values.length; index += 1) {
    const value = Number(values[index]);
    current = (value - current) * multiplier + current;
    series.push(current);
  }

  return series;
}

function rsi(values, period) {
  if (!Array.isArray(values) || values.length <= period) {
    return null;
  }

  let gains = 0;
  let losses = 0;

  for (let index = 1; index <= period; index += 1) {
    const change = Number(values[index]) - Number(values[index - 1]);
    if (change >= 0) {
      gains += change;
    } else {
      losses += Math.abs(change);
    }
  }

  if (losses === 0) {
    return 100;
  }

  const relativeStrength = (gains / period) / (losses / period);
  return 100 - (100 / (1 + relativeStrength));
}

function macd(values, fastPeriod, slowPeriod, signalPeriod) {
  if (!Array.isArray(values) || values.length < Math.max(fastPeriod, slowPeriod, signalPeriod)) {
    return null;
  }

  const fastSeries = emaSeries(values, fastPeriod);
  const slowSeries = emaSeries(values, slowPeriod);
  if (!fastSeries.length || !slowSeries.length) {
    return null;
  }

  const macdSeries = fastSeries.map((fastValue, index) => fastValue - slowSeries[index]);
  const signalSeries = emaSeries(macdSeries, signalPeriod);
  if (!signalSeries.length) {
    return null;
  }

  return {
    value: macdSeries[macdSeries.length - 1],
    signal: signalSeries[signalSeries.length - 1],
    histogram: macdSeries[macdSeries.length - 1] - signalSeries[signalSeries.length - 1]
  };
}

module.exports = {
  average,
  ema,
  emaSeries,
  rsi,
  macd
};
