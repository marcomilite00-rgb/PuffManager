-- Migration: Update RPCs for Scope & RLS
-- Updates direct_sale and fulfill_reservation to handle scope_id and created_by

-- 1. Update direct_sale
CREATE OR REPLACE FUNCTION direct_sale(
    p_staff_id UUID, -- Kept for legacy compatibility / order history
    p_customer_name TEXT,
    p_payment_amount DECIMAL,
    p_items JSONB,
    p_scope_id UUID DEFAULT NULL -- NEW: Scope ID
) RETURNS UUID AS $$
DECLARE
    v_order_id UUID;
    v_total DECIMAL := 0;
    v_item JSONB;
    v_diff DECIMAL;
    v_items_desc TEXT := '';
    v_actual_scope_id UUID;
    v_current_user_id UUID;
BEGIN
    -- Get current auth user
    v_current_user_id := auth.uid();
    
    -- Resolve Scope: Use provided or fallback to finding one for the user
    IF p_scope_id IS NOT NULL THEN
        v_actual_scope_id := p_scope_id;
    ELSE
        -- Fallback: Get first scope user is member of (simplification for single-store apps)
        SELECT scope_id INTO v_actual_scope_id FROM scope_members WHERE user_id = v_current_user_id LIMIT 1;
        
        IF v_actual_scope_id IS NULL THEN
             -- Fallback 2: If no scope member found (e.g. legacy user), try to get default
             SELECT id INTO v_actual_scope_id FROM scopes LIMIT 1;
        END IF;
    END IF;

    -- Calculate total
    FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
    LOOP
        v_total := v_total + ((v_item->>'qty')::int * (v_item->>'price_final')::decimal);
        
        -- Build description
        v_items_desc := v_items_desc || (v_item->>'qty') || 'x ' || 
                       -- Improve this query if needed, for performance we assume names passed or just generic
                       'Prodotto' || ', '; 
    END LOOP;

    -- Create Order
    INSERT INTO orders (sold_by_staff_id, customer_name, gross_total, status)
    VALUES (
        p_staff_id, 
        p_customer_name, 
        v_total, 
        CASE 
            WHEN p_payment_amount >= v_total THEN 'COMPLETED'::order_status 
            ELSE 'PARTIAL_PAYMENT'::order_status 
        END
    )
    RETURNING id INTO v_order_id;

    -- Process Items
    FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
    LOOP
        -- Update Inventory
        UPDATE inventory 
        SET qty = qty - (v_item->>'qty')::int,
            updated_at = NOW()
        WHERE variant_id = (v_item->>'variant_id')::uuid;

        -- Create Order Item
        INSERT INTO order_items (order_id, variant_id, qty, unit_price_default, unit_price_final)
        VALUES (
            v_order_id,
            (v_item->>'variant_id')::uuid,
            (v_item->>'qty')::int,
            (v_item->>'price_default')::decimal,
            (v_item->>'price_final')::decimal
        );
    END LOOP;

    -- Handle Payment
    IF p_payment_amount > 0 THEN
        INSERT INTO payments (order_id, amount) VALUES (v_order_id, p_payment_amount);
    END IF;

    -- Handle Reminder (Partial Payment)
    v_diff := v_total - p_payment_amount;
    IF v_diff > 0.01 THEN
        INSERT INTO reminders (
            scope_id,
            created_by,
            created_by_staff_id, -- Keep for legacy/FK if strict
            order_id, 
            customer_name, 
            description, 
            amount_due,
            title -- Use customer name or generic title
        )
        VALUES (
            v_actual_scope_id,
            v_current_user_id,
            p_staff_id,
            v_order_id, 
            p_customer_name, 
            LEFT(v_items_desc, 100), -- Truncate if too long
            v_diff,
            'Saldo ' || p_customer_name
        );
    END IF;

    RETURN v_order_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- 2. Update fulfill_reservation
CREATE OR REPLACE FUNCTION fulfill_reservation(
    p_res_id UUID,
    p_staff_id UUID,
    p_payment_amount DECIMAL,
    p_scope_id UUID DEFAULT NULL -- NEW
) RETURNS UUID AS $$
DECLARE
    v_order_id UUID;
    v_res RECORD;
    v_item RECORD;
    v_total DECIMAL := 0;
    v_items_desc TEXT := '';
    v_diff DECIMAL;
    v_actual_scope_id UUID;
    v_current_user_id UUID;
BEGIN
     -- Get current auth user
    v_current_user_id := auth.uid();
    
    -- Resolve Scope
    IF p_scope_id IS NOT NULL THEN
        v_actual_scope_id := p_scope_id;
    ELSE
        SELECT scope_id INTO v_actual_scope_id FROM scope_members WHERE user_id = v_current_user_id LIMIT 1;
         IF v_actual_scope_id IS NULL THEN
             SELECT id INTO v_actual_scope_id FROM scopes LIMIT 1;
        END IF;
    END IF;

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

    -- Copy items
    FOR v_item IN 
        SELECT ri.*, pm.name as model_name, pf.name as flavor_name
        FROM reservation_items ri 
        JOIN product_variants pv ON ri.variant_id = pv.id 
        JOIN product_models pm ON pv.model_id = pm.id
        JOIN product_flavors pf ON pv.flavor_id = pf.id
        WHERE ri.reservation_id = p_res_id
    LOOP
        INSERT INTO order_items (order_id, variant_id, qty, unit_price_default, unit_price_final)
        VALUES (v_order_id, v_item.variant_id, v_item.qty, v_item.unit_price_default, v_item.unit_price_final);

        v_items_desc := v_items_desc || v_item.qty || 'x ' || v_item.model_name || ' ' || v_item.flavor_name || ', ';
    END LOOP;

    -- Handle Payment
    IF p_payment_amount > 0 THEN
        INSERT INTO payments (order_id, amount) VALUES (v_order_id, p_payment_amount);
    END IF;

    -- Handle Reminder
    v_diff := v_total - p_payment_amount;
    IF v_diff > 0.01 THEN
        INSERT INTO reminders (
            scope_id,
            created_by,
            created_by_staff_id,
            order_id, 
            customer_name, 
            description, 
            amount_due,
            title
        )
        VALUES (
            v_actual_scope_id,
            v_current_user_id,
            p_staff_id,
            v_order_id, 
            v_res.customer_name, 
            LEFT(v_items_desc, 100),
            v_diff,
            'Saldo Prenotazione ' || v_res.customer_name
        );
    END IF;

    -- Close reservation
    UPDATE reservations SET status = 'SOLD' WHERE id = p_res_id;

    RETURN v_order_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
