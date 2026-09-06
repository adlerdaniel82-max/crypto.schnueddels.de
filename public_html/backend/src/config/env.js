"use strict";

const fs = require("fs");
const path = require("path");
const dotenv = require("dotenv");

const candidates = [
  path.resolve(__dirname, "../../../../private/.env"),
  path.resolve(__dirname, "../../../.env"),
  path.resolve(__dirname, "../../.env")
];

candidates.forEach((filePath) => {
  if (fs.existsSync(filePath)) {
    dotenv.config({ path: filePath });
  }
});

const config = {
  nodeEnv: process.env.NODE_ENV || "development",
  host: process.env.HOST || "127.0.0.1",
  port: Number(process.env.PORT || 3033),
  dbHost: process.env.DB_HOST || "127.0.0.1",
  dbName: process.env.DB_NAME || "",
  dbUser: process.env.DB_USER || "",
  dbPassword: process.env.DB_PASSWORD || "",
  authApiUrl: process.env.AUTH_API_URL || "https://schnueddels.de/auth/api",
  projectKey: process.env.PROJECT_KEY || "crypto",
  projectApiSecret: process.env.PROJECT_API_SECRET || "",
  walletTimeoutMs: Math.max(1000, Number(process.env.WALLET_TIMEOUT_MS || 10000)),
  telegramAlertsEnabled: process.env.TELEGRAM_ALERTS_ENABLED === "true",
  telegramBotToken: process.env.TELEGRAM_BOT_TOKEN || "",
  telegramChatId: process.env.TELEGRAM_CHAT_ID || "",
  krakenApiKey: process.env.KRAKEN_API_KEY || "",
  krakenApiSecret: process.env.KRAKEN_API_SECRET || ""
};

if (config.nodeEnv !== "test" && !config.projectApiSecret) {
  throw new Error("Missing required env var: PROJECT_API_SECRET");
}

module.exports = config;
