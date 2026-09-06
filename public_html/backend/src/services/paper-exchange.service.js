"use strict";

const START_CASH_EUR = 1000;
const PAPER_EUR_PER_TALER = 10;
const LOSS_THRESHOLD_EUR = 1000;

function normalizeDepositTalers(value) {
  const talerAmount = Number(value);
  if (!Number.isInteger(talerAmount) || talerAmount <= 0) {
    throw badRequest("invalid_taler_amount");
  }

  return {
    talerAmount,
    paperAmountEur: talerAmount * PAPER_EUR_PER_TALER
  };
}

function normalizeWithdrawalEur(value) {
  const paperAmountEur = Number(value);
  if (!Number.isInteger(paperAmountEur) || paperAmountEur <= 0) {
    throw badRequest("invalid_withdrawal_amount");
  }
  if (paperAmountEur % PAPER_EUR_PER_TALER !== 0) {
    throw badRequest("withdrawal_amount_must_convert_to_whole_taler");
  }

  return {
    paperAmountEur,
    talerAmount: paperAmountEur / PAPER_EUR_PER_TALER
  };
}

function calculateWithdrawalQuote({ cashEur, realizedLossEur }) {
  const safeCashEur = Math.max(0, Math.floor(Number(cashEur || 0)));
  const safeRealizedLossEur = Math.max(0, Math.floor(Number(realizedLossEur || 0)));
  const protectedCashEur = safeRealizedLossEur >= LOSS_THRESHOLD_EUR ? 0 : START_CASH_EUR;
  const withdrawableEur = Math.max(0, safeCashEur - protectedCashEur);

  return {
    protectedCashEur,
    withdrawableEur,
    withdrawableTaler: Math.floor(withdrawableEur / PAPER_EUR_PER_TALER),
    realizedLossEur: safeRealizedLossEur
  };
}

function badRequest(message) {
  const error = new Error(message);
  error.statusCode = 400;
  return error;
}

module.exports = {
  LOSS_THRESHOLD_EUR,
  PAPER_EUR_PER_TALER,
  START_CASH_EUR,
  calculateWithdrawalQuote,
  normalizeDepositTalers,
  normalizeWithdrawalEur
};
