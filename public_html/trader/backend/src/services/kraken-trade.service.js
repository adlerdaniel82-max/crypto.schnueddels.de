"use strict";

const crypto = require("crypto");
const https = require("https");
const querystring = require("querystring");
const env = require("../config/env");

const KRAKEN_HOSTNAME = "api.kraken.com";
let lastNonce = 0;
let requestQueue = Promise.resolve();

function isConfigured() {
  return Boolean(env.traderKrakenApiKey && env.traderKrakenApiSecret);
}

function sign(urlPath, nonce, postData) {
  const secretBuffer = Buffer.from(env.traderKrakenApiSecret, "base64");
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

function enqueueRequest(task) {
  const runTask = () => Promise.resolve().then(task);
  const queued = requestQueue.then(runTask, runTask);
  requestQueue = queued.then(() => undefined, () => undefined);
  return queued;
}

function krakenRequest(urlPath, params = {}) {
  return enqueueRequest(() => {
    const nonce = nextNonce();
    const postData = querystring.stringify({ ...params, nonce });
    const signature = sign(urlPath, nonce, postData);

    const options = {
      hostname: KRAKEN_HOSTNAME,
      port: 443,
      path: urlPath,
      method: "POST",
      headers: {
        "API-Key": env.traderKrakenApiKey,
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
          try { parsed = JSON.parse(raw); } catch { reject(new Error("kraken_invalid_response")); return; }
          if (parsed.error && parsed.error.length) {
            const err = new Error(parsed.error[0]);
            err.krakenErrors = parsed.error;
            err.statusCode = 502;
            reject(err);
            return;
          }
          resolve(parsed.result || {});
        });
      });
      req.on("error", reject);
      req.setTimeout(15000, () => { req.destroy(new Error("kraken_request_timeout")); });
      req.write(postData);
      req.end();
    });
  });
}

async function fetchTicker(pair) {
  const response = await fetch(`https://${KRAKEN_HOSTNAME}/0/public/Ticker?pair=${encodeURIComponent(pair)}`, {
    signal: AbortSignal.timeout(10000)
  });
  if (!response.ok) throw new Error(`kraken_http_error_${response.status}`);
  const data = await response.json();
  if (data.error && data.error.length) throw new Error(data.error[0]);
  const result = data.result;
  const key = Object.keys(result)[0];
  return {
    ask: Number(result[key].a[0]),
    bid: Number(result[key].b[0]),
    last: Number(result[key].c[0])
  };
}

async function placeOrder(pair, side, volume) {
  if (!isConfigured()) throw Object.assign(new Error("trader_kraken_not_configured"), { statusCode: 503 });
  if (typeof volume !== "number" || !isFinite(volume) || volume <= 0) {
    throw Object.assign(new Error("trader_invalid_volume"), { statusCode: 400 });
  }
  const result = await krakenRequest("/0/private/AddOrder", {
    pair,
    type: side,
    ordertype: "market",
    volume: volume.toFixed(8)
  });
  return {
    txid: result.txids && result.txids[0] || null,
    descr: result.descr && result.descr.order || null
  };
}

async function cancelOrder(txid) {
  if (!isConfigured()) throw Object.assign(new Error("trader_kraken_not_configured"), { statusCode: 503 });
  return krakenRequest("/0/private/CancelOrder", { txid });
}

module.exports = { isConfigured, fetchTicker, placeOrder, cancelOrder };
