"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");

const {
  calculateWithdrawalQuote,
  normalizeDepositTalers,
  normalizeWithdrawalEur
} = require("../src/services/paper-exchange.service");

test("deposit accepts only whole positive Taler and converts 1 Taler to 10 EUR", () => {
  assert.deepEqual(normalizeDepositTalers(10), {
    talerAmount: 10,
    paperAmountEur: 100
  });

  assert.throws(() => normalizeDepositTalers(1.5), /invalid_taler_amount/);
  assert.throws(() => normalizeDepositTalers(0), /invalid_taler_amount/);
});

test("withdrawal accepts only whole EUR amounts that convert to whole Taler", () => {
  assert.deepEqual(normalizeWithdrawalEur(100), {
    paperAmountEur: 100,
    talerAmount: 10
  });

  assert.throws(() => normalizeWithdrawalEur(100.5), /invalid_withdrawal_amount/);
  assert.throws(() => normalizeWithdrawalEur(105), /withdrawal_amount_must_convert_to_whole_taler/);
});

test("withdrawal quote protects the 1000 EUR start capital until 1000 EUR losses were realized", () => {
  assert.deepEqual(calculateWithdrawalQuote({ cashEur: 1450.75, realizedLossEur: 0 }), {
    protectedCashEur: 1000,
    withdrawableEur: 450,
    withdrawableTaler: 45,
    realizedLossEur: 0
  });

  assert.deepEqual(calculateWithdrawalQuote({ cashEur: 900, realizedLossEur: 1000 }), {
    protectedCashEur: 0,
    withdrawableEur: 900,
    withdrawableTaler: 90,
    realizedLossEur: 1000
  });
});
