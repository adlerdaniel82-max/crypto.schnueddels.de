"use strict";

const tradeEngine = require("../engine/trade-engine");

(async () => {
  try {
    const result = await tradeEngine.runCycle();
    console.log("[trade-loop] result:", JSON.stringify(result));
    process.exit(0);
  } catch (error) {
    console.error("[trade-loop] fatal:", error.message);
    process.exit(1);
  }
})();
