-- User-scoped manual paper trading. Separate from auto-trader tables.

CREATE TABLE IF NOT EXISTS paper_accounts (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT,
  user_id INT UNSIGNED NOT NULL,
  cash_eur DECIMAL(14,2) NOT NULL DEFAULT 1000.00,
  created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  UNIQUE KEY uniq_paper_accounts_user (user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS paper_positions (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT,
  user_id INT UNSIGNED NOT NULL,
  coin_symbol VARCHAR(32) NOT NULL,
  base_asset VARCHAR(16) NOT NULL,
  quote_asset VARCHAR(16) NOT NULL DEFAULT 'EUR',
  entry_price DECIMAL(18,8) NOT NULL,
  entry_volume DECIMAL(24,8) NOT NULL,
  opened_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  closed_at TIMESTAMP(3) NULL,
  close_reason VARCHAR(64) NULL,
  realized_pnl_eur DECIMAL(14,2) NOT NULL DEFAULT 0.00,
  PRIMARY KEY (id),
  KEY idx_paper_positions_user_open (user_id, closed_at),
  KEY idx_paper_positions_user_symbol (user_id, coin_symbol)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS paper_orders (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT,
  user_id INT UNSIGNED NOT NULL,
  position_id INT UNSIGNED NULL,
  coin_symbol VARCHAR(32) NOT NULL,
  side ENUM('buy','sell') NOT NULL,
  price_eur DECIMAL(18,8) NOT NULL,
  volume DECIMAL(24,8) NOT NULL,
  gross_eur DECIMAL(14,2) NOT NULL,
  realized_pnl_eur DECIMAL(14,2) NULL,
  created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  KEY idx_paper_orders_user_created (user_id, created_at),
  KEY idx_paper_orders_position (position_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS paper_ledger (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT,
  user_id INT UNSIGNED NOT NULL,
  order_id INT UNSIGNED NULL,
  movement_type ENUM('initial','buy','sell','reset') NOT NULL,
  amount_eur DECIMAL(14,2) NOT NULL,
  balance_after_eur DECIMAL(14,2) NOT NULL,
  created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  KEY idx_paper_ledger_user_created (user_id, created_at),
  KEY idx_paper_ledger_order (order_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
