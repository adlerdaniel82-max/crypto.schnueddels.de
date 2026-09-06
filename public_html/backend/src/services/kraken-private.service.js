"use strict";

const crypto = require("crypto");
const https = require("https");
const querystring = require("querystring");
const env = require("../config/env");

const KRAKEN_HOSTNAME = "api.kraken.com";
let lastNonce = 0;
let privateRequestQueue = Promise.resolve();

function isConfigured() {
  return Boolean(env.krakenApiKey && env.krakenApiSecret);
}

function sign(urlPath, nonce, postData) {
  const secretBuffer = Buffer.from(env.krakenApiSecret, "base64");
  const sha256Hash = crypto
    .createHash("sha256")
    .update(nonce + postData)
    .digest();
  const hmac = crypto.createHmac("sha512", secretBuffer);
  hmac.update(urlPath);
  hmac.update(sha256Hash);
  return hmac.digest("base64");
}

function nextNonce() {
  const now = Date.now();
  const nonce = now > lastNonce ? now : lastNonce + 1;
  lastNonce = nonce;
  return String(nonce);
}

function enqueuePrivateRequest(task) {
  const runTask = () => Promise.resolve().then(task);
  const queued = privateRequestQueue.then(runTask, runTask);
  privateRequestQueue = queued.then(() => undefined, () => undefined);
  return queued;
}

async function privateRequest(urlPath, params = {}) {
  if (!isConfigured()) {
    const error = new Error("kraken_api_not_configured");
    error.statusCode = 503;
    throw error;
  }

  return enqueuePrivateRequest(() => {
    const nonce = nextNonce();
    const postData = querystring.stringify({ ...params, nonce });
    const signature = sign(urlPath, nonce, postData);

    const options = {
      hostname: KRAKEN_HOSTNAME,
      port: 443,
      path: urlPath,
      method: "POST",
      headers: {
        "API-Key": env.krakenApiKey,
        "API-Sign": signature,
        "Content-Type": "application/x-www-form-urlencoded",
        "Content-Length": Buffer.byteLength(postData)
      }
    };

    return new Promise((resolve, reject) => {
      const req = https.request(options, (res) => {
        let raw = "";
        res.on("data", (chunk) => { raw += chunk; });
        res.on("end", () => {
          let parsed;
          try {
            parsed = JSON.parse(raw);
          } catch (parseError) {
            reject(new Error("kraken_invalid_response"));
            return;
          }
          if (parsed.error && parsed.error.length) {
            const apiError = new Error(parsed.error[0]);
            apiError.krakenErrors = parsed.error;
            apiError.statusCode = 502;
            reject(apiError);
            return;
          }
          resolve(parsed.result || {});
        });
      });
      req.on("error", reject);
      req.setTimeout(15000, () => {
        req.destroy(new Error("kraken_request_timeout"));
      });
      req.write(postData);
      req.end();
    });
  });
}

async function fetchBalance() {
  return privateRequest("/0/private/Balance");
}

async function fetchOpenOrders() {
  const result = await privateRequest("/0/private/OpenOrders");
  const orders = result.open || {};
  return Object.entries(orders).map(([txid, order]) => ({
    txid,
    pair: order.descr && order.descr.pair,
    type: order.descr && order.descr.type,
    ordertype: order.descr && order.descr.ordertype,
    price: order.descr && order.descr.price,
    volume: order.vol,
    volume_executed: order.vol_exec,
    status: order.status,
    opened_at: order.opentm ? new Date(order.opentm * 1000).toISOString() : null
  }));
}

module.exports = {
  isConfigured,
  fetchBalance,
  fetchOpenOrders
};
