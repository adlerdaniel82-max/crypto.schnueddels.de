"use strict";

const express = require("express");
const controller = require("../controllers/settings.controller");

const router = express.Router();

router.get("/", controller.listSettings);

module.exports = router;
