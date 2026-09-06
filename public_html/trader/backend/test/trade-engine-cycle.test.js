"use strict";

const assert = require("node:assert/strict");
const path = require("node:path");
const test = require("node:test");

process.env.NODE_ENV = "test";

function loadTradeEngineWithMocks({ signalClient, traderRepo }) {
  const enginePath = path.resolve(__dirname, "../src/engine/trade-engine.js");
  const mocks = new Map([
    [path.resolve(__dirname, "../src/services/signal-client.js"), signalClient],
    [path.resolve(__dirname, "../src/services/kraken-trade.service.js"), { isConfigured: () => false }],
    [path.resolve(__dirname, "../src/services/telegram.service.js"), { isConfigured: () => false, sendMessage: async () => {} }],
    [path.resolve(__dirname, "../src/repositories/trader.repository.js"), traderRepo]
  ]);

  delete require.cache[enginePath];
  mocks.forEach((exports, filename) => {
    require.cache[filename] = {
      id: filename,
      filename,
      loaded: true,
      exports
    };
  });

  return require(enginePath);
}

test("paper cycle aggregates risk skip reasons from entry decisions", async () => {
  let markedComplete = false;
  const coin = {
    symbol: "BTC/EUR",
    exchange_symbol: "XBTEUR",
    timeframes: {}
  };
  const engine = loadTradeEngineWithMocks({
    signalClient: {
      fetchCoins: async () => [coin],
      getEntryReadyCoins: () => [coin],
      getEntryTimeframe: () => "1h",
      getClosePrice: () => 50,
      getEntrySignalContract: () => ({
        type: "buy",
        blockers: ["trend"],
        risk: { riskExceeded: false }
      }),
      getSellSignalDetails: () => ({ active: false }),
      getLongTermTrend: () => ({ positive: false })
    },
    traderRepo: {
      getConfig: async () => ({
        paused: false,
        mode: "short",
        dryRun: true,
        budgetEur: 300,
        maxPerCoinEur: 100,
        stopLossPercent: 5,
        takeProfitPercent: 12,
        partialExitPercent: 0
      }),
      getOpenPositions: async () => [],
      markCycleComplete: async () => {
        markedComplete = true;
      },
      recordCycleRun: async () => {},
      logOrder: async () => {
        throw new Error("logOrder should not be called for skipped entry");
      }
    }
  });

  const result = await engine.runCycle();

  assert.equal(markedComplete, true);
  assert.equal(result.buys, 0);
  assert.equal(result.skippedBuys, 1);
  assert.deepEqual(result.riskSkipCounts, { signal_blocked: 1 });
  assert.deepEqual(result.riskSkipBlockerCounts, { trend: 1 });
  assert.deepEqual(result.riskSkipStats, {
    total: 1,
    reasons: [{ key: "signal_blocked", count: 1, share_percent: 100 }],
    blockers: [{ key: "trend", count: 1, share_percent: 100 }]
  });
});

test("paper cycle stores take profit price for new positions", async () => {
  let openedPosition = null;
  const cashDeltas = [];
  const coin = {
    symbol: "BTC/EUR",
    base_asset: "BTC",
    exchange_symbol: "XBTEUR",
    timeframes: {}
  };
  const engine = loadTradeEngineWithMocks({
    signalClient: {
      fetchCoins: async () => [coin],
      getEntryReadyCoins: () => [coin],
      getEntryTimeframe: () => "1h",
      getClosePrice: () => 50,
      getEntrySignalContract: () => ({
        type: "buy",
        blockers: [],
        risk: {
          riskExceeded: false,
          stopLossPercent: 5,
          takeProfitPercent: 12
        }
      }),
      getSellSignalDetails: () => ({ active: false }),
      getLongTermTrend: () => ({ positive: false })
    },
    traderRepo: {
      getConfig: async () => ({
        paused: false,
        mode: "short",
        dryRun: true,
        budgetEur: 300,
        maxPerCoinEur: 100,
        stopLossPercent: 5,
        partialExitPercent: 0
      }),
      getOpenPositions: async () => [],
      markCycleComplete: async () => {},
      recordCycleRun: async () => {},
      logOrder: async () => 42,
      openPosition: async (position) => {
        openedPosition = position;
      },
      addDryRunCash: async (deltaEur) => {
        cashDeltas.push(deltaEur);
        return 200;
      },
      setDryRunCash: async () => {
        throw new Error("setDryRunCash should not be called");
      }
    }
  });

  const result = await engine.runCycle();

  assert.equal(result.buys, 1);
  assert.equal(openedPosition.stopLossPrice, 47.5);
  assert.equal(openedPosition.takeProfitPrice, 56);
  assert.deepEqual(cashDeltas, [-100]);
});

test("paper cycle marks buy order as error when position cannot be opened", async () => {
  const statusUpdates = [];
  const coin = {
    symbol: "BTC/EUR",
    base_asset: "BTC",
    exchange_symbol: "XBTEUR",
    timeframes: {}
  };
  const engine = loadTradeEngineWithMocks({
    signalClient: {
      fetchCoins: async () => [coin],
      getEntryReadyCoins: () => [coin],
      getEntryTimeframe: () => "1h",
      getClosePrice: () => 50,
      getEntrySignalContract: () => ({
        type: "buy",
        blockers: [],
        risk: {
          riskExceeded: false,
          stopLossPercent: 5,
          takeProfitPercent: 12
        }
      }),
      getSellSignalDetails: () => ({ active: false }),
      getLongTermTrend: () => ({ positive: false })
    },
    traderRepo: {
      getConfig: async () => ({
        paused: false,
        mode: "short",
        dryRun: true,
        budgetEur: 300,
        maxPerCoinEur: 100,
        stopLossPercent: 5,
        partialExitPercent: 0
      }),
      getOpenPositions: async () => [],
      markCycleComplete: async () => {},
      recordCycleRun: async () => {},
      logOrder: async () => 42,
      updateOrderStatus: async (id, status) => {
        statusUpdates.push({ id, status });
      },
      openPosition: async () => {
        throw new Error("Unknown column 'dry_run_realized_pnl_eur'");
      }
    }
  });

  const result = await engine.runCycle();

  assert.equal(result.buys, 0);
  assert.deepEqual(statusUpdates, [{ id: 42, status: "error" }]);
  assert.match(result.errors[0], /Unknown column/);
});

test("paper cycle skips new buys when dry-run cash cannot fund the order", async () => {
  const coin = {
    symbol: "BTC/EUR",
    base_asset: "BTC",
    exchange_symbol: "XBTEUR",
    timeframes: {}
  };
  const engine = loadTradeEngineWithMocks({
    signalClient: {
      fetchCoins: async () => [coin],
      getEntryReadyCoins: () => [coin],
      getEntryTimeframe: () => "1h",
      getClosePrice: () => 50,
      getEntrySignalContract: () => ({
        type: "buy",
        blockers: [],
        risk: {
          riskExceeded: false,
          stopLossPercent: 5,
          takeProfitPercent: 12
        }
      }),
      getSellSignalDetails: () => ({ active: false }),
      getLongTermTrend: () => ({ positive: false })
    },
    traderRepo: {
      getConfig: async () => ({
        paused: false,
        mode: "short",
        dryRun: true,
        dryRunCashEur: 50,
        budgetEur: 300,
        maxPerCoinEur: 100,
        stopLossPercent: 5,
        partialExitPercent: 0
      }),
      getOpenPositions: async () => [],
      markCycleComplete: async () => {},
      recordCycleRun: async () => {},
      logOrder: async () => {
        throw new Error("logOrder should not be called without enough dry-run cash");
      }
    }
  });

  const result = await engine.runCycle();

  assert.equal(result.buys, 0);
  assert.equal(result.skippedBuys, 1);
  assert.deepEqual(result.riskSkipCounts, { dry_run_cash_insufficient: 1 });
});

test("paper cycle closes a position at take profit without partial exit", async () => {
  const orders = [];
  let closedPosition = null;
  let partialExitCalled = false;
  const coin = {
    symbol: "BTC/EUR",
    exchange_symbol: "XBTEUR",
    timeframes: {}
  };
  const engine = loadTradeEngineWithMocks({
    signalClient: {
      fetchCoins: async () => [coin],
      getEntryReadyCoins: () => [],
      getEntryTimeframe: () => "1h",
      getClosePrice: () => 112,
      getEntrySignalContract: () => null,
      getSellSignalDetails: () => ({ active: false }),
      getLongTermTrend: () => ({ positive: true, timeframe: "1d", signalType: "buy" })
    },
    traderRepo: {
      getConfig: async () => ({
        paused: false,
        mode: "short",
        dryRun: true,
        budgetEur: 300,
        maxPerCoinEur: 100,
        stopLossPercent: 5,
        partialExitPercent: 25
      }),
      getOpenPositions: async () => [{
        id: 7,
        coinSymbol: "BTC/EUR",
        krakenPair: "XBTEUR",
        entryPrice: 100,
        entryVolume: 1,
        stopLossPrice: 95,
        takeProfitPrice: 112,
        partialExitDone: false
      }],
      markCycleComplete: async () => {},
      recordCycleRun: async () => {},
      logOrder: async (order) => {
        orders.push(order);
        return 42;
      },
      addPositionDryRunRealizedPnl: async () => {},
      addDryRunCash: async () => 1000,
      setDryRunCash: async () => {},
      closePosition: async (id, reason) => {
        closedPosition = { id, reason };
      },
      setPartialExit: async () => {
        partialExitCalled = true;
      }
    }
  });

  const result = await engine.runCycle();

  assert.equal(result.sells, 1);
  assert.equal(result.partialSells, 0);
  assert.equal(partialExitCalled, false);
  assert.deepEqual(closedPosition, { id: 7, reason: "take_profit" });
  assert.equal(orders[0].volume, 1);
  assert.equal(orders[0].signalReason, "take_profit");
});

test("paper cycle books sell proceeds into dry-run cash on close", async () => {
  const orders = [];
  const positionRealizedPnls = [];
  const cashDeltas = [];
  const cashResets = [];
  let closedPosition = null;

  const coin = {
    symbol: "BTC/EUR",
    exchange_symbol: "XBTEUR",
    timeframes: {}
  };

  const engine = loadTradeEngineWithMocks({
    signalClient: {
      fetchCoins: async () => [coin],
      getEntryReadyCoins: () => [],
      getEntryTimeframe: () => "1h",
      getClosePrice: () => 5,
      getEntrySignalContract: () => null,
      getSellSignalDetails: () => ({ active: true, timeframe: "4h", signalCreatedAt: "2026-05-23 10:00:00.000" }),
      getLongTermTrend: () => ({ positive: false, timeframe: "1d", signalType: "sell" })
    },
    traderRepo: {
      getConfig: async () => ({
        paused: false,
        mode: "short",
        dryRun: true,
        dryRunCashEur: 12,
        budgetEur: 300,
        maxPerCoinEur: 100,
        stopLossPercent: 5,
        partialExitPercent: 0
      }),
      getOpenPositions: async () => [{
        id: 7,
        coinSymbol: "BTC/EUR",
        krakenPair: "XBTEUR",
        entryPrice: 100,
        entryVolume: 1,
        dryRunRealizedPnlEur: 0,
        stopLossPrice: 95,
        takeProfitPrice: null,
        partialExitDone: false
      }],
      markCycleComplete: async () => {},
      recordCycleRun: async () => {},
      logOrder: async (order) => {
        orders.push(order);
        return 42;
      },
      addPositionDryRunRealizedPnl: async (id, realizedPnlEur) => {
        positionRealizedPnls.push({ id, realizedPnlEur });
      },
      addDryRunCash: async (deltaEur) => {
        cashDeltas.push(deltaEur);
        return 17;
      },
      setDryRunCash: async (valueEur) => {
        cashResets.push(valueEur);
      },
      closePosition: async (id, reason) => {
        closedPosition = { id, reason };
      }
    }
  });

  const result = await engine.runCycle();

  assert.equal(result.sells, 1);
  assert.deepEqual(positionRealizedPnls, [{ id: 7, realizedPnlEur: -95 }]);
  assert.deepEqual(cashDeltas, [5]);
  assert.deepEqual(cashResets, []);
  assert.deepEqual(closedPosition, { id: 7, reason: "stop_loss" });
  assert.equal(orders[0].volume, 1);
});
