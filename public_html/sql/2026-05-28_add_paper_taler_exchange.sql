-- Exchange between Schnueddel Taler and paper-trading cash.

ALTER TABLE paper_ledger
  MODIFY movement_type ENUM('initial','buy','sell','reset','taler_deposit','taler_withdraw') NOT NULL;

CREATE TABLE IF NOT EXISTS paper_taler_exchanges (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT,
  user_id INT UNSIGNED NOT NULL,
  direction ENUM('taler_to_paper','paper_to_taler') NOT NULL,
  taler_amount INT UNSIGNED NOT NULL,
  paper_amount_eur DECIMAL(14,2) NOT NULL,
  wallet_status ENUM('pending','reserved','committed','credited','failed') NOT NULL DEFAULT 'pending',
  wallet_reservation_id VARCHAR(32) NULL,
  wallet_ledger_id VARCHAR(32) NULL,
  idempotency_key VARCHAR(180) NOT NULL,
  error_code VARCHAR(80) NULL,
  created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  UNIQUE KEY uniq_paper_taler_exchange_idempotency (idempotency_key),
  KEY idx_paper_taler_exchange_user_created (user_id, created_at),
  KEY idx_paper_taler_exchange_status (wallet_status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
