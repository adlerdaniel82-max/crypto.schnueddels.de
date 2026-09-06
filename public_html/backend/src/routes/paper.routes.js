"use strict";

const express = require("express");
const { requireProjectAuth } = require("../middleware/require-project-auth");
const controller = require("../controllers/paper.controller");

const router = express.Router();

router.use(requireProjectAuth);
router.get("/status", controller.getStatus);
router.post("/buy", controller.buy);
router.post("/sell", controller.sell);
router.post("/deposit-talers", controller.depositTalers);
router.post("/withdraw-talers", controller.withdrawTalers);
router.post("/reset", controller.reset);

module.exports = router;
