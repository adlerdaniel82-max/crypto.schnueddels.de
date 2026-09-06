"use strict";

const db = require("../config/db");

async function getActiveSourceByKey(sourceKey) {
  const [rows] = await db.query(`
    SELECT
      id,
      source_key,
      label,
      endpoint_url,
      poll_interval_seconds
    FROM data_sources
    WHERE source_key = ? AND is_active = 1
    LIMIT 1
  `, [sourceKey]);

  return rows[0] || null;
}

module.exports = {
  getActiveSourceByKey
};
