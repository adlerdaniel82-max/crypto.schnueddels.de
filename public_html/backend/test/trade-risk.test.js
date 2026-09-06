"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");

const {
  assessEntryDecision,
  buildRiskSkipStats,
  createRiskSkipCounter,
  recordRiskSkip
} = require("../../shared/trade-risk");

function coin(overrides = {}) {
  return {
    symbol: "BTC/EUR",
    exchange_symbol: "XBTEUR",
    ...overrides
  };
}

function config(overrides = {}) {
  return {
    budgetEur: 300,
    maxPerCoinEur: 100,
    stopLossPercent: 5,
    takeProfitPercent: 12,
    ...overrides
  };
}

function contract(overrides = {}) {
  return {
    type: "buy",
    blockers: [],
    risk: {
      stopLossPercent: 4,
      takeProfitPercent: 10,
      riskExceeded: false
    },
    ...overrides
  };
}

test("shared entry risk guard allows backtest buys without exchange symbols and uses signal risk", () => {
  const decision = assessEntryDecision({
    coin: coin({ exchange_symbol: null }),
    price: 50,
    config: config(),
    signal: contract(),
    openSymbols: new Set(),
    openPositionCount: 0,
    requireExchangeSymbol: false,
    useSignalRisk: true
  });

  assert.equal(decision.action, "buy");
  assert.equal(decision.reason, "entry_allowed");
  assert.equal(decision.volume, 2);
  assert.equal(decision.stopLossPrice, 48);
  assert.equal(decision.takeProfitPrice, 55);
});

test("shared entry risk guard blocks buy contracts with active blockers", () => {
  const decision = assessEntryDecision({
    coin: coin(),
    price: 50,
    config: config(),
    signal: contract({ blockers: ["higher_tf_trend"] }),
    openSymbols: new Set(),
    openPositionCount: 0
  });

  assert.equal(decision.action, "skip");
  assert.equal(decision.reason, "signal_blocked");
});

test("shared entry risk guard blocks entries when configured budget is exhausted", () => {
  const decision = assessEntryDecision({
    coin: coin({ symbol: "ETH/EUR", exchange_symbol: "ETHEUR" }),
    price: 100,
    config: config({ budgetEur: 250, maxPerCoinEur: 100 }),
    signal: contract(),
    openSymbols: new Set(["BTC/EUR", "SOL/EUR"]),
    openPositionCount: 2
  });

  assert.equal(decision.action, "skip");
  assert.equal(decision.reason, "budget_exhausted");
  assert.equal(decision.remainingBudgetEur, 50);
});

test("shared risk skip stats aggregate decision reasons and signal blockers", () => {
  const counter = createRiskSkipCounter();

  recordRiskSkip(counter, { reason: "signal_blocked", blockers: ["trend", "volume"] });
  recordRiskSkip(counter, { reason: "signal_blocked", blockers: ["trend"] });
  recordRiskSkip(counter, { reason: "budget_exhausted" });

  assert.deepEqual(counter.reasonCounts, {
    signal_blocked: 2,
    budget_exhausted: 1
  });
  assert.deepEqual(counter.blockerCounts, {
    trend: 2,
    volume: 1
  });
  assert.equal(counter.total, 3);
  assert.deepEqual(buildRiskSkipStats(counter), {
    total: 3,
    reasons: [
      { key: "signal_blocked", count: 2, share_percent: 66.67 },
      { key: "budget_exhausted", count: 1, share_percent: 33.33 }
    ],
    blockers: [
      { key: "trend", count: 2, share_percent: 66.67 },
      { key: "volume", count: 1, share_percent: 33.33 }
    ]
  });
});
