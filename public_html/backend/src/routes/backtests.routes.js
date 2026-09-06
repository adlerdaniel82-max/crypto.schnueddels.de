"use strict";

const express = require("express");
const controller = require("../controllers/backtests.controller");

const router = express.Router();

router.get("/", controller.listBacktests);

module.exports = router;
