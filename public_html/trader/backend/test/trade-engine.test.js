"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");

process.env.NODE_ENV = "test";

const {
  assessEntryDecision,
  assessExitDecision
} = require("../src/engine/trade-engine");

function position(overrides = {}) {
  return {
    coinSymbol: "BTC/EUR",
    entryPrice: 100,
    stopLossPrice: 90,
    ...overrides
  };
}

function config(overrides = {}) {
  return {
    budgetEur: 300,
    maxPerCoinEur: 100,
    stopLossPercent: 5,
    ...overrides
  };
}

function coin(overrides = {}) {
  return {
    symbol: "BTC/EUR",
    exchange_symbol: "XBTEUR",
    ...overrides
  };
}

test("entry risk guard allows a valid buy and calculates volume and stop loss", () => {
  const decision = assessEntryDecision({
    coin: coin(),
    price: 50,
    config: config(),
    openSymbols: new Set(),
    openPositionCount: 1
  });

  assert.equal(decision.action, "buy");
  assert.equal(decision.reason, "entry_allowed");
  assert.equal(decision.budgetEur, 100);
  assert.equal(decision.volume, 2);
  assert.equal(decision.stopLossPrice, 47.5);
});

test("entry risk guard skips coins that already have an open position", () => {
  const decision = assessEntryDecision({
    coin: coin(),
    price: 50,
    config: config(),
    openSymbols: new Set(["BTC/EUR"]),
    openPositionCount: 1
  });

  assert.equal(decision.action, "skip");
  assert.equal(decision.reason, "open_position");
});

test("entry risk guard skips when the remaining budget cannot fund the configured position size", () => {
  const decision = assessEntryDecision({
    coin: coin({ symbol: "ETH/EUR", exchange_symbol: "ETHEUR" }),
    price: 100,
    config: config({ budgetEur: 250, maxPerCoinEur: 100 }),
    openSymbols: new Set(["BTC/EUR", "SOL/EUR"]),
    openPositionCount: 2
  });

  assert.equal(decision.action, "skip");
  assert.equal(decision.reason, "budget_exhausted");
  assert.equal(decision.remainingBudgetEur, 50);
});

test("entry risk guard skips invalid risk configuration", () => {
  const decision = assessEntryDecision({
    coin: coin(),
    price: 50,
    config: config({ stopLossPercent: 0 }),
    openSymbols: new Set(),
    openPositionCount: 0
  });

  assert.equal(decision.action, "skip");
  assert.equal(decision.reason, "invalid_stop_loss");
});

test("keeps a loss-making position on sell signal when the long trend is positive", () => {
  const decision = assessExitDecision({
    position: position(),
    currentPrice: 95,
    isStopLoss: false,
    sellSignal: { active: true, timeframe: "4h", signalCreatedAt: "2026-05-08 10:00:00" },
    longTermTrend: { positive: true, timeframe: "1d", signalType: "buy" }
  });

  assert.equal(decision.action, "hold");
  assert.equal(decision.reason, "hold_loss_positive_trend");
  assert.equal(decision.shouldNotify, true);
  assert.equal(decision.unrealizedProfitPercent, -5);
});

test("sells a profitable position on sell signal even when the long trend is positive", () => {
  const decision = assessExitDecision({
    position: position(),
    currentPrice: 105,
    isStopLoss: false,
    sellSignal: { active: true, timeframe: "4h", signalCreatedAt: "2026-05-08 10:00:00" },
    longTermTrend: { positive: true, timeframe: "1d", signalType: "buy" }
  });

  assert.equal(decision.action, "sell");
  assert.equal(decision.reason, "signal_sell_profit");
  assert.equal(decision.shouldNotify, false);
  assert.equal(decision.unrealizedProfitPercent, 5);
});

test("sells a loss-making position on sell signal when long trend is not positive", () => {
  const decision = assessExitDecision({
    position: position(),
    currentPrice: 95,
    isStopLoss: false,
    sellSignal: { active: true, timeframe: "4h", signalCreatedAt: "2026-05-08 10:00:00" },
    longTermTrend: { positive: false, timeframe: "1d", signalType: "sell" }
  });

  assert.equal(decision.action, "sell");
  assert.equal(decision.reason, "signal_sell_loss_trend_confirmed");
  assert.equal(decision.shouldNotify, false);
});

test("stop loss remains a hard sell even when the long trend is positive", () => {
  const decision = assessExitDecision({
    position: position(),
    currentPrice: 89,
    isStopLoss: true,
    isTakeProfit: false,
    sellSignal: { active: false },
    longTermTrend: { positive: true, timeframe: "1d", signalType: "buy" }
  });

  assert.equal(decision.action, "sell");
  assert.equal(decision.reason, "stop_loss");
  assert.equal(decision.shouldNotify, false);
});

test("take profit is a hard sell even without a sell signal", () => {
  const decision = assessExitDecision({
    position: position({ takeProfitPrice: 112 }),
    currentPrice: 112,
    isStopLoss: false,
    isTakeProfit: true,
    sellSignal: { active: false },
    longTermTrend: { positive: true, timeframe: "1d", signalType: "buy" }
  });

  assert.equal(decision.action, "sell");
  assert.equal(decision.reason, "take_profit");
  assert.equal(decision.shouldNotify, false);
  assert.equal(decision.unrealizedProfitPercent, 12);
});

test("keeps old behavior when an entry price is missing", () => {
  const decision = assessExitDecision({
    position: position({ entryPrice: null }),
    currentPrice: 95,
    isStopLoss: false,
    isTakeProfit: false,
    sellSignal: { active: true, timeframe: "4h", signalCreatedAt: "2026-05-08 10:00:00" },
    longTermTrend: { positive: true, timeframe: "1d", signalType: "buy" }
  });

  assert.equal(decision.action, "sell");
  assert.equal(decision.reason, "signal_sell_no_entry_price");
  assert.equal(decision.shouldNotify, false);
});
