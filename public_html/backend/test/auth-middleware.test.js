"use strict";

const assert = require("node:assert/strict");
const path = require("node:path");
const test = require("node:test");

function loadMiddlewareWithAuthMock(authMock) {
  const adminPath = path.resolve(__dirname, "../src/middleware/require-admin-auth.js");
  const projectPath = path.resolve(__dirname, "../src/middleware/require-project-auth.js");
  const authPath = path.resolve(__dirname, "../src/services/central-auth.service.js");

  delete require.cache[adminPath];
  delete require.cache[projectPath];
  delete require.cache[authPath];

  require.cache[authPath] = {
    id: authPath,
    filename: authPath,
    loaded: true,
    exports: authMock
  };

  return {
    ...require(adminPath),
    ...require(projectPath)
  };
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

test("project middleware accepts normal project users", async () => {
  const middleware = loadMiddlewareWithAuthMock({
    verifyProjectSession: async () => ({ ok: true, user: { id: 11, role: "user" } }),
    verifyAdminSession: async () => ({ ok: false, statusCode: 403, error: "admin_access_required" }),
    verifyMasterSession: async () => ({ ok: false, statusCode: 403, error: "master_access_required" })
  });
  const req = { headers: { cookie: "auth_session=s1" } };
  let nextCalled = false;

  await middleware.requireProjectAuth(req, createResponse(), () => {
    nextCalled = true;
  });

  assert.equal(nextCalled, true);
  assert.deepEqual(req.authUser, { id: 11, role: "user" });
});

test("master middleware rejects non-master users", async () => {
  const middleware = loadMiddlewareWithAuthMock({
    verifyProjectSession: async () => ({ ok: true, user: { id: 11, role: "user" } }),
    verifyAdminSession: async () => ({ ok: true, user: { id: 12, role: "admin" } }),
    verifyMasterSession: async () => ({ ok: false, statusCode: 403, error: "master_access_required" })
  });
  const res = createResponse();
  let nextCalled = false;

  await middleware.requireMasterAuth({ headers: { cookie: "auth_session=s1" } }, res, () => {
    nextCalled = true;
  });

  assert.equal(nextCalled, false);
  assert.equal(res.payload.status, 403);
  assert.equal(res.payload.body.error, "master_access_required");
});

test("master middleware accepts master users", async () => {
  const middleware = loadMiddlewareWithAuthMock({
    verifyProjectSession: async () => ({ ok: true, user: { id: 1, role: "master" } }),
    verifyAdminSession: async () => ({ ok: true, user: { id: 1, role: "master" } }),
    verifyMasterSession: async () => ({ ok: true, user: { id: 1, role: "master" } })
  });
  const req = { headers: { cookie: "auth_session=s1" } };
  let nextCalled = false;

  await middleware.requireMasterAuth(req, createResponse(), () => {
    nextCalled = true;
  });

  assert.equal(nextCalled, true);
  assert.deepEqual(req.authUser, { id: 1, role: "master" });
});
