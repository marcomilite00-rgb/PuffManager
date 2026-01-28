-- FIX: Rimuove le funzioni duplicate (ambigue) e ricrea le versioni univoche corrette.

-- 1. DROP di TUTTE le varianti esistenti (per pulire l'ambiguità)
DROP FUNCTION IF EXISTS direct_sale(UUID, TEXT, DECIMAL, JSONB);
DROP FUNCTION IF EXISTS direct_sale(UUID, TEXT, DECIMAL, JSONB, UUID);

DROP FUNCTION IF EXISTS fulfill_reservation(UUID, UUID, DECIMAL);
DROP FUNCTION IF EXISTS fulfill_reservation(UUID, UUID, DECIMAL, UUID);


-- 2. Ricrea direct_sale (Versione definitiva con scope_id opzionale)
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
    -- Risoluzione Scope
    IF p_scope_id IS NOT NULL THEN v_actual_scope_id := p_scope_id;
    ELSE SELECT id INTO v_actual_scope_id FROM scopes LIMIT 1; END IF;

    -- Calcola il valore reale della merce
    FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
    LOOP
        v_real_total := v_real_total + ((v_item->>'qty')::int * (v_item->>'price_final')::decimal);
    END LOOP;

    -- Crea Ordine
    -- NOTA: gross_total = quanto stai pagando ORA (se parziale) oppure il totale reale (se saldo o eccesso)
    -- Se è una vendita parziale, gross_total riflette l'incasso.
    INSERT INTO orders (sold_by_staff_id, customer_name, gross_total, status)
    VALUES (
        p_staff_id, 
        p_customer_name, 
        p_payment_amount, -- Coerenza Cassa/Storico
        CASE 
            WHEN p_payment_amount >= v_real_total - 0.01 THEN 'COMPLETED'::order_status 
            ELSE 'PARTIAL_PAYMENT'::order_status 
        END
    )
    RETURNING id INTO v_order_id;

    -- Inserisci Items e Scarica Inventario
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

    -- Registra Pagamento
    IF p_payment_amount > 0 THEN
        INSERT INTO payments (order_id, amount) VALUES (v_order_id, p_payment_amount);
    END IF;

    -- Crea Promemoria per la differenza (se c'è)
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


-- 3. Ricrea fulfill_reservation (Versione definitiva con scope_id opzionale)
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

    -- Calcola Totale Reale merce
    SELECT SUM(qty * unit_price_final) INTO v_real_total FROM reservation_items WHERE reservation_id = p_res_id;

    -- Crea Ordine
    INSERT INTO orders (sold_by_staff_id, customer_name, source_reservation_id, gross_total, status)
    VALUES (
        p_staff_id, 
        v_res.customer_name, 
        p_res_id, 
        p_payment_amount, -- Coerenza Cassa
        CASE 
            WHEN p_payment_amount >= v_real_total - 0.01 THEN 'COMPLETED'::order_status 
            ELSE 'PARTIAL_PAYMENT'::order_status 
        END
    )
    RETURNING id INTO v_order_id;

    -- Copia Items
    FOR v_item IN SELECT * FROM reservation_items WHERE reservation_id = p_res_id
    LOOP
        INSERT INTO order_items (order_id, variant_id, qty, unit_price_default, unit_price_final)
        VALUES (v_order_id, v_item.variant_id, v_item.qty, v_item.unit_price_default, v_item.unit_price_final);
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


-- Concedi permessi
GRANT EXECUTE ON FUNCTION direct_sale(UUID, TEXT, DECIMAL, JSONB, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION fulfill_reservation(UUID, UUID, DECIMAL, UUID) TO authenticated;
