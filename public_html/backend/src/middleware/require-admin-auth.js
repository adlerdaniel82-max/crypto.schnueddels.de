"use strict";

const { verifyAdminSession, verifyMasterSession } = require("../services/central-auth.service");

async function requireAdminAuth(req, res, next) {
  const verification = await verifyAdminSession(req.headers.cookie || "");

  if (!verification.ok) {
    res.status(verification.statusCode).json({
      error: verification.error,
      login_url: "https://schnueddels.de/auth/?redirect=" + encodeURIComponent("https://crypto.schnueddels.de/frontend/"),
      account_url: "https://schnueddels.de/auth/account.php"
    });
    return;
  }

  req.authUser = verification.user || null;
  next();
}

async function requireMasterAuth(req, res, next) {
  const verification = await verifyMasterSession(req.headers.cookie || "");

  if (!verification.ok) {
    res.status(verification.statusCode).json({
      error: verification.error,
      login_url: "https://schnueddels.de/auth/?redirect=" + encodeURIComponent("https://crypto.schnueddels.de/frontend/"),
      account_url: "https://schnueddels.de/auth/account.php"
    });
    return;
  }

  req.authUser = verification.user || null;
  next();
}

module.exports = {
  requireAdminAuth,
  requireMasterAuth
};
