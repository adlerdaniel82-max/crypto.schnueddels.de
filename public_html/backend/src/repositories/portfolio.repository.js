"use strict";

const db = require("../config/db");

async function saveSnapshot({ balances, openOrders }) {
  const balancesJson = JSON.stringify(balances || {});
  const openOrdersJson = JSON.stringify(openOrders || []);
  const openOrderCount = Array.isArray(openOrders) ? openOrders.length : 0;

  const [result] = await db.query(`
    INSERT INTO portfolio_snapshots (balances_json, open_orders_json, open_order_count)
    VALUES (?, ?, ?)
  `, [balancesJson, openOrdersJson, openOrderCount]);

  return result.insertId;
}

async function getLatestSnapshot() {
  const [rows] = await db.query(`
    SELECT
      id,
      fetched_at,
      balances_json,
      open_orders_json,
      open_order_count
    FROM portfolio_snapshots
    ORDER BY fetched_at DESC
    LIMIT 1
  `);

  if (!rows.length) {
    return null;
  }

  const row = rows[0];
  return {
    id: row.id,
    fetchedAt: row.fetched_at,
    balances: typeof row.balances_json === "string"
      ? JSON.parse(row.balances_json)
      : row.balances_json,
    openOrders: typeof row.open_orders_json === "string"
      ? JSON.parse(row.open_orders_json)
      : row.open_orders_json,
    openOrderCount: row.open_order_count
  };
}

module.exports = {
  saveSnapshot,
  getLatestSnapshot
};
