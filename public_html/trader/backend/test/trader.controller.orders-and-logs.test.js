"use strict";

const assert = require("node:assert/strict");
const path = require("node:path");
const test = require("node:test");
const Module = require("module");

function loadControllerWithDeps({ repoMock, fsMock, signalClientMock }) {
  const controllerPath = path.resolve(__dirname, "../src/controllers/trader.controller.js");
  const repoPath = path.resolve(__dirname, "../src/repositories/trader.repository.js");
  const signalClientPath = path.resolve(__dirname, "../src/services/signal-client.js");
  delete require.cache[controllerPath];
  delete require.cache[repoPath];
  delete require.cache[signalClientPath];

  const originalLoad = Module._load;
  Module._load = function(request, parent, isMain) {
    if (request === "fs" && fsMock) {
      return fsMock;
    }
    return originalLoad.apply(this, arguments);
  };

  require.cache[repoPath] = {
    id: repoPath,
    filename: repoPath,
    loaded: true,
    exports: repoMock
  };

  if (signalClientMock) {
    require.cache[signalClientPath] = {
      id: signalClientPath,
      filename: signalClientPath,
      loaded: true,
      exports: signalClientMock
    };
  }

  try {
    return require(controllerPath);
  } finally {
    Module._load = originalLoad;
  }
}

test("trader orders endpoint returns paginated orders", async () => {
  let receivedPage = null;
  let receivedPageSize = null;
  const controller = loadControllerWithDeps({
    repoMock: {
      getConfig: async () => ({ dryRun: true, paused: false, mode: "long", lastCycleAt: null }),
      getOpenPositions: async () => [],
      getRecentOrdersPage: async (page, pageSize) => {
        receivedPage = page;
        receivedPageSize = pageSize;
        return {
          items: [{ id: 1 }],
          page,
          pageSize,
          total: 12,
          totalPages: 2
        };
      },
      getRecentCycleRuns: async () => []
    }
  });

  const payload = {};
  const res = {
    json(value) {
      payload.body = value;
    }
  };

  await controller.getOrders({ query: { page: "2", limit: "10" } }, res, (error) => {
    throw error;
  });

  assert.equal(receivedPage, 2);
  assert.equal(receivedPageSize, 10);
  assert.equal(payload.body.page, 2);
  assert.equal(payload.body.totalPages, 2);
  assert.equal(payload.body.items.length, 1);
});

test("trader log clear endpoint truncates the selected stream", async () => {
  const writes = [];
  const controller = loadControllerWithDeps({
    repoMock: {
      getConfig: async () => ({ dryRun: true, paused: false, mode: "long", lastCycleAt: null }),
      getOpenPositions: async () => [],
      getRecentOrdersPage: async () => ({ items: [], page: 1, pageSize: 10, total: 0, totalPages: 0 }),
      getRecentCycleRuns: async () => []
    },
    fsMock: {
      readFileSync: () => "line1\nline2\n",
      writeFileSync: (file, content) => {
        writes.push({ file, content });
      }
    }
  });

  const payload = {};
  const res = {
    json(value) {
      payload.body = value;
    },
    status(code) {
      payload.status = code;
      return this;
    }
  };

  await controller.clearLogs({ body: { stream: "err" } }, res, (error) => {
    throw error;
  });

  assert.equal(payload.body.cleared, true);
  assert.deepEqual(writes.map((entry) => entry.file), [
    "/home/webuser/.pm2/logs/crypto-trade-loop-error.log",
    "/home/webuser/.pm2/logs/crypto-trader-error.log"
  ]);
});

test("trader status endpoint exposes dry-run cash and theoretical equity", async () => {
  const controller = loadControllerWithDeps({
    repoMock: {
      getConfig: async () => ({
        dryRun: true,
        paused: false,
        mode: "long",
        lastCycleAt: "2026-05-23 10:00:00.000",
        dryRunCashEur: 987.5
      }),
      getOpenPositions: async () => [{
        coinSymbol: "BTC/EUR",
        entryPrice: 100,
        entryVolume: 1,
        dryRunRealizedPnlEur: 5
      }],
    },
    signalClientMock: {
      fetchCoins: async () => [{
        symbol: "BTC/EUR",
        exchange_symbol: "XBTEUR",
        timeframes: {
          "4h": { close_price: 112 }
        }
      }],
      getEntryTimeframe: () => "4h",
      getClosePrice: (coin, timeframe) => coin.timeframes[timeframe].close_price,
      isSignalApiReachable: async () => true
    }
  });

  const payload = {};
  const res = {
    json(value) {
      payload.body = value;
    }
  };

  await controller.getStatus({}, res, (error) => {
    throw error;
  });

  assert.equal(payload.body.dryRunCashEur, 987.5);
  assert.equal(payload.body.dryRunTheoreticalEur, 1099.5);
});

test("trader positions endpoint exposes realized and unrealized pnl", async () => {
  const controller = loadControllerWithDeps({
    repoMock: {
      getConfig: async () => ({ dryRun: true, paused: false, mode: "short", lastCycleAt: null }),
      getOpenPositions: async () => [{
        id: 7,
        coinSymbol: "BTC/EUR",
        krakenPair: "XBTEUR",
        entryPrice: 100,
        entryVolume: 2,
        dryRunRealizedPnlEur: 15,
        partialExitDone: true,
        partialExitVolume: 1
      }]
    },
    signalClientMock: {
      fetchCoins: async () => [{
        symbol: "BTC/EUR",
        exchange_symbol: "XBTEUR",
        timeframes: {
          "1h": { close_price: 112 }
        }
      }],
      getEntryTimeframe: () => "1h",
      getClosePrice: (coin, timeframe) => coin.timeframes[timeframe].close_price
    }
  });

  const payload = {};
  const res = {
    json(value) {
      payload.body = value;
    }
  };

  await controller.getPositions({}, res, (error) => {
    throw error;
  });

  assert.equal(payload.body.items.length, 1);
  assert.equal(payload.body.items[0].realizedProfitEur, 15);
  assert.equal(payload.body.items[0].unrealizedProfitEur, 12);
  assert.equal(payload.body.items[0].totalProfitEur, 27);
  assert.equal(payload.body.items[0].marketValueEur, 112);
});
