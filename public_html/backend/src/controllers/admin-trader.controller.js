"use strict";

const adminTraderRepo = require("../repositories/admin-trader.repository");
const { buildCycleRunsSeries, buildCycleRunsSummary } = require("../../../shared/cycle-runs");

async function getCycleRuns(req, res, next) {
  try {
    const limit = parsePositiveInt(req.query.limit, 10);
    const seriesLimit = parsePositiveInt(req.query.seriesLimit, 50);
    const fetchLimit = Math.max(limit, seriesLimit);
    const runs = await adminTraderRepo.getRecentCycleRuns(fetchLimit);
    const items = runs.slice(0, limit);
    const trendRuns = runs.slice(0, seriesLimit);
    res.json({
      items,
      summary: buildCycleRunsSummary(trendRuns),
      series: buildCycleRunsSeries(trendRuns, { limit: seriesLimit })
    });
  } catch (error) {
    next(error);
  }
}

function parsePositiveInt(value, fallback) {
  const numeric = Number.parseInt(value, 10);
  return Number.isInteger(numeric) && numeric > 0 ? numeric : fallback;
}

module.exports = {
  getCycleRuns
};
