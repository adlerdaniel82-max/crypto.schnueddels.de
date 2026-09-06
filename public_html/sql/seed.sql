INSERT INTO job_runs (job_key, status, started_at, finished_at, rows_written, message, details_json)
VALUES
  (
    'seed_bootstrap',
    'success',
    '2026-04-24 09:00:00',
    '2026-04-24 09:16:30',
    13,
    'Grundbestand fuer Watchlist, Strategieprofile, Beispiel-Candles und Startsignale.',
    JSON_OBJECT('coins', 5, 'settings', 3, 'candles', 5, 'signals', 5)
  );
