-- FIX: Includi dettagli prodotti (Gusto/Modello) nella descrizione del Promemoria per le Prenotazioni

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
    v_description TEXT;
BEGIN
    IF p_scope_id IS NOT NULL THEN v_actual_scope_id := p_scope_id;
    ELSE SELECT id INTO v_actual_scope_id FROM scopes LIMIT 1; END IF;

    SELECT * INTO v_res FROM reservations WHERE id = p_res_id;
    IF v_res.status <> 'RESERVED' THEN RAISE EXCEPTION 'Reservation is not active'; END IF;

    -- Calcola Totale Reale merce
    SELECT SUM(qty * unit_price_final) INTO v_real_total FROM reservation_items WHERE reservation_id = p_res_id;

    -- Genera Descrizione Dettagliata (Modello + Gusto)
    SELECT string_agg(pm.name || ' ' || pf.name || (CASE WHEN ri.qty > 1 THEN ' x' || ri.qty ELSE '' END), ', ')
    INTO v_description
    FROM reservation_items ri
    JOIN product_variants pv ON ri.variant_id = pv.id
    JOIN product_models pm ON pv.model_id = pm.id
    JOIN product_flavors pf ON pv.flavor_id = pf.id
    WHERE ri.reservation_id = p_res_id;

    v_description := 'Saldo: ' || COALESCE(v_description, 'Articoli variabili');

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

    -- Promemoria Differenza (CON DESCRIZIONE DETTAGLIATA)
    v_diff := v_real_total - p_payment_amount;
    IF v_diff > 0.01 THEN
        INSERT INTO reminders (
            scope_id, created_by, created_by_staff_id, order_id, 
            customer_name, 
            description, -- Qui usiamo la descrizione generata
            amount_due, title
        )
        VALUES (
            v_actual_scope_id, auth.uid(), p_staff_id, v_order_id, 
            v_res.customer_name, 
            v_description, 
            v_diff, 'Saldo ' || v_res.customer_name
        );
    END IF;

    -- Chiudi prenotazione
    UPDATE reservations SET status = 'SOLD' WHERE id = p_res_id;

    RETURN v_order_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION fulfill_reservation(UUID, UUID, DECIMAL, UUID) TO authenticated;
