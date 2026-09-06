-- 2026-05-09_add_trader_cycle_runs.sql

CREATE TABLE IF NOT EXISTS trader_cycle_runs (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT,
  mode VARCHAR(8) NOT NULL DEFAULT 'long',
  dry_run TINYINT(1) NOT NULL DEFAULT 1,
  skipped TINYINT(1) NOT NULL DEFAULT 0,
  skip_reason VARCHAR(64) NULL,
  result_json LONGTEXT NOT NULL,
  created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  KEY idx_trader_cycle_runs_created (created_at),
  KEY idx_trader_cycle_runs_mode (mode)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
