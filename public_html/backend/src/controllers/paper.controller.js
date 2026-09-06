"use strict";

const paperRepository = require("../repositories/paper.repository");

async function getStatus(req, res, next) {
  try {
    res.json(await paperRepository.getStatus(req.authUser.id));
  } catch (error) {
    next(error);
  }
}

async function buy(req, res, next) {
  try {
    const result = await paperRepository.buy({
      userId: req.authUser.id,
      symbol: req.body.symbol,
      amountEur: req.body.amountEur
    });
    res.status(201).json(result);
  } catch (error) {
    sendKnownError(error, res, next);
  }
}

async function sell(req, res, next) {
  try {
    const result = await paperRepository.sell({
      userId: req.authUser.id,
      positionId: req.body.positionId,
      volume: req.body.volume
    });
    res.json(result);
  } catch (error) {
    sendKnownError(error, res, next);
  }
}

async function reset(req, res, next) {
  try {
    res.json(await paperRepository.reset(req.authUser.id));
  } catch (error) {
    next(error);
  }
}

async function depositTalers(req, res, next) {
  try {
    const result = await paperRepository.depositTalers({
      userId: req.authUser.id,
      talerAmount: req.body.talerAmount
    });
    res.status(201).json(result);
  } catch (error) {
    sendKnownError(error, res, next);
  }
}

async function withdrawTalers(req, res, next) {
  try {
    const result = await paperRepository.withdrawTalers({
      userId: req.authUser.id,
      amountEur: req.body.amountEur
    });
    res.json(result);
  } catch (error) {
    sendKnownError(error, res, next);
  }
}

function sendKnownError(error, res, next) {
  if (error.statusCode) {
    res.status(error.statusCode).json({ error: error.message });
    return;
  }
  next(error);
}

module.exports = {
  buy,
  depositTalers,
  getStatus,
  reset,
  sell,
  withdrawTalers
};
