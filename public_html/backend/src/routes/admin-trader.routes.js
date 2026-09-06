"use strict";

const express = require("express");
const { requireMasterAuth } = require("../middleware/require-admin-auth");
const controller = require("../controllers/admin-trader.controller");

const router = express.Router();

router.use(requireMasterAuth);
router.get("/cycle-runs", controller.getCycleRuns);

module.exports = router;
