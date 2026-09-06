"use strict";

const { verifyProjectSession } = require("../services/central-auth.service");

async function requireProjectAuth(req, res, next) {
  const verification = await verifyProjectSession(req.headers.cookie || "");

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
  requireProjectAuth
};
