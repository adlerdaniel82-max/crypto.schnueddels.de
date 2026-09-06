"use strict";

const assert = require("node:assert/strict");
const path = require("node:path");
const test = require("node:test");

function loadControllerWithRepoMock(repoMock) {
  const controllerPath = path.resolve(__dirname, "../src/controllers/trader.controller.js");
  const repoPath = path.resolve(__dirname, "../src/repositories/trader.repository.js");
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

test("cycle runs controller returns recent runs from repository", async () => {
  let receivedLimit = null;
  const controller = loadControllerWithRepoMock({
    getConfig: async () => ({ dryRun: true, paused: false, mode: "short", lastCycleAt: null }),
    getOpenPositions: async () => [],
    getRecentCycleRuns: async (limit) => {
      receivedLimit = limit;
      return [{
        id: 1,
        createdAt: "2026-05-09T12:00:00.000Z",
        skipped: false,
        result: {
          buys: 1,
          sells: 0,
          partialSells: 0,
          skippedBuys: 0,
          riskSkipStats: {
            total: 0,
            reasons: [],
            blockers: []
          }
        }
      }];
    }
  });

  const payload = {};
  const res = {
    json(value) {
      payload.body = value;
    }
  };

  await controller.getCycleRuns({ query: { limit: "7" } }, res, (error) => {
    throw error;
  });

  assert.equal(receivedLimit, 50);
  assert.equal(payload.body.items.length, 1);
  assert.equal(payload.body.summary.total_runs, 1);
  assert.equal(payload.body.summary.total_buys, 1);
  assert.equal(payload.body.series.total_runs, 1);
  assert.equal(payload.body.series.points[0].executed, 1);
});
