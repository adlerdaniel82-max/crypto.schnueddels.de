"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");

const { buildSignalContract } = require("../src/services/signal-contract");

test("signal contract normalizes legacy signal fields for downstream consumers", () => {
  const contract = buildSignalContract({
    signalType: "buy",
    confidenceScore: "82",
    summary: "Trend und Momentum bestaetigen einen moeglichen Einstieg.",
    reasons: ["Kurs oberhalb EMA20 und EMA50"],
    blockerKeys: [],
    stopLossPercent: "5.5",
    takeProfitPercent: "12",
    riskExceeded: false,
    createdAt: "2026-05-09 08:00:00",
    higherTimeframeConfirmation: { timeframe: "1d", trendUp: true }
  });

  assert.deepEqual(contract, {
    version: 1,
    type: "buy",
    confidence: 82,
    summary: "Trend und Momentum bestaetigen einen moeglichen Einstieg.",
    reasons: ["Kurs oberhalb EMA20 und EMA50"],
    blockers: [],
    risk: {
      stopLossPercent: 5.5,
      takeProfitPercent: 12,
      riskExceeded: false
    },
    timing: {
      createdAt: "2026-05-09 08:00:00",
      higherTimeframeConfirmation: { timeframe: "1d", trendUp: true }
    }
  });
});
