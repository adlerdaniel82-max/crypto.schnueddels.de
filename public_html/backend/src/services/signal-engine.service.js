"use strict";

const { average, ema, rsi, macd } = require("../utils/indicators");
const { buildSignalContract } = require("./signal-contract");

function evaluateSignalConditions({ candles, strategy, higherTimeframeConfirmation = null }) {
  const closes = candles.map((candle) => Number(candle.close_price));
  const volumes = candles.map((candle) => Number(candle.volume));
  const latest = candles[candles.length - 1];

  if (!latest) {
    return null;
  }

  const emaFast = ema(closes, Number(strategy.fast_ema_period));
  const emaSlow = ema(closes, Number(strategy.slow_ema_period));
  const rsiValue = rsi(closes, 14);
  const macdResult = macd(
    closes,
    Number(strategy.macd_fast_period),
    Number(strategy.macd_slow_period),
    Number(strategy.macd_signal_period)
  );
  const recentVolumes = volumes.slice(-20);
  const averageVolume = average(recentVolumes);
  const volumeRatio = averageVolume ? Number(latest.volume) / averageVolume : null;
  const previousClose = closes.length >= 2 ? Number(closes[closes.length - 2]) : null;
  const percentChange = previousClose ? ((Number(latest.close_price) - previousClose) / previousClose) * 100 : null;
  const closePrice = Number(latest.close_price);

  const buyChecks = {
    trend: emaFast !== null && emaSlow !== null && closePrice > emaFast && emaFast > emaSlow,
    rsi: rsiValue !== null && rsiValue >= Number(strategy.rsi_min) && rsiValue <= Number(strategy.rsi_max),
    macd: Boolean(macdResult) && macdResult.value > macdResult.signal,
    volume: volumeRatio !== null && volumeRatio >= Number(strategy.volume_factor_min)
  };

  if (higherTimeframeConfirmation) {
    buyChecks.higher_tf_trend = Boolean(higherTimeframeConfirmation.trendUp);
  }

  return {
    latest,
    closePrice,
    emaFast,
    emaSlow,
    rsiValue,
    macdResult,
    volumeRatio,
    percentChange,
    buyChecks,
    riskExceeded: percentChange !== null && Math.abs(percentChange) > Number(strategy.max_daily_drop_percent),
    higherTimeframeConfirmation
  };
}

function buildSignal({ candles, strategy, higherTimeframeConfirmation = null }) {
  const analysis = evaluateSignalConditions({ candles, strategy, higherTimeframeConfirmation });
  if (!analysis) {
    return null;
  }

  const {
    latest,
    closePrice,
    emaFast,
    emaSlow,
    rsiValue,
    macdResult,
    volumeRatio,
    percentChange,
    buyChecks,
    riskExceeded,
    higherTimeframeConfirmation: resolvedHigherTimeframeConfirmation
  } = analysis;

  const reasons = [];
  let confidenceScore = 50;

  if (emaFast !== null && emaSlow !== null) {
    if (buyChecks.trend) {
      reasons.push("Kurs oberhalb EMA20 und EMA50");
      confidenceScore += 12;
    } else if (closePrice < emaFast && emaFast < emaSlow) {
      reasons.push("Kurs unter EMA20 und EMA50");
      confidenceScore -= 14;
    } else {
      reasons.push("Trendlage uneinheitlich");
      confidenceScore -= 4;
    }
  }

  if (rsiValue !== null) {
    if (buyChecks.rsi) {
      reasons.push(`RSI im Zielkorridor (${Number(strategy.rsi_min)}-${Number(strategy.rsi_max)})`);
      confidenceScore += 10;
    } else if (rsiValue > 70) {
      reasons.push("RSI ueber 70");
      confidenceScore -= 18;
    } else if (rsiValue < 35) {
      reasons.push("RSI unter 35");
      confidenceScore -= 10;
    } else {
      reasons.push("RSI ausserhalb des Zielkorridors");
      confidenceScore -= 5;
    }
  }

  if (macdResult) {
    if (buyChecks.macd) {
      reasons.push("MACD positiv");
      confidenceScore += 8;
    } else {
      reasons.push("MACD negativ");
      confidenceScore -= 8;
    }
  }

  if (volumeRatio !== null) {
    if (buyChecks.volume) {
      reasons.push("Volumen ueber Durchschnitt");
      confidenceScore += 6;
    } else {
      reasons.push("Volumen unter Schwellwert");
      confidenceScore -= 3;
    }
  }

  if (resolvedHigherTimeframeConfirmation) {
    if (buyChecks.higher_tf_trend) {
      reasons.push(`${resolvedHigherTimeframeConfirmation.timeframe} Trend bestaetigt`);
      confidenceScore += 8;
    } else {
      reasons.push(`${resolvedHigherTimeframeConfirmation.timeframe} Trend nicht bestaetigt`);
      confidenceScore -= 10;
    }
  }

  if (riskExceeded) {
    reasons.push("Kurzfristige Bewegung ueberschreitet Risikoschwelle");
    confidenceScore -= 12;
  }

  confidenceScore = Math.max(0, Math.min(100, confidenceScore));

  let signalType = "watch";
  let summary = "Struktur solide, aber noch ohne klares Long-Signal.";

  if (
    emaFast !== null &&
    emaSlow !== null &&
    rsiValue !== null &&
    macdResult &&
    volumeRatio !== null &&
    buyChecks.trend &&
    buyChecks.rsi &&
    buyChecks.macd &&
    buyChecks.volume &&
    (resolvedHigherTimeframeConfirmation ? buyChecks.higher_tf_trend : true)
  ) {
    signalType = "buy";
    summary = "Trend und Momentum bestaetigen einen moeglichen Einstieg.";
  } else if (
    emaFast !== null &&
    emaSlow !== null &&
    closePrice < emaFast &&
    emaFast < emaSlow &&
    ((rsiValue !== null && rsiValue > 70) || (macdResult && macdResult.value < macdResult.signal))
  ) {
    signalType = "sell";
    summary = "Trendbruch und Momentum sprechen fuer ein Exit-Signal.";
  } else if (
    (rsiValue !== null && rsiValue > 70) ||
    (volumeRatio !== null && volumeRatio >= Number(strategy.volume_factor_min) * 1.5 && percentChange !== null && percentChange > 0)
  ) {
    signalType = "avoid";
    summary = "Setup wirkt ueberhitzt oder kurzfristig unruhig.";
  } else if (confidenceScore < 45) {
    signalType = "waiting";
    summary = "Zu wenig Struktur fuer ein belastbares Signal.";
  }

  const blockerKeys = getBuyBlockerKeys(buyChecks);
  const createdAt = plusSeconds(latest.close_time, 60);

  return {
    signalType,
    confidenceScore,
    summary,
    reasons,
    closePrice,
    rsiValue,
    macdValue: macdResult ? macdResult.value : null,
    macdSignalValue: macdResult ? macdResult.signal : null,
    emaFast,
    emaSlow,
    volumeRatio,
    buyChecks,
    blockerKeys,
    higherTimeframeConfirmation: resolvedHigherTimeframeConfirmation,
    stopLossPercent: Number(strategy.stop_loss_percent),
    takeProfitPercent: Number(strategy.take_profit_percent),
    createdAt,
    contract: buildSignalContract({
      signalType,
      confidenceScore,
      summary,
      reasons,
      blockerKeys,
      riskExceeded,
      stopLossPercent: Number(strategy.stop_loss_percent),
      takeProfitPercent: Number(strategy.take_profit_percent),
      createdAt,
      higherTimeframeConfirmation: resolvedHigherTimeframeConfirmation
    })
  };
}

function getBuyBlockerKeys(buyChecks) {
  return Object.entries(buyChecks)
    .filter(([, passed]) => !passed)
    .map(([key]) => key);
}

function plusSeconds(sqlDateTime, seconds) {
  const value = new Date(`${sqlDateTime}Z`);
  value.setUTCSeconds(value.getUTCSeconds() + seconds);
  return value.toISOString().slice(0, 19).replace("T", " ");
}

module.exports = {
  buildSignal,
  evaluateSignalConditions
};
