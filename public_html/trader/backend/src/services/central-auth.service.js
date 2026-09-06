"use strict";

const crypto = require("crypto");
const https = require("https");
const env = require("../config/env");

function parseCookies(cookieHeader) {
  return String(cookieHeader || "")
    .split(";")
    .map((part) => part.trim())
    .filter(Boolean)
    .reduce((acc, part) => {
      const separatorIndex = part.indexOf("=");
      if (separatorIndex <= 0) return acc;
      const key = part.slice(0, separatorIndex).trim();
      const value = part.slice(separatorIndex + 1).trim();
      acc[key] = decodeURIComponent(value);
      return acc;
    }, {});
}

function postJson(url, payload, extraHeaders = {}) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify(payload || {});
    const parsed = new URL(url);
    const req = https.request({
      method: "POST",
      hostname: parsed.hostname,
      port: parsed.port || 443,
      path: `${parsed.pathname}${parsed.search || ""}`,
      headers: {
        "Content-Type": "application/json",
        "Content-Length": Buffer.byteLength(body),
        ...extraHeaders
      },
      timeout: 10000
    }, (res) => {
      let raw = "";
      res.on("data", (chunk) => { raw += chunk; });
      res.on("end", () => {
        let json = {};
        try {
          json = raw ? JSON.parse(raw) : {};
        } catch (error) {
          error.status = res.statusCode;
          reject(error);
          return;
        }
        if ((res.statusCode || 500) >= 200 && (res.statusCode || 500) < 300) {
          resolve(json);
          return;
        }
        const error = new Error(json && json.error ? json.error : "auth_request_failed");
        error.status = res.statusCode;
        reject(error);
      });
    });

    req.on("timeout", () => req.destroy(new Error("auth_timeout")));
    req.on("error", reject);
    req.write(body);
    req.end();
  });
}

async function verifyMasterSession(cookieHeader) {
  if (!env.projectApiSecret) {
    return { ok: false, statusCode: 503, error: "auth_not_configured" };
  }

  const cookies = parseCookies(cookieHeader);
  const sessionId = String(cookies.auth_session || "").trim();
  if (!sessionId) {
    return { ok: false, statusCode: 401, error: "auth_required" };
  }

  const payload = {
    session_id: sessionId,
    project_key: env.projectKey
  };
  const timestamp = Math.floor(Date.now() / 1000);
  const payloadJson = JSON.stringify(payload);
  const headers = {
    "X-Project-Key": env.projectKey,
    "X-Project-Secret": env.projectApiSecret,
    "X-Timestamp": String(timestamp),
    "X-Signature": crypto
      .createHmac("sha256", env.projectApiSecret)
      .update(payloadJson + String(timestamp))
      .digest("hex")
  };

  try {
    const result = await postJson(`${String(env.authApiUrl).replace(/\/+$/, "")}/verify.php`, payload, headers);
    if (!result?.valid) {
      return { ok: false, statusCode: 403, error: "project_access_required" };
    }
    if (!result?.is_master && result?.user?.role !== "master") {
      return { ok: false, statusCode: 403, error: "master_access_required" };
    }
    return { ok: true, statusCode: 200, user: result.user || null };
  } catch (error) {
    if (error.message === "Invalid or expired session" || error.message === "Session ID required") {
      return { ok: false, statusCode: 401, error: "auth_required" };
    }
    if (error.message === "No access to this project") {
      return { ok: false, statusCode: 403, error: "project_access_required" };
    }
    return { ok: false, statusCode: 503, error: "auth_unavailable" };
  }
}

module.exports = {
  verifyMasterSession
};
