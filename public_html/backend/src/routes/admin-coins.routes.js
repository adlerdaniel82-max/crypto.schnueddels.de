"use strict";

const express = require("express");
const controller = require("../controllers/coins.controller");
const { requireMasterAuth } = require("../middleware/require-admin-auth");

const router = express.Router();

router.use(requireMasterAuth);
router.get("/", controller.listAllCoins);
router.get("/kraken-pairs", controller.listKrakenPairs);
router.post("/refresh-market", controller.refreshMarket);
router.post("/", controller.createCoin);
router.patch("/:id", controller.updateCoinState);
router.delete("/:id", controller.deleteCoin);

module.exports = router;
