"use strict";

const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const http = require("node:http");
const path = require("node:path");
const test = require("node:test");

function loadWalletService() {
  const servicePath = path.resolve(__dirname, "../src/services/central-wallet.service.js");
  const envPath = path.resolve(__dirname, "../src/config/env.js");
  delete require.cache[servicePath];
  delete require.cache[envPath];
  return require(servicePath);
}

function withServer(handler) {
  const server = http.createServer(handler);
  return new Promise((resolve, reject) => {
    server.listen(0, "127.0.0.1", () => {
      resolve({
        url: `http://127.0.0.1:${server.address().port}/auth/api`,
        close: () => new Promise((done) => server.close(done))
      });
    });
    server.on("error", reject);
  });
}

test("wallet client credits free earn Taler through signed central wallet request", async () => {
  const requests = [];
  const server = await withServer((req, res) => {
    let raw = "";
    req.on("data", (chunk) => { raw += chunk; });
    req.on("end", () => {
      requests.push({
        url: req.url,
        headers: req.headers,
        body: JSON.parse(raw)
      });
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ ok: true, ledger_id: "77", balance_available: "15" }));
    });
  });

  const oldEnv = { ...process.env };
  try {
    process.env.AUTH_API_URL = server.url;
    process.env.PROJECT_KEY = "crypto";
    process.env.PROJECT_API_SECRET = "crypto-wallet-secret";
    process.env.WALLET_TIMEOUT_MS = "1000";

    const wallet = loadWalletService();
    const result = await wallet.credit({
      centralUserId: 42,
      amount: 10,
      reasonCode: "crypto.paper.withdraw",
      sourceType: "paper_taler_exchange",
      sourceId: "crypto:paper:withdraw:9",
      idempotencyKey: "crypto.paper.withdraw:9"
    });

    assert.equal(result.ledger_id, "77");
    assert.equal(requests[0].url, "/auth/api/wallet/credit.php");
    assert.equal(requests[0].headers["x-project-key"], "crypto");
    assert.equal(requests[0].headers["x-project-secret"], "crypto-wallet-secret");
    assert.equal(
      requests[0].headers["x-signature"],
      crypto
        .createHmac("sha256", "crypto-wallet-secret")
        .update(JSON.stringify(requests[0].body) + requests[0].headers["x-timestamp"])
        .digest("hex")
    );
    assert.deepEqual(requests[0].body, {
      user_id: 42,
      currency_code: "SNT_FREE",
      amount: "10",
      reason_code: "crypto.paper.withdraw",
      source_type: "paper_taler_exchange",
      source_id: "crypto:paper:withdraw:9",
      idempotency_key: "crypto.paper.withdraw:9"
    });
  } finally {
    process.env = oldEnv;
    await server.close();
  }
});
