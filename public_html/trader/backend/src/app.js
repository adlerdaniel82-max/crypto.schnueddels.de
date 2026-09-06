"use strict";

const path = require("path");
const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const rateLimit = require("express-rate-limit");
const traderRoutes = require("./routes/trader.routes");
const { requireTraderAuth } = require("./middleware/require-trader-auth");

const app = express();

app.set("trust proxy", "loopback");

app.use(helmet());
app.use(cors({ origin: ["https://crypto.schnueddels.de"], credentials: true }));
app.use(express.json());

app.use("/api", rateLimit({ windowMs: 60 * 1000, max: 60, standardHeaders: true, legacyHeaders: false }));

app.get("/health", (req, res) => {
  res.json({ status: "ok", service: "crypto-trader", timestamp: new Date().toISOString() });
});

app.use(requireTraderAuth);
app.use("/api/trader", traderRoutes);
app.use("/", express.static(path.resolve(__dirname, "../../frontend")));

app.use((error, req, res, next) => {
  console.error(error);
  res.status(500).json({ error: "internal_server_error" });
});

module.exports = app;
