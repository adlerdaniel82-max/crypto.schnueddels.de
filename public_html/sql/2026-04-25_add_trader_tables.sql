-- 2026-04-25_add_trader_tables.sql

CREATE TABLE IF NOT EXISTS trader_config (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT,
  dry_run TINYINT(1) NOT NULL DEFAULT 1,
  paused TINYINT(1) NOT NULL DEFAULT 0,
  budget_eur DECIMAL(12,2) NOT NULL DEFAULT 0.00,
  max_per_coin_eur DECIMAL(12,2) NOT NULL DEFAULT 0.00,
  stop_loss_percent DECIMAL(5,2) NOT NULL DEFAULT 5.00,
  last_cycle_at TIMESTAMP NULL,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

INSERT INTO trader_config (dry_run, paused, budget_eur, max_per_coin_eur, stop_loss_percent)
VALUES (1, 0, 0.00, 0.00, 5.00)
ON DUPLICATE KEY UPDATE id = id;

CREATE TABLE IF NOT EXISTS trade_orders (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT,
  coin_symbol VARCHAR(20) NOT NULL,
  side ENUM('buy','sell') NOT NULL,
  kraken_pair VARCHAR(20) NOT NULL,
  volume DECIMAL(18,8) NOT NULL,
  price_estimate DECIMAL(18,8) NULL,
  kraken_txid VARCHAR(64) NULL,
  dry_run TINYINT(1) NOT NULL DEFAULT 1,
  status VARCHAR(32) NOT NULL DEFAULT 'pending',
  signal_reason VARCHAR(64) NULL,
  created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  KEY idx_trade_orders_symbol (coin_symbol),
  KEY idx_trade_orders_created (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS trader_positions (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT,
  coin_symbol VARCHAR(20) NOT NULL,
  base_asset VARCHAR(16) NOT NULL,
  kraken_pair VARCHAR(20) NOT NULL,
  buy_order_id INT UNSIGNED NULL,
  entry_price DECIMAL(18,8) NULL,
  entry_volume DECIMAL(18,8) NULL,
  stop_loss_price DECIMAL(18,8) NULL,
  opened_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  closed_at TIMESTAMP(3) NULL,
  close_reason VARCHAR(64) NULL,
  PRIMARY KEY (id),
  KEY idx_trader_positions_symbol (coin_symbol),
  KEY idx_trader_positions_open (closed_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
