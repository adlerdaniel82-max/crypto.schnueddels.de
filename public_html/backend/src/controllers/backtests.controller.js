"use strict";

const backtestsService = require("../services/backtests.service");

async function listBacktests(req, res, next) {
  try {
    const payload = await backtestsService.runBacktests({
      lookback: req.query.lookback
    });

    res.json(payload);
  } catch (error) {
    next(error);
  }
}

module.exports = {
  listBacktests
};
