"use strict";

const assert = require("node:assert/strict");
const { EventEmitter } = require("node:events");
const test = require("node:test");

process.env.NODE_ENV = "test";
process.env.TRADER_KRAKEN_API_KEY = "test-key";
process.env.TRADER_KRAKEN_API_SECRET = Buffer.from("test-secret", "utf8").toString("base64");

const https = require("node:https");
const originalRequest = https.request;
const originalNow = Date.now;
const krakenTradeService = require("../src/services/kraken-trade.service");

function parseBody(body) {
  return Object.fromEntries(new URLSearchParams(body));
}

function installRequestMock(pending) {
  https.request = (options, callback) => {
    const req = new EventEmitter();
    req.body = "";
    req.write = (chunk) => {
      req.body += chunk;
    };
    req.setTimeout = () => req;
    req.destroy = () => {};
    req.end = () => {
      pending.push({ options, callback, body: req.body });
    };
    return req;
  };
}

function respond(record, payload) {
  const res = new EventEmitter();
  res.statusCode = 200;
  record.callback(res);
  queueMicrotask(() => {
    res.emit("data", JSON.stringify({ error: [], result: payload }));
    res.emit("end");
  });
}

test("Kraken private requests are serialized and use monotonic nonces", async () => {
  const pending = [];
  installRequestMock(pending);
  Date.now = () => 1715000000000;

  try {
    const orderPromise = krakenTradeService.placeOrder("BTC/EUR", "buy", 1.25);
    const cancelPromise = krakenTradeService.cancelOrder("tx-123");

    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(pending.length, 1);

    const first = pending.shift();
    const firstBody = parseBody(first.body);
    assert.equal(firstBody.nonce, "1715000000000");
    assert.equal(firstBody.pair, "BTC/EUR");
    respond(first, { txids: ["tx-1"], descr: { order: "buy" } });

    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(pending.length, 1);

    const second = pending.shift();
    const secondBody = parseBody(second.body);
    assert.equal(secondBody.nonce, "1715000000001");
    assert.equal(secondBody.txid, "tx-123");
    respond(second, { count: 1 });

    await Promise.all([orderPromise, cancelPromise]);
  } finally {
    https.request = originalRequest;
    Date.now = originalNow;
  }
});
