CREATE TABLE IF NOT EXISTS alert_events (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  coin_id BIGINT UNSIGNED NOT NULL,
  timeframe VARCHAR(8) NOT NULL,
  alert_kind VARCHAR(32) NOT NULL,
  signal_created_at DATETIME NOT NULL,
  sent_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  payload_json LONGTEXT NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uniq_coin_timeframe_alert (coin_id, timeframe, alert_kind, signal_created_at),
  KEY idx_alert_events_sent_at (sent_at),
  KEY idx_alert_events_coin_id (coin_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
