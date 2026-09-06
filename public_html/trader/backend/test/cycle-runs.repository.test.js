"use strict";

const assert = require("node:assert/strict");
const path = require("node:path");
const test = require("node:test");

function loadRepositoryWithDbMock(queryImpl) {
  const repoPath = path.resolve(__dirname, "../src/repositories/trader.repository.js");
  const dbPath = path.resolve(__dirname, "../src/config/db.js");
  delete require.cache[repoPath];
  delete require.cache[dbPath];
  require.cache[dbPath] = {
    id: dbPath,
    filename: dbPath,
    loaded: true,
    exports: {
      query: queryImpl
    }
  };

  return require(repoPath);
}

test("cycle run repository stores and reads structured paper-trading metrics", async () => {
  const queries = [];
  const repo = loadRepositoryWithDbMock(async (sql, params) => {
    queries.push({ sql, params });
    if (sql.includes("INSERT INTO trader_cycle_runs")) {
      return [{ insertId: 7 }];
    }
    if (sql.includes("FROM trader_cycle_runs")) {
      return [[{
        id: 7,
        mode: "short",
        dry_run: 1,
        skipped: 0,
        skip_reason: null,
        result_json: JSON.stringify({
          buys: 1,
          skippedBuys: 3,
          riskSkipCounts: { signal_blocked: 2, budget_exhausted: 1 },
          riskSkipBlockerCounts: { trend: 2 },
          riskSkipStats: {
            total: 3,
            reasons: [{ key: "signal_blocked", count: 2, share_percent: 66.67 }],
            blockers: [{ key: "trend", count: 2, share_percent: 66.67 }]
          }
        }),
        created_at: "2026-05-09 12:00:00.000"
      }]];
    }
    throw new Error(`unexpected query: ${sql}`);
  });

  const insertedId = await repo.recordCycleRun({
    config: { mode: "short", dryRun: true },
    result: {
      buys: 1,
      skippedBuys: 3,
      riskSkipCounts: { signal_blocked: 2, budget_exhausted: 1 },
      riskSkipBlockerCounts: { trend: 2 },
      riskSkipStats: {
        total: 3,
        reasons: [{ key: "signal_blocked", count: 2, share_percent: 66.67 }],
        blockers: [{ key: "trend", count: 2, share_percent: 66.67 }]
      }
    }
  });

  const runs = await repo.getRecentCycleRuns(5);

  assert.equal(insertedId, 7);
  assert.equal(queries[0].sql.includes("INSERT INTO trader_cycle_runs"), true);
  assert.equal(queries[1].sql.includes("FROM trader_cycle_runs"), true);
  assert.equal(runs.length, 1);
  assert.equal(runs[0].id, 7);
  assert.equal(runs[0].mode, "short");
  assert.equal(runs[0].result.buys, 1);
  assert.equal(runs[0].result.riskSkipStats.total, 3);
});

test("order repository paginates recent orders and returns total counts", async () => {
  const queries = [];
  const repo = loadRepositoryWithDbMock(async (sql, params) => {
    queries.push({ sql, params });
    if (sql.includes("COUNT(*) AS total")) {
      return [[{ total: 23 }]];
    }
    if (sql.includes("FROM trade_orders")) {
      return [[
        {
          id: 12,
          coin_symbol: "BTC",
          side: "buy",
          kraken_pair: "XBTEUR",
          volume: "0.25",
          price_estimate: "51234.56",
          kraken_txid: "TX123",
          dry_run: 1,
          status: "simulated",
          signal_reason: "entry_ok",
          created_at: "2026-05-09 11:30:00.000"
        }
      ]];
    }
    throw new Error(`unexpected query: ${sql}`);
  });

  const page = await repo.getRecentOrdersPage(3, 10);

  assert.equal(queries[0].sql.includes("COUNT(*) AS total"), true);
  assert.equal(queries[1].sql.includes("FROM trade_orders"), true);
  assert.equal(queries[1].params[0], 10);
  assert.equal(queries[1].params[1], 20);
  assert.equal(page.page, 3);
  assert.equal(page.pageSize, 10);
  assert.equal(page.total, 23);
  assert.equal(page.totalPages, 3);
  assert.equal(page.items.length, 1);
  assert.equal(page.items[0].coin_symbol, "BTC");
});
