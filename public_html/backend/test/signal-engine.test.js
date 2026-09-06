"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");

const { buildSignal, evaluateSignalConditions } = require("../src/services/signal-engine.service");

function makeCandles(closes, volume = 1000) {
  return closes.map((close, index) => ({
    close_price: close,
    volume: index >= closes.length - 10 ? volume * 1.2 : volume,
    close_time: `2026-05-09 10:${String(index).padStart(2, "0")}:00`
  }));
}

test("signal engine returns a contract that mirrors the live signal output", () => {
  const strategy = {
    fast_ema_period: 3,
    slow_ema_period: 5,
    macd_fast_period: 3,
    macd_slow_period: 6,
    macd_signal_period: 3,
    rsi_min: 30,
    rsi_max: 70,
    volume_factor_min: 0.8,
    max_daily_drop_percent: 50,
    stop_loss_percent: 5,
    take_profit_percent: 12
  };

  const candles = makeCandles([
    100, 101, 100, 102, 101, 103, 102, 104, 103, 105,
    104, 106, 105, 107, 106, 108, 107, 109, 108, 110
  ]);

  const signal = buildSignal({ candles, strategy });

  assert.ok(signal);
  assert.ok(signal.contract);
  assert.equal(signal.contract.version, 1);
  assert.equal(signal.contract.type, signal.signalType);
  assert.equal(signal.contract.confidence, signal.confidenceScore);
  assert.equal(signal.contract.summary, signal.summary);
  assert.deepEqual(signal.contract.reasons, signal.reasons);
  assert.deepEqual(signal.contract.blockers, signal.blockerKeys);
  assert.equal(signal.contract.risk.stopLossPercent, signal.stopLossPercent);
  assert.equal(signal.contract.risk.takeProfitPercent, signal.takeProfitPercent);
  assert.equal(signal.contract.timing.createdAt, signal.createdAt);
});

test("signal engine exposes buy blockers when the setup is incomplete", () => {
  const strategy = {
    fast_ema_period: 3,
    slow_ema_period: 5,
    macd_fast_period: 3,
    macd_slow_period: 6,
    macd_signal_period: 3,
    rsi_min: 40,
    rsi_max: 60,
    volume_factor_min: 1.5,
    max_daily_drop_percent: 10,
    stop_loss_percent: 5,
    take_profit_percent: 12
  };

  const candles = makeCandles([
    100, 99, 100, 98, 99, 97, 98, 96, 97, 95,
    96, 94, 95, 93, 94, 92, 93, 91, 92, 90
  ], 100);

  const analysis = evaluateSignalConditions({ candles, strategy });
  assert.ok(analysis);
  assert.ok(Array.isArray(Object.keys(analysis.buyChecks)));

  const signal = buildSignal({ candles, strategy });
  assert.ok(signal.contract.blockers.length > 0);
  assert.equal(signal.contract.type, signal.signalType);
});
