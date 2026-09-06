"use strict";

const db = require("../config/db");

async function upsertCandles(items) {
  if (!Array.isArray(items) || !items.length) {
    return 0;
  }

  let changed = 0;

  for (const item of items) {
    const [result] = await db.query(`
      INSERT INTO market_candles (
        coin_id,
        source_id,
        timeframe,
        open_time,
        close_time,
        open_price,
        high_price,
        low_price,
        close_price,
        volume,
        trades_count,
        raw_payload
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON DUPLICATE KEY UPDATE
        close_time = VALUES(close_time),
        open_price = VALUES(open_price),
        high_price = VALUES(high_price),
        low_price = VALUES(low_price),
        close_price = VALUES(close_price),
        volume = VALUES(volume),
        trades_count = VALUES(trades_count),
        raw_payload = VALUES(raw_payload)
    `, [
      item.coinId,
      item.sourceId,
      item.timeframe,
      item.openTime,
      item.closeTime,
      item.openPrice,
      item.highPrice,
      item.lowPrice,
      item.closePrice,
      item.volume,
      item.tradesCount,
      JSON.stringify(item.rawPayload || [])
    ]);

    if (result.affectedRows > 0) {
      changed += 1;
    }
  }

  return changed;
}

async function getRecentCandles(coinId, timeframe, limit) {
  const safeLimit = Math.max(1, Math.min(Number(limit) || 100, 1500));
  const [rows] = await db.query(`
    SELECT *
    FROM (
      SELECT
        id,
        coin_id,
        source_id,
        timeframe,
        open_time,
        close_time,
        open_price,
        high_price,
        low_price,
        close_price,
        volume,
        trades_count
      FROM market_candles
      WHERE coin_id = ? AND timeframe = ?
      ORDER BY open_time DESC
      LIMIT ?
    ) recent
    ORDER BY open_time ASC
  `, [coinId, timeframe, safeLimit]);

  return rows;
}

async function getRecentCandlesForBacktest(coinId, timeframe, limit) {
  return getRecentCandles(coinId, timeframe, limit);
}

module.exports = {
  upsertCandles,
  getRecentCandles,
  getRecentCandlesForBacktest
};
