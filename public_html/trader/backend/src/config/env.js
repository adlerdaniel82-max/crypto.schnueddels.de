"use strict";

const fs = require("fs");
const path = require("path");
const dotenv = require("dotenv");

const candidates = [
  path.resolve(__dirname, "../../../../../private/.env"),
  path.resolve(__dirname, "../../../../.env")
];

for (const filePath of candidates) {
  if (fs.existsSync(filePath)) {
    dotenv.config({ path: filePath });
    break;
  }
}

module.exports = {
  nodeEnv: process.env.NODE_ENV || "development",
  host: process.env.HOST || "127.0.0.1",
  port: Number(process.env.PORT || 3034),
  dbHost: process.env.DB_HOST || "127.0.0.1",
  dbName: process.env.DB_NAME || "",
  dbUser: process.env.DB_USER || "",
  dbPassword: process.env.DB_PASSWORD || "",
  authApiUrl: process.env.AUTH_API_URL || "https://schnueddels.de/auth/api",
  projectKey: process.env.PROJECT_KEY || "crypto",
  projectApiSecret: process.env.PROJECT_API_SECRET || "",
  traderKrakenApiKey: process.env.TRADER_KRAKEN_API_KEY || "",
  traderKrakenApiSecret: process.env.TRADER_KRAKEN_API_SECRET || "",
  telegramBotToken: process.env.TELEGRAM_BOT_TOKEN || "",
  telegramChatId: process.env.TELEGRAM_CHAT_ID || "",
  signalBaseUrl: process.env.SIGNAL_BASE_URL || "http://127.0.0.1:3033"
};

const REQUIRED_IN_PROD = ["DB_NAME", "DB_USER", "DB_PASSWORD", "PROJECT_API_SECRET"];
if (module.exports.nodeEnv !== "test") {
  for (const key of REQUIRED_IN_PROD) {
    if (!process.env[key]) {
      throw new Error(`Missing required env var: ${key}`);
    }
  }
}
