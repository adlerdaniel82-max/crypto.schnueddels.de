CREATE TABLE IF NOT EXISTS data_sources (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT,
  source_key VARCHAR(64) NOT NULL,
  label VARCHAR(128) NOT NULL,
  endpoint_url VARCHAR(255) NOT NULL,
  provider_type ENUM('exchange_public', 'market_aggregator') NOT NULL DEFAULT 'exchange_public',
  poll_interval_seconds INT UNSIGNED NOT NULL DEFAULT 300,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uniq_data_sources_key (source_key)
);

CREATE TABLE IF NOT EXISTS coins (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT,
  symbol VARCHAR(32) NOT NULL,
  base_asset VARCHAR(16) NOT NULL,
  quote_asset VARCHAR(16) NOT NULL DEFAULT 'EUR',
  name VARCHAR(128) NOT NULL,
  exchange_symbol VARCHAR(64) NOT NULL,
  default_timeframe ENUM('5m', '15m', '1h', '4h', '1d') NOT NULL DEFAULT '4h',
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  sort_order INT UNSIGNED NOT NULL DEFAULT 100,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uniq_coins_symbol (symbol),
  KEY idx_coins_active_order (is_active, sort_order)
);

CREATE TABLE IF NOT EXISTS strategy_settings (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT,
  setting_key VARCHAR(64) NOT NULL,
  label VARCHAR(128) NOT NULL,
  timeframe ENUM('5m', '15m', '1h', '4h', '1d') NOT NULL,
  rsi_min DECIMAL(6,2) NOT NULL,
  rsi_max DECIMAL(6,2) NOT NULL,
  fast_ema_period SMALLINT UNSIGNED NOT NULL DEFAULT 20,
  slow_ema_period SMALLINT UNSIGNED NOT NULL DEFAULT 50,
  macd_fast_period SMALLINT UNSIGNED NOT NULL DEFAULT 12,
  macd_slow_period SMALLINT UNSIGNED NOT NULL DEFAULT 26,
  macd_signal_period SMALLINT UNSIGNED NOT NULL DEFAULT 9,
  volume_factor_min DECIMAL(8,2) NOT NULL DEFAULT 1.00,
  stop_loss_percent DECIMAL(6,2) NOT NULL DEFAULT 4.00,
  take_profit_percent DECIMAL(6,2) NOT NULL DEFAULT 8.00,
  max_daily_drop_percent DECIMAL(6,2) NOT NULL DEFAULT 6.00,
  notes TEXT NULL,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  sort_order INT UNSIGNED NOT NULL DEFAULT 100,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uniq_strategy_settings_key (setting_key),
  KEY idx_strategy_settings_active_order (is_active, sort_order)
);

CREATE TABLE IF NOT EXISTS market_candles (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  coin_id INT UNSIGNED NOT NULL,
  source_id INT UNSIGNED NOT NULL,
  timeframe ENUM('5m', '15m', '1h', '4h', '1d') NOT NULL,
  open_time DATETIME NOT NULL,
  close_time DATETIME NOT NULL,
  open_price DECIMAL(18,8) NOT NULL,
  high_price DECIMAL(18,8) NOT NULL,
  low_price DECIMAL(18,8) NOT NULL,
  close_price DECIMAL(18,8) NOT NULL,
  volume DECIMAL(24,8) NOT NULL DEFAULT 0,
  trades_count INT UNSIGNED NULL,
  raw_payload JSON NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uniq_market_candle (coin_id, timeframe, open_time),
  KEY idx_market_candles_coin_time (coin_id, timeframe, open_time),
  CONSTRAINT fk_market_candles_coin
    FOREIGN KEY (coin_id) REFERENCES coins (id)
    ON DELETE CASCADE,
  CONSTRAINT fk_market_candles_source
    FOREIGN KEY (source_id) REFERENCES data_sources (id)
    ON DELETE RESTRICT
);

CREATE TABLE IF NOT EXISTS signals (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  coin_id INT UNSIGNED NOT NULL,
  source_id INT UNSIGNED NOT NULL,
  timeframe ENUM('5m', '15m', '1h', '4h', '1d') NOT NULL,
  signal_type ENUM('buy', 'watch', 'avoid', 'sell', 'waiting') NOT NULL DEFAULT 'waiting',
  confidence_score DECIMAL(6,2) NOT NULL DEFAULT 0,
  close_price DECIMAL(18,8) NULL,
  rsi_value DECIMAL(10,4) NULL,
  macd_value DECIMAL(18,8) NULL,
  macd_signal_value DECIMAL(18,8) NULL,
  ema_fast DECIMAL(18,8) NULL,
  ema_slow DECIMAL(18,8) NULL,
  volume_ratio DECIMAL(10,4) NULL,
  stop_loss_percent DECIMAL(6,2) NULL,
  take_profit_percent DECIMAL(6,2) NULL,
  summary VARCHAR(255) NULL,
  reasons_json JSON NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_signals_coin_created (coin_id, created_at),
  KEY idx_signals_timeframe_created (timeframe, created_at),
  KEY idx_signals_signal_type (signal_type),
  CONSTRAINT fk_signals_coin
    FOREIGN KEY (coin_id) REFERENCES coins (id)
    ON DELETE CASCADE,
  CONSTRAINT fk_signals_source
    FOREIGN KEY (source_id) REFERENCES data_sources (id)
    ON DELETE RESTRICT
);

CREATE TABLE IF NOT EXISTS job_runs (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  job_key VARCHAR(64) NOT NULL,
  status ENUM('running', 'success', 'error') NOT NULL DEFAULT 'running',
  started_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  finished_at DATETIME NULL,
  rows_written INT UNSIGNED NOT NULL DEFAULT 0,
  message TEXT NULL,
  details_json JSON NULL,
  PRIMARY KEY (id),
  KEY idx_job_runs_key_started (job_key, started_at),
  KEY idx_job_runs_status_started (status, started_at)
);

INSERT INTO data_sources (source_key, label, endpoint_url, provider_type, poll_interval_seconds, is_active)
VALUES
  ('kraken_public', 'Kraken Public', 'https://api.kraken.com/0/public/OHLC', 'exchange_public', 300, 1),
  ('coingecko', 'CoinGecko', 'https://api.coingecko.com/api/v3', 'market_aggregator', 600, 1)
ON DUPLICATE KEY UPDATE
  label = VALUES(label),
  endpoint_url = VALUES(endpoint_url),
  provider_type = VALUES(provider_type),
  poll_interval_seconds = VALUES(poll_interval_seconds),
  is_active = VALUES(is_active);

INSERT INTO coins (symbol, base_asset, quote_asset, name, exchange_symbol, default_timeframe, is_active, sort_order)
VALUES
  ('BTC/EUR', 'BTC', 'EUR', 'Bitcoin', 'XBTEUR', '4h', 1, 10),
  ('ETH/EUR', 'ETH', 'EUR', 'Ethereum', 'ETHEUR', '4h', 1, 20),
  ('SOL/EUR', 'SOL', 'EUR', 'Solana', 'SOLEUR', '4h', 1, 30),
  ('XRP/EUR', 'XRP', 'EUR', 'Ripple', 'XRPEUR', '4h', 1, 40),
  ('ADA/EUR', 'ADA', 'EUR', 'Cardano', 'ADAEUR', '4h', 1, 50)
ON DUPLICATE KEY UPDATE
  base_asset = VALUES(base_asset),
  quote_asset = VALUES(quote_asset),
  name = VALUES(name),
  exchange_symbol = VALUES(exchange_symbol),
  default_timeframe = VALUES(default_timeframe),
  is_active = VALUES(is_active),
  sort_order = VALUES(sort_order);

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
  ('default_5m', 'Kurzfrist Scan', '5m', 46.00, 64.00, 20, 50, 12, 26, 9, 1.15, 2.80, 4.20, 3.00, 'Schneller Filter fuer Intraday-Bewegungen.', 1, 10),
  ('default_15m', 'Standard Intraday', '15m', 42.00, 68.00, 20, 50, 12, 26, 9, 1.10, 4.00, 8.00, 6.00, 'Primarprofil fuer Phase 1, RSI leicht geoeffnet fuer weniger verpasste Intraday-Setups.', 1, 20),
  ('default_1h', 'Strukturtrend', '1h', 48.00, 62.00, 20, 50, 12, 26, 9, 1.05, 5.00, 10.00, 7.00, 'Hoeherer Horizont fuer ruhigere Signale.', 1, 30),
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

INSERT INTO market_candles (
  coin_id,
  source_id,
  timeframe,
  open_time,
  close_time,
  open_price,
  high_price,
  low_price,
  close_price,
  volume,
  trades_count,
  raw_payload
)
SELECT
  c.id,
  ds.id,
  '15m',
  '2026-04-24 09:00:00',
  '2026-04-24 09:15:00',
  seed.open_price,
  seed.high_price,
  seed.low_price,
  seed.close_price,
  seed.volume,
  seed.trades_count,
  JSON_OBJECT('seed', TRUE, 'origin', 'initial_schema')
FROM (
  SELECT 'BTC/EUR' AS symbol, 86421.35 AS open_price, 86780.00 AS high_price, 86205.10 AS low_price, 86692.54 AS close_price, 132.44 AS volume, 820 AS trades_count
  UNION ALL
  SELECT 'ETH/EUR', 2988.21, 3015.10, 2972.54, 3004.20, 485.92, 910
  UNION ALL
  SELECT 'SOL/EUR', 164.35, 168.40, 162.80, 167.55, 14320.22, 770
  UNION ALL
  SELECT 'XRP/EUR', 0.5210, 0.5290, 0.5172, 0.5265, 93420.55, 660
  UNION ALL
  SELECT 'ADA/EUR', 0.4380, 0.4426, 0.4344, 0.4411, 118320.00, 605
) seed
INNER JOIN coins c ON c.symbol = seed.symbol
INNER JOIN data_sources ds ON ds.source_key = 'kraken_public'
WHERE NOT EXISTS (
  SELECT 1
  FROM market_candles mc
  WHERE mc.coin_id = c.id
    AND mc.timeframe = '15m'
    AND mc.open_time = '2026-04-24 09:00:00'
);

INSERT INTO signals (
  coin_id,
  source_id,
  timeframe,
  signal_type,
  confidence_score,
  close_price,
  rsi_value,
  macd_value,
  macd_signal_value,
  ema_fast,
  ema_slow,
  volume_ratio,
  stop_loss_percent,
  take_profit_percent,
  summary,
  reasons_json,
  created_at
)
SELECT
  c.id,
  ds.id,
  '15m',
  seed.signal_type,
  seed.confidence_score,
  seed.close_price,
  seed.rsi_value,
  seed.macd_value,
  seed.macd_signal_value,
  seed.ema_fast,
  seed.ema_slow,
  seed.volume_ratio,
  seed.stop_loss_percent,
  seed.take_profit_percent,
  seed.summary,
  seed.reasons_json,
  '2026-04-24 09:16:00'
FROM (
  SELECT
    'BTC/EUR' AS symbol,
    'watch' AS signal_type,
    68.00 AS confidence_score,
    86692.54 AS close_price,
    58.10 AS rsi_value,
    121.50 AS macd_value,
    109.80 AS macd_signal_value,
    86480.22 AS ema_fast,
    85820.34 AS ema_slow,
    1.18 AS volume_ratio,
    4.00 AS stop_loss_percent,
    8.00 AS take_profit_percent,
    'Trend stabil, Momentum positiv, noch kein aggressiver Einstieg.' AS summary,
    JSON_ARRAY('Kurs oberhalb EMA20 und EMA50', 'RSI im Einstiegsbereich', 'Volumen ueber Durchschnitt') AS reasons_json
  UNION ALL
  SELECT
    'ETH/EUR',
    'buy',
    74.00,
    3004.20,
    56.40,
    8.35,
    6.22,
    2998.00,
    2975.44,
    1.22,
    4.00,
    8.00,
    'Sauberes Intraday-Setup mit positivem Momentum.',
    JSON_ARRAY('EMA20 oberhalb EMA50', 'MACD positiv', 'Volumen bestaetigt Bewegung')
  UNION ALL
  SELECT
    'SOL/EUR',
    'watch',
    66.00,
    167.55,
    61.70,
    0.88,
    0.72,
    165.92,
    161.40,
    1.14,
    4.00,
    8.00,
    'Trend intakt, aber Bewegung bereits fortgeschritten.',
    JSON_ARRAY('Trend positiv', 'RSI noch unter Ueberhitzung', 'Ruecksetzer abwarten')
  UNION ALL
  SELECT
    'XRP/EUR',
    'avoid',
    59.00,
    0.5265,
    71.30,
    0.0048,
    0.0051,
    0.5220,
    0.5196,
    1.35,
    4.00,
    8.00,
    'Momentum ueberhitzt, kurzfristig kein sauberer Einstieg.',
    JSON_ARRAY('RSI ueber 70', 'MACD verliert Dynamik', 'Pump-Risiko kurzfristig erhoeht')
  UNION ALL
  SELECT
    'ADA/EUR',
    'waiting',
    44.00,
    0.4411,
    49.50,
    0.0012,
    0.0010,
    0.4405,
    0.4394,
    0.98,
    4.00,
    8.00,
    'Noch kein eindeutiger Vorteil fuer Long oder Exit.',
    JSON_ARRAY('Trend leicht positiv', 'Volumen neutral', 'Setup beobachten')
) seed
INNER JOIN coins c ON c.symbol = seed.symbol
INNER JOIN data_sources ds ON ds.source_key = 'kraken_public'
WHERE NOT EXISTS (
  SELECT 1
  FROM signals s
  WHERE s.coin_id = c.id
    AND s.timeframe = '15m'
    AND s.created_at = '2026-04-24 09:16:00'
);

CREATE OR REPLACE VIEW v_latest_signals AS
SELECT s.*
FROM signals s
INNER JOIN (
  SELECT coin_id, MAX(created_at) AS latest_created_at
  FROM signals
  GROUP BY coin_id
) latest
  ON latest.coin_id = s.coin_id
 AND latest.latest_created_at = s.created_at;
