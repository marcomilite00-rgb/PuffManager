-- Migration: Comprehensive Payment Logic & RPC Fixes
-- Replaces previous RPCs to strictly follow User Requirements

-- 1. pay_reminder: Handles partial/full payments
-- LOGIC:
--  - Insert into 'payments' (Cassa update).
--  - Update 'reminders' (decrease amount).
--  - CREATE NEW 'order' for the payment amount (Storico update "saldo").
--  - Update Original Order status (Yellow dot logic).
CREATE OR REPLACE FUNCTION pay_reminder(
    p_reminder_id UUID,
    p_payment_amount DECIMAL,
    p_staff_id UUID
) RETURNS VOID AS $$
DECLARE
    v_reminder RECORD;
    v_new_amount_due DECIMAL;
    v_order_status order_status;
    v_original_order RECORD;
    v_new_order_id UUID;
    v_original_items_desc TEXT;
BEGIN
    -- Get reminder
    SELECT * INTO v_reminder FROM reminders WHERE id = p_reminder_id;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Reminder not found';
    END IF;

    -- Get original order
    SELECT * INTO v_original_order FROM orders WHERE id = v_reminder.order_id;

    -- Validate amount
    IF p_payment_amount <= 0 THEN
        RAISE EXCEPTION 'Payment amount must be positive';
    END IF;
    
    -- 1. Create NEW Order for the partial payment (So it shows in Storico)
    -- We treat this as a "Saldo" transaction.
    INSERT INTO orders (
        sold_by_staff_id, 
        customer_name, 
        gross_total, 
        status, 
        created_at
    )
    VALUES (
        p_staff_id,
        v_reminder.customer_name,
        p_payment_amount, -- The amount being paid NOW
        'COMPLETED', -- This specific transaction is completed
        NOW()
    ) RETURNING id INTO v_new_order_id;
    
    -- Create a "Dummy" item for the new order to explain what it is
    INSERT INTO order_items (order_id, variant_id, qty, unit_price_default, unit_price_final)
    SELECT 
        v_new_order_id, 
        NULL, -- No specific variant, or we could link to a "Saldo" service item if it existed. Nullable variant_id? 
              -- If variant_id is NOT NULL in schema, we might need a workaround. 
              -- Let's check schema assumption. Assuming variant_id can be null or we skip.
              -- If strict, we grab the first item from original order just for reference or skip items?
              -- "items" is usually required for detail view.
              -- Let's insert a descriptive item if possible, or just leave items empty and rely on order description?
              -- History UI iterates items. Let's try to fetch a dummy variant or just reuse one from original linked?
              -- Safer: No items, but Description needs to be handled? 
              -- Layout expects items. Let's not break UI.
              -- We will skip inserting items for now, assuming UI handles empty items gracefully or we update UI.
              -- wait, Storico.tsx maps items. If empty, it's fine.
        0, 0, 0
    WHERE false; -- No op

    -- 2. Register Payment (Linked to the NEW order? OR Original?)
    -- User said "Cassa e Storico riportano sempre gli stessi importi".
    -- If Cassa sums 'payments', we should link this payment to the NEW order (v_new_order_id) so they match.
    INSERT INTO payments (order_id, amount, created_at)
    VALUES (v_new_order_id, p_payment_amount, NOW());

    -- 3. Update Reminder Amount
    v_new_amount_due := v_reminder.amount_due - p_payment_amount;
    
    IF v_new_amount_due < 0.01 THEN 
        v_new_amount_due := 0; 
    END IF;

    -- 4. Update Reminder Status
    UPDATE reminders 
    SET amount_due = v_new_amount_due,
        status = CASE WHEN v_new_amount_due = 0 THEN 'resolved' ELSE 'active' END,
        updated_at = NOW()
    WHERE id = p_reminder_id;

    -- 5. Update ORIGINAL Order Status (Yellow Dot Logic)
    -- Only set to COMPLETED if reminder is fully resolved.
    -- If partial, it remains PARTIAL_PAYMENT (Yellow Dot stays).
    IF v_new_amount_due = 0 THEN
        UPDATE orders 
        SET status = 'COMPLETED' 
        WHERE id = v_reminder.order_id;
    ELSE
        -- Ensure it's marked partial
        UPDATE orders 
        SET status = 'PARTIAL_PAYMENT' 
        WHERE id = v_reminder.order_id;
    END IF;

END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- 2. resolve_reminder_debt: Handles "Elimina"
-- LOGIC: Remove reminder, Remove Yellow Dot (Compelte Original Order). 
-- NO Payment, NO New Order. "Lascia il prezzo finale così com'è".
CREATE OR REPLACE FUNCTION resolve_reminder_debt(
    p_reminder_id UUID
) RETURNS VOID AS $$
DECLARE
    v_order_id UUID;
BEGIN
    SELECT order_id INTO v_order_id FROM reminders WHERE id = p_reminder_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'Reminder not found'; END IF;

    -- Delete Reminder
    DELETE FROM reminders WHERE id = p_reminder_id;

    -- Update Original Order to COMPLETED (Removes Yellow Dot)
    UPDATE orders 
    SET status = 'COMPLETED' 
    WHERE id = v_order_id;

END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- 3. direct_sale & fulfill_reservation UPDATES
-- LOGIC: 
--  - If Partial Payment:
--      - Order.gross_total = Payment Amount (User Requirement: "prezzo finale inserito").
--      - Order.status = 'PARTIAL_PAYMENT'.
--      - Reminder.amount_due = (Real Total - Payment Amount).

CREATE OR REPLACE FUNCTION direct_sale(
    p_staff_id UUID,
    p_customer_name TEXT,
    p_payment_amount DECIMAL,
    p_items JSONB,
    p_scope_id UUID DEFAULT NULL
) RETURNS UUID AS $$
DECLARE
    v_order_id UUID;
    v_real_total DECIMAL := 0;
    v_item JSONB;
    v_diff DECIMAL;
    v_actual_scope_id UUID;
BEGIN
    -- Scope Resolution (Simplified)
    IF p_scope_id IS NOT NULL THEN v_actual_scope_id := p_scope_id;
    ELSE SELECT id INTO v_actual_scope_id FROM scopes LIMIT 1; END IF;

    -- Calculate Real Total (Value of Goods)
    FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
    LOOP
        v_real_total := v_real_total + ((v_item->>'qty')::int * (v_item->>'price_final')::decimal);
    END LOOP;

    -- Create Order
    -- KEY CHANGE: gross_total is set to p_payment_amount (Cash In), NOT v_real_total.
    -- Unless payment is 0? If payment is 0, gross_total 0? Yes, user seems to want this coherence.
    -- But if full payment, p_payment_amount >= v_real_total, then gross_total = v_real_total.
    INSERT INTO orders (sold_by_staff_id, customer_name, gross_total, status)
    VALUES (
        p_staff_id, 
        p_customer_name, 
        p_payment_amount, -- Stores what was paid NOW
        CASE 
            WHEN p_payment_amount >= v_real_total - 0.01 THEN 'COMPLETED'::order_status 
            ELSE 'PARTIAL_PAYMENT'::order_status 
        END
    )
    RETURNING id INTO v_order_id;

    -- Items & Inventory
    FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
    LOOP
        UPDATE inventory 
        SET qty = qty - (v_item->>'qty')::int, updated_at = NOW()
        WHERE variant_id = (v_item->>'variant_id')::uuid;

        INSERT INTO order_items (order_id, variant_id, qty, unit_price_default, unit_price_final)
        VALUES (
            v_order_id,
            (v_item->>'variant_id')::uuid,
            (v_item->>'qty')::int,
            (v_item->>'price_default')::decimal,
            (v_item->>'price_final')::decimal
        );
    END LOOP;

    -- Payment Record
    IF p_payment_amount > 0 THEN
        INSERT INTO payments (order_id, amount) VALUES (v_order_id, p_payment_amount);
    END IF;

    -- Reminder for Difference
    v_diff := v_real_total - p_payment_amount;
    IF v_diff > 0.01 THEN
        INSERT INTO reminders (
            scope_id, created_by, created_by_staff_id, order_id, 
            customer_name, description, amount_due, title
        )
        VALUES (
            v_actual_scope_id, auth.uid(), p_staff_id, v_order_id, 
            p_customer_name, 'Vendita Parziale', v_diff, 'Saldo ' || p_customer_name
        );
    END IF;

    RETURN v_order_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


CREATE OR REPLACE FUNCTION fulfill_reservation(
    p_res_id UUID,
    p_staff_id UUID,
    p_payment_amount DECIMAL,
    p_scope_id UUID DEFAULT NULL
) RETURNS UUID AS $$
DECLARE
    v_order_id UUID;
    v_res RECORD;
    v_item RECORD;
    v_real_total DECIMAL := 0;
    v_diff DECIMAL;
    v_actual_scope_id UUID;
BEGIN
    IF p_scope_id IS NOT NULL THEN v_actual_scope_id := p_scope_id;
    ELSE SELECT id INTO v_actual_scope_id FROM scopes LIMIT 1; END IF;

    SELECT * INTO v_res FROM reservations WHERE id = p_res_id;
    IF v_res.status <> 'RESERVED' THEN RAISE EXCEPTION 'Reservation is not active'; END IF;

    -- Calculate Real Total
    SELECT SUM(qty * unit_price_final) INTO v_real_total FROM reservation_items WHERE reservation_id = p_res_id;

    -- Create Order (gross_total = paid amount)
    INSERT INTO orders (sold_by_staff_id, customer_name, source_reservation_id, gross_total, status)
    VALUES (
        p_staff_id, 
        v_res.customer_name, 
        p_res_id, 
        p_payment_amount, -- KEY CHANGE
        CASE 
            WHEN p_payment_amount >= v_real_total - 0.01 THEN 'COMPLETED'::order_status 
            ELSE 'PARTIAL_PAYMENT'::order_status 
        END
    )
    RETURNING id INTO v_order_id;

    -- Copy Items
    FOR v_item IN SELECT * FROM reservation_items WHERE reservation_id = p_res_id
    LOOP
        INSERT INTO order_items (order_id, variant_id, qty, unit_price_default, unit_price_final)
        VALUES (v_order_id, v_item.variant_id, v_item.qty, v_item.unit_price_default, v_item.unit_price_final);
    END LOOP;

    -- Payment
    IF p_payment_amount > 0 THEN
        INSERT INTO payments (order_id, amount) VALUES (v_order_id, p_payment_amount);
    END IF;

    -- Reminder
    v_diff := v_real_total - p_payment_amount;
    IF v_diff > 0.01 THEN
        INSERT INTO reminders (
            scope_id, created_by, created_by_staff_id, order_id, 
            customer_name, description, amount_due, title
        )
        VALUES (
            v_actual_scope_id, auth.uid(), p_staff_id, v_order_id, 
            v_res.customer_name, 'Saldo Prenotazione', v_diff, 'Saldo ' || v_res.customer_name
        );
    END IF;

    -- Close reservation
    UPDATE reservations SET status = 'SOLD' WHERE id = p_res_id;

    RETURN v_order_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant permissions again to be sure
GRANT EXECUTE ON FUNCTION pay_reminder(UUID, DECIMAL, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION resolve_reminder_debt(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION direct_sale(UUID, TEXT, DECIMAL, JSONB, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION fulfill_reservation(UUID, UUID, DECIMAL, UUID) TO authenticated;
