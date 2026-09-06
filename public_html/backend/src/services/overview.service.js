"use strict";

const db = require("../config/db");

async function getOverview() {
  const [[summary]] = await db.query(`
    SELECT
      (SELECT COUNT(*) FROM coins WHERE is_active = 1) AS active_coins,
      (SELECT COUNT(DISTINCT timeframe) FROM strategy_settings WHERE is_active = 1) AS tracked_timeframes,
      (SELECT MAX(created_at) FROM signals) AS last_signal_at
  `);

  const [counts] = await db.query(`
    SELECT signal_type, COUNT(*) AS count
    FROM (
      SELECT s1.*
      FROM signals s1
      INNER JOIN (
        SELECT coin_id, MAX(created_at) AS latest_created_at
        FROM signals
        GROUP BY coin_id
      ) s2
        ON s1.coin_id = s2.coin_id
       AND s1.created_at = s2.latest_created_at
    ) latest
    GROUP BY signal_type
  `);

  const signalCounts = {
    buy: 0,
    watch: 0,
    avoid: 0,
    sell: 0,
    waiting: 0
  };

  counts.forEach((row) => {
    signalCounts[row.signal_type] = Number(row.count);
  });

  return {
    active_coins: Number(summary.active_coins || 0),
    tracked_timeframes: Number(summary.tracked_timeframes || 0),
    last_signal_at: summary.last_signal_at || null,
    signal_counts: signalCounts
  };
}

module.exports = {
  getOverview
};
