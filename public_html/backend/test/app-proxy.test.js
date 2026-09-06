"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");

const app = require("../src/app");

test("backend trusts the reverse proxy for rate limit client IP handling", () => {
  assert.equal(app.get("trust proxy"), 1);
});
