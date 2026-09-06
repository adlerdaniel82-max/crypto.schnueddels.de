-- Fresh-install entry point for MySQL/MariaDB.
-- Run from the repository root against an empty, selected database:
--   mariadb --database="$DB_NAME" < install.sql
-- Do not use this on a populated production database.

SOURCE public_html/sql/2026-04-24_initial_schema.sql;
SOURCE public_html/sql/2026-04-24_add_long_timeframes.sql;
SOURCE public_html/sql/2026-04-25_add_alert_events.sql;
SOURCE public_html/sql/2026-04-25_add_portfolio_snapshots.sql;
SOURCE public_html/sql/2026-04-25_add_trader_tables.sql;
SOURCE public_html/sql/2026-04-26_short_long_mode.sql;
SOURCE public_html/sql/2026-05-09_add_trader_cycle_runs.sql;
SOURCE public_html/sql/2026-05-23_add_trader_dry_run_wallet.sql;
SOURCE public_html/sql/2026-05-23_add_trader_take_profit.sql;
SOURCE public_html/sql/2026-05-26_add_user_paper_trading.sql;
SOURCE public_html/sql/2026-05-26_reconcile_dry_run_cash_with_open_positions.sql;
SOURCE public_html/sql/2026-05-26_repair_dry_run_orphan_buy_positions.sql;
SOURCE public_html/sql/2026-05-28_add_paper_taler_exchange.sql;
