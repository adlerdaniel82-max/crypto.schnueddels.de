"use strict";

const db = require("../config/db");
const coinsRepository = require("../repositories/coins.repository");
const settingsRepository = require("../repositories/settings.repository");
const dataSourcesRepository = require("../repositories/data-sources.repository");
const marketCandlesRepository = require("../repositories/market-candles.repository");
const jobRunsRepository = require("../repositories/job-runs.repository");
const krakenOhlcService = require("../services/kraken-ohlc.service");
const coinGeckoService = require("../services/coingecko.service");

const MIN_CANDLE_COUNTS = {
  "5m": 120,
  "15m": 120,
  "1h": 120,
  "4h": 45,
  "1d": 30
};

async function main() {
  const jobId = await jobRunsRepository.startJob("fetch_market_data", {
    source: "kraken_public_with_coingecko_fallback"
  });

  try {
    const [krakenSource, coinGeckoSource] = await Promise.all([
      dataSourcesRepository.getActiveSourceByKey("kraken_public"),
      dataSourcesRepository.getActiveSourceByKey("coingecko")
    ]);

    if (!krakenSource) {
      throw new Error("kraken_source_missing");
    }
    if (!coinGeckoSource) {
      throw new Error("coingecko_source_missing");
    }

    const [coins, settings] = await Promise.all([
      coinsRepository.listActiveCoinsForJobs(),
      settingsRepository.listActiveSettings()
    ]);

    const timeframes = [...new Set(settings.map((setting) => setting.timeframe))];
    let rowsWritten = 0;
    let fallbackCount = 0;

    for (const coin of coins) {
      for (const timeframe of timeframes) {
        const fetchResult = await fetchBestCandles({
          coin,
          timeframe,
          krakenSource,
          coinGeckoSource
        });
        const rows = fetchResult.candles.map((candle) => ({
          ...candle,
          coinId: coin.id,
          sourceId: fetchResult.sourceId
        }));

        rowsWritten += await marketCandlesRepository.upsertCandles(rows);
        if (fetchResult.sourceKey === "coingecko") {
          fallbackCount += 1;
        }
      }
    }

    await jobRunsRepository.finishJobSuccess(
      jobId,
      rowsWritten,
      "Market ingest completed.",
      { coins: coins.length, timeframes, fallbackCount }
    );

    console.log(`[crypto] fetch-market-data completed, rows=${rowsWritten}`);
  } catch (error) {
    await jobRunsRepository.finishJobError(jobId, error.message, {
      stack: error.stack
    });
    console.error("[crypto] fetch-market-data failed", error);
    process.exit(1);
  } finally {
    await db.end();
  }
}

async function fetchBestCandles({ coin, timeframe, krakenSource, coinGeckoSource }) {
  try {
    const krakenCandles = await krakenOhlcService.fetchCandles(coin.exchange_symbol, timeframe);
    if (hasUsableCandles(krakenCandles, timeframe)) {
      return {
        candles: krakenCandles,
        sourceId: krakenSource.id,
        sourceKey: "kraken_public"
      };
    }
  } catch (error) {
    console.warn(`[crypto] kraken fallback for ${coin.symbol} ${timeframe}: ${error.message}`);
  }

  const coingeckoCandles = await coinGeckoService.fetchCandles({
    baseAsset: coin.base_asset,
    coinName: coin.name,
    quoteAsset: coin.quote_asset,
    timeframe
  });

  return {
    candles: coingeckoCandles,
    sourceId: coinGeckoSource.id,
    sourceKey: "coingecko"
  };
}

function hasUsableCandles(candles, timeframe) {
  if (!Array.isArray(candles) || !candles.length) {
    return false;
  }

  const positiveCloses = candles.filter((item) => Number(item.closePrice) > 0);
  if (!positiveCloses.length) {
    return false;
  }

  const minimum = MIN_CANDLE_COUNTS[timeframe] || 30;
  return positiveCloses.length >= Math.min(minimum, candles.length);
}

main();
