CREATE TABLE IF NOT EXISTS portfolio_snapshots (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT,
  fetched_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  balances_json JSON NOT NULL DEFAULT ('{}'),
  open_orders_json JSON NOT NULL DEFAULT ('[]'),
  open_order_count SMALLINT UNSIGNED NOT NULL DEFAULT 0,
  PRIMARY KEY (id),
  KEY idx_portfolio_snapshots_fetched (fetched_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
