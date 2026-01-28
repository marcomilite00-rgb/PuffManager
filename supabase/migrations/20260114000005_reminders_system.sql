-- Migration: Reminders System
-- 1. Create Reminders Table
CREATE TABLE IF NOT EXISTS reminders (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    created_by_staff_id UUID REFERENCES staff(id) NOT NULL,
    order_id UUID REFERENCES orders(id) NOT NULL,
    customer_name TEXT, -- Denormalized for easier display
    description TEXT,   -- Summary of items (e.g. "Item A x2, Item B...")
    amount_due NUMERIC(10,2) NOT NULL,
    status TEXT DEFAULT 'active' CHECK (status IN ('active', 'resolved'))
);

-- 2. RLS Policies
ALTER TABLE reminders ENABLE ROW LEVEL SECURITY;

-- Admins and Staff can view ALL reminders
CREATE POLICY "Admins/Staff view all reminders" ON reminders
FOR SELECT
USING (
    EXISTS (
        SELECT 1 FROM staff_sessions ss
        JOIN staff s ON ss.staff_id = s.id
        WHERE ss.auth_uid = auth.uid()
        AND (s.role = 'admin' OR s.role = 'staff')
        AND (ss.revoked_at IS NULL OR ss.revoked_at > now())
    )
);

-- Helpers can view ONLY their own reminders
CREATE POLICY "Helpers view own reminders" ON reminders
FOR SELECT
USING (
    created_by_staff_id = (
        SELECT staff_id FROM staff_sessions
        WHERE auth_uid = auth.uid()
        AND (revoked_at IS NULL OR revoked_at > now())
        LIMIT 1
    )
    AND NOT EXISTS ( -- Exclude if they are admin/staff (handled above, but cleaner separation)
        SELECT 1 FROM staff_sessions ss
        JOIN staff s ON ss.staff_id = s.id
        WHERE ss.auth_uid = auth.uid()
        AND (s.role = 'admin' OR s.role = 'staff')
         AND (ss.revoked_at IS NULL OR ss.revoked_at > now())
    )
);

-- Allow creation via RPC (Server-side logic usually bypasses RLS if SECURITY DEFINER, but good to have)
CREATE POLICY "Staff can create reminders" ON reminders
FOR INSERT
WITH CHECK (true); 

-- 3. Update fulfill_reservation RPC
CREATE OR REPLACE FUNCTION fulfill_reservation(
    p_res_id UUID,
    p_staff_id UUID,
    p_payment_amount DECIMAL
) RETURNS UUID AS $$
DECLARE
    v_order_id UUID;
    v_res RECORD;
    v_item RECORD;
    v_total DECIMAL := 0;
    v_items_desc TEXT := '';
    v_diff DECIMAL;
BEGIN
    -- Get reservation info
    SELECT * INTO v_res FROM reservations WHERE id = p_res_id;
    IF v_res.status <> 'RESERVED' THEN
        RAISE EXCEPTION 'Reservation is not active';
    END IF;

    -- Calculate total
    SELECT SUM(qty * unit_price_final) INTO v_total FROM reservation_items WHERE reservation_id = p_res_id;

    -- Create Order
    INSERT INTO orders (sold_by_staff_id, customer_name, source_reservation_id, gross_total, status)
    VALUES (
        p_staff_id, 
        v_res.customer_name, 
        p_res_id, 
        v_total, 
        CASE 
            WHEN p_payment_amount >= v_total THEN 'COMPLETED'::order_status 
            ELSE 'PARTIAL_PAYMENT'::order_status 
        END
    )
    RETURNING id INTO v_order_id;

    -- Copy items and Update Inventory (inventory update was done at reservation time, so we just copy to order_items)
    FOR v_item IN 
        SELECT ri.*, pv.unit_cost, pm.name as model_name, pf.name as flavor_name
        FROM reservation_items ri 
        JOIN product_variants pv ON ri.variant_id = pv.id 
        JOIN product_models pm ON pv.model_id = pm.id
        JOIN product_flavors pf ON pv.flavor_id = pf.id
        WHERE ri.reservation_id = p_res_id
    LOOP
        -- Insert order item
        INSERT INTO order_items (order_id, variant_id, qty, unit_price_default, unit_price_final, unit_cost, profit)
        VALUES (v_order_id, v_item.variant_id, v_item.qty, v_item.unit_price_default, v_item.unit_price_final, v_item.unit_cost, (v_item.unit_price_final - COALESCE(v_item.unit_cost, 0)) * v_item.qty);

        -- Build description for reminder if needed
        v_items_desc := v_items_desc || v_item.qty || 'x ' || v_item.model_name || ' ' || v_item.flavor_name || ', ';
    END LOOP;

    -- Remove trailing comma
    IF length(v_items_desc) > 2 THEN
        v_items_desc := substring(v_items_desc from 1 for length(v_items_desc) - 2);
    END IF;

    -- Handle Payment
    IF p_payment_amount > 0 THEN
        INSERT INTO payments (order_id, amount) VALUES (v_order_id, p_payment_amount);
    END IF;

    -- Handle Reminder (Partial Payment)
    v_diff := v_total - p_payment_amount;
    IF v_diff > 0.01 THEN -- Use small epsilon for float comparison
        INSERT INTO reminders (created_by_staff_id, order_id, customer_name, description, amount_due)
        VALUES (p_staff_id, v_order_id, v_res.customer_name, v_items_desc, v_diff);
    END IF;

    -- Close reservation
    UPDATE reservations SET status = 'SOLD' WHERE id = p_res_id;

    RETURN v_order_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
