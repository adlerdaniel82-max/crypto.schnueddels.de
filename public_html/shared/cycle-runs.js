"use strict";

function buildCycleRunsSummary(runs) {
  const items = Array.isArray(runs) ? runs : [];
  const riskSkipCounter = createCounter();
  let totalBuys = 0;
  let totalSells = 0;
  let totalPartialSells = 0;
  let totalSkippedBuys = 0;
  let skippedRuns = 0;

  items.forEach((run) => {
    const result = run && run.result ? run.result : {};
    const stats = result.riskSkipStats || {};

    if (run && run.skipped) {
      skippedRuns += 1;
    }

    totalBuys += Number(result.buys || 0);
    totalSells += Number(result.sells || 0);
    totalPartialSells += Number(result.partialSells || 0);
    totalSkippedBuys += Number(result.skippedBuys || 0);
    riskSkipCounter.total += Number(stats.total || 0);

    mergeCountMap(riskSkipCounter.reasonCounts, toCountMap(stats.reasons));
    mergeCountMap(riskSkipCounter.blockerCounts, toCountMap(stats.blockers));
  });

  const totalRuns = items.length;
  const completedRuns = totalRuns - skippedRuns;
  const topReason = pickTopEntry(riskSkipCounter.reasonCounts, riskSkipCounter.total);
  const topBlocker = pickTopEntry(riskSkipCounter.blockerCounts, riskSkipCounter.total);

  return {
    total_runs: totalRuns,
    completed_runs: completedRuns,
    skipped_runs: skippedRuns,
    total_buys: totalBuys,
    total_sells: totalSells,
    total_partial_sells: totalPartialSells,
    total_skipped_buys: totalSkippedBuys,
    total_risk_skips: riskSkipCounter.total,
    average_buys_per_run: round(totalBuys / totalRuns),
    average_skipped_buys_per_run: round(totalSkippedBuys / totalRuns),
    average_risk_skips_per_run: round(riskSkipCounter.total / totalRuns),
    top_risk_skip_reason: topReason,
    top_risk_skip_blocker: topBlocker
  };
}

function buildCycleRunsSeries(runs, options = {}) {
  const items = Array.isArray(runs) ? runs.slice() : [];
  const numericLimit = Number(options.limit);
  const limit = Number.isInteger(numericLimit) && numericLimit > 0 ? Math.min(numericLimit, 50) : 50;
  const ordered = items
    .slice()
    .sort(compareCycleRunsByCreatedAt)
    .slice(-limit);

  const points = ordered.map((run) => {
    const result = run && run.result ? run.result : {};
    const riskSkipStats = result.riskSkipStats || {};
    const buys = Number(result.buys || 0);
    const sells = Number(result.sells || 0);
    const partialSells = Number(result.partialSells || 0);
    const skippedBuys = Number(result.skippedBuys || 0);
    const riskSkips = Number(riskSkipStats.total || 0);
    const executed = buys + sells + partialSells;
    const blocked = skippedBuys + riskSkips;

    return {
      created_at: run && (run.createdAt || run.created_at) ? (run.createdAt || run.created_at) : null,
      mode: run && run.mode ? run.mode : "long",
      skipped: Boolean(run && run.skipped),
      dry_run: Boolean(run && run.dryRun),
      buys,
      sells,
      partial_sells: partialSells,
      skipped_buys: skippedBuys,
      risk_skips: riskSkips,
      executed,
      blocked
    };
  });

  const maxExecuted = points.reduce((max, point) => Math.max(max, point.executed), 0);
  const maxBlocked = points.reduce((max, point) => Math.max(max, point.blocked), 0);
  const firstPoint = points[0] || null;
  const lastPoint = points.length ? points[points.length - 1] : null;

  return {
    limit,
    total_runs: points.length,
    points,
    max_executed: maxExecuted,
    max_blocked: maxBlocked,
    first_point: firstPoint,
    last_point: lastPoint,
    trend: firstPoint && lastPoint ? {
      executed_delta: lastPoint.executed - firstPoint.executed,
      blocked_delta: lastPoint.blocked - firstPoint.blocked,
      risk_delta: lastPoint.risk_skips - firstPoint.risk_skips
    } : null
  };
}

function createCounter() {
  return {
    total: 0,
    reasonCounts: {},
    blockerCounts: {}
  };
}

function toCountMap(items) {
  const counts = {};
  (Array.isArray(items) ? items : []).forEach((item) => {
    if (!item || !item.key) return;
    counts[item.key] = Number(item.count || 0);
  });
  return counts;
}

function mergeCountMap(target, source) {
  Object.entries(source || {}).forEach(([key, value]) => {
    target[key] = Number(target[key] || 0) + Number(value || 0);
  });
}

function pickTopEntry(counts, total) {
  const entries = Object.entries(counts || {})
    .filter(([, count]) => Number(count) > 0)
    .sort((left, right) => {
      if (Number(right[1]) !== Number(left[1])) {
        return Number(right[1]) - Number(left[1]);
      }
      return String(left[0]).localeCompare(String(right[0]));
    });

  if (!entries.length) {
    return null;
  }

  const [key, count] = entries[0];
  return {
    key,
    count: Number(count),
    share_percent: total ? round((Number(count) / total) * 100) : null
  };
}

function round(value) {
  if (value === null || value === undefined || !Number.isFinite(Number(value))) {
    return null;
  }

  return Math.round(Number(value) * 100) / 100;
}

function compareCycleRunsByCreatedAt(left, right) {
  const leftTime = toCycleRunTime(left);
  const rightTime = toCycleRunTime(right);

  if (leftTime !== null && rightTime !== null && leftTime !== rightTime) {
    return leftTime - rightTime;
  }
  if (leftTime !== null && rightTime === null) {
    return -1;
  }
  if (leftTime === null && rightTime !== null) {
    return 1;
  }

  return 0;
}

function toCycleRunTime(run) {
  if (!run) {
    return null;
  }

  const raw = run.createdAt || run.created_at;
  if (!raw) {
    return null;
  }

  const timestamp = new Date(raw).getTime();
  return Number.isFinite(timestamp) ? timestamp : null;
}

module.exports = {
  buildCycleRunsSeries,
  buildCycleRunsSummary
};
