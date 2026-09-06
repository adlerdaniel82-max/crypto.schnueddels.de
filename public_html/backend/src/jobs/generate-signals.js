"use strict";

const db = require("../config/db");
const coinsRepository = require("../repositories/coins.repository");
const settingsRepository = require("../repositories/settings.repository");
const marketCandlesRepository = require("../repositories/market-candles.repository");
const signalsRepository = require("../repositories/signals.repository");
const alertEventsRepository = require("../repositories/alert-events.repository");
const jobRunsRepository = require("../repositories/job-runs.repository");
const signalEngine = require("../services/signal-engine.service");
const telegramAlertsService = require("../services/telegram-alerts.service");

async function main() {
  const jobId = await jobRunsRepository.startJob("generate_signals", {});

  try {
    const [coins, settings, allSettings] = await Promise.all([
      coinsRepository.listActiveCoinsForJobs(),
      settingsRepository.listActiveSettings(),
      settingsRepository.listAllActiveSettings()
    ]);
    const settingsByTimeframe = new Map(settings.map((item) => [item.timeframe, item]));
    const settingsByKey = new Map(allSettings.map((item) => [item.setting_key, item]));

    let rowsWritten = 0;

    for (const coin of coins) {
      const coinOverride = coin.strategy_key ? settingsByKey.get(coin.strategy_key) : null;

      for (const strategy of settings) {
        const effectiveStrategy = (coinOverride && coinOverride.timeframe === strategy.timeframe)
          ? coinOverride
          : strategy;
        const requiredLength = Math.max(
          Number(effectiveStrategy.slow_ema_period) + Number(effectiveStrategy.macd_signal_period) + 5,
          60
        );
        const candles = await marketCandlesRepository.getRecentCandles(coin.id, effectiveStrategy.timeframe, requiredLength);
        const higherTimeframeConfirmation = await loadHigherTimeframeConfirmation({
          coinId: coin.id,
          strategy: effectiveStrategy,
          settingsByTimeframe
        });

        if (!candles.length) {
          continue;
        }

        const signal = signalEngine.buildSignal({
          candles,
          strategy: effectiveStrategy,
          higherTimeframeConfirmation
        });

        if (!signal || !signal.createdAt) {
          continue;
        }
        const contract = signal.contract || signal;

        const latestCandle = candles[candles.length - 1];
        const sourceId = Number(latestCandle && latestCandle.source_id) || null;
        if (!sourceId) {
          continue;
        }

        await signalsRepository.replaceSignal({
          coinId: coin.id,
          sourceId,
          timeframe: effectiveStrategy.timeframe,
          signalType: signal.signalType,
          confidenceScore: signal.confidenceScore,
          closePrice: signal.closePrice,
          rsiValue: signal.rsiValue,
          macdValue: signal.macdValue,
          macdSignalValue: signal.macdSignalValue,
          emaFast: signal.emaFast,
          emaSlow: signal.emaSlow,
          volumeRatio: signal.volumeRatio,
          stopLossPercent: contract.risk ? contract.risk.stopLossPercent : signal.stopLossPercent,
          takeProfitPercent: contract.risk ? contract.risk.takeProfitPercent : signal.takeProfitPercent,
          summary: contract.summary || signal.summary,
          reasons: contract.reasons || signal.reasons,
          createdAt: signal.createdAt
        });

        rowsWritten += 1;
      }
    }

    const alertSummary = await processTelegramAlerts();

    await jobRunsRepository.finishJobSuccess(
      jobId,
      rowsWritten,
      "Signal generation completed.",
      {
        coins: coins.length,
        strategies: settings.length,
        alerts: alertSummary
      }
    );

    console.log(`[crypto] generate-signals completed, rows=${rowsWritten}, alerts_sent=${alertSummary.sent || 0}, alerts_bootstrapped=${alertSummary.bootstrapped || 0}`);
  } catch (error) {
    await jobRunsRepository.finishJobError(jobId, error.message, {
      stack: error.stack
    });
    console.error("[crypto] generate-signals failed", error);
    process.exit(1);
  } finally {
    await db.end();
  }
}

async function processTelegramAlerts() {
  if (!telegramAlertsService.isConfigured()) {
    return {
      enabled: false,
      reason: "telegram_not_configured",
      sent: 0,
      bootstrapped: 0,
      skipped_existing: 0,
      failed: 0
    };
  }

  const coins = await coinsRepository.listActiveCoins();
  const candidates = buildAlertCandidates(coins);

  if (!candidates.length) {
    return {
      enabled: true,
      sent: 0,
      bootstrapped: 0,
      skipped_existing: 0,
      failed: 0
    };
  }

  const existingCount = await alertEventsRepository.countAlertEvents();
  if (existingCount === 0) {
    for (const candidate of candidates) {
      await alertEventsRepository.recordAlertEvent({
        coinId: candidate.coinId,
        timeframe: candidate.timeframe,
        alertKind: candidate.alertKind,
        signalCreatedAt: candidate.signalCreatedAt,
        payload: {
          bootstrap: true,
          symbol: candidate.symbol
        }
      });
    }

    return {
      enabled: true,
      sent: 0,
      bootstrapped: candidates.length,
      skipped_existing: 0,
      failed: 0
    };
  }

  let sent = 0;
  let skippedExisting = 0;
  let failed = 0;

  for (const candidate of candidates) {
    const exists = await alertEventsRepository.hasAlertEvent(candidate);
    if (exists) {
      skippedExisting += 1;
      continue;
    }

    try {
      await telegramAlertsService.sendMessage(candidate.message);
      await alertEventsRepository.recordAlertEvent({
        coinId: candidate.coinId,
        timeframe: candidate.timeframe,
        alertKind: candidate.alertKind,
        signalCreatedAt: candidate.signalCreatedAt,
        payload: {
          symbol: candidate.symbol,
          kind: candidate.alertKind
        }
      });
      sent += 1;
    } catch (error) {
      failed += 1;
      console.error(`[crypto] telegram alert failed for ${candidate.symbol} ${candidate.alertKind}`, error.message);
    }
  }

  return {
    enabled: true,
    sent,
    bootstrapped: 0,
    skipped_existing: skippedExisting,
    failed
  };
}

async function loadHigherTimeframeConfirmation({ coinId, strategy, settingsByTimeframe }) {
  if (strategy.timeframe !== "4h") {
    return null;
  }

  const confirmationStrategy = settingsByTimeframe.get("1d");
  if (!confirmationStrategy) {
    return null;
  }

  const requiredLength = Math.max(
    Number(confirmationStrategy.slow_ema_period) + Number(confirmationStrategy.macd_signal_period) + 5,
    60
  );
  const candles = await marketCandlesRepository.getRecentCandles(coinId, confirmationStrategy.timeframe, requiredLength);

  if (candles.length < requiredLength) {
    return {
      timeframe: confirmationStrategy.timeframe,
      trendUp: false,
      available: false
    };
  }

  const analysis = signalEngine.evaluateSignalConditions({
    candles,
    strategy: confirmationStrategy
  });

  return {
    timeframe: confirmationStrategy.timeframe,
    trendUp: Boolean(analysis && analysis.buyChecks && analysis.buyChecks.trend),
    available: true
  };
}

function buildAlertCandidates(coins) {
  const items = [];

  for (const coin of coins) {
    const primary = coin.timeframes && coin.timeframes["1d"] ? coin.timeframes["1d"] : null;
    const entry = coin.timeframes && coin.timeframes["4h"] ? coin.timeframes["4h"] : null;

    if (primary && primary.signal_type === "buy" && primary.signal_created_at) {
      items.push({
        coinId: coin.id,
        symbol: coin.symbol,
        timeframe: "1d",
        alertKind: "primary_buy",
        signalCreatedAt: primary.signal_created_at,
        message: formatPrimaryBuyAlert({ coin, primary, entry })
      });
    }

    if (
      primary &&
      primary.signal_type === "buy" &&
      entry &&
      entry.signal_type === "buy" &&
      entry.signal_created_at
    ) {
      items.push({
        coinId: coin.id,
        symbol: coin.symbol,
        timeframe: "4h",
        alertKind: "entry_ready",
        signalCreatedAt: entry.signal_created_at,
        message: formatEntryReadyAlert({ coin, primary, entry })
      });
    }
  }

  return items;
}

function formatPrimaryBuyAlert({ coin, primary, entry }) {
  const lines = [
    "crypto.schnueddels.de",
    `1d Buy: ${coin.symbol}`,
    coin.name,
    `Preis: ${formatPrice(primary.close_price)}`,
    `4h Status: ${entry && entry.signal_type === "buy" ? "Entry frei" : "Auf 4h warten"}`,
    `Stop: ${formatPriceWithPercent(primary.close_price, primary.stop_loss_percent, -1)}`,
    `Ziel: ${formatPriceWithPercent(primary.close_price, primary.take_profit_percent, 1)}`,
    `C/R: ${formatRewardRisk(primary.take_profit_percent, primary.stop_loss_percent)}`,
    `Stand: ${primary.signal_created_at}`
  ];

  return lines.join("\n");
}

function formatEntryReadyAlert({ coin, entry }) {
  const lines = [
    "crypto.schnueddels.de",
    `4h Entry frei: ${coin.symbol}`,
    coin.name,
    `Preis: ${formatPrice(entry.close_price)}`,
    `Stop: ${formatPriceWithPercent(entry.close_price, entry.stop_loss_percent, -1)}`,
    `Ziel: ${formatPriceWithPercent(entry.close_price, entry.take_profit_percent, 1)}`,
    `C/R: ${formatRewardRisk(entry.take_profit_percent, entry.stop_loss_percent)}`,
    `Stand: ${entry.signal_created_at}`
  ];

  return lines.join("\n");
}

function formatPrice(value) {
  const numericValue = Number(value);
  if (!Number.isFinite(numericValue)) {
    return "-";
  }

  const digits = Math.abs(numericValue) < 0.01 ? 6 : Math.abs(numericValue) < 0.1 ? 5 : Math.abs(numericValue) < 1 ? 4 : 2;
  return `${new Intl.NumberFormat("de-DE", {
    minimumFractionDigits: 0,
    maximumFractionDigits: digits
  }).format(numericValue)} EUR`;
}

function formatPercent(value) {
  const numericValue = Number(value);
  if (!Number.isFinite(numericValue)) {
    return "-";
  }

  return `${new Intl.NumberFormat("de-DE", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 1
  }).format(numericValue)} %`;
}

function formatPriceWithPercent(closePrice, percent, direction) {
  const numericClosePrice = Number(closePrice);
  const numericPercent = Number(percent);

  if (!Number.isFinite(numericClosePrice) || !Number.isFinite(numericPercent)) {
    return "-";
  }

  const factor = direction < 0 ? 1 - (numericPercent / 100) : 1 + (numericPercent / 100);
  return `${formatPrice(numericClosePrice * factor)} (${formatPercent(numericPercent)})`;
}

function formatRewardRisk(takeProfitPercent, stopLossPercent) {
  const reward = Number(takeProfitPercent);
  const risk = Number(stopLossPercent);

  if (!Number.isFinite(reward) || !Number.isFinite(risk) || risk <= 0) {
    return "-";
  }

  return new Intl.NumberFormat("de-DE", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2
  }).format(reward / risk);
}

main();
