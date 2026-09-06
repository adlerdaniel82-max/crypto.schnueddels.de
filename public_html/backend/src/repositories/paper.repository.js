"use strict";

const crypto = require("crypto");
const db = require("../config/db");
const centralWalletService = require("../services/central-wallet.service");
const {
  calculateWithdrawalQuote,
  normalizeDepositTalers,
  normalizeWithdrawalEur
} = require("../services/paper-exchange.service");

const START_CASH_EUR = 1000;
const MIN_VOLUME = 0.00000001;

function roundMoney(value) {
  return Math.round((Number(value) + Number.EPSILON) * 100) / 100;
}

function roundVolume(value) {
  return Math.floor(Number(value) * 100000000) / 100000000;
}

async function getOrCreateAccount(userId, connection = db) {
  const numericUserId = normalizeUserId(userId);
  const [insertResult] = await connection.query(`
    INSERT IGNORE INTO paper_accounts (user_id, cash_eur)
    VALUES (?, ?)
  `, [numericUserId, START_CASH_EUR]);

  const [rows] = await connection.query(`
    SELECT id, user_id, cash_eur, created_at, updated_at
    FROM paper_accounts
    WHERE user_id = ?
    LIMIT 1
  `, [numericUserId]);

  if (!rows.length) throw new Error("paper_account_missing");

  if (insertResult.affectedRows > 0) {
    await connection.query(`
      INSERT INTO paper_ledger (user_id, movement_type, amount_eur, balance_after_eur)
      VALUES (?, 'initial', ?, ?)
    `, [numericUserId, START_CASH_EUR, START_CASH_EUR]);
  }

  return mapAccount(rows[0]);
}

async function getStatus(userId) {
  const account = await getOrCreateAccount(userId);
  const positions = await listOpenPositions(userId);
  const orders = await listRecentOrders(userId, 20);
  const realizedLossEur = await getRealizedLossEur(userId);
  const marketValueEur = roundMoney(positions.reduce((sum, position) => sum + Number(position.marketValueEur || 0), 0));

  return {
    account,
    cashEur: account.cashEur,
    marketValueEur,
    equityEur: roundMoney(account.cashEur + marketValueEur),
    exchange: calculateWithdrawalQuote({ cashEur: account.cashEur, realizedLossEur }),
    positions,
    orders
  };
}

async function listOpenPositions(userId) {
  const numericUserId = normalizeUserId(userId);
  const [rows] = await db.query(`
    SELECT *
    FROM paper_positions
    WHERE user_id = ? AND closed_at IS NULL
    ORDER BY opened_at DESC
  `, [numericUserId]);

  const positions = [];
  for (const row of rows) {
    const market = await getLatestMarket(row.coin_symbol);
    positions.push(mapPosition(row, market));
  }
  return positions;
}

async function listRecentOrders(userId, limit = 20) {
  const numericUserId = normalizeUserId(userId);
  const safeLimit = Math.max(1, Math.min(100, Number.parseInt(limit, 10) || 20));
  const [rows] = await db.query(`
    SELECT *
    FROM paper_orders
    WHERE user_id = ?
    ORDER BY created_at DESC
    LIMIT ?
  `, [numericUserId, safeLimit]);

  return rows.map(mapOrder);
}

async function getRealizedLossEur(userId, connection = db) {
  const numericUserId = normalizeUserId(userId);
  const [rows] = await connection.query(`
    SELECT COALESCE(SUM(CASE WHEN realized_pnl_eur < 0 THEN ABS(realized_pnl_eur) ELSE 0 END), 0) AS realized_loss_eur
    FROM paper_orders
    WHERE user_id = ? AND side = 'sell' AND realized_pnl_eur IS NOT NULL
  `, [numericUserId]);

  return roundMoney(Number(rows[0]?.realized_loss_eur || 0));
}

async function buy({ userId, symbol, amountEur }) {
  const numericUserId = normalizeUserId(userId);
  const coinSymbol = normalizeSymbol(symbol);
  const grossEur = roundMoney(amountEur);
  if (!Number.isFinite(grossEur) || grossEur <= 0) throw badRequest("invalid_amount_eur");

  const market = await getLatestMarket(coinSymbol);
  if (!market || !market.priceEur) throw badRequest("market_price_unavailable");

  const volume = roundVolume(grossEur / market.priceEur);
  if (volume < MIN_VOLUME) throw badRequest("invalid_volume");

  const connection = await db.getConnection();
  try {
    await connection.beginTransaction();
    await getOrCreateAccount(numericUserId, connection);

    const [accountRows] = await connection.query(`
      SELECT id, cash_eur
      FROM paper_accounts
      WHERE user_id = ?
      FOR UPDATE
    `, [numericUserId]);
    const cashEur = Number(accountRows[0].cash_eur);
    if (cashEur < grossEur) throw badRequest("insufficient_paper_cash");

    const [positionResult] = await connection.query(`
      INSERT INTO paper_positions
        (user_id, coin_symbol, base_asset, quote_asset, entry_price, entry_volume)
      VALUES (?, ?, ?, ?, ?, ?)
    `, [numericUserId, market.symbol, market.baseAsset, market.quoteAsset, market.priceEur, volume]);

    const [orderResult] = await connection.query(`
      INSERT INTO paper_orders
        (user_id, position_id, coin_symbol, side, price_eur, volume, gross_eur, realized_pnl_eur)
      VALUES (?, ?, ?, 'buy', ?, ?, ?, NULL)
    `, [numericUserId, positionResult.insertId, market.symbol, market.priceEur, volume, grossEur]);

    const newCashEur = roundMoney(cashEur - grossEur);
    await connection.query("UPDATE paper_accounts SET cash_eur = ? WHERE user_id = ?", [newCashEur, numericUserId]);
    await connection.query(`
      INSERT INTO paper_ledger (user_id, order_id, movement_type, amount_eur, balance_after_eur)
      VALUES (?, ?, 'buy', ?, ?)
    `, [numericUserId, orderResult.insertId, -grossEur, newCashEur]);

    await connection.commit();
    return getStatus(numericUserId);
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

async function sell({ userId, positionId, volume }) {
  const numericUserId = normalizeUserId(userId);
  const numericPositionId = Number(positionId);
  if (!Number.isInteger(numericPositionId) || numericPositionId <= 0) throw badRequest("invalid_position_id");

  const connection = await db.getConnection();
  try {
    await connection.beginTransaction();
    await getOrCreateAccount(numericUserId, connection);

    const [positionRows] = await connection.query(`
      SELECT *
      FROM paper_positions
      WHERE id = ? AND user_id = ? AND closed_at IS NULL
      FOR UPDATE
    `, [numericPositionId, numericUserId]);
    if (!positionRows.length) throw notFound("paper_position_not_found");

    const position = positionRows[0];
    const currentVolume = Number(position.entry_volume);
    const sellVolume = volume === undefined || volume === null || volume === ""
      ? currentVolume
      : roundVolume(volume);
    if (!Number.isFinite(sellVolume) || sellVolume <= 0) throw badRequest("invalid_volume");
    if (sellVolume - currentVolume > 0.000000001) throw badRequest("paper_volume_exceeds_position");

    const market = await getLatestMarket(position.coin_symbol);
    if (!market || !market.priceEur) throw badRequest("market_price_unavailable");

    const grossEur = roundMoney(market.priceEur * sellVolume);
    const realizedPnlEur = roundMoney((market.priceEur - Number(position.entry_price)) * sellVolume);
    const remainingVolume = roundVolume(currentVolume - sellVolume);

    const [orderResult] = await connection.query(`
      INSERT INTO paper_orders
        (user_id, position_id, coin_symbol, side, price_eur, volume, gross_eur, realized_pnl_eur)
      VALUES (?, ?, ?, 'sell', ?, ?, ?, ?)
    `, [numericUserId, numericPositionId, position.coin_symbol, market.priceEur, sellVolume, grossEur, realizedPnlEur]);

    if (remainingVolume < MIN_VOLUME) {
      await connection.query(`
        UPDATE paper_positions
        SET closed_at = NOW(3), close_reason = 'manual_sell', realized_pnl_eur = realized_pnl_eur + ?
        WHERE id = ? AND user_id = ?
      `, [realizedPnlEur, numericPositionId, numericUserId]);
    } else {
      await connection.query(`
        UPDATE paper_positions
        SET entry_volume = ?, realized_pnl_eur = realized_pnl_eur + ?
        WHERE id = ? AND user_id = ?
      `, [remainingVolume, realizedPnlEur, numericPositionId, numericUserId]);
    }

    const [accountRows] = await connection.query(`
      SELECT cash_eur
      FROM paper_accounts
      WHERE user_id = ?
      FOR UPDATE
    `, [numericUserId]);
    const newCashEur = roundMoney(Number(accountRows[0].cash_eur) + grossEur);
    await connection.query("UPDATE paper_accounts SET cash_eur = ? WHERE user_id = ?", [newCashEur, numericUserId]);
    await connection.query(`
      INSERT INTO paper_ledger (user_id, order_id, movement_type, amount_eur, balance_after_eur)
      VALUES (?, ?, 'sell', ?, ?)
    `, [numericUserId, orderResult.insertId, grossEur, newCashEur]);

    await connection.commit();
    return getStatus(numericUserId);
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

async function reset(userId) {
  const numericUserId = normalizeUserId(userId);
  const connection = await db.getConnection();
  try {
    await connection.beginTransaction();
    await connection.query("DELETE FROM paper_orders WHERE user_id = ?", [numericUserId]);
    await connection.query("DELETE FROM paper_positions WHERE user_id = ?", [numericUserId]);
    await connection.query("DELETE FROM paper_ledger WHERE user_id = ?", [numericUserId]);
    await connection.query(`
      INSERT INTO paper_accounts (user_id, cash_eur)
      VALUES (?, ?)
      ON DUPLICATE KEY UPDATE cash_eur = VALUES(cash_eur)
    `, [numericUserId, START_CASH_EUR]);
    await connection.query(`
      INSERT INTO paper_ledger (user_id, movement_type, amount_eur, balance_after_eur)
      VALUES (?, 'reset', ?, ?)
    `, [numericUserId, START_CASH_EUR, START_CASH_EUR]);
    await connection.commit();
    return getStatus(numericUserId);
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

async function depositTalers({ userId, talerAmount, walletClient = centralWalletService }) {
  const numericUserId = normalizeUserId(userId);
  const exchange = normalizeDepositTalers(talerAmount);
  const baseKey = `crypto.paper.deposit:${numericUserId}:${crypto.randomUUID()}`;
  const connection = await db.getConnection();
  let reservationId = null;
  let walletCommitted = false;

  try {
    await connection.beginTransaction();
    await getOrCreateAccount(numericUserId, connection);

    const [exchangeResult] = await connection.query(`
      INSERT INTO paper_taler_exchanges
        (user_id, direction, taler_amount, paper_amount_eur, wallet_status, idempotency_key)
      VALUES (?, 'taler_to_paper', ?, ?, 'pending', ?)
    `, [numericUserId, exchange.talerAmount, exchange.paperAmountEur, baseKey]);
    const exchangeId = Number(exchangeResult.insertId);

    const sourceId = `crypto:paper:deposit:${exchangeId}`;
    const reservation = await walletClient.reserve({
      centralUserId: numericUserId,
      amount: exchange.talerAmount,
      reasonCode: "crypto.paper.deposit",
      sourceType: "paper_taler_exchange",
      sourceId,
      idempotencyKey: `${baseKey}:reserve`,
      expiresInSeconds: 300
    });
    reservationId = Number(reservation?.reservation_id || 0);

    await connection.query(`
      UPDATE paper_taler_exchanges
      SET wallet_status = 'reserved', wallet_reservation_id = ?
      WHERE id = ?
    `, [String(reservationId), exchangeId]);

    const [accountRows] = await connection.query(`
      SELECT cash_eur
      FROM paper_accounts
      WHERE user_id = ?
      FOR UPDATE
    `, [numericUserId]);
    const newCashEur = roundMoney(Number(accountRows[0].cash_eur) + exchange.paperAmountEur);
    await connection.query("UPDATE paper_accounts SET cash_eur = ? WHERE user_id = ?", [newCashEur, numericUserId]);
    await connection.query(`
      INSERT INTO paper_ledger (user_id, movement_type, amount_eur, balance_after_eur)
      VALUES (?, 'taler_deposit', ?, ?)
    `, [numericUserId, exchange.paperAmountEur, newCashEur]);

    const commit = await walletClient.commit({
      reservationId,
      idempotencyKey: `${baseKey}:commit`,
      metadata: { exchange_id: exchangeId, paper_amount_eur: exchange.paperAmountEur }
    });
    walletCommitted = true;

    await connection.query(`
      UPDATE paper_taler_exchanges
      SET wallet_status = 'committed', wallet_ledger_id = ?
      WHERE id = ?
    `, [String(commit?.ledger_id || ""), exchangeId]);

    await connection.commit();
    const status = await getStatus(numericUserId);
    return {
      ...status,
      exchange: {
        ...status.exchange,
        direction: "taler_to_paper",
        talerAmount: exchange.talerAmount,
        paperAmountEur: exchange.paperAmountEur
      }
    };
  } catch (error) {
    if (connection.connection && connection.connection._closing !== true) {
      try { await connection.rollback(); } catch { /* ignore rollback errors */ }
    }
    if (reservationId && !walletCommitted) {
      try {
        await walletClient.release({
          reservationId,
          idempotencyKey: `${baseKey}:release`,
          metadata: { error: String(error?.code || error?.message || "deposit_failed").slice(0, 120) }
        });
      } catch (releaseError) {
        console.error("[paper] taler deposit reservation release failed:", releaseError?.code || releaseError?.message || releaseError);
      }
    }
    throw mapWalletError(error);
  } finally {
    connection.release();
  }
}

async function withdrawTalers({ userId, amountEur, walletClient = centralWalletService }) {
  const numericUserId = normalizeUserId(userId);
  const exchange = normalizeWithdrawalEur(amountEur);
  const baseKey = `crypto.paper.withdraw:${numericUserId}:${crypto.randomUUID()}`;
  const connection = await db.getConnection();

  try {
    await connection.beginTransaction();
    await getOrCreateAccount(numericUserId, connection);

    const [accountRows] = await connection.query(`
      SELECT cash_eur
      FROM paper_accounts
      WHERE user_id = ?
      FOR UPDATE
    `, [numericUserId]);
    const cashEur = roundMoney(Number(accountRows[0].cash_eur));
    const realizedLossEur = await getRealizedLossEur(numericUserId, connection);
    const quote = calculateWithdrawalQuote({ cashEur, realizedLossEur });
    if (exchange.paperAmountEur > quote.withdrawableEur) {
      throw badRequest("paper_withdrawal_exceeds_available");
    }

    const [exchangeResult] = await connection.query(`
      INSERT INTO paper_taler_exchanges
        (user_id, direction, taler_amount, paper_amount_eur, wallet_status, idempotency_key)
      VALUES (?, 'paper_to_taler', ?, ?, 'pending', ?)
    `, [numericUserId, exchange.talerAmount, exchange.paperAmountEur, baseKey]);
    const exchangeId = Number(exchangeResult.insertId);
    const newCashEur = roundMoney(cashEur - exchange.paperAmountEur);

    await connection.query("UPDATE paper_accounts SET cash_eur = ? WHERE user_id = ?", [newCashEur, numericUserId]);
    await connection.query(`
      INSERT INTO paper_ledger (user_id, movement_type, amount_eur, balance_after_eur)
      VALUES (?, 'taler_withdraw', ?, ?)
    `, [numericUserId, -exchange.paperAmountEur, newCashEur]);

    const credit = await walletClient.credit({
      centralUserId: numericUserId,
      amount: exchange.talerAmount,
      reasonCode: "crypto.paper.withdraw",
      sourceType: "paper_taler_exchange",
      sourceId: `crypto:paper:withdraw:${exchangeId}`,
      idempotencyKey: `${baseKey}:credit`,
      metadata: { exchange_id: exchangeId, paper_amount_eur: exchange.paperAmountEur }
    });

    await connection.query(`
      UPDATE paper_taler_exchanges
      SET wallet_status = 'credited', wallet_ledger_id = ?
      WHERE id = ?
    `, [String(credit?.ledger_id || ""), exchangeId]);

    await connection.commit();
    const status = await getStatus(numericUserId);
    return {
      ...status,
      exchange: {
        ...status.exchange,
        direction: "paper_to_taler",
        talerAmount: exchange.talerAmount,
        paperAmountEur: exchange.paperAmountEur
      }
    };
  } catch (error) {
    try { await connection.rollback(); } catch { /* ignore rollback errors */ }
    throw mapWalletError(error);
  } finally {
    connection.release();
  }
}

async function getLatestMarket(symbol) {
  const coinSymbol = normalizeSymbol(symbol);
  const [rows] = await db.query(`
    SELECT
      c.id,
      c.symbol,
      c.base_asset,
      c.quote_asset,
      c.exchange_symbol,
      COALESCE(
        (
          SELECT s.close_price
          FROM signals s
          WHERE s.coin_id = c.id AND s.timeframe = c.default_timeframe AND s.close_price IS NOT NULL
          ORDER BY s.created_at DESC
          LIMIT 1
        ),
        (
          SELECT mc.close_price
          FROM market_candles mc
          WHERE mc.coin_id = c.id AND mc.timeframe = c.default_timeframe
          ORDER BY mc.open_time DESC
          LIMIT 1
        ),
        (
          SELECT mc2.close_price
          FROM market_candles mc2
          WHERE mc2.coin_id = c.id
          ORDER BY mc2.open_time DESC
          LIMIT 1
        )
      ) AS price_eur
    FROM coins c
    WHERE c.symbol = ? AND c.is_active = 1
    LIMIT 1
  `, [coinSymbol]);

  if (!rows.length || rows[0].price_eur == null) return null;
  return {
    id: rows[0].id,
    symbol: rows[0].symbol,
    baseAsset: rows[0].base_asset,
    quoteAsset: rows[0].quote_asset,
    exchangeSymbol: rows[0].exchange_symbol,
    priceEur: Number(rows[0].price_eur)
  };
}

function mapAccount(row) {
  return {
    id: row.id,
    userId: row.user_id,
    cashEur: Number(row.cash_eur),
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function mapPosition(row, market = null) {
  const entryPrice = Number(row.entry_price);
  const volume = Number(row.entry_volume);
  const currentPrice = market && market.priceEur ? Number(market.priceEur) : null;
  const marketValueEur = currentPrice ? roundMoney(currentPrice * volume) : null;
  const costBasisEur = roundMoney(entryPrice * volume);
  const unrealizedPnlEur = currentPrice ? roundMoney((currentPrice - entryPrice) * volume) : null;

  return {
    id: row.id,
    userId: row.user_id,
    coinSymbol: row.coin_symbol,
    baseAsset: row.base_asset,
    quoteAsset: row.quote_asset,
    entryPriceEur: entryPrice,
    volume,
    costBasisEur,
    currentPriceEur: currentPrice,
    marketValueEur,
    realizedPnlEur: Number(row.realized_pnl_eur || 0),
    unrealizedPnlEur,
    totalPnlEur: unrealizedPnlEur == null ? Number(row.realized_pnl_eur || 0) : roundMoney(Number(row.realized_pnl_eur || 0) + unrealizedPnlEur),
    openedAt: row.opened_at,
    closedAt: row.closed_at || null,
    closeReason: row.close_reason || null
  };
}

function mapOrder(row) {
  return {
    id: row.id,
    userId: row.user_id,
    positionId: row.position_id,
    coinSymbol: row.coin_symbol,
    side: row.side,
    priceEur: Number(row.price_eur),
    volume: Number(row.volume),
    grossEur: Number(row.gross_eur),
    realizedPnlEur: row.realized_pnl_eur == null ? null : Number(row.realized_pnl_eur),
    createdAt: row.created_at
  };
}

function normalizeUserId(userId) {
  const numericUserId = Number(userId);
  if (!Number.isInteger(numericUserId) || numericUserId <= 0) throw badRequest("invalid_user_id");
  return numericUserId;
}

function normalizeSymbol(symbol) {
  const value = String(symbol || "").trim().toUpperCase();
  if (!/^[A-Z0-9]{1,16}\/[A-Z0-9]{2,16}$/.test(value)) throw badRequest("invalid_symbol");
  return value;
}

function badRequest(message) {
  const error = new Error(message);
  error.statusCode = 400;
  return error;
}

function notFound(message) {
  const error = new Error(message);
  error.statusCode = 404;
  return error;
}

function mapWalletError(error) {
  if (error && error.statusCode) return error;
  if (error && error.name === "CentralWalletError") {
    const mapped = new Error(error.code || error.message || "wallet_unavailable");
    mapped.statusCode = Number(error.status || 502);
    return mapped;
  }
  return error;
}

module.exports = {
  buy,
  depositTalers,
  getLatestMarket,
  getOrCreateAccount,
  getStatus,
  listOpenPositions,
  listRecentOrders,
  reset,
  sell,
  withdrawTalers
};
