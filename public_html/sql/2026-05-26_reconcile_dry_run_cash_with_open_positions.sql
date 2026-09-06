-- One-time reconciliation after switching dry-run cash to real paper cash.
-- Open paper positions are treated as already-paid assets, so their cost basis
-- is subtracted from the 1000 EUR dry-run starting balance.

UPDATE trader_config
SET dry_run_cash_eur = ROUND(
  1000.00 - COALESCE((
    SELECT SUM(entry_price * (
      CASE
        WHEN partial_exit_done = 1 AND partial_exit_volume IS NOT NULL THEN partial_exit_volume
        ELSE entry_volume
      END
    ))
    FROM trader_positions
    WHERE closed_at IS NULL
  ), 0),
  2
)
WHERE id = 1
  AND dry_run = 1;
