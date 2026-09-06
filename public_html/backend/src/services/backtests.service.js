"use strict";

const coinsRepository = require("../repositories/coins.repository");
const settingsRepository = require("../repositories/settings.repository");
const marketCandlesRepository = require("../repositories/market-candles.repository");
const { buildSignal, evaluateSignalConditions } = require("./signal-engine.service");
const {
  assessEntryDecision,
  buildRiskSkipStats,
  createRiskSkipCounter,
  mergeRiskSkipCounters,
  recordRiskSkip
} = require("../../../shared/trade-risk");

const EXIT_SIGNALS = new Set(["sell", "avoid"]);
const BUY_BLOCKER_KEYS = ["trend", "rsi", "macd", "volume", "higher_tf_trend"];

async function runBacktests(options = {}) {
  const lookback = normalizeLookback(options.lookback);
  const [coins, settings] = await Promise.all([
    coinsRepository.listActiveCoinsForJobs(),
    settingsRepository.listActiveSettings()
  ]);

  const items = [];

  for (const strategy of settings) {
    const coinResults = [];
    const confirmationStrategy = getConfirmationStrategy(strategy, settings);

    for (const coin of coins) {
      const candles = await marketCandlesRepository.getRecentCandlesForBacktest(
        coin.id,
        strategy.timeframe,
        lookback + getWarmupLength(strategy) + 2
      );
      const confirmationCandles = confirmationStrategy
        ? await marketCandlesRepository.getRecentCandlesForBacktest(
          coin.id,
          confirmationStrategy.timeframe,
          lookback + getWarmupLength(confirmationStrategy) + 30
        )
        : [];

      coinResults.push(runCoinBacktest({
        coin,
        strategy,
        candles,
        lookback,
        confirmationStrategy,
        confirmationCandles
      }));
    }

    items.push(buildStrategySummary(strategy, coinResults, lookback));
  }

  return {
    generated_at: new Date().toISOString(),
    lookback_candles: lookback,
    items
  };
}

function runCoinBacktest({ coin, strategy, candles, lookback, confirmationStrategy = null, confirmationCandles = [] }) {
  const warmup = getWarmupLength(strategy);
  const usableCandles = Array.isArray(candles) ? candles.slice(-(lookback + warmup + 1)) : [];

  if (usableCandles.length <= warmup + 1) {
    return {
      coin_id: coin.id,
      symbol: coin.symbol,
      name: coin.name,
      timeframe: strategy.timeframe,
      candles_available: usableCandles.length,
      warmup_candles: warmup,
      trades_count: 0,
      wins: 0,
      losses: 0,
      win_rate_percent: null,
      average_return_percent: null,
      total_return_percent: null,
      max_drawdown_percent: null,
      best_trade_percent: null,
      worst_trade_percent: null,
      average_hold_candles: null,
      open_position: false,
      first_signal_at: null,
      last_trade_at: null,
      risk_skip_counts: {},
      risk_skip_blocker_counts: {},
      risk_skip_stats: buildRiskSkipStats(createRiskSkipCounter())
    };
  }

  const trades = [];
  const blockerCounts = createBlockerCounter();
  const riskSkipCounter = createRiskSkipCounter();
  let position = null;
  let firstSignalAt = null;
  let evaluationCount = 0;
  let blockedEvaluationCount = 0;

  for (let index = warmup - 1; index < usableCandles.length - 1; index += 1) {
    const window = usableCandles.slice(0, index + 1);
    const higherTimeframeConfirmation = getHigherTimeframeConfirmation({
      strategy,
      confirmationStrategy,
      confirmationCandles,
      targetCloseTime: window[window.length - 1].close_time
    });
    const signal = buildSignal({
      candles: window,
      strategy,
      higherTimeframeConfirmation
    });
    const nextCandle = usableCandles[index + 1];

    if (!signal || !nextCandle) {
      continue;
    }
    const contract = signal.contract || signal;

    if (!firstSignalAt && signal.createdAt) {
      firstSignalAt = signal.createdAt;
    }

    if (!position) {
      evaluationCount += 1;
      if ((contract.type || signal.signalType) !== "buy") {
        blockedEvaluationCount += 1;
        const blockers = contract.blockers || signal.blockerKeys || [];
        blockers.forEach((key) => {
          blockerCounts[key] += 1;
        });
        recordRiskSkip(riskSkipCounter, {
          reason: "non_buy_signal",
          blockers
        });
      }
    }

    if (position) {
      if (EXIT_SIGNALS.has(contract.type || signal.signalType)) {
        finalizeTrade(trades, position, {
          exitPrice: Number(nextCandle.open_price),
          exitTime: nextCandle.open_time,
          exitReason: contract.type || signal.signalType,
          candleIndex: index + 1
        });
        position = null;
        continue;
      }

      const intrabarExit = getIntrabarExit(position, nextCandle, index + 1);
      if (intrabarExit) {
        finalizeTrade(trades, position, intrabarExit);
        position = null;
        continue;
      }
    }

    if (!position && (contract.type || signal.signalType) === "buy") {
      const entryDecision = assessEntryDecision({
        coin,
        price: nextCandle.open_price,
        config: createBacktestRiskConfig(strategy),
        signal: contract,
        openSymbols: new Set(),
        openPositionCount: 0,
        requireExchangeSymbol: false,
        useSignalRisk: true
      });
      if (entryDecision.action !== "buy") {
        blockedEvaluationCount += 1;
        recordRiskSkip(riskSkipCounter, entryDecision);
        continue;
      }

      position = createPosition(entryDecision, nextCandle, index + 1);
      const intrabarExit = getIntrabarExit(position, nextCandle, index + 1);
      if (intrabarExit) {
        finalizeTrade(trades, position, intrabarExit);
        position = null;
      }
    }
  }

  if (position) {
    const lastCandle = usableCandles[usableCandles.length - 1];
    finalizeTrade(trades, position, {
      exitPrice: Number(lastCandle.close_price),
      exitTime: lastCandle.close_time,
      exitReason: "mark_to_market",
      candleIndex: usableCandles.length - 1
    });
    position = null;
  }

  return buildCoinSummary({
    coin,
    strategy,
    candles: usableCandles,
    warmup,
    trades,
    firstSignalAt,
    evaluationCount,
    blockedEvaluationCount,
    blockerCounts,
    riskSkipCounter
  });
}

function createBacktestRiskConfig(strategy) {
  return {
    budgetEur: 1,
    maxPerCoinEur: 1,
    stopLossPercent: strategy.stop_loss_percent,
    takeProfitPercent: strategy.take_profit_percent
  };
}

function createPosition(entryDecision, candle, entryIndex) {
  const entryPrice = Number(candle.open_price);

  return {
    entryIndex,
    entryPrice,
    entryTime: candle.open_time,
    stopLossPercent: entryDecision.stopLossPercent,
    takeProfitPercent: entryDecision.takeProfitPercent,
    stopLossPrice: entryDecision.stopLossPrice,
    takeProfitPrice: entryDecision.takeProfitPrice
  };
}

function getIntrabarExit(position, candle, candleIndex) {
  const low = Number(candle.low_price);
  const high = Number(candle.high_price);

  if (position.stopLossPrice !== null && low <= position.stopLossPrice) {
    return {
      exitPrice: position.stopLossPrice,
      exitTime: candle.close_time,
      exitReason: "stop_loss",
      candleIndex
    };
  }

  if (position.takeProfitPrice !== null && high >= position.takeProfitPrice) {
    return {
      exitPrice: position.takeProfitPrice,
      exitTime: candle.close_time,
      exitReason: "take_profit",
      candleIndex
    };
  }

  return null;
}

function finalizeTrade(trades, position, exit) {
  const returnPercent = ((Number(exit.exitPrice) - position.entryPrice) / position.entryPrice) * 100;

  trades.push({
    entry_time: position.entryTime,
    exit_time: exit.exitTime,
    entry_price: round(position.entryPrice, 8),
    exit_price: round(Number(exit.exitPrice), 8),
    return_percent: round(returnPercent, 4),
    hold_candles: Math.max(1, Number(exit.candleIndex) - Number(position.entryIndex) + 1),
    exit_reason: exit.exitReason
  });
}

function buildCoinSummary({ coin, strategy, candles, warmup, trades, firstSignalAt, evaluationCount, blockedEvaluationCount, blockerCounts, riskSkipCounter }) {
  const returns = trades.map((trade) => Number(trade.return_percent));
  const wins = returns.filter((value) => value > 0).length;
  const losses = returns.filter((value) => value <= 0).length;
  const equityCurve = buildEquityCurve(returns);
  const lastTrade = trades[trades.length - 1] || null;

  return {
    coin_id: coin.id,
    symbol: coin.symbol,
    name: coin.name,
    timeframe: strategy.timeframe,
    candles_available: candles.length,
    warmup_candles: warmup,
    period_start: candles[0] ? candles[0].open_time : null,
    period_end: candles[candles.length - 1] ? candles[candles.length - 1].close_time : null,
    trades_count: trades.length,
    wins,
    losses,
    win_rate_percent: trades.length ? round((wins / trades.length) * 100, 2) : null,
    average_return_percent: trades.length ? round(average(returns), 4) : null,
    total_return_percent: trades.length ? round((equityCurve[equityCurve.length - 1] - 1) * 100, 4) : null,
    max_drawdown_percent: equityCurve.length ? round(getMaxDrawdownPercent(equityCurve), 4) : null,
    best_trade_percent: returns.length ? round(Math.max(...returns), 4) : null,
    worst_trade_percent: returns.length ? round(Math.min(...returns), 4) : null,
    average_hold_candles: trades.length ? round(average(trades.map((trade) => trade.hold_candles)), 2) : null,
    open_position: false,
    first_signal_at: firstSignalAt,
    last_trade_at: lastTrade ? lastTrade.exit_time : null,
    last_exit_reason: lastTrade ? lastTrade.exit_reason : null,
    evaluation_count: evaluationCount,
    blocked_evaluation_count: blockedEvaluationCount,
    blocker_counts: blockerCounts,
    blocker_stats: buildBlockerStats(blockerCounts, blockedEvaluationCount),
    top_blocker: getTopBlocker(blockerCounts),
    risk_skip_counts: riskSkipCounter.reasonCounts,
    risk_skip_blocker_counts: riskSkipCounter.blockerCounts,
    risk_skip_stats: buildRiskSkipStats(riskSkipCounter)
  };
}

function buildStrategySummary(strategy, coinResults, lookback) {
  const resultsWithTrades = coinResults.filter((item) => item.trades_count > 0);
  const totalTrades = resultsWithTrades.reduce((sum, item) => sum + item.trades_count, 0);
  const totalWins = resultsWithTrades.reduce((sum, item) => sum + item.wins, 0);
  const averageTrade = average(resultsWithTrades.map((item) => item.average_return_percent).filter(isFiniteNumber));
  const averageTotal = average(resultsWithTrades.map((item) => item.total_return_percent).filter(isFiniteNumber));
  const averageDrawdown = average(resultsWithTrades.map((item) => item.max_drawdown_percent).filter(isFiniteNumber));

  const ranked = resultsWithTrades
    .filter((item) => isFiniteNumber(item.total_return_percent))
    .slice()
    .sort((left, right) => Number(right.total_return_percent) - Number(left.total_return_percent));
  const blockerCounts = createBlockerCounter();
  const riskSkipCounter = createRiskSkipCounter();
  let blockedEvaluationCount = 0;

  coinResults.forEach((item) => {
    blockedEvaluationCount += Number(item.blocked_evaluation_count || 0);
    BUY_BLOCKER_KEYS.forEach((key) => {
      blockerCounts[key] += Number((item.blocker_counts && item.blocker_counts[key]) || 0);
    });
    mergeRiskSkipCounters(riskSkipCounter, {
      total: item.risk_skip_stats ? item.risk_skip_stats.total : 0,
      reasonCounts: item.risk_skip_counts || {},
      blockerCounts: item.risk_skip_blocker_counts || {}
    });
  });

  return {
    setting_key: strategy.setting_key,
    label: strategy.label,
    timeframe: strategy.timeframe,
    notes: strategy.notes || "",
    lookback_candles: lookback,
    coins_tested: coinResults.length,
    coins_with_trades: resultsWithTrades.length,
    trades_count: totalTrades,
    win_rate_percent: totalTrades ? round((totalWins / totalTrades) * 100, 2) : null,
    average_trade_percent: isFiniteNumber(averageTrade) ? round(averageTrade, 4) : null,
    average_total_return_percent: isFiniteNumber(averageTotal) ? round(averageTotal, 4) : null,
    average_max_drawdown_percent: isFiniteNumber(averageDrawdown) ? round(averageDrawdown, 4) : null,
    best_coin: ranked[0] ? {
      symbol: ranked[0].symbol,
      total_return_percent: ranked[0].total_return_percent
    } : null,
    worst_coin: ranked.length ? {
      symbol: ranked[ranked.length - 1].symbol,
      total_return_percent: ranked[ranked.length - 1].total_return_percent
    } : null,
    blocker_counts: blockerCounts,
    blocker_stats: buildBlockerStats(blockerCounts, blockedEvaluationCount),
    top_blocker: getTopBlocker(blockerCounts),
    risk_skip_counts: riskSkipCounter.reasonCounts,
    risk_skip_blocker_counts: riskSkipCounter.blockerCounts,
    risk_skip_stats: buildRiskSkipStats(riskSkipCounter),
    items: coinResults
  };
}

function createBlockerCounter() {
  return {
    trend: 0,
    rsi: 0,
    macd: 0,
    volume: 0,
    higher_tf_trend: 0
  };
}

function buildBlockerStats(blockerCounts, blockedEvaluationCount) {
  return BUY_BLOCKER_KEYS.map((key) => ({
    key,
    count: Number(blockerCounts[key] || 0),
    share_percent: blockedEvaluationCount ? round((Number(blockerCounts[key] || 0) / blockedEvaluationCount) * 100, 2) : null
  }))
    .filter((item) => item.count > 0)
    .sort((left, right) => right.count - left.count);
}

function getTopBlocker(blockerCounts) {
  const stats = buildBlockerStats(blockerCounts, Object.values(blockerCounts).reduce((sum, value) => sum + Number(value || 0), 0));
  return stats[0] ? stats[0].key : null;
}

function getWarmupLength(strategy) {
  return Math.max(
    Number(strategy.slow_ema_period) + Number(strategy.macd_signal_period) + 5,
    60
  );
}

function getConfirmationStrategy(strategy, settings) {
  if (strategy.timeframe !== "4h") {
    return null;
  }

  return settings.find((item) => item.timeframe === "1d") || null;
}

function getHigherTimeframeConfirmation({ strategy, confirmationStrategy, confirmationCandles, targetCloseTime }) {
  if (strategy.timeframe !== "4h" || !confirmationStrategy) {
    return null;
  }

  const filteredCandles = confirmationCandles.filter((candle) => candle.close_time <= targetCloseTime);
  const requiredLength = getWarmupLength(confirmationStrategy);

  if (filteredCandles.length < requiredLength) {
    return {
      timeframe: confirmationStrategy.timeframe,
      trendUp: false,
      available: false
    };
  }

  const analysis = evaluateSignalConditions({
    candles: filteredCandles.slice(-requiredLength),
    strategy: confirmationStrategy
  });

  return {
    timeframe: confirmationStrategy.timeframe,
    trendUp: Boolean(analysis && analysis.buyChecks && analysis.buyChecks.trend),
    available: true
  };
}

function buildEquityCurve(returns) {
  const curve = [];
  let equity = 1;

  returns.forEach((value) => {
    equity *= 1 + (Number(value) / 100);
    curve.push(equity);
  });

  return curve;
}

function getMaxDrawdownPercent(curve) {
  let peak = curve[0];
  let maxDrawdown = 0;

  curve.forEach((value) => {
    if (value > peak) {
      peak = value;
      return;
    }

    const drawdown = ((peak - value) / peak) * 100;
    if (drawdown > maxDrawdown) {
      maxDrawdown = drawdown;
    }
  });

  return maxDrawdown;
}

function average(values) {
  if (!values.length) {
    return null;
  }

  return values.reduce((sum, value) => sum + Number(value), 0) / values.length;
}

function normalizeLookback(value) {
  const numeric = Number(value);
  if (!Number.isInteger(numeric) || numeric < 120) {
    return 720;
  }

  return Math.min(numeric, 1200);
}

function round(value, digits) {
  const factor = 10 ** digits;
  return Math.round(Number(value) * factor) / factor;
}

function isFiniteNumber(value) {
  if (value === null || value === undefined || value === "") {
    return false;
  }

  return Number.isFinite(Number(value));
}

module.exports = {
  runCoinBacktest,
  runBacktests
};
