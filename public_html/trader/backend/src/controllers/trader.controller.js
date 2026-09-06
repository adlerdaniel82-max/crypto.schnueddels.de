"use strict";

const fs = require("fs");
const traderRepo = require("../repositories/trader.repository");
const tradeEngine = require("../engine/trade-engine");
const signalClient = require("../services/signal-client");
const { buildCycleRunsSeries, buildCycleRunsSummary } = require("../../../../shared/cycle-runs");

const LOG_OUT = "/home/webuser/.pm2/logs/crypto-trade-loop-out.log";
const LOG_ERR = "/home/webuser/.pm2/logs/crypto-trade-loop-error.log";
const API_LOG_ERR = "/home/webuser/.pm2/logs/crypto-trader-error.log";

function readLastLines(filePath, n) {
  try {
    const content = fs.readFileSync(filePath, "utf8");
    const lines = content.split("\n").filter(Boolean);
    return lines.slice(-n);
  } catch {
    return [];
  }
}

async function getStatus(req, res, next) {
  try {
    const [config, positions, signalOk] = await Promise.all([
      traderRepo.getConfig(),
      traderRepo.getOpenPositions(),
      signalClient.isSignalApiReachable()
    ]);
    const coins = config.dryRun ? await signalClient.fetchCoins().catch(() => []) : [];

    const dryRunTheoreticalEur = config.dryRun
      ? calculateDryRunTheoreticalEur({ cashEur: config.dryRunCashEur, positions, coins, mode: config.mode })
      : null;

    res.json({
      dryRun: config.dryRun,
      paused: config.paused,
      signalApiOk: signalOk,
      openPositionsCount: positions.length,
      lastCycleAt: config.lastCycleAt,
      mode: config.mode,
      dryRunCashEur: config.dryRunCashEur,
      dryRunTheoreticalEur
    });
  } catch (error) { next(error); }
}

async function getConfig(req, res, next) {
  try {
    res.json(await traderRepo.getConfig());
  } catch (error) { next(error); }
}

async function updateConfig(req, res, next) {
  try {
    const { dryRun, paused, budgetEur, maxPerCoinEur, stopLossPercent, mode, partialExitPercent } = req.body;
    if (budgetEur !== undefined && (typeof budgetEur !== "number" || budgetEur < 0)) {
      return res.status(400).json({ error: "invalid_budgetEur" });
    }
    if (maxPerCoinEur !== undefined && (typeof maxPerCoinEur !== "number" || maxPerCoinEur < 0)) {
      return res.status(400).json({ error: "invalid_maxPerCoinEur" });
    }
    if (stopLossPercent !== undefined && (typeof stopLossPercent !== "number" || stopLossPercent < 0 || stopLossPercent > 50)) {
      return res.status(400).json({ error: "invalid_stopLossPercent" });
    }
    if (mode !== undefined && mode !== "long" && mode !== "short") {
      return res.status(400).json({ error: "invalid_mode" });
    }
    if (partialExitPercent !== undefined && (typeof partialExitPercent !== "number" || !Number.isInteger(partialExitPercent) || partialExitPercent < 0 || partialExitPercent > 99)) {
      return res.status(400).json({ error: "invalid_partialExitPercent" });
    }
    await traderRepo.updateConfig({ dryRun, paused, budgetEur, maxPerCoinEur, stopLossPercent, mode, partialExitPercent });
    res.json(await traderRepo.getConfig());
  } catch (error) { next(error); }
}

async function getPositions(req, res, next) {
  try {
    const [config, positions, coins] = await Promise.all([
      traderRepo.getConfig(),
      traderRepo.getOpenPositions(),
      signalClient.fetchCoins().catch(() => [])
    ]);

    res.json({
      items: enrichPositionsWithPnl({
        positions,
        coins,
        mode: config.mode
      })
    });
  } catch (error) { next(error); }
}

async function deletePosition(req, res, next) {
  try {
    const id = Number.parseInt(req.params.id, 10);
    if (!Number.isInteger(id) || id <= 0) {
      return res.status(400).json({ error: "invalid_position_id" });
    }

    const deleted = await traderRepo.closeOpenPositionManually(id);
    if (!deleted) {
      return res.status(404).json({ error: "open_position_not_found" });
    }

    res.json({ deleted: true, id });
  } catch (error) { next(error); }
}

async function getOrders(req, res, next) {
  try {
    const page = parsePositiveInt(req.query.page, 1);
    const pageSize = parsePositiveInt(req.query.limit, 10);
    const pageResult = await traderRepo.getRecentOrdersPage(page, pageSize);
    res.json(pageResult);
  } catch (error) { next(error); }
}

async function getCycleRuns(req, res, next) {
  try {
    const limit = parsePositiveInt(req.query.limit, 10);
    const seriesLimit = parsePositiveInt(req.query.seriesLimit, 50);
    const fetchLimit = Math.max(limit, seriesLimit);
    const runs = await traderRepo.getRecentCycleRuns(fetchLimit);
    const items = runs.slice(0, limit);
    const trendRuns = runs.slice(0, seriesLimit);
    res.json({
      items,
      summary: buildCycleRunsSummary(trendRuns),
      series: buildCycleRunsSeries(trendRuns, { limit: seriesLimit })
    });
  } catch (error) { next(error); }
}

function parsePositiveInt(value, fallback) {
  const numeric = Number.parseInt(value, 10);
  return Number.isInteger(numeric) && numeric > 0 ? numeric : fallback;
}

function calculateDryRunTheoreticalEur({ cashEur, positions, coins, mode }) {
  const coinMap = new Map((coins || []).map((coin) => [coin.symbol, coin]));
  const entryTimeframe = signalClient.getEntryTimeframe(mode);
  let total = Number(cashEur || 0);

  for (const position of positions || []) {
    const coin = coinMap.get(position.coinSymbol);
    if (!coin) continue;

    const currentPrice = signalClient.getClosePrice(coin, entryTimeframe) || signalClient.getClosePrice(coin, "1h");
    const entryPrice = position.entryPrice != null ? Number(position.entryPrice) : null;
    const baseVolume = position.partialExitDone && position.partialExitVolume != null
      ? Number(position.partialExitVolume)
      : Number(position.entryVolume || 0);

    if (!currentPrice || !entryPrice || baseVolume <= 0) continue;

    total += Number(currentPrice) * baseVolume;
  }

  return Math.round((total + Number.EPSILON) * 100) / 100;
}

function enrichPositionsWithPnl({ positions, coins, mode }) {
  const coinMap = new Map((coins || []).map((coin) => [coin.symbol, coin]));
  const entryTimeframe = signalClient.getEntryTimeframe(mode);

  return (positions || []).map((position) => {
    const coin = coinMap.get(position.coinSymbol);
    const currentPrice = coin
      ? signalClient.getClosePrice(coin, entryTimeframe) || signalClient.getClosePrice(coin, "1h")
      : null;
    const entryPrice = position.entryPrice != null ? Number(position.entryPrice) : null;
    const openVolume = position.partialExitDone && position.partialExitVolume != null
      ? Number(position.partialExitVolume)
      : Number(position.entryVolume || 0);
    const realizedProfitEur = Number(position.dryRunRealizedPnlEur || 0);
    const unrealizedProfitEur = entryPrice != null && currentPrice != null && openVolume > 0
      ? roundMoney((Number(currentPrice) - entryPrice) * openVolume)
      : null;
    const unrealizedProfitPercent = entryPrice != null && currentPrice != null && entryPrice > 0
      ? roundMoney(((Number(currentPrice) - entryPrice) / entryPrice) * 100)
      : null;
    const marketValueEur = currentPrice != null && openVolume > 0
      ? roundMoney(Number(currentPrice) * openVolume)
      : null;
    const costBasisEur = entryPrice != null && openVolume > 0
      ? roundMoney(entryPrice * openVolume)
      : null;
    const totalProfitEur = unrealizedProfitEur != null
      ? roundMoney(realizedProfitEur + unrealizedProfitEur)
      : realizedProfitEur;

    return {
      ...position,
      currentPriceEur: currentPrice != null ? roundMoney(currentPrice) : null,
      costBasisEur,
      marketValueEur,
      realizedProfitEur,
      unrealizedProfitEur,
      unrealizedProfitPercent,
      totalProfitEur
    };
  });
}

function roundMoney(value) {
  return Math.round((Number(value) + Number.EPSILON) * 100) / 100;
}

async function runCycle(req, res, next) {
  try {
    const result = await tradeEngine.runCycle();
    res.json(result);
  } catch (error) { next(error); }
}

async function emergencyStop(req, res, next) {
  try {
    await traderRepo.updateConfig({ paused: true });
    res.json({ paused: true, message: "Trader gestoppt." });
  } catch (error) { next(error); }
}

async function clearLogs(req, res, next) {
  try {
    const stream = String((req.body && req.body.stream) || req.query.stream || "").trim();
    if (stream !== "out" && stream !== "err") {
      return res.status(400).json({ error: "invalid_log_stream" });
    }

    const clearedFiles = [];
    if (stream === "out") {
      clearFile(LOG_OUT);
      clearedFiles.push(LOG_OUT);
    } else {
      clearFile(LOG_ERR);
      clearFile(API_LOG_ERR);
      clearedFiles.push(LOG_ERR, API_LOG_ERR);
    }

    res.json({ cleared: true, stream, files: clearedFiles });
  } catch (error) {
    next(error);
  }
}

function clearFile(filePath) {
  fs.writeFileSync(filePath, "", "utf8");
}

function getLogs(req, res) {
  const out = readLastLines(LOG_OUT, 20).map((l) => ({ src: "out", line: l }));
  const loopErr = readLastLines(LOG_ERR, 20).map((l) => ({ src: "err", line: `[crypto-trade-loop] ${l}` }));
  const apiErr = readLastLines(API_LOG_ERR, 20).map((l) => ({ src: "err", line: `[crypto-trader] ${l}` }));
  const err = loopErr.concat(apiErr).slice(-40);
  res.json({ out, err });
}

module.exports = { getStatus, getConfig, updateConfig, getPositions, deletePosition, getOrders, getCycleRuns, runCycle, emergencyStop, getLogs, clearLogs };
