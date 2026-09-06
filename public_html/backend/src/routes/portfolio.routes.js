"use strict";

const express = require("express");
const router = express.Router();
const { requireMasterAuth } = require("../middleware/require-admin-auth");
const portfolioController = require("../controllers/portfolio.controller");

router.use(requireMasterAuth);

router.get("/session", (req, res) => { res.json({ ok: true }); });
router.get("/latest", portfolioController.getLatestSnapshot);
router.post("/fetch", portfolioController.fetchSnapshot);

module.exports = router;
