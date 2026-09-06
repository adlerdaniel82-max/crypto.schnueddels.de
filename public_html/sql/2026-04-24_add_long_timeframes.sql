INSERT INTO strategy_settings (
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
  notes,
  is_active,
  sort_order
)
VALUES
  ('default_4h', 'Swingtrend', '4h', 48.00, 64.00, 20, 50, 12, 26, 9, 1.00, 7.00, 14.00, 9.00, 'Mittelfristiger Trendfilter fuer Swing-Bewegungen.', 1, 40),
  ('default_1d', 'Tagestrend', '1d', 50.00, 65.00, 20, 50, 12, 26, 9, 0.95, 10.00, 20.00, 12.00, 'Langfristiger Tagesfilter fuer robuste Marktlage.', 1, 50)
ON DUPLICATE KEY UPDATE
  label = VALUES(label),
  timeframe = VALUES(timeframe),
  rsi_min = VALUES(rsi_min),
  rsi_max = VALUES(rsi_max),
  fast_ema_period = VALUES(fast_ema_period),
  slow_ema_period = VALUES(slow_ema_period),
  macd_fast_period = VALUES(macd_fast_period),
  macd_slow_period = VALUES(macd_slow_period),
  macd_signal_period = VALUES(macd_signal_period),
  volume_factor_min = VALUES(volume_factor_min),
  stop_loss_percent = VALUES(stop_loss_percent),
  take_profit_percent = VALUES(take_profit_percent),
  max_daily_drop_percent = VALUES(max_daily_drop_percent),
  notes = VALUES(notes),
  is_active = VALUES(is_active),
  sort_order = VALUES(sort_order);
