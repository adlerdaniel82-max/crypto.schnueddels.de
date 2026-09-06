"use strict";

const assert = require("node:assert/strict");
const path = require("node:path");
const test = require("node:test");

function loadControllerWithRepoMock(repoMock) {
  const controllerPath = path.resolve(__dirname, "../src/controllers/admin-trader.controller.js");
  const repoPath = path.resolve(__dirname, "../src/repositories/admin-trader.repository.js");
  delete require.cache[controllerPath];
  delete require.cache[repoPath];
  require.cache[repoPath] = {
    id: repoPath,
    filename: repoPath,
    loaded: true,
    exports: repoMock
  };

  return require(controllerPath);
}

test("admin trader cycle runs controller returns summary for the latest runs", async () => {
  let receivedLimit = null;
  const controller = loadControllerWithRepoMock({
    getRecentCycleRuns: async (limit) => {
      receivedLimit = limit;
      return [
        {
          createdAt: "2026-05-09T12:00:00.000Z",
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
        }
      ];
    }
  });

  const payload = {};
  const res = {
    json(value) {
      payload.body = value;
    }
  };

  await controller.getCycleRuns({ query: { limit: "4" } }, res, (error) => {
    throw error;
  });

  assert.equal(receivedLimit, 50);
  assert.equal(payload.body.items.length, 1);
  assert.equal(payload.body.summary.total_runs, 1);
  assert.equal(payload.body.summary.total_buys, 2);
  assert.equal(payload.body.summary.top_risk_skip_reason.key, "signal_blocked");
  assert.equal(payload.body.series.total_runs, 1);
  assert.equal(payload.body.series.points.length, 1);
  assert.equal(payload.body.series.points[0].executed, 3);
});
