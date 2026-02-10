-- Migration: Comprehensive Fix for Reservations and Sales
-- Purpose: 
-- 1. Add missing unit_cost to reservation_items
-- 2. Fix broken update_reservation_item RPC (missing declarations)
-- 3. Ensure all sales RPCs (fulfill_reservation, direct_sale) calculate profit

-- 1. Schema Fix
ALTER TABLE reservation_items ADD COLUMN IF NOT EXISTS unit_cost DECIMAL(10,2);

-- 2. Fix update_reservation_item (Missing declarations and cost sync)
CREATE OR REPLACE FUNCTION update_reservation_item(
    p_item_id UUID,
    p_new_qty INT,
    p_new_price DECIMAL DEFAULT NULL
) RETURNS VOID AS $$
DECLARE
    v_old_qty INT;
    v_variant_id UUID;
    v_diff INT;
    v_available INT;
    v_res_status TEXT;
    v_res_id UUID;
    v_current_cost DECIMAL;
BEGIN
    -- Get old qty, variant and reservation status
    SELECT ri.qty, ri.variant_id, r.status, r.id, pv.unit_cost
    INTO v_old_qty, v_variant_id, v_res_status, v_res_id, v_current_cost
    FROM reservation_items ri
    JOIN reservations r ON ri.reservation_id = r.id
    JOIN product_variants pv ON ri.variant_id = pv.id
    WHERE ri.id = p_item_id;
    
    IF v_old_qty IS NULL THEN
        RAISE EXCEPTION 'Item non trovato.';
    END IF;

    IF v_res_status != 'RESERVED' THEN
        RAISE EXCEPTION 'La prenotazione non è più attiva (Stato: %).', v_res_status;
    END IF;

    v_diff := p_new_qty - v_old_qty;

    -- If increasing qty, check stock
    IF v_diff > 0 THEN
        SELECT qty INTO v_available FROM inventory WHERE variant_id = v_variant_id;
        IF v_available IS NULL OR v_available < v_diff THEN
            RAISE EXCEPTION 'Stock insufficiente. Disponibili: %', COALESCE(v_available, 0);
        END IF;
        UPDATE inventory SET qty = qty - v_diff, updated_at = NOW() WHERE variant_id = v_variant_id;
    -- If decreasing qty, restore stock
    ELSIF v_diff < 0 THEN
        UPDATE inventory SET qty = qty + ABS(v_diff), updated_at = NOW() WHERE variant_id = v_variant_id;
    END IF;

    -- Update item qty, optionally price, and sync cost
    UPDATE reservation_items 
    SET qty = p_new_qty, 
        unit_price_final = COALESCE(p_new_price, unit_price_final),
        unit_cost = v_current_cost
    WHERE id = p_item_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 3. Update fulfill_reservation to handle unit_cost and profit
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
    v_item_profit DECIMAL;
BEGIN
    IF p_scope_id IS NOT NULL THEN v_actual_scope_id := p_scope_id;
    ELSE SELECT id INTO v_actual_scope_id FROM scopes LIMIT 1; END IF;

    SELECT * INTO v_res FROM reservations WHERE id = p_res_id;
    IF v_res IS NULL OR v_res.status <> 'RESERVED' THEN RAISE EXCEPTION 'Reservation is not active'; END IF;

    -- Calcola Totale Reale merce
    SELECT SUM(qty * unit_price_final) INTO v_real_total FROM reservation_items WHERE reservation_id = p_res_id;

    -- Crea Ordine
    INSERT INTO orders (sold_by_staff_id, customer_name, source_reservation_id, gross_total, status)
    VALUES (
        p_staff_id, 
        v_res.customer_name, 
        p_res_id, 
        p_payment_amount, 
        CASE 
            WHEN p_payment_amount >= v_real_total - 0.01 THEN 'COMPLETED'::order_status 
            ELSE 'PARTIAL_PAYMENT'::order_status 
        END
    )
    RETURNING id INTO v_order_id;

    -- Copia Items con unit_cost e calcola profitto
    FOR v_item IN SELECT * FROM reservation_items WHERE reservation_id = p_res_id
    LOOP
        v_item_profit := (v_item.unit_price_final - COALESCE(v_item.unit_cost, 0)) * v_item.qty;
        
        INSERT INTO order_items (order_id, variant_id, qty, unit_price_default, unit_price_final, unit_cost, profit)
        VALUES (v_order_id, v_item.variant_id, v_item.qty, v_item.unit_price_default, v_item.unit_price_final, v_item.unit_cost, v_item_profit);
    END LOOP;

    -- Pagamento
    IF p_payment_amount > 0 THEN
        INSERT INTO payments (order_id, amount) VALUES (v_order_id, p_payment_amount);
    END IF;

    -- Promemoria Differenza
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

    -- Chiudi prenotazione
    UPDATE reservations SET status = 'SOLD' WHERE id = p_res_id;

    RETURN v_order_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 4. Update direct_sale to handle unit_cost and profit
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
    v_variant RECORD;
    v_diff DECIMAL;
    v_actual_scope_id UUID;
    v_item_profit DECIMAL;
BEGIN
    -- Risoluzione Scope
    IF p_scope_id IS NOT NULL THEN v_actual_scope_id := p_scope_id;
    ELSE SELECT id INTO v_actual_scope_id FROM scopes LIMIT 1; END IF;

    -- Calcola il valore reale della merce
    FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
    LOOP
        v_real_total := v_real_total + ((v_item->>'qty')::int * (v_item->>'price_final')::decimal);
    END LOOP;

    -- Crea Ordine
    INSERT INTO orders (sold_by_staff_id, customer_name, gross_total, status)
    VALUES (
        p_staff_id, 
        p_customer_name, 
        p_payment_amount, 
        CASE 
            WHEN p_payment_amount >= v_real_total - 0.01 THEN 'COMPLETED'::order_status 
            ELSE 'PARTIAL_PAYMENT'::order_status 
        END
    )
    RETURNING id INTO v_order_id;

    -- Inserisci Items, Scarica Inventario e calcola profitto
    FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
    LOOP
        -- Recupera unit_cost corrente
        SELECT unit_cost INTO v_variant FROM product_variants WHERE id = (v_item->>'variant_id')::uuid;
        
        v_item_profit := ((v_item->>'price_final')::decimal - COALESCE(v_variant.unit_cost, 0)) * (v_item->>'qty')::int;

        UPDATE inventory 
        SET qty = qty - (v_item->>'qty')::int, updated_at = NOW()
        WHERE variant_id = (v_item->>'variant_id')::uuid;

        INSERT INTO order_items (order_id, variant_id, qty, unit_price_default, unit_price_final, unit_cost, profit)
        VALUES (
            v_order_id,
            (v_item->>'variant_id')::uuid,
            (v_item->>'qty')::int,
            (v_item->>'price_default')::decimal,
            (v_item->>'price_final')::decimal,
            v_variant.unit_cost,
            v_item_profit
        );
    END LOOP;

    -- Registra Pagamento
    IF p_payment_amount > 0 THEN
        INSERT INTO payments (order_id, amount) VALUES (v_order_id, p_payment_amount);
    END IF;

    -- Crea Promemoria per la differenza
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

-- Grant permissions
GRANT EXECUTE ON FUNCTION update_reservation_item(UUID, INT, DECIMAL) TO authenticated;
GRANT EXECUTE ON FUNCTION fulfill_reservation(UUID, UUID, DECIMAL, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION direct_sale(UUID, TEXT, DECIMAL, JSONB, UUID) TO authenticated;
