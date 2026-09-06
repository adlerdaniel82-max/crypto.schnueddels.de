ALTER TABLE trader_config
  ADD COLUMN IF NOT EXISTS dry_run_cash_eur DECIMAL(12,2) NOT NULL DEFAULT 1000.00 AFTER partial_exit_percent;

UPDATE trader_config
SET dry_run_cash_eur = 1000.00
WHERE id = 1;

ALTER TABLE trader_positions
  ADD COLUMN IF NOT EXISTS dry_run_realized_pnl_eur DECIMAL(12,2) NOT NULL DEFAULT 0.00 AFTER take_profit_price;
