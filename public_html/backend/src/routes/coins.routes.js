"use strict";

const express = require("express");
const controller = require("../controllers/coins.controller");

const router = express.Router();

router.get("/", controller.listCoins);
router.get("/candles", controller.listCoinCandles);
router.get("/:symbol/candles", controller.listCoinCandles);
router.get("/:symbol", controller.getCoin);

module.exports = router;
