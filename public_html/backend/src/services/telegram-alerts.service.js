"use strict";

const https = require("https");
const env = require("../config/env");

function isConfigured() {
  return Boolean(
    env.telegramAlertsEnabled &&
    env.telegramBotToken &&
    env.telegramChatId
  );
}

async function sendMessage(text) {
  if (!isConfigured()) {
    return { ok: false, skipped: true, reason: "telegram_not_configured" };
  }

  const payload = JSON.stringify({
    chat_id: env.telegramChatId,
    text,
    disable_web_page_preview: true
  });

  return new Promise((resolve, reject) => {
    const request = https.request({
      hostname: "api.telegram.org",
      path: `/bot${env.telegramBotToken}/sendMessage`,
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Content-Length": Buffer.byteLength(payload)
      },
      timeout: 10000
    }, (response) => {
      let body = "";
      response.setEncoding("utf8");

      response.on("data", (chunk) => {
        body += chunk;
      });

      response.on("end", () => {
        if (response.statusCode && response.statusCode >= 400) {
          reject(new Error(`telegram_http_${response.statusCode}`));
          return;
        }

        try {
          const parsed = JSON.parse(body);
          if (!parsed || parsed.ok !== true) {
            reject(new Error("telegram_api_error"));
            return;
          }

          resolve(parsed);
        } catch (error) {
          reject(new Error("telegram_invalid_json"));
        }
      });
    });

    request.on("error", () => {
      reject(new Error("telegram_unreachable"));
    });

    request.on("timeout", () => {
      request.destroy(new Error("telegram_timeout"));
    });

    request.write(payload);
    request.end();
  });
}

module.exports = {
  isConfigured,
  sendMessage
};
