-- ============================================================
-- Add avg_unit_price to orders table (calculated field)
-- Formula: gross_total / total_qty_items
-- ============================================================

ALTER TABLE orders ADD COLUMN IF NOT EXISTS avg_unit_price numeric DEFAULT NULL;

-- Backfill existing orders (skip orders with 0 gross or 0 qty)
UPDATE orders o SET avg_unit_price = (
    SELECT CASE 
        WHEN SUM(oi.qty) > 0 AND o.gross_total > 0 
        THEN ROUND(o.gross_total / SUM(oi.qty), 2) 
        ELSE NULL 
    END
    FROM order_items oi WHERE oi.order_id = o.id
)
WHERE o.avg_unit_price IS NULL;
