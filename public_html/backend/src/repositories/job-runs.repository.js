"use strict";

const db = require("../config/db");

async function startJob(jobKey, details) {
  const [result] = await db.query(`
    INSERT INTO job_runs (job_key, status, started_at, details_json)
    VALUES (?, 'running', NOW(), ?)
  `, [jobKey, JSON.stringify(details || {})]);

  return result.insertId;
}

async function finishJobSuccess(id, rowsWritten, message, details) {
  await db.query(`
    UPDATE job_runs
    SET status = 'success',
        finished_at = NOW(),
        rows_written = ?,
        message = ?,
        details_json = ?
    WHERE id = ?
  `, [rowsWritten || 0, message || null, JSON.stringify(details || {}), id]);
}

async function finishJobError(id, message, details) {
  await db.query(`
    UPDATE job_runs
    SET status = 'error',
        finished_at = NOW(),
        message = ?,
        details_json = ?
    WHERE id = ?
  `, [message || "job_failed", JSON.stringify(details || {}), id]);
}

module.exports = {
  startJob,
  finishJobSuccess,
  finishJobError
};
