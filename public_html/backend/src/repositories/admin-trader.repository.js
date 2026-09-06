"use strict";

const db = require("../config/db");

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
  getRecentCycleRuns
};
