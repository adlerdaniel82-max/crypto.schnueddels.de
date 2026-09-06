"use strict";

const { verifyMasterSession } = require("../services/central-auth.service");

async function requireTraderAuth(req, res, next) {
  const verification = await verifyMasterSession(req.headers.cookie || "");

  if (!verification.ok) {
    res.status(verification.statusCode).json({
      error: verification.error,
      login_url: "https://schnueddels.de/auth/?redirect=" + encodeURIComponent("https://crypto.schnueddels.de/trade/")
    });
    return;
  }

  req.authUser = verification.user || null;
  next();
}

module.exports = { requireTraderAuth };
