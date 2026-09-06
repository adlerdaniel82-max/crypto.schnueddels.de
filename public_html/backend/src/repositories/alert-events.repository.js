"use strict";

const db = require("../config/db");

async function countAlertEvents() {
  const [rows] = await db.query(`
    SELECT COUNT(*) AS total
    FROM alert_events
  `);

  return Number((rows[0] && rows[0].total) || 0);
}

async function hasAlertEvent(item) {
  const [rows] = await db.query(`
    SELECT id
    FROM alert_events
    WHERE coin_id = ?
      AND timeframe = ?
      AND alert_kind = ?
      AND signal_created_at = ?
    LIMIT 1
  `, [
    item.coinId,
    item.timeframe,
    item.alertKind,
    item.signalCreatedAt
  ]);

  return Boolean(rows[0]);
}

async function recordAlertEvent(item) {
  await db.query(`
    INSERT INTO alert_events (
      coin_id,
      timeframe,
      alert_kind,
      signal_created_at,
      payload_json
    )
    VALUES (?, ?, ?, ?, ?)
  `, [
    item.coinId,
    item.timeframe,
    item.alertKind,
    item.signalCreatedAt,
    JSON.stringify(item.payload || {})
  ]);
}

module.exports = {
  countAlertEvents,
  hasAlertEvent,
  recordAlertEvent
};
