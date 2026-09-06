"use strict";

const signalClient = require("../services/signal-client");
const krakenTrade = require("../services/kraken-trade.service");
const telegram = require("../services/telegram.service");
const traderRepo = require("../repositories/trader.repository");
const {
  assessEntryDecision,
  buildRiskSkipStats,
  createRiskSkipCounter,
  recordRiskSkip
} = require("../../../../shared/trade-risk");

const LONG_MODE_MIN_INTERVAL_S = 270;
const HOLD_ALERT_KIND = "trader_hold_sell";
const DRY_RUN_CASH_MIN_EUR = 10;
const DRY_RUN_CASH_REFILL_EUR = 1000;

function roundMoney(value) {
  return Math.round((Number(value) + Number.EPSILON) * 100) / 100;
}

function calculateUnrealizedProfitPercent(position, currentPrice) {
  const entryPrice = position && position.entryPrice != null ? Number(position.entryPrice) : null;
  const price = currentPrice != null ? Number(currentPrice) : null;

  if (!entryPrice || entryPrice <= 0 || !price || price <= 0) {
    return null;
  }

  return ((price - entryPrice) / entryPrice) * 100;
}

function calculateRealizedProfitEur(position, sellPrice, sellVolume) {
  const entryPrice = position && position.entryPrice != null ? Number(position.entryPrice) : null;
  const price = sellPrice != null ? Number(sellPrice) : null;
  const volume = sellVolume != null ? Number(sellVolume) : null;

  if (!entryPrice || entryPrice <= 0 || !price || price <= 0 || !volume || volume <= 0) {
    return 0;
  }

  return roundMoney((price - entryPrice) * volume);
}

function calculateTradeValueEur(price, volume) {
  const numericPrice = price != null ? Number(price) : null;
  const numericVolume = volume != null ? Number(volume) : null;

  if (!numericPrice || numericPrice <= 0 || !numericVolume || numericVolume <= 0) {
    return 0;
  }

  return roundMoney(numericPrice * numericVolume);
}

async function applyDryRunCashDelta(deltaEur) {
  let updatedCashEur = await traderRepo.addDryRunCash(deltaEur);
  return refillDryRunCashIfNeeded(updatedCashEur);
}

async function refillDryRunCashIfNeeded(cashEur) {
  const currentCashEur = cashEur != null ? Number(cashEur) : null;
  if (currentCashEur == null || !Number.isFinite(currentCashEur) || currentCashEur >= DRY_RUN_CASH_MIN_EUR) {
    return cashEur;
  }

  console.warn(`[trade-engine] dry-run cash ${currentCashEur.toFixed(2)} EUR below ${DRY_RUN_CASH_MIN_EUR.toFixed(2)} EUR — refilling to ${DRY_RUN_CASH_REFILL_EUR.toFixed(2)} EUR`);
  await traderRepo.setDryRunCash(DRY_RUN_CASH_REFILL_EUR);
  return DRY_RUN_CASH_REFILL_EUR;
}

function assessExitDecision({ position, currentPrice, isStopLoss, isTakeProfit, sellSignal, longTermTrend }) {
  const unrealizedProfitPercent = calculateUnrealizedProfitPercent(position, currentPrice);

  if (isStopLoss) {
    return {
      action: "sell",
      reason: "stop_loss",
      shouldNotify: false,
      unrealizedProfitPercent
    };
  }

  if (isTakeProfit) {
    return {
      action: "sell",
      reason: "take_profit",
      shouldNotify: false,
      unrealizedProfitPercent
    };
  }

  if (!sellSignal || !sellSignal.active) {
    return {
      action: "hold",
      reason: "no_exit_signal",
      shouldNotify: false,
      unrealizedProfitPercent
    };
  }

  if (unrealizedProfitPercent == null) {
    return {
      action: "sell",
      reason: "signal_sell_no_entry_price",
      shouldNotify: false,
      unrealizedProfitPercent
    };
  }

  if (unrealizedProfitPercent < 0 && longTermTrend && longTermTrend.positive) {
    return {
      action: "hold",
      reason: "hold_loss_positive_trend",
      shouldNotify: true,
      unrealizedProfitPercent
    };
  }

  return {
    action: "sell",
    reason: unrealizedProfitPercent < 0
      ? "signal_sell_loss_trend_confirmed"
      : (unrealizedProfitPercent === 0 ? "signal_sell_break_even" : "signal_sell_profit"),
    shouldNotify: false,
    unrealizedProfitPercent
  };
}

function formatPercent(value) {
  return value == null ? "n/a" : `${value.toFixed(2)}%`;
}

function formatPrice(value) {
  return value == null ? "n/a" : Number(value).toFixed(8);
}

function formatMoney(value) {
  return value == null ? "n/a" : `${roundMoney(value).toFixed(2)} EUR`;
}

function getOpenVolume(position) {
  return position && position.partialExitDone && position.partialExitVolume != null
    ? Number(position.partialExitVolume)
    : Number(position && position.entryVolume ? position.entryVolume : 0);
}

function formatHoldNotification({ position, currentPrice, decision, sellSignal, longTermTrend }) {
  return [
    `Auto-Trader haelt ${position.coinSymbol}`,
    `Aktuelles Sell-Signal: ${sellSignal.timeframe || "n/a"}`,
    `Einstieg: ${formatPrice(position.entryPrice)} EUR`,
    `Aktuell: ${formatPrice(currentPrice)} EUR`,
    `Unrealisierter Stand: ${formatPercent(decision.unrealizedProfitPercent)}`,
    `Laengerer Trend: ${longTermTrend.timeframe || "n/a"} ${longTermTrend.signalType || "n/a"}`,
    "Kein Verkauf, weil der Verkauf aktuell Verlust realisieren wuerde und der laengere Trend positiv ist."
  ].join("\n");
}

async function notifyHeldSellSignal({ coin, position, currentPrice, decision, sellSignal, longTermTrend }) {
  if (!decision.shouldNotify || !telegram.isConfigured()) {
    return false;
  }

  if (!coin.id || !sellSignal.timeframe || !sellSignal.signalCreatedAt) {
    return false;
  }

  const alert = {
    coinId: coin.id,
    timeframe: sellSignal.timeframe,
    alertKind: HOLD_ALERT_KIND,
    signalCreatedAt: sellSignal.signalCreatedAt
  };

  const exists = await traderRepo.hasAlertEvent(alert);
  if (exists) {
    return false;
  }

  await telegram.sendMessage(formatHoldNotification({
    position,
    currentPrice,
    decision,
    sellSignal,
    longTermTrend
  }));

  await traderRepo.recordAlertEvent({
    ...alert,
    payload: {
      coinSymbol: position.coinSymbol,
      currentPrice,
      entryPrice: position.entryPrice,
      unrealizedProfitPercent: decision.unrealizedProfitPercent,
      longTermTrend
    }
  });

  return true;
}

async function runCycle() {
  const config = await traderRepo.getConfig();

  if (config.paused) {
    console.log("[trade-engine] paused — skipping cycle");
    await traderRepo.recordCycleRun({
      config,
      skipped: true,
      skipReason: "paused",
      result: {
        skipped: true,
        reason: "paused",
        buys: 0,
        sells: 0,
        partialSells: 0,
        heldSells: 0,
        holdNotifications: 0,
        skippedBuys: 0,
        riskSkipCounts: {},
        riskSkipBlockerCounts: {},
        riskSkipStats: buildRiskSkipStats(createRiskSkipCounter()),
        errors: []
      }
    });
    return { skipped: true, reason: "paused" };
  }

  if (config.mode === "long" && config.lastCycleAt) {
    const secondsSinceLast = (Date.now() - new Date(config.lastCycleAt).getTime()) / 1000;
    if (secondsSinceLast < LONG_MODE_MIN_INTERVAL_S) {
      console.log(`[trade-engine] LONG throttle (${Math.round(secondsSinceLast)}s < ${LONG_MODE_MIN_INTERVAL_S}s) — skipping`);
      await traderRepo.recordCycleRun({
        config,
        skipped: true,
        skipReason: "throttled",
        result: {
          skipped: true,
          reason: "throttled",
          buys: 0,
          sells: 0,
          partialSells: 0,
          heldSells: 0,
          holdNotifications: 0,
          skippedBuys: 0,
          riskSkipCounts: {},
          riskSkipBlockerCounts: {},
          riskSkipStats: buildRiskSkipStats(createRiskSkipCounter()),
          errors: []
        }
      });
      return { skipped: true, reason: "throttled" };
    }
  }

  console.log(`[trade-engine] cycle start — mode=${config.mode} dry_run=${config.dryRun}`);

  if (config.dryRun) {
    const updatedCashEur = await refillDryRunCashIfNeeded(config.dryRunCashEur);
    if (updatedCashEur != null) {
      config.dryRunCashEur = updatedCashEur;
    }
  }

  const coins = await signalClient.fetchCoins();
  const openPositions = await traderRepo.getOpenPositions();
  const openSymbols = new Set(openPositions.map((p) => p.coinSymbol));
  const coinMap = new Map(coins.map((c) => [c.symbol, c]));
  const riskSkipCounter = createRiskSkipCounter();

  const results = createCycleResults(riskSkipCounter);

  // --- Bestehende Positionen prüfen ---
  for (const position of openPositions) {
    const coin = coinMap.get(position.coinSymbol);
    if (!coin) continue;

    const entryTf = signalClient.getEntryTimeframe(config.mode);
    const currentPrice = signalClient.getClosePrice(coin, entryTf) || signalClient.getClosePrice(coin, "1h");
    if (!currentPrice) continue;

    const isStopLoss = position.stopLossPrice && currentPrice <= position.stopLossPrice;
    const isTakeProfit = position.takeProfitPrice && currentPrice >= position.takeProfitPrice;
    const sellSignal = signalClient.getSellSignalDetails(coin, config.mode);
    const longTermTrend = signalClient.getLongTermTrend(coin, config.mode);
    const exitDecision = assessExitDecision({
      position,
      currentPrice,
      isStopLoss,
      isTakeProfit,
      sellSignal,
      longTermTrend
    });

    if (exitDecision.action !== "sell") {
      if (exitDecision.reason === "hold_loss_positive_trend") {
        results.heldSells++;
        try {
          const notified = await notifyHeldSellSignal({
            coin,
            position,
            currentPrice,
            decision: exitDecision,
            sellSignal,
            longTermTrend
          });
          if (notified) results.holdNotifications++;
        } catch (notifyError) {
          results.errors.push(`hold-notify ${position.coinSymbol}: ${notifyError.message}`);
        }
        const unrealizedPnlEur = calculateRealizedProfitEur(position, currentPrice, getOpenVolume(position));
        console.log(`[trade-engine] hold ${position.coinSymbol} — sell signal ${sellSignal.timeframe} but ${longTermTrend.timeframe || "long"} trend positive, pnl=${formatPercent(exitDecision.unrealizedProfitPercent)} (${formatMoney(unrealizedPnlEur)})`);
      }
      continue;
    }

    const closeReason = exitDecision.reason;

    let sellVolume;
    let doFullClose = true;

    if (!isStopLoss && !isTakeProfit && config.partialExitPercent > 0) {
      if (!position.partialExitDone) {
        sellVolume = (position.entryVolume || 0) * (config.partialExitPercent / 100);
        doFullClose = false;
      } else {
        sellVolume = position.partialExitVolume || (position.entryVolume || 0);
        doFullClose = true;
      }
    } else {
      sellVolume = isStopLoss && position.partialExitDone
        ? (position.partialExitVolume || position.entryVolume || 0)
        : (position.entryVolume || 0);
      doFullClose = true;
    }

    try {
      const orderId = await traderRepo.logOrder({
        coinSymbol: position.coinSymbol,
        side: "sell",
        krakenPair: position.krakenPair,
        volume: sellVolume,
        priceEstimate: currentPrice,
        dryRun: config.dryRun,
        status: config.dryRun ? "dry_run" : "pending",
        signalReason: doFullClose ? closeReason : "partial_" + closeReason
      });

      if (!config.dryRun && krakenTrade.isConfigured()) {
        try {
          const order = await krakenTrade.placeOrder(position.krakenPair, "sell", sellVolume);
          await traderRepo.updateOrderStatus(orderId, "submitted", order.txid);
        } catch (krakenError) {
          await traderRepo.updateOrderStatus(orderId, "error");
          results.errors.push(`sell ${position.coinSymbol}: ${krakenError.message}`);
          continue;
        }
      }

      const realizedPnlEur = calculateRealizedProfitEur(position, currentPrice, sellVolume);

      let updatedCashEur = null;

      if (config.dryRun) {
        try {
          await traderRepo.addPositionDryRunRealizedPnl(position.id, realizedPnlEur);
          updatedCashEur = await applyDryRunCashDelta(calculateTradeValueEur(currentPrice, sellVolume));
        } catch (dryRunSettlementError) {
          results.errors.push(`dry-run settlement ${position.coinSymbol}: ${dryRunSettlementError.message}`);
          continue;
        }
      }

      if (doFullClose) {
        await traderRepo.closePosition(position.id, closeReason);
        openSymbols.delete(position.coinSymbol);
        results.sells++;
        const dryRunCashLabel = config.dryRun && doFullClose ? ` cash=${formatMoney(updatedCashEur)}` : "";
        console.log(`[trade-engine] sell ${position.coinSymbol} — ${closeReason} vol=${sellVolume.toFixed(8)} pnl=${formatMoney(realizedPnlEur)}${dryRunCashLabel} (dry=${config.dryRun})`);
      } else {
        const remainingVolume = (position.entryVolume || 0) - sellVolume;
        await traderRepo.setPartialExit(position.id, remainingVolume);
        results.partialSells++;
        const dryRunCashLabel = config.dryRun ? ` cash=${formatMoney(updatedCashEur)}` : "";
        console.log(`[trade-engine] partial-sell ${position.coinSymbol} ${config.partialExitPercent}% vol=${sellVolume.toFixed(8)} pnl=${formatMoney(realizedPnlEur)} remaining=${remainingVolume.toFixed(8)}${dryRunCashLabel} (dry=${config.dryRun})`);
      }
    } catch (error) {
      results.errors.push(`sell ${position.coinSymbol}: ${error.message}`);
    }
  }

  // --- Neue Einstiege prüfen ---
  if (config.maxPerCoinEur <= 0 || config.budgetEur <= 0) {
    results.skippedBuys++;
    recordRiskSkip(riskSkipCounter, { reason: "budget_not_configured" });
    console.log("[trade-engine] no budget configured — skipping buy checks");
    await traderRepo.markCycleComplete();
    return finalizeCycleResults(results, riskSkipCounter);
  }

  const currentOpenCount = openSymbols.size;
  const deployedEur = currentOpenCount * config.maxPerCoinEur;

  if (deployedEur + config.maxPerCoinEur > config.budgetEur) {
    results.skippedBuys++;
    recordRiskSkip(riskSkipCounter, { reason: "budget_exhausted" });
    console.log("[trade-engine] budget fully deployed — skipping buys");
    await traderRepo.markCycleComplete();
    return finalizeCycleResults(results, riskSkipCounter);
  }

  const entryReady = signalClient.getEntryReadyCoins(coins, config.mode);
  const entryTf = signalClient.getEntryTimeframe(config.mode);

  for (const coin of entryReady) {
    const price = signalClient.getClosePrice(coin, entryTf) || signalClient.getClosePrice(coin, "1h");
    const entryDecision = assessEntryDecision({
      coin,
      price,
      config,
      signal: signalClient.getEntrySignalContract(coin, config.mode),
      openSymbols,
      openPositionCount: openSymbols.size,
      useSignalRisk: false
    });
    if (entryDecision.action !== "buy") {
      results.skippedBuys++;
      recordRiskSkip(riskSkipCounter, entryDecision);
      console.log(`[trade-engine] skip-buy ${coin.symbol || "unknown"} — ${entryDecision.reason}`);
      continue;
    }

    const buyCostEur = calculateTradeValueEur(price, entryDecision.volume);
    const dryRunCashEur = Number(config.dryRunCashEur);
    if (config.dryRun && Number.isFinite(dryRunCashEur) && dryRunCashEur < buyCostEur) {
      const decision = {
        action: "skip",
        reason: "dry_run_cash_insufficient",
        remainingCashEur: dryRunCashEur,
        requiredCashEur: buyCostEur
      };
      results.skippedBuys++;
      recordRiskSkip(riskSkipCounter, decision);
      console.log(`[trade-engine] skip-buy ${coin.symbol || "unknown"} — dry_run_cash_insufficient cash=${formatMoney(dryRunCashEur)} required=${formatMoney(buyCostEur)}`);
      continue;
    }

    let orderId = null;

    try {
      orderId = await traderRepo.logOrder({
        coinSymbol: coin.symbol,
        side: "buy",
        krakenPair: coin.exchange_symbol,
        volume: entryDecision.volume,
        priceEstimate: price,
        dryRun: config.dryRun,
        status: config.dryRun ? "dry_run" : "pending",
        signalReason: config.mode === "short" ? "4h_1h_buy" : "1d_4h_buy"
      });

      let krakenTxid = null;

      if (!config.dryRun && krakenTrade.isConfigured()) {
        try {
          const order = await krakenTrade.placeOrder(coin.exchange_symbol, "buy", entryDecision.volume);
          krakenTxid = order.txid;
          await traderRepo.updateOrderStatus(orderId, "submitted", krakenTxid);
        } catch (krakenError) {
          await traderRepo.updateOrderStatus(orderId, "error");
          results.errors.push(`buy ${coin.symbol}: ${krakenError.message}`);
          continue;
        }
      }

      await traderRepo.openPosition({
        coinSymbol: coin.symbol,
        baseAsset: coin.base_asset,
        krakenPair: coin.exchange_symbol,
        buyOrderId: orderId,
        entryPrice: price,
        entryVolume: entryDecision.volume,
        stopLossPrice: entryDecision.stopLossPrice,
        takeProfitPrice: entryDecision.takeProfitPrice
      });

      if (config.dryRun) {
        const updatedCashEur = await applyDryRunCashDelta(-buyCostEur);
        if (updatedCashEur != null) {
          config.dryRunCashEur = updatedCashEur;
        }
      }

      openSymbols.add(coin.symbol);
      results.buys++;
      const takeProfitLabel = entryDecision.takeProfitPrice == null ? "n/a" : entryDecision.takeProfitPrice.toFixed(8);
      console.log(`[trade-engine] buy ${coin.symbol} vol=${entryDecision.volume.toFixed(8)} @ ${price} stop=${entryDecision.stopLossPrice.toFixed(8)} target=${takeProfitLabel} mode=${config.mode} (dry=${config.dryRun})`);

      const newDeployed = openSymbols.size * config.maxPerCoinEur;
      if (newDeployed + config.maxPerCoinEur > config.budgetEur) break;
    } catch (error) {
      if (orderId != null) {
        try {
          await traderRepo.updateOrderStatus(orderId, "error");
        } catch (statusError) {
          results.errors.push(`buy ${coin.symbol}: could not mark order ${orderId} as error: ${statusError.message}`);
        }
      }
      results.errors.push(`buy ${coin.symbol}: ${error.message}`);
    }
  }

  await traderRepo.markCycleComplete();
  finalizeCycleResults(results, riskSkipCounter);
  try {
    await traderRepo.recordCycleRun({ config, result: results });
  } catch (error) {
    results.errors.push(`cycle-run-record: ${error.message}`);
  }
  console.log(`[trade-engine] cycle done — mode=${config.mode} buys=${results.buys} sells=${results.sells} partial=${results.partialSells} held=${results.heldSells} skip_reasons=${results.riskSkipStats.total} notifications=${results.holdNotifications} errors=${results.errors.length}`);
  return results;
}

function createCycleResults(riskSkipCounter) {
  return {
    sells: 0,
    partialSells: 0,
    heldSells: 0,
    holdNotifications: 0,
    buys: 0,
    skippedBuys: 0,
    riskSkipCounts: riskSkipCounter.reasonCounts,
    riskSkipBlockerCounts: riskSkipCounter.blockerCounts,
    riskSkipStats: buildRiskSkipStats(riskSkipCounter),
    errors: []
  };
}

function finalizeCycleResults(results, riskSkipCounter) {
  results.riskSkipCounts = riskSkipCounter.reasonCounts;
  results.riskSkipBlockerCounts = riskSkipCounter.blockerCounts;
  results.riskSkipStats = buildRiskSkipStats(riskSkipCounter);
  return results;
}

module.exports = {
  runCycle,
  assessEntryDecision,
  assessExitDecision,
  calculateUnrealizedProfitPercent,
  calculateRealizedProfitEur
};
