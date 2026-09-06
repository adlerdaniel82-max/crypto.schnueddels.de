"use strict";

const db = require("../config/db");

async function getConfig() {
  const [rows] = await db.query("SELECT * FROM trader_config ORDER BY id ASC LIMIT 1");
  if (!rows.length) throw new Error("trader_config_missing");
  const row = rows[0];
  return {
    id: row.id,
    dryRun: Boolean(row.dry_run),
    paused: Boolean(row.paused),
    budgetEur: Number(row.budget_eur),
    maxPerCoinEur: Number(row.max_per_coin_eur),
    stopLossPercent: Number(row.stop_loss_percent),
    mode: row.mode || "long",
    partialExitPercent: Number(row.partial_exit_percent || 0),
    dryRunCashEur: Number(row.dry_run_cash_eur ?? 1000),
    lastCycleAt: row.last_cycle_at || null
  };
}

async function recordCycleRun({ config, result, skipped = false, skipReason = null }) {
  const payload = normalizeCycleResult(result, { skipped, skipReason });
  const [dbResult] = await db.query(`
    INSERT INTO trader_cycle_runs
      (mode, dry_run, skipped, skip_reason, result_json)
    VALUES (?, ?, ?, ?, ?)
  `, [
    config && config.mode ? config.mode : "long",
    config && config.dryRun ? 1 : 0,
    skipped ? 1 : 0,
    skipReason || null,
    JSON.stringify(payload)
  ]);
  return dbResult.insertId;
}

async function getRecentCycleRuns(limit = 10) {
  const numericLimit = Number(limit);
  const safeLimit = Number.isInteger(numericLimit) && numericLimit > 0 ? Math.min(numericLimit, 50) : 10;
  const [rows] = await db.query(`
    SELECT *
    FROM trader_cycle_runs
    ORDER BY created_at DESC
    LIMIT ?
  `, [safeLimit]);

  return rows.map((row) => ({
    id: row.id,
    mode: row.mode || "long",
    dryRun: Boolean(row.dry_run),
    skipped: Boolean(row.skipped),
    skipReason: row.skip_reason || null,
    result: parseCycleResult(row.result_json),
    createdAt: row.created_at || null
  }));
}

async function updateConfig(patch) {
  const fields = [];
  const values = [];

  if (patch.dryRun !== undefined) { fields.push("dry_run = ?"); values.push(patch.dryRun ? 1 : 0); }
  if (patch.paused !== undefined) { fields.push("paused = ?"); values.push(patch.paused ? 1 : 0); }
  if (patch.budgetEur !== undefined) {
    const v = Number(patch.budgetEur);
    if (isNaN(v)) throw new Error("invalid_budget_eur");
    fields.push("budget_eur = ?"); values.push(v);
  }
  if (patch.maxPerCoinEur !== undefined) {
    const v = Number(patch.maxPerCoinEur);
    if (isNaN(v)) throw new Error("invalid_max_per_coin_eur");
    fields.push("max_per_coin_eur = ?"); values.push(v);
  }
  if (patch.stopLossPercent !== undefined) {
    const v = Number(patch.stopLossPercent);
    if (isNaN(v)) throw new Error("invalid_stop_loss_percent");
    fields.push("stop_loss_percent = ?"); values.push(v);
  }
  if (patch.mode !== undefined) {
    if (patch.mode !== "long" && patch.mode !== "short") throw new Error("invalid_mode");
    fields.push("mode = ?"); values.push(patch.mode);
  }
  if (patch.partialExitPercent !== undefined) {
    const v = Number(patch.partialExitPercent);
    if (isNaN(v) || v < 0 || v > 99) throw new Error("invalid_partial_exit_percent");
    fields.push("partial_exit_percent = ?"); values.push(v);
  }
  if (patch.dryRunCashEur !== undefined) {
    const v = Number(patch.dryRunCashEur);
    if (isNaN(v)) throw new Error("invalid_dry_run_cash_eur");
    fields.push("dry_run_cash_eur = ?"); values.push(v);
  }
  if (patch.lastCycleAt !== undefined) { fields.push("last_cycle_at = ?"); values.push(patch.lastCycleAt); }

  if (!fields.length) return;
  await db.query(`UPDATE trader_config SET ${fields.join(", ")} WHERE id = 1`, values);
}

async function markCycleComplete() {
  await db.query("UPDATE trader_config SET last_cycle_at = NOW(3) WHERE id = 1");
}

async function logOrder({ coinSymbol, side, krakenPair, volume, priceEstimate, krakenTxid, dryRun, status, signalReason }) {
  const [result] = await db.query(`
    INSERT INTO trade_orders
      (coin_symbol, side, kraken_pair, volume, price_estimate, kraken_txid, dry_run, status, signal_reason)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `, [coinSymbol, side, krakenPair, volume, priceEstimate ?? null, krakenTxid ?? null, dryRun ? 1 : 0, status, signalReason ?? null]);
  return result.insertId;
}

async function updateOrderStatus(id, status, krakenTxid = undefined) {
  if (krakenTxid !== undefined) {
    await db.query("UPDATE trade_orders SET status = ?, kraken_txid = ? WHERE id = ?", [status, krakenTxid, id]);
  } else {
    await db.query("UPDATE trade_orders SET status = ? WHERE id = ?", [status, id]);
  }
}

async function getOpenPositions() {
  const [rows] = await db.query(`
    SELECT * FROM trader_positions WHERE closed_at IS NULL ORDER BY opened_at DESC
  `);
  return rows.map((row) => ({
    id: row.id,
    coinSymbol: row.coin_symbol,
    baseAsset: row.base_asset,
    krakenPair: row.kraken_pair,
    buyOrderId: row.buy_order_id,
    entryPrice: row.entry_price ? Number(row.entry_price) : null,
    entryVolume: row.entry_volume ? Number(row.entry_volume) : null,
    stopLossPrice: row.stop_loss_price ? Number(row.stop_loss_price) : null,
    takeProfitPrice: row.take_profit_price ? Number(row.take_profit_price) : null,
    partialExitDone: Boolean(row.partial_exit_done),
    partialExitVolume: row.partial_exit_volume != null ? Number(row.partial_exit_volume) : null,
    dryRunRealizedPnlEur: row.dry_run_realized_pnl_eur != null ? Number(row.dry_run_realized_pnl_eur) : 0,
    openedAt: row.opened_at
  }));
}

async function openPosition({ coinSymbol, baseAsset, krakenPair, buyOrderId, entryPrice, entryVolume, stopLossPrice, takeProfitPrice }) {
  const [result] = await db.query(`
    INSERT INTO trader_positions
      (coin_symbol, base_asset, kraken_pair, buy_order_id, entry_price, entry_volume, stop_loss_price, take_profit_price, dry_run_realized_pnl_eur)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0)
  `, [
    coinSymbol,
    baseAsset,
    krakenPair,
    buyOrderId ?? null,
    entryPrice ?? null,
    entryVolume ?? null,
    stopLossPrice ?? null,
    takeProfitPrice ?? null
  ]);
  return result.insertId;
}

async function closePosition(id, closeReason) {
  await db.query(
    "UPDATE trader_positions SET closed_at = NOW(3), close_reason = ? WHERE id = ?",
    [closeReason, id]
  );
}

async function addPositionDryRunRealizedPnl(id, realizedPnlEur) {
  const delta = Number(realizedPnlEur);
  if (isNaN(delta)) throw new Error("invalid_realized_pnl_eur");
  await db.query(
    "UPDATE trader_positions SET dry_run_realized_pnl_eur = COALESCE(dry_run_realized_pnl_eur, 0) + ? WHERE id = ?",
    [delta, id]
  );
}

async function addDryRunCash(deltaEur) {
  const delta = Number(deltaEur);
  if (isNaN(delta)) throw new Error("invalid_dry_run_cash_delta");
  await db.query("UPDATE trader_config SET dry_run_cash_eur = ROUND(dry_run_cash_eur + ?, 2) WHERE id = 1", [delta]);
  const [rows] = await db.query("SELECT dry_run_cash_eur FROM trader_config WHERE id = 1 LIMIT 1");
  return rows[0] ? Number(rows[0].dry_run_cash_eur) : null;
}

async function setDryRunCash(valueEur) {
  const value = Number(valueEur);
  if (isNaN(value)) throw new Error("invalid_dry_run_cash_value");
  await db.query("UPDATE trader_config SET dry_run_cash_eur = ROUND(?, 2) WHERE id = 1", [value]);
  return value;
}

async function closeOpenPositionManually(id) {
  const [result] = await db.query(
    "UPDATE trader_positions SET closed_at = NOW(3), close_reason = 'manual_cancelled' WHERE id = ? AND closed_at IS NULL",
    [id]
  );
  return result.affectedRows > 0;
}

async function setPartialExit(id, remainingVolume) {
  await db.query(
    "UPDATE trader_positions SET partial_exit_done = 1, partial_exit_volume = ? WHERE id = ?",
    [remainingVolume, id]
  );
}

async function getRecentOrders(limit = 30) {
  const page = 1;
  const pageSize = Number.isInteger(Number(limit)) && Number(limit) > 0 ? Number(limit) : 30;
  const pageResult = await getRecentOrdersPage(page, pageSize);
  return pageResult.items;
}

async function getRecentOrdersPage(page = 1, pageSize = 10) {
  const numericPage = Number(page);
  const numericPageSize = Number(pageSize);
  const safePage = Number.isInteger(numericPage) && numericPage > 0 ? numericPage : 1;
  const safePageSize = Number.isInteger(numericPageSize) && numericPageSize > 0 ? Math.min(numericPageSize, 100) : 10;
  const offset = (safePage - 1) * safePageSize;
  const [countRows] = await db.query("SELECT COUNT(*) AS total FROM trade_orders");
  const total = Number(countRows[0] && countRows[0].total ? countRows[0].total : 0);
  const totalPages = total > 0 ? Math.ceil(total / safePageSize) : 0;
  const [rows] = await db.query(`
    SELECT *
    FROM trade_orders
    ORDER BY created_at DESC
    LIMIT ? OFFSET ?
  `, [safePageSize, offset]);

  return {
    items: rows,
    page: safePage,
    pageSize: safePageSize,
    total,
    totalPages
  };
}

async function hasAlertEvent({ coinId, timeframe, alertKind, signalCreatedAt }) {
  if (!coinId || !timeframe || !alertKind || !signalCreatedAt) return false;

  const [rows] = await db.query(`
    SELECT id
    FROM alert_events
    WHERE coin_id = ?
      AND timeframe = ?
      AND alert_kind = ?
      AND signal_created_at = ?
    LIMIT 1
  `, [coinId, timeframe, alertKind, signalCreatedAt]);

  return Boolean(rows[0]);
}

async function recordAlertEvent({ coinId, timeframe, alertKind, signalCreatedAt, payload }) {
  await db.query(`
    INSERT IGNORE INTO alert_events (
      coin_id,
      timeframe,
      alert_kind,
      signal_created_at,
      payload_json
    )
    VALUES (?, ?, ?, ?, ?)
  `, [
    coinId,
    timeframe,
    alertKind,
    signalCreatedAt,
    JSON.stringify(payload || {})
  ]);
}

function normalizeCycleResult(result, meta = {}) {
  const payload = result && typeof result === "object" ? { ...result } : {};
  payload.skipped = Boolean(meta.skipped);
  payload.skipReason = meta.skipReason || null;
  return payload;
}

function parseCycleResult(raw) {
  if (!raw) {
    return {};
  }

  if (typeof raw === "object") {
    return raw;
  }

  try {
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

module.exports = {
  getConfig,
  recordCycleRun,
  getRecentCycleRuns,
  updateConfig,
  markCycleComplete,
  logOrder, updateOrderStatus,
  getOpenPositions, openPosition, closePosition, closeOpenPositionManually, setPartialExit,
  addPositionDryRunRealizedPnl, addDryRunCash, setDryRunCash,
  getRecentOrders,
  getRecentOrdersPage,
  hasAlertEvent, recordAlertEvent
};
