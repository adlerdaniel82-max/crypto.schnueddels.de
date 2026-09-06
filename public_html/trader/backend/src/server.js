"use strict";

const app = require("./app");
const config = require("./config/env");

app.listen(config.port, config.host, () => {
  console.log(`[crypto-trader] listening on ${config.host}:${config.port}`);
});
