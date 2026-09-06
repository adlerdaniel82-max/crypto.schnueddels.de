"use strict";

function buildSignalContract(signal) {
  if (!signal || typeof signal !== "object") {
    return null;
  }

  return {
    version: 1,
    type: signal.signalType || null,
    confidence: Number.isFinite(Number(signal.confidenceScore)) ? Number(signal.confidenceScore) : null,
    summary: signal.summary || null,
    reasons: Array.isArray(signal.reasons) ? signal.reasons.slice() : [],
    blockers: Array.isArray(signal.blockerKeys) ? signal.blockerKeys.slice() : [],
    risk: {
      stopLossPercent: Number.isFinite(Number(signal.stopLossPercent)) ? Number(signal.stopLossPercent) : null,
      takeProfitPercent: Number.isFinite(Number(signal.takeProfitPercent)) ? Number(signal.takeProfitPercent) : null,
      riskExceeded: Boolean(signal.riskExceeded)
    },
    timing: {
      createdAt: signal.createdAt || null,
      higherTimeframeConfirmation: signal.higherTimeframeConfirmation || null
    }
  };
}

module.exports = {
  buildSignalContract
};
