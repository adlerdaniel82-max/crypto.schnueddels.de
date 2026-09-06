"use strict";

const krakenPrivateService = require("../services/kraken-private.service");
const portfolioRepository = require("../repositories/portfolio.repository");

async function getLatestSnapshot(req, res, next) {
  try {
    const snapshot = await portfolioRepository.getLatestSnapshot();
    if (!snapshot) {
      res.json({ snapshot: null, configured: krakenPrivateService.isConfigured() });
      return;
    }
    res.json({ snapshot, configured: krakenPrivateService.isConfigured() });
  } catch (error) {
    next(error);
  }
}

async function fetchSnapshot(req, res, next) {
  try {
    if (!krakenPrivateService.isConfigured()) {
      res.status(503).json({ error: "kraken_api_not_configured" });
      return;
    }

    const [balances, openOrders] = await Promise.all([
      krakenPrivateService.fetchBalance(),
      krakenPrivateService.fetchOpenOrders()
    ]);

    const id = await portfolioRepository.saveSnapshot({ balances, openOrders });
    const snapshot = await portfolioRepository.getLatestSnapshot();

    res.json({ snapshot, id });
  } catch (error) {
    if (error.statusCode) {
      res.status(error.statusCode).json({ error: error.message });
      return;
    }
    next(error);
  }
}

module.exports = {
  getLatestSnapshot,
  fetchSnapshot
};
