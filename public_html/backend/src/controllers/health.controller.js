"use strict";

const db = require("../config/db");

async function getHealth(req, res) {
  try {
    await db.query("SELECT 1");
    res.json({
      status: "ok",
      service: "crypto-backend",
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error(error);
    res.status(503).json({
      status: "error",
      service: "crypto-backend"
    });
  }
}

module.exports = {
  getHealth
};
