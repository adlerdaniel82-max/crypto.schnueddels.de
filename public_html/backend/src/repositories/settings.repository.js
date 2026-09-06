"use strict";

const db = require("../config/db");

const SETTINGS_COLUMNS = `
  id,
  setting_key,
  label,
  timeframe,
  rsi_min,
  rsi_max,
  fast_ema_period,
  slow_ema_period,
  macd_fast_period,
  macd_slow_period,
  macd_signal_period,
  volume_factor_min,
  stop_loss_percent,
  take_profit_percent,
  max_daily_drop_percent,
  notes
`;

async function listActiveSettings() {
  const [rows] = await db.query(`
    SELECT ${SETTINGS_COLUMNS}
    FROM strategy_settings
    WHERE is_active = 1 AND is_default = 1
    ORDER BY sort_order ASC, timeframe ASC
  `);

  return rows;
}

async function listAllActiveSettings() {
  const [rows] = await db.query(`
    SELECT ${SETTINGS_COLUMNS}
    FROM strategy_settings
    WHERE is_active = 1
    ORDER BY sort_order ASC, timeframe ASC
  `);

  return rows;
}

module.exports = {
  listActiveSettings,
  listAllActiveSettings
};
