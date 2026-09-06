"use strict";

const express = require("express");
const router = express.Router();
const { requireTraderAuth } = require("../middleware/require-trader-auth");
const trader = require("../controllers/trader.controller");

router.use(requireTraderAuth);

router.get("/status", trader.getStatus);
router.get("/config", trader.getConfig);
router.patch("/config", trader.updateConfig);
router.get("/positions", trader.getPositions);
router.delete("/positions/:id", trader.deletePosition);
router.get("/orders", trader.getOrders);
router.get("/cycle-runs", trader.getCycleRuns);
router.post("/run", trader.runCycle);
router.post("/stop", trader.emergencyStop);
router.get("/logs", trader.getLogs);
router.post("/logs/clear", trader.clearLogs);

module.exports = router;
