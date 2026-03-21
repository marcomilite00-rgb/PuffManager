-- Major Overhaul Migration
-- 1. Rename reinvestimento column in load_history (renamed to loads)
-- 2. Create archived_loads table
-- 3. Add is_archived to orders
-- 4. Create close_current_load RPC

-- Ensure unit_cost exists on product_variants
ALTER TABLE product_variants
  ADD COLUMN IF NOT EXISTS unit_cost NUMERIC DEFAULT 0;

-- Create archived_loads table
CREATE TABLE IF NOT EXISTS archived_loads (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    closed_at TIMESTAMPTZ DEFAULT NOW(),
    soldi_spesi_carico NUMERIC NOT NULL DEFAULT 0,
    pezzi_comprati INTEGER NOT NULL DEFAULT 0,
    unit_cost_calcolato NUMERIC GENERATED ALWAYS AS (
        soldi_spesi_carico / NULLIF(pezzi_comprati, 0)
    ) STORED,
    gross_total NUMERIC(10,2) NOT NULL DEFAULT 0,
    items_sold_snapshot JSONB,
    created_by UUID REFERENCES staff(id)
);

-- Add is_archived to orders (nullable, backward-compatible)
ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS is_archived BOOLEAN DEFAULT false;

-- RLS policies for archived_loads
ALTER TABLE archived_loads ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow authenticated read on archived_loads"
    ON archived_loads FOR SELECT
    TO authenticated
    USING (true);

CREATE POLICY "Allow authenticated insert on archived_loads"
    ON archived_loads FOR INSERT
    TO authenticated
    WITH CHECK (true);

CREATE POLICY "Allow authenticated delete on archived_loads"
    ON archived_loads FOR DELETE
    TO authenticated
    USING (true);

-- RPC: close_current_load
-- Atomically archives the current load, resets inventory and pending data,
-- and applies the new unit_cost to all active variants.
CREATE OR REPLACE FUNCTION close_current_load(
    p_soldi_spesi NUMERIC,
    p_pezzi_comprati INTEGER
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
    v_executer_role staff_role;
    v_staff_id UUID;
    v_now TIMESTAMPTZ;
    v_last_reset TIMESTAMPTZ;
    v_gross_total NUMERIC(10,2);
    v_new_unit_cost NUMERIC;
    v_snapshot JSONB;
BEGIN
    -- Authorization Check
    SELECT s.role, s.id INTO v_executer_role, v_staff_id
    FROM staff s
    JOIN staff_sessions ss ON ss.staff_id = s.id
    WHERE ss.auth_uid = auth.uid()
      AND (ss.revoked_at IS NULL OR ss.revoked_at > now())
    LIMIT 1;

    IF v_executer_role IS NULL OR v_executer_role != 'admin' THEN
        RAISE EXCEPTION 'Access Denied: Only Admins can close loads';
    END IF;

    -- Validate input
    IF p_pezzi_comprati <= 0 THEN
        RAISE EXCEPTION 'Pezzi comprati must be > 0';
    END IF;

    v_now := NOW();
    v_new_unit_cost := p_soldi_spesi / p_pezzi_comprati;

    -- Get last reset date
    SELECT last_reset_date INTO v_last_reset
    FROM settings LIMIT 1 FOR UPDATE;

    -- Calculate gross from current session orders
    SELECT COALESCE(SUM(gross_total), 0) INTO v_gross_total
    FROM orders
    WHERE created_at >= v_last_reset
      AND created_at < v_now
      AND (is_archived = false OR is_archived IS NULL);

    -- Snapshot order items BEFORE any deletion
    SELECT COALESCE(jsonb_agg(row_to_json(sub)), '[]'::jsonb) INTO v_snapshot
    FROM (
        SELECT
            pm.name AS model_name,
            pf.name AS flavor_name,
            oi.qty,
            oi.unit_price_final AS price,
            st.name AS staff_name
        FROM order_items oi
        JOIN orders o ON o.id = oi.order_id
        JOIN product_variants pv ON pv.id = oi.variant_id
        JOIN product_models pm ON pm.id = pv.model_id
        JOIN product_flavors pf ON pf.id = pv.flavor_id
        LEFT JOIN staff st ON st.id = o.sold_by_staff_id
        WHERE o.created_at >= v_last_reset
          AND o.created_at < v_now
          AND (o.is_archived = false OR o.is_archived IS NULL)
    ) sub;

    -- Insert archive record
    INSERT INTO archived_loads (
        closed_at, soldi_spesi_carico, pezzi_comprati,
        gross_total, items_sold_snapshot, created_by
    ) VALUES (
        v_now, p_soldi_spesi, p_pezzi_comprati,
        v_gross_total, v_snapshot, v_staff_id
    );

    -- Delete active reservations
    DELETE FROM reservation_items
    WHERE reservation_id IN (
        SELECT id FROM reservations WHERE status = 'RESERVED'
    );
    DELETE FROM reservations WHERE status = 'RESERVED';

    -- Delete active reminders
    DELETE FROM reminders WHERE amount_due > 0;

    -- Archive current orders
    UPDATE orders
    SET is_archived = true
    WHERE created_at >= v_last_reset
      AND created_at < v_now
      AND (is_archived = false OR is_archived IS NULL);

    -- Reset inventory quantities
    UPDATE inventory SET qty = 0;

    -- Apply new unit_cost to ALL active variants
    UPDATE product_variants
    SET unit_cost = v_new_unit_cost
    WHERE active = true;

    -- Update settings
    UPDATE settings
    SET last_reset_date = v_now,
        updated_at = v_now
    WHERE id = 1;

    RETURN json_build_object(
        'success', true,
        'gross_total', v_gross_total,
        'unit_cost_calcolato', v_new_unit_cost,
        'pezzi_comprati', p_pezzi_comprati,
        'soldi_spesi', p_soldi_spesi,
        'new_reset_date', v_now
    );
END;
$$;

GRANT EXECUTE ON FUNCTION close_current_load(NUMERIC, INTEGER) TO authenticated;
