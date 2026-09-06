-- 2026-05-23_add_trader_take_profit.sql

ALTER TABLE trader_positions
  ADD COLUMN take_profit_price DECIMAL(18,8) NULL AFTER stop_loss_price;

UPDATE trader_positions
SET take_profit_price = ROUND(entry_price * 1.10, 8)
WHERE closed_at IS NULL
  AND take_profit_price IS NULL
  AND entry_price IS NOT NULL
  AND entry_price > 0;
