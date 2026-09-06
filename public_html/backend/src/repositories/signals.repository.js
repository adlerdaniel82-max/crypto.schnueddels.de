"use strict";

const db = require("../config/db");

async function replaceSignal(item) {
  await db.query(`
    DELETE FROM signals
    WHERE coin_id = ? AND timeframe = ? AND created_at = ?
  `, [item.coinId, item.timeframe, item.createdAt]);

  await db.query(`
    INSERT INTO signals (
      coin_id,
      source_id,
      timeframe,
      signal_type,
      confidence_score,
      close_price,
      rsi_value,
      macd_value,
      macd_signal_value,
      ema_fast,
      ema_slow,
      volume_ratio,
      stop_loss_percent,
      take_profit_percent,
      summary,
      reasons_json,
      created_at
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `, [
    item.coinId,
    item.sourceId,
    item.timeframe,
    item.signalType,
    item.confidenceScore,
    item.closePrice,
    item.rsiValue,
    item.macdValue,
    item.macdSignalValue,
    item.emaFast,
    item.emaSlow,
    item.volumeRatio,
    item.stopLossPercent,
    item.takeProfitPercent,
    item.summary,
    JSON.stringify(item.reasons || []),
    item.createdAt
  ]);
}

module.exports = {
  replaceSignal
};
