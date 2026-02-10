-- Migration: Better descriptions and item sorting
-- Purpose: 
-- 1. Restore detailed product descriptions in Reminders for both reservations and direct sales
-- 2. Use newlines in descriptions for better readability
-- 3. Ensure items are ordered consistently

-- 1. Update fulfill_reservation
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
    v_description TEXT;
BEGIN
    IF p_scope_id IS NOT NULL THEN v_actual_scope_id := p_scope_id;
    ELSE SELECT id INTO v_actual_scope_id FROM scopes LIMIT 1; END IF;

    SELECT * INTO v_res FROM reservations WHERE id = p_res_id;
    IF v_res IS NULL OR v_res.status <> 'RESERVED' THEN RAISE EXCEPTION 'Reservation is not active'; END IF;

    -- Calcola Totale Reale merce
    SELECT SUM(qty * unit_price_final) INTO v_real_total FROM reservation_items WHERE reservation_id = p_res_id;

    -- Genera Descrizione Dettagliata con Newline (Ordinata per Modello/Gusto)
    SELECT string_agg(pm.name || ' ' || pf.name || (CASE WHEN ri.qty > 1 THEN ' x' || ri.qty ELSE '' END), E'\n' ORDER BY pm.name, pf.name)
    INTO v_description
    FROM reservation_items ri
    JOIN product_variants pv ON ri.variant_id = pv.id
    JOIN product_models pm ON pv.model_id = pm.id
    JOIN product_flavors pf ON pv.flavor_id = pf.id
    WHERE ri.reservation_id = p_res_id;

    v_description := 'Saldo:' || E'\n' || COALESCE(v_description, 'Articoli variabili');

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

    -- Copia Items
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
            v_res.customer_name, v_description, v_diff, 'Saldo ' || v_res.customer_name
        );
    END IF;

    UPDATE reservations SET status = 'SOLD' WHERE id = p_res_id;
    RETURN v_order_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 2. Update direct_sale
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
    v_description TEXT;
BEGIN
    IF p_scope_id IS NOT NULL THEN v_actual_scope_id := p_scope_id;
    ELSE SELECT id INTO v_actual_scope_id FROM scopes LIMIT 1; END IF;

    -- Genera Descrizione Dettagliata da JSONB
    SELECT string_agg(pm.name || ' ' || pf.name || (CASE WHEN (elem->>'qty')::int > 1 THEN ' x' || (elem->>'qty')::text ELSE '' END), E'\n' ORDER BY pm.name, pf.name)
    INTO v_description
    FROM jsonb_array_elements(p_items) AS elem
    JOIN product_variants pv ON (elem->>'variant_id')::uuid = pv.id
    JOIN product_models pm ON pv.model_id = pm.id
    JOIN product_flavors pf ON pv.flavor_id = pf.id;

    v_description := 'Vendita:' || E'\n' || COALESCE(v_description, 'Articoli');

    FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
    LOOP
        v_real_total := v_real_total + ((v_item->>'qty')::int * (v_item->>'price_final')::decimal);
    END LOOP;

    INSERT INTO orders (sold_by_staff_id, customer_name, gross_total, status)
    VALUES (p_staff_id, p_customer_name, p_payment_amount, 
        CASE WHEN p_payment_amount >= v_real_total - 0.01 THEN 'COMPLETED'::order_status ELSE 'PARTIAL_PAYMENT'::order_status END
    ) RETURNING id INTO v_order_id;

    FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
    LOOP
        SELECT unit_cost INTO v_variant FROM product_variants WHERE id = (v_item->>'variant_id')::uuid;
        v_item_profit := ((v_item->>'price_final')::decimal - COALESCE(v_variant.unit_cost, 0)) * (v_item->>'qty')::int;
        UPDATE inventory SET qty = qty - (v_item->>'qty')::int, updated_at = NOW() WHERE variant_id = (v_item->>'variant_id')::uuid;
        INSERT INTO order_items (order_id, variant_id, qty, unit_price_default, unit_price_final, unit_cost, profit)
        VALUES (v_order_id,(v_item->>'variant_id')::uuid,(v_item->>'qty')::int,(v_item->>'price_default')::decimal,(v_item->>'price_final')::decimal, v_variant.unit_cost, v_item_profit);
    END LOOP;

    IF p_payment_amount > 0 THEN
        INSERT INTO payments (order_id, amount) VALUES (v_order_id, p_payment_amount);
    END IF;

    v_diff := v_real_total - p_payment_amount;
    IF v_diff > 0.01 THEN
        INSERT INTO reminders (scope_id, created_by, created_by_staff_id, order_id, customer_name, description, amount_due, title)
        VALUES (v_actual_scope_id, auth.uid(), p_staff_id, v_order_id, p_customer_name, v_description, v_diff, 'Saldo ' || p_customer_name);
    END IF;

    RETURN v_order_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
