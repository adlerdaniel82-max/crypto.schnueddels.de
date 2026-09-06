"use strict";

const express = require("express");
const controller = require("../controllers/overview.controller");

const router = express.Router();

router.get("/", controller.getOverview);

module.exports = router;
