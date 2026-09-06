"use strict";

const assert = require("node:assert/strict");
const path = require("node:path");
const test = require("node:test");

function loadControllerWithRepoMock(repoMock) {
  const controllerPath = path.resolve(__dirname, "../src/controllers/paper.controller.js");
  const repoPath = path.resolve(__dirname, "../src/repositories/paper.repository.js");
  delete require.cache[controllerPath];
  delete require.cache[repoPath];
  require.cache[repoPath] = {
    id: repoPath,
    filename: repoPath,
    loaded: true,
    exports: repoMock
  };

  return require(controllerPath);
}

function createResponse() {
  const payload = {};
  return {
    payload,
    status(code) {
      payload.status = code;
      return this;
    },
    json(body) {
      payload.body = body;
      return this;
    }
  };
}

test("paper buy uses authenticated user id from request context", async () => {
  let received = null;
  const controller = loadControllerWithRepoMock({
    buy: async (payload) => {
      received = payload;
      return { cashEur: 900 };
    }
  });
  const res = createResponse();

  await controller.buy({
    authUser: { id: 42 },
    body: { userId: 999, symbol: "TRX/EUR", amountEur: 100 }
  }, res, (error) => {
    throw error;
  });

  assert.deepEqual(received, { userId: 42, symbol: "TRX/EUR", amountEur: 100 });
  assert.equal(res.payload.status, 201);
  assert.equal(res.payload.body.cashEur, 900);
});

test("paper sell maps repository validation errors to response status", async () => {
  const controller = loadControllerWithRepoMock({
    sell: async () => {
      const error = new Error("paper_volume_exceeds_position");
      error.statusCode = 400;
      throw error;
    }
  });
  const res = createResponse();
  let nextCalled = false;

  await controller.sell({
    authUser: { id: 42 },
    body: { positionId: 7, volume: 100 }
  }, res, () => {
    nextCalled = true;
  });

  assert.equal(nextCalled, false);
  assert.equal(res.payload.status, 400);
  assert.equal(res.payload.body.error, "paper_volume_exceeds_position");
});

test("paper deposit and withdraw use authenticated central user id", async () => {
  const calls = [];
  const controller = loadControllerWithRepoMock({
    depositTalers: async (payload) => {
      calls.push(["deposit", payload]);
      return { cashEur: 1100, exchange: { talerAmount: 10, paperAmountEur: 100 } };
    },
    withdrawTalers: async (payload) => {
      calls.push(["withdraw", payload]);
      return { cashEur: 1000, exchange: { talerAmount: 10, paperAmountEur: 100 } };
    }
  });

  const depositRes = createResponse();
  await controller.depositTalers({
    authUser: { id: 42 },
    body: { talerAmount: 10, userId: 999 }
  }, depositRes, (error) => {
    throw error;
  });

  const withdrawRes = createResponse();
  await controller.withdrawTalers({
    authUser: { id: 42 },
    body: { amountEur: 100, userId: 999 }
  }, withdrawRes, (error) => {
    throw error;
  });

  assert.deepEqual(calls, [
    ["deposit", { userId: 42, talerAmount: 10 }],
    ["withdraw", { userId: 42, amountEur: 100 }]
  ]);
  assert.equal(depositRes.payload.status, 201);
  assert.equal(depositRes.payload.body.exchange.talerAmount, 10);
  assert.equal(withdrawRes.payload.body.exchange.paperAmountEur, 100);
});
