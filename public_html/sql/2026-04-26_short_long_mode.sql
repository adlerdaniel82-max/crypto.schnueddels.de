-- 2026-04-26_short_long_mode.sql

ALTER TABLE trader_config
  ADD COLUMN mode ENUM('long','short') NOT NULL DEFAULT 'long' AFTER stop_loss_percent,
  ADD COLUMN partial_exit_percent TINYINT UNSIGNED NOT NULL DEFAULT 0 AFTER mode;

ALTER TABLE trader_positions
  ADD COLUMN partial_exit_done TINYINT(1) NOT NULL DEFAULT 0 AFTER close_reason,
  ADD COLUMN partial_exit_volume DECIMAL(18,8) NULL AFTER partial_exit_done;
