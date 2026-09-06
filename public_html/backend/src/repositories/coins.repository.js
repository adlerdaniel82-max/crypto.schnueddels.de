"use strict";

const db = require("../config/db");
const { buildSignalContract } = require("../services/signal-contract");

async function listActiveCoins() {
  const [coins] = await db.query(`
    SELECT
      c.id,
      c.symbol,
      c.base_asset,
      c.quote_asset,
      c.exchange_symbol,
      c.name,
      c.sort_order,
      c.default_timeframe
    FROM coins c
    WHERE c.is_active = 1
    ORDER BY c.sort_order ASC, c.symbol ASC
  `);

  if (!coins.length) {
    return [];
  }

  const coinIds = coins.map((coin) => coin.id);
  const [candleRows] = await db.query(`
    SELECT latest.*
    FROM market_candles latest
    INNER JOIN (
      SELECT coin_id, timeframe, MAX(open_time) AS max_open_time
      FROM market_candles
      WHERE coin_id IN (?)
      GROUP BY coin_id, timeframe
    ) grouped
      ON grouped.coin_id = latest.coin_id
     AND grouped.timeframe = latest.timeframe
     AND grouped.max_open_time = latest.open_time
  `, [coinIds]);

  const [signalRows] = await db.query(`
    SELECT latest.*
    FROM signals latest
    INNER JOIN (
      SELECT coin_id, timeframe, MAX(created_at) AS max_created_at
      FROM signals
      WHERE coin_id IN (?)
      GROUP BY coin_id, timeframe
    ) grouped
      ON grouped.coin_id = latest.coin_id
     AND grouped.timeframe = latest.timeframe
     AND grouped.max_created_at = latest.created_at
  `, [coinIds]);

  const candlesByCoin = groupByCoinAndTimeframe(candleRows);
  const signalsByCoin = groupByCoinAndTimeframe(signalRows, true);

  return coins.map((coin) => {
    const timeframes = {};
    const candleEntries = candlesByCoin.get(coin.id) || new Map();
    const signalEntries = signalsByCoin.get(coin.id) || new Map();
    const knownTimeframes = new Set([
      ...candleEntries.keys(),
      ...signalEntries.keys()
    ]);

    knownTimeframes.forEach((timeframe) => {
      const candle = candleEntries.get(timeframe) || null;
      const signal = signalEntries.get(timeframe) || null;
      const signalContract = buildSignalContractFromRow(signal);

      timeframes[timeframe] = {
        timeframe,
        close_price: candle ? candle.close_price : null,
        volume: candle ? candle.volume : null,
        candle_open_time: candle ? candle.open_time : null,
        candle_close_time: candle ? candle.close_time : null,
        signal_type: signal ? signal.signal_type : null,
        summary: signal ? signal.summary : null,
        reasons: signal ? parseReasons(signal.reasons_json) : [],
        rsi_value: signal ? signal.rsi_value : null,
        macd_value: signal ? signal.macd_value : null,
        ema_fast: signal ? signal.ema_fast : null,
        ema_slow: signal ? signal.ema_slow : null,
        volume_ratio: signal ? signal.volume_ratio : null,
        stop_loss_percent: signal ? signal.stop_loss_percent : null,
        take_profit_percent: signal ? signal.take_profit_percent : null,
        signal_created_at: signal ? signal.created_at : null,
        signal_contract: signalContract
      };
    });

    const preferredTimeframe = timeframes[coin.default_timeframe]
      ? coin.default_timeframe
      : pickPreferredTimeframe(timeframes);
    const active = preferredTimeframe ? timeframes[preferredTimeframe] : {};

    return {
      ...coin,
      close_price: active.close_price || null,
      volume: active.volume || null,
      signal_type: active.signal_type || null,
      signal_timeframe: preferredTimeframe || null,
      summary: active.summary || null,
      reasons: active.reasons || [],
      rsi_value: active.rsi_value || null,
      macd_value: active.macd_value || null,
      ema_fast: active.ema_fast || null,
      ema_slow: active.ema_slow || null,
      volume_ratio: active.volume_ratio || null,
      stop_loss_percent: active.stop_loss_percent || null,
      take_profit_percent: active.take_profit_percent || null,
      signal_created_at: active.signal_created_at || null,
      signal_contract: active.signal_contract || null,
      candle_open_time: active.candle_open_time || null,
      timeframes
    };
  });
}

async function getCoinBySymbol(symbol) {
  const [rows] = await db.query(`
    SELECT
      c.id,
      c.symbol,
      c.base_asset,
      c.quote_asset,
      c.name,
      c.default_timeframe,
      c.sort_order,
      c.is_active
    FROM coins c
    WHERE c.symbol = ?
    LIMIT 1
  `, [symbol]);

  return rows[0] || null;
}

async function getCoinById(id) {
  const [rows] = await db.query(`
    SELECT
      id,
      symbol,
      base_asset,
      quote_asset,
      name,
      exchange_symbol,
      default_timeframe,
      strategy_key,
      sort_order,
      is_active
    FROM coins
    WHERE id = ?
    LIMIT 1
  `, [id]);

  return rows[0] || null;
}

async function getCoinCandles(symbol, timeframe, limit) {
  const safeLimit = Math.max(1, Math.min(Number(limit) || 100, 500));
  const [rows] = await db.query(`
    SELECT
      mc.open_time,
      mc.open_price,
      mc.high_price,
      mc.low_price,
      mc.close_price,
      mc.volume
    FROM market_candles mc
    INNER JOIN coins c ON c.id = mc.coin_id
    WHERE c.symbol = ? AND mc.timeframe = ?
    ORDER BY mc.open_time DESC
    LIMIT ?
  `, [symbol, timeframe, safeLimit]);

  return rows;
}

async function listActiveCoinsForJobs() {
  const [rows] = await db.query(`
    SELECT
      id,
      symbol,
      base_asset,
      quote_asset,
      name,
      exchange_symbol,
      default_timeframe,
      strategy_key,
      sort_order
    FROM coins
    WHERE is_active = 1
    ORDER BY sort_order ASC, symbol ASC
  `);

  return rows;
}

async function listAllCoins() {
  const [rows] = await db.query(`
    SELECT
      c.id,
      c.symbol,
      c.base_asset,
      c.quote_asset,
      c.name,
      c.exchange_symbol,
      c.default_timeframe,
      c.strategy_key,
      c.sort_order,
      c.is_active,
      c.created_at,
      latest_signal.signal_type,
      latest_signal.created_at AS signal_created_at
    FROM coins c
    LEFT JOIN signals latest_signal
      ON latest_signal.id = (
        SELECT s.id
        FROM signals s
        WHERE s.coin_id = c.id
        ORDER BY s.created_at DESC
        LIMIT 1
      )
    ORDER BY c.sort_order ASC, c.symbol ASC
  `);

  return rows;
}

async function createCoin(input) {
  const [result] = await db.query(`
    INSERT INTO coins (
      symbol,
      base_asset,
      quote_asset,
      name,
      exchange_symbol,
      default_timeframe,
      is_active,
      sort_order
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `, [
    input.symbol,
    input.baseAsset,
    input.quoteAsset,
    input.name,
    input.exchangeSymbol,
    input.defaultTimeframe,
    input.isActive ? 1 : 0,
    input.sortOrder
  ]);

  return result.insertId;
}

async function updateCoinActiveState(id, isActive) {
  const [result] = await db.query(`
    UPDATE coins
    SET is_active = ?
    WHERE id = ?
  `, [isActive ? 1 : 0, id]);

  return result.affectedRows > 0;
}

async function updateCoinAdminSettings(id, input) {
  const fields = [];
  const params = [];

  if (input.isActive !== undefined) {
    fields.push("is_active = ?");
    params.push(input.isActive ? 1 : 0);
  }

  if (input.defaultTimeframe !== undefined) {
    fields.push("default_timeframe = ?");
    params.push(input.defaultTimeframe);
  }

  if (input.strategyKey !== undefined) {
    fields.push("strategy_key = ?");
    params.push(input.strategyKey || null);
  }

  if (input.sortOrder !== undefined) {
    fields.push("sort_order = ?");
    params.push(input.sortOrder);
  }

  if (!fields.length) {
    return false;
  }

  const [result] = await db.query(`
    UPDATE coins
    SET ${fields.join(", ")}
    WHERE id = ?
  `, [...params, id]);

  return result.affectedRows > 0;
}

async function deleteCoin(id) {
  const [result] = await db.query(`
    DELETE FROM coins
    WHERE id = ?
  `, [id]);

  return result.affectedRows > 0;
}

function parseReasons(raw) {
  if (!raw) {
    return [];
  }

  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch (error) {
    return [];
  }
}

function buildSignalContractFromRow(signal) {
  if (!signal) {
    return null;
  }

  return buildSignalContract({
    signalType: signal.signal_type,
    confidenceScore: signal.confidence_score,
    summary: signal.summary,
    reasons: parseReasons(signal.reasons_json),
    blockerKeys: [],
    riskExceeded: false,
    stopLossPercent: signal.stop_loss_percent,
    takeProfitPercent: signal.take_profit_percent,
    createdAt: signal.created_at,
    higherTimeframeConfirmation: null
  });
}

function groupByCoinAndTimeframe(rows) {
  const outer = new Map();

  rows.forEach((row) => {
    if (!outer.has(row.coin_id)) {
      outer.set(row.coin_id, new Map());
    }

    outer.get(row.coin_id).set(row.timeframe, row);
  });

  return outer;
}

function pickPreferredTimeframe(timeframes) {
  const order = ["4h", "1d", "1h", "15m", "5m"];
  return order.find((timeframe) => timeframes[timeframe]) || Object.keys(timeframes)[0] || null;
}

module.exports = {
  listActiveCoins,
  getCoinBySymbol,
  getCoinById,
  getCoinCandles,
  listActiveCoinsForJobs,
  listAllCoins,
  createCoin,
  updateCoinActiveState,
  updateCoinAdminSettings,
  deleteCoin
};
