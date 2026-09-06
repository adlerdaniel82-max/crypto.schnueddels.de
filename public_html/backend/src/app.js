"use strict";

const path = require("path");
const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const rateLimit = require("express-rate-limit");
const healthRoutes = require("./routes/health.routes");
const overviewRoutes = require("./routes/overview.routes");
const coinsRoutes = require("./routes/coins.routes");
const settingsRoutes = require("./routes/settings.routes");
const backtestsRoutes = require("./routes/backtests.routes");
const adminCoinsRoutes = require("./routes/admin-coins.routes");
const adminTraderRoutes = require("./routes/admin-trader.routes");
const portfolioRoutes = require("./routes/portfolio.routes");
const paperRoutes = require("./routes/paper.routes");

const app = express();

app.set("trust proxy", 1);
app.use(helmet());

app.use(cors({
  origin: ["https://crypto.schnueddels.de"],
  credentials: true
}));

const globalLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 100,
  standardHeaders: true,
  legacyHeaders: false
});

const backtestsLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 3,
  standardHeaders: true,
  legacyHeaders: false
});

app.use(globalLimiter);
app.use(express.json());

app.use("/api/health", healthRoutes);
app.use("/api/overview", overviewRoutes);
app.use("/api/coins", coinsRoutes);
app.use("/api/settings", settingsRoutes);
app.use("/api/backtests", backtestsLimiter, backtestsRoutes);
app.use("/api/paper", paperRoutes);
app.use("/api/admin/coins", adminCoinsRoutes);
app.use("/api/admin/trader", adminTraderRoutes);
app.use("/api/admin/portfolio", portfolioRoutes);

app.use("/frontend", express.static(path.resolve(__dirname, "../../frontend")));

app.get("/", (req, res) => {
  res.redirect("/frontend/");
});

app.use((error, req, res, next) => {
  console.error(error);
  res.status(500).json({ error: "internal_server_error" });
});

module.exports = app;
