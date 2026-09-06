"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");

const { runCoinBacktest } = require("../src/services/backtests.service");

function makeCandles(count) {
  return Array.from({ length: count }, (_, index) => {
    const close = 100 - index;
    const openTime = new Date(Date.UTC(2026, 4, 9, 0, index * 60, 0));
    const closeTime = new Date(Date.UTC(2026, 4, 9, 0, index * 60 + 30, 0));
    return {
      open_price: close + 0.5,
      close_price: close,
      low_price: close - 0.5,
      high_price: close + 1,
      volume: 1000,
      open_time: formatSqlDateTime(openTime),
      close_time: formatSqlDateTime(closeTime)
    };
  });
}

function formatSqlDateTime(value) {
  return value.toISOString().slice(0, 19).replace("T", " ");
}

test("backtest result exposes aggregated risk skip reasons", () => {
  const result = runCoinBacktest({
    coin: { id: 1, symbol: "BTC/EUR", name: "Bitcoin" },
    strategy: {
      setting_key: "test_1h",
      label: "Test 1h",
      timeframe: "1h",
      fast_ema_period: 3,
      slow_ema_period: 5,
      macd_fast_period: 3,
      macd_slow_period: 6,
      macd_signal_period: 3,
      rsi_min: 40,
      rsi_max: 60,
      volume_factor_min: 1.1,
      max_daily_drop_percent: 10,
      stop_loss_percent: 5,
      take_profit_percent: 12
    },
    candles: makeCandles(70),
    lookback: 20
  });

  assert.equal(result.trades_count, 0);
  assert.ok(result.risk_skip_stats.total > 0);
  assert.ok(result.risk_skip_counts.non_buy_signal > 0);
  assert.equal(
    result.risk_skip_stats.reasons.some((item) => item.key === "non_buy_signal"),
    true
  );
});
