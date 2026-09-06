"use strict";

const crypto = require("crypto");
const http = require("http");
const https = require("https");
const env = require("../config/env");

const CURRENCY_FREE = "SNT_FREE";

class CentralWalletError extends Error {
  constructor(code, { status = 500, payload = null } = {}) {
    super(code);
    this.name = "CentralWalletError";
    this.code = code;
    this.status = status;
    this.payload = payload;
  }
}

function requireConfig() {
  if (!env.projectApiSecret) {
    throw new CentralWalletError("WALLET_CONFIG_MISSING", { status: 500 });
  }
}

function wholeAmount(amount) {
  const raw = String(amount || "").trim();
  if (!/^\d+$/.test(raw) || Number(raw) <= 0) {
    throw new CentralWalletError("INVALID_WALLET_AMOUNT", { status: 400 });
  }
  return raw;
}

function positiveInt(value, name) {
  const number = Number(value || 0);
  if (!Number.isInteger(number) || number <= 0) {
    throw new CentralWalletError(`INVALID_${name}`, { status: 400 });
  }
  return number;
}

function nonEmpty(value, name) {
  const text = String(value || "").trim();
  if (!text) {
    throw new CentralWalletError(`INVALID_${name}`, { status: 400 });
  }
  return text;
}

function buildUrl(endpoint) {
  return new URL(`${String(env.authApiUrl).replace(/\/+$/, "")}/wallet/${endpoint}.php`);
}

function postJson(endpoint, payload) {
  requireConfig();

  return new Promise((resolve, reject) => {
    const url = buildUrl(endpoint);
    const body = JSON.stringify(payload || {});
    const timestamp = String(Math.floor(Date.now() / 1000));
    const signature = crypto
      .createHmac("sha256", env.projectApiSecret)
      .update(body + timestamp)
      .digest("hex");
    const transport = url.protocol === "http:" ? http : https;

    const req = transport.request({
      method: "POST",
      hostname: url.hostname,
      port: url.port || (url.protocol === "http:" ? 80 : 443),
      path: `${url.pathname}${url.search || ""}`,
      timeout: env.walletTimeoutMs,
      headers: {
        "Content-Type": "application/json",
        "Content-Length": Buffer.byteLength(body),
        "X-Project-Key": env.projectKey,
        "X-Project-Secret": env.projectApiSecret,
        "X-Timestamp": timestamp,
        "X-Signature": signature
      }
    }, (res) => {
      let raw = "";
      res.on("data", (chunk) => { raw += chunk; });
      res.on("end", () => {
        let json = {};
        try {
          json = raw ? JSON.parse(raw) : {};
        } catch {
          return reject(new CentralWalletError("WALLET_BAD_RESPONSE", {
            status: Number(res.statusCode || 502),
            payload: { raw }
          }));
        }

        const status = Number(res.statusCode || 500);
        if (status >= 200 && status < 300) return resolve(json);
        return reject(new CentralWalletError(String(json?.error || "WALLET_HTTP_ERROR"), {
          status,
          payload: json
        }));
      });
    });

    req.on("timeout", () => req.destroy(new CentralWalletError("WALLET_TIMEOUT", { status: 504 })));
    req.on("error", (err) => {
      if (err instanceof CentralWalletError) return reject(err);
      return reject(new CentralWalletError("WALLET_REQUEST_FAILED", {
        status: 502,
        payload: { message: err?.message || String(err) }
      }));
    });
    req.write(body);
    req.end();
  });
}

async function reserve({
  centralUserId,
  amount,
  reasonCode,
  sourceType,
  sourceId,
  idempotencyKey,
  expiresInSeconds = 300
}) {
  return postJson("reserve", {
    user_id: positiveInt(centralUserId, "CENTRAL_USER_ID"),
    currency_code: CURRENCY_FREE,
    amount: wholeAmount(amount),
    reason_code: nonEmpty(reasonCode, "REASON_CODE"),
    source_type: nonEmpty(sourceType, "SOURCE_TYPE"),
    source_id: nonEmpty(sourceId, "SOURCE_ID"),
    idempotency_key: nonEmpty(idempotencyKey, "IDEMPOTENCY_KEY"),
    expires_in_seconds: positiveInt(expiresInSeconds, "EXPIRES_IN_SECONDS")
  });
}

async function commit({ reservationId, idempotencyKey, metadata = null }) {
  const payload = {
    reservation_id: positiveInt(reservationId, "RESERVATION_ID"),
    idempotency_key: nonEmpty(idempotencyKey, "IDEMPOTENCY_KEY")
  };
  if (metadata && typeof metadata === "object") payload.metadata = metadata;
  return postJson("commit", payload);
}

async function release({ reservationId, idempotencyKey, metadata = null }) {
  const payload = {
    reservation_id: positiveInt(reservationId, "RESERVATION_ID"),
    idempotency_key: nonEmpty(idempotencyKey, "IDEMPOTENCY_KEY")
  };
  if (metadata && typeof metadata === "object") payload.metadata = metadata;
  return postJson("release", payload);
}

async function credit({
  centralUserId,
  amount,
  reasonCode,
  sourceType,
  sourceId,
  idempotencyKey,
  metadata = null
}) {
  const payload = {
    user_id: positiveInt(centralUserId, "CENTRAL_USER_ID"),
    currency_code: CURRENCY_FREE,
    amount: wholeAmount(amount),
    reason_code: nonEmpty(reasonCode, "REASON_CODE"),
    source_type: nonEmpty(sourceType, "SOURCE_TYPE"),
    source_id: nonEmpty(sourceId, "SOURCE_ID"),
    idempotency_key: nonEmpty(idempotencyKey, "IDEMPOTENCY_KEY")
  };
  if (metadata && typeof metadata === "object") payload.metadata = metadata;
  return postJson("credit", payload);
}

module.exports = {
  CentralWalletError,
  commit,
  credit,
  release,
  reserve
};
