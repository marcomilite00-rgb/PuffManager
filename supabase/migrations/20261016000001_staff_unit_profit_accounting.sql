-- Migration: Unified Staff Unit Profit Accounting Model
-- Purpose: Unifies order_items contribution margin (unit_profit) with cash drawer staff profit breakdown

CREATE OR REPLACE FUNCTION get_staff_unit_profit_breakdown()
RETURNS TABLE (
    staff_id UUID,
    staff_name TEXT,
    staff_role staff_role,
    total_qty_sold BIGINT,
    gross_sold NUMERIC,
    total_cogs NUMERIC,
    unit_profit_staff NUMERIC,
    profit_share_percent NUMERIC,
    net_attributed_profit NUMERIC
) LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, extensions AS $$
WITH session_params AS (
    SELECT 
        COALESCE(last_reset_date, '1970-01-01'::timestamptz) AS last_reset,
        COALESCE(money_spent_total, 0) + COALESCE(money_spent_current_load, 0) AS total_expenses
    FROM settings
    WHERE id = 1
),
session_payments AS (
    SELECT COALESCE(SUM(p.amount), 0) AS total_cash_received
    FROM payments p
    CROSS JOIN session_params sp
    WHERE p.created_at >= sp.last_reset
),
staff_item_aggregates AS (
    SELECT 
        s.id AS staff_id,
        s.name AS staff_name,
        s.role AS staff_role,
        COALESCE(SUM(oi.qty), 0) AS total_qty_sold,
        COALESCE(SUM(oi.qty * oi.unit_price_final), 0) AS total_gross_sold,
        COALESCE(SUM(oi.qty * COALESCE(oi.unit_cost, pv.unit_cost, 0)), 0) AS total_cogs,
        COALESCE(SUM(oi.qty * (oi.unit_price_final - COALESCE(oi.unit_cost, pv.unit_cost, 0))), 0) AS unit_profit_staff
    FROM staff s
    CROSS JOIN session_params sp
    LEFT JOIN orders o ON o.sold_by_staff_id = s.id 
                       AND o.created_at >= sp.last_reset
                       AND (o.is_archived = false OR o.is_archived IS NULL)
    LEFT JOIN order_items oi ON oi.order_id = o.id
    LEFT JOIN product_variants pv ON pv.id = oi.variant_id
    GROUP BY s.id, s.name, s.role
),
totals AS (
    SELECT 
        COALESCE(SUM(unit_profit_staff), 0) AS sum_all_unit_profit
    FROM staff_item_aggregates
)
SELECT 
    sia.staff_id,
    sia.staff_name,
    sia.staff_role,
    sia.total_qty_sold,
    ROUND(sia.total_gross_sold, 2) AS gross_sold,
    ROUND(sia.total_cogs, 2) AS total_cogs,
    ROUND(sia.unit_profit_staff, 2) AS unit_profit_staff,
    CASE 
        WHEN t.sum_all_unit_profit > 0 THEN 
            ROUND((sia.unit_profit_staff / t.sum_all_unit_profit) * 100, 2)
        ELSE 0 
    END AS profit_share_percent,
    ROUND(
        (spay.total_cash_received - spar.total_expenses) * 
        CASE 
            WHEN t.sum_all_unit_profit > 0 THEN (sia.unit_profit_staff / t.sum_all_unit_profit)
            ELSE 0 
        END
    , 2) AS net_attributed_profit
FROM staff_item_aggregates sia
CROSS JOIN totals t
CROSS JOIN session_params spar
CROSS JOIN session_payments spay
ORDER BY sia.unit_profit_staff DESC;
$$;

GRANT EXECUTE ON FUNCTION get_staff_unit_profit_breakdown() TO authenticated;
GRANT EXECUTE ON FUNCTION get_staff_unit_profit_breakdown() TO anon;
