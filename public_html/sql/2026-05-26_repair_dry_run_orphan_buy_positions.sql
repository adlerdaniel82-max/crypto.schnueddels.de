-- Repairs dry-run buy orders that were written while position inserts failed
-- because the dry-run wallet columns were missing in production.

CREATE TEMPORARY TABLE tmp_dry_run_orphan_buy_repair AS
SELECT
  o.id,
  o.coin_symbol,
  o.kraken_pair,
  o.price_estimate,
  o.volume,
  o.created_at
FROM trade_orders o
JOIN (
  SELECT
    o2.coin_symbol,
    MAX(o2.id) AS repair_order_id
  FROM trade_orders o2
  WHERE o2.dry_run = 1
    AND o2.side = 'buy'
    AND o2.status = 'dry_run'
    AND NOT EXISTS (
      SELECT 1
      FROM trader_positions p
      WHERE p.buy_order_id = o2.id
    )
    AND NOT EXISTS (
      SELECT 1
      FROM trader_positions open_p
      WHERE open_p.coin_symbol = o2.coin_symbol
        AND open_p.closed_at IS NULL
    )
    AND EXISTS (
      SELECT 1
      FROM trader_cycle_runs r
      WHERE r.result_json LIKE CONCAT('%buy ', o2.coin_symbol, ': Unknown column ''dry_run_realized_pnl_eur''%')
    )
  GROUP BY o2.coin_symbol
) latest ON latest.repair_order_id = o.id;

INSERT INTO trader_positions
  (coin_symbol, base_asset, kraken_pair, buy_order_id, entry_price, entry_volume, stop_loss_price, take_profit_price, dry_run_realized_pnl_eur, opened_at)
SELECT
  r.coin_symbol,
  SUBSTRING_INDEX(r.coin_symbol, '/', 1),
  r.kraken_pair,
  r.id,
  r.price_estimate,
  r.volume,
  ROUND(r.price_estimate * (1 - ((SELECT stop_loss_percent FROM trader_config WHERE id = 1) / 100)), 8),
  ROUND(r.price_estimate * 1.10, 8),
  0.00,
  r.created_at
FROM tmp_dry_run_orphan_buy_repair r;

UPDATE trade_orders o
JOIN tmp_dry_run_orphan_buy_repair r ON r.coin_symbol = o.coin_symbol
LEFT JOIN trader_positions p ON p.buy_order_id = o.id
SET o.status = 'error'
WHERE o.dry_run = 1
  AND o.side = 'buy'
  AND o.status = 'dry_run'
  AND p.id IS NULL
  AND o.id <> r.id;

DROP TEMPORARY TABLE tmp_dry_run_orphan_buy_repair;
