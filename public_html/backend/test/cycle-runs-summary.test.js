"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");

const { buildCycleRunsSeries, buildCycleRunsSummary } = require("../../shared/cycle-runs");

test("cycle run summary aggregates the last runs into a compact overview", () => {
  const summary = buildCycleRunsSummary([
    {
      skipped: false,
      result: {
        buys: 2,
        sells: 1,
        partialSells: 0,
        skippedBuys: 3,
        riskSkipStats: {
          total: 3,
          reasons: [{ key: "signal_blocked", count: 2, share_percent: 66.67 }],
          blockers: [{ key: "trend", count: 2, share_percent: 66.67 }]
        }
      }
    },
    {
      skipped: true,
      result: {
        buys: 0,
        sells: 0,
        partialSells: 0,
        skippedBuys: 0,
        riskSkipStats: {
          total: 0,
          reasons: [],
          blockers: []
        }
      }
    },
    {
      skipped: false,
      result: {
        buys: 1,
        sells: 0,
        partialSells: 1,
        skippedBuys: 4,
        riskSkipStats: {
          total: 5,
          reasons: [{ key: "budget_exhausted", count: 3, share_percent: 60 }],
          blockers: [{ key: "volume", count: 3, share_percent: 60 }]
        }
      }
    }
  ]);

  assert.deepEqual(summary, {
    total_runs: 3,
    completed_runs: 2,
    skipped_runs: 1,
    total_buys: 3,
    total_sells: 1,
    total_partial_sells: 1,
    total_skipped_buys: 7,
    total_risk_skips: 8,
    average_buys_per_run: 1,
    average_skipped_buys_per_run: 2.33,
    average_risk_skips_per_run: 2.67,
    top_risk_skip_reason: { key: "budget_exhausted", count: 3, share_percent: 37.5 },
    top_risk_skip_blocker: { key: "volume", count: 3, share_percent: 37.5 }
  });
});

test("cycle run series orders runs chronologically and derives trend values", () => {
  const series = buildCycleRunsSeries([
    {
      createdAt: "2026-05-09T12:00:00.000Z",
      skipped: false,
      dryRun: false,
      result: {
        buys: 2,
        sells: 1,
        partialSells: 1,
        skippedBuys: 4,
        riskSkipStats: {
          total: 5,
          reasons: [],
          blockers: []
        }
      }
    },
    {
      createdAt: "2026-05-09T11:00:00.000Z",
      skipped: true,
      dryRun: true,
      result: {
        buys: 0,
        sells: 1,
        partialSells: 0,
        skippedBuys: 0,
        riskSkipStats: {
          total: 0,
          reasons: [],
          blockers: []
        }
      }
    },
    {
      createdAt: "2026-05-09T10:00:00.000Z",
      skipped: false,
      dryRun: true,
      result: {
        buys: 1,
        sells: 0,
        partialSells: 0,
        skippedBuys: 2,
        riskSkipStats: {
          total: 3,
          reasons: [],
          blockers: []
        }
      }
    }
  ], { limit: 50 });

  assert.equal(series.limit, 50);
  assert.equal(series.total_runs, 3);
  assert.equal(series.points.length, 3);
  assert.deepEqual(series.points.map((point) => point.created_at), [
    "2026-05-09T10:00:00.000Z",
    "2026-05-09T11:00:00.000Z",
    "2026-05-09T12:00:00.000Z"
  ]);
  assert.deepEqual(series.points.map((point) => point.executed), [1, 1, 4]);
  assert.deepEqual(series.points.map((point) => point.blocked), [5, 0, 9]);
  assert.deepEqual(series.points.map((point) => point.risk_skips), [3, 0, 5]);
  assert.equal(series.max_executed, 4);
  assert.equal(series.max_blocked, 9);
  assert.equal(series.first_point.executed, 1);
  assert.equal(series.last_point.executed, 4);
});
