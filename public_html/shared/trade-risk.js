"use strict";

function assessEntryDecision({
  coin,
  price,
  config,
  signal = null,
  openSymbols,
  openPositionCount,
  requireExchangeSymbol = true,
  useSignalRisk = false
}) {
  if (!coin || !coin.symbol) {
    return { action: "skip", reason: "invalid_coin" };
  }

  if (openSymbols && openSymbols.has(coin.symbol)) {
    return { action: "skip", reason: "open_position" };
  }

  if (requireExchangeSymbol && !coin.exchange_symbol) {
    return { action: "skip", reason: "missing_exchange_symbol" };
  }

  const normalizedSignal = normalizeSignal(signal);
  if (normalizedSignal) {
    if (normalizedSignal.type !== "buy") {
      return { action: "skip", reason: "non_buy_signal" };
    }

    if (normalizedSignal.blockers.length > 0) {
      return { action: "skip", reason: "signal_blocked", blockers: normalizedSignal.blockers };
    }

    if (normalizedSignal.riskExceeded) {
      return { action: "skip", reason: "risk_exceeded" };
    }
  }

  const entryPrice = Number(price);
  if (!Number.isFinite(entryPrice) || entryPrice <= 0) {
    return { action: "skip", reason: "invalid_price" };
  }

  const budgetEur = Number(config && config.budgetEur);
  const maxPerCoinEur = Number(config && config.maxPerCoinEur);
  if (!Number.isFinite(budgetEur) || budgetEur <= 0 || !Number.isFinite(maxPerCoinEur) || maxPerCoinEur <= 0) {
    return { action: "skip", reason: "budget_not_configured" };
  }

  const stopLossPercent = selectRiskPercent({
    config,
    signalRisk: normalizedSignal ? normalizedSignal.risk : null,
    key: "stopLossPercent",
    useSignalRisk
  });
  const takeProfitPercent = selectRiskPercent({
    config,
    signalRisk: normalizedSignal ? normalizedSignal.risk : null,
    key: "takeProfitPercent",
    useSignalRisk
  });

  if (!Number.isFinite(stopLossPercent) || stopLossPercent <= 0 || stopLossPercent >= 100) {
    return { action: "skip", reason: "invalid_stop_loss" };
  }
  if (!Number.isFinite(takeProfitPercent) || takeProfitPercent < 0) {
    return { action: "skip", reason: "invalid_take_profit" };
  }

  const deployedEur = Math.max(0, Number(openPositionCount || 0)) * maxPerCoinEur;
  const remainingBudgetEur = budgetEur - deployedEur;
  if (remainingBudgetEur < maxPerCoinEur) {
    return { action: "skip", reason: "budget_exhausted", remainingBudgetEur };
  }

  const volume = maxPerCoinEur / entryPrice;
  if (!Number.isFinite(volume) || volume <= 0) {
    return { action: "skip", reason: "invalid_volume" };
  }

  return {
    action: "buy",
    reason: "entry_allowed",
    budgetEur: maxPerCoinEur,
    remainingBudgetEur,
    volume,
    stopLossPercent,
    takeProfitPercent,
    stopLossPrice: roundPrice(entryPrice * (1 - stopLossPercent / 100)),
    takeProfitPrice: takeProfitPercent > 0 ? roundPrice(entryPrice * (1 + takeProfitPercent / 100)) : null
  };
}

function normalizeSignal(signal) {
  if (!signal) {
    return null;
  }

  const risk = signal.risk || {};
  return {
    type: signal.type || signal.signalType || null,
    blockers: Array.isArray(signal.blockers)
      ? signal.blockers
      : (Array.isArray(signal.blockerKeys) ? signal.blockerKeys : []),
    riskExceeded: Boolean(risk.riskExceeded || signal.riskExceeded),
    risk
  };
}

function selectRiskPercent({ config, signalRisk, key, useSignalRisk }) {
  const first = useSignalRisk && signalRisk ? signalRisk[key] : config && config[key];
  const second = useSignalRisk ? config && config[key] : signalRisk && signalRisk[key];
  const firstValue = Number(first);
  if (Number.isFinite(firstValue)) {
    return firstValue;
  }

  return Number(second);
}

function roundPrice(value) {
  return Math.round(Number(value) * 100000000) / 100000000;
}

function createRiskSkipCounter() {
  return {
    total: 0,
    reasonCounts: {},
    blockerCounts: {}
  };
}

function recordRiskSkip(counter, decision) {
  if (!counter || !decision || !decision.reason) {
    return counter;
  }

  counter.total += 1;
  counter.reasonCounts[decision.reason] = Number(counter.reasonCounts[decision.reason] || 0) + 1;

  if (Array.isArray(decision.blockers)) {
    decision.blockers.forEach((key) => {
      if (!key) return;
      counter.blockerCounts[key] = Number(counter.blockerCounts[key] || 0) + 1;
    });
  }

  return counter;
}

function mergeRiskSkipCounters(target, source) {
  if (!target || !source) {
    return target;
  }

  target.total += Number(source.total || 0);
  mergeCountMap(target.reasonCounts, source.reasonCounts);
  mergeCountMap(target.blockerCounts, source.blockerCounts);

  return target;
}

function buildRiskSkipStats(counter) {
  const total = Number(counter && counter.total ? counter.total : 0);
  const reasonCounts = counter && counter.reasonCounts ? counter.reasonCounts : {};
  const blockerCounts = counter && counter.blockerCounts ? counter.blockerCounts : {};

  return {
    total,
    reasons: buildCountStats(reasonCounts, total),
    blockers: buildCountStats(blockerCounts, total)
  };
}

function mergeCountMap(target, source) {
  Object.entries(source || {}).forEach(([key, value]) => {
    target[key] = Number(target[key] || 0) + Number(value || 0);
  });
}

function buildCountStats(counts, total) {
  return Object.entries(counts || {})
    .map(([key, value]) => ({
      key,
      count: Number(value || 0),
      share_percent: total ? roundPercent((Number(value || 0) / total) * 100) : null
    }))
    .filter((item) => item.count > 0)
    .sort((left, right) => {
      if (right.count !== left.count) {
        return right.count - left.count;
      }

      return left.key.localeCompare(right.key);
    });
}

function roundPercent(value) {
  return Math.round(Number(value) * 100) / 100;
}

module.exports = {
  assessEntryDecision,
  buildRiskSkipStats,
  createRiskSkipCounter,
  mergeRiskSkipCounters,
  recordRiskSkip
};
