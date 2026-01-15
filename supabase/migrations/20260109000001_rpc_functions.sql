-- RPC: create_reservation
CREATE OR REPLACE FUNCTION create_reservation(
    p_staff_id UUID,
    p_customer_name TEXT,
    p_items JSONB -- Array of {variant_id, qty, price_default, price_final}
) RETURNS UUID AS $$
DECLARE
    v_res_id UUID;
    v_item RECORD;
BEGIN
    -- Create reservation header
    INSERT INTO reservations (created_by_staff_id, customer_name, status)
    VALUES (p_staff_id, p_customer_name, 'RESERVED')
    RETURNING id INTO v_res_id;

    -- Process items
    FOR v_item IN SELECT * FROM jsonb_to_recordset(p_items) AS x(variant_id UUID, qty INT, price_default DECIMAL, price_final DECIMAL)
    LOOP
        -- Check stock
        IF (SELECT qty FROM inventory WHERE variant_id = v_item.variant_id) < v_item.qty THEN
            RAISE EXCEPTION 'Stock insufficient for variant %', v_item.variant_id;
        END IF;

        -- Create item
        INSERT INTO reservation_items (reservation_id, variant_id, qty, unit_price_default, unit_price_final)
        VALUES (v_res_id, v_item.variant_id, v_item.qty, v_item.price_default, v_item.price_final);

        -- Update inventory
        UPDATE inventory SET qty = qty - v_item.qty WHERE variant_id = v_item.variant_id;
    END LOOP;

    RETURN v_res_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- RPC: cancel_reservation
CREATE OR REPLACE FUNCTION cancel_reservation(p_res_id UUID) RETURNS VOID AS $$
DECLARE
    v_item RECORD;
BEGIN
    -- Check status
    IF (SELECT status FROM reservations WHERE id = p_res_id) <> 'RESERVED' THEN
        RAISE EXCEPTION 'Only RESERVED reservations can be cancelled';
    END IF;

    -- Restore stock
    FOR v_item IN SELECT variant_id, qty FROM reservation_items WHERE reservation_id = p_res_id
    LOOP
        UPDATE inventory SET qty = qty + v_item.qty WHERE variant_id = v_item.variant_id;
    END LOOP;

    -- Update status
    UPDATE reservations SET status = 'CANCELLED' WHERE id = p_res_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- RPC: fulfill_reservation
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
    VALUES (p_staff_id, v_res.customer_name, p_res_id, v_total, CASE WHEN p_payment_amount >= v_total THEN 'COMPLETED'::order_status ELSE 'PARTIAL_PAYMENT'::order_status END)
    RETURNING id INTO v_order_id;

    -- Copy items
    FOR v_item IN 
        SELECT ri.*, pv.unit_cost 
        FROM reservation_items ri 
        JOIN product_variants pv ON ri.variant_id = pv.id 
        WHERE ri.reservation_id = p_res_id
    LOOP
        INSERT INTO order_items (order_id, variant_id, qty, unit_price_default, unit_price_final, unit_cost, profit)
        VALUES (v_order_id, v_item.variant_id, v_item.qty, v_item.unit_price_default, v_item.unit_price_final, v_item.unit_cost, (v_item.unit_price_final - COALESCE(v_item.unit_cost, 0)) * v_item.qty);
    END LOOP;

    -- Payment
    IF p_payment_amount > 0 THEN
        INSERT INTO payments (order_id, amount) VALUES (v_order_id, p_payment_amount);
    END IF;

    -- Close reservation
    UPDATE reservations SET status = 'SOLD' WHERE id = p_res_id;

    RETURN v_order_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- RPC: direct_sale
CREATE OR REPLACE FUNCTION direct_sale(
    p_staff_id UUID,
    p_customer_name TEXT,
    p_payment_amount DECIMAL,
    p_items JSONB
) RETURNS UUID AS $$
DECLARE
    v_order_id UUID;
    v_item RECORD;
    v_total DECIMAL := 0;
BEGIN
    -- Calculate total from JSON
    SELECT SUM((x->>'qty')::INT * (x->>'price_final')::DECIMAL) INTO v_total FROM jsonb_array_elements(p_items) AS x;

    -- Create Order
    INSERT INTO orders (sold_by_staff_id, customer_name, gross_total, status)
    VALUES (p_staff_id, p_customer_name, v_total, CASE WHEN p_payment_amount >= v_total THEN 'COMPLETED'::order_status ELSE 'PARTIAL_PAYMENT'::order_status END)
    RETURNING id INTO v_order_id;

    -- Process items
    FOR v_item IN SELECT * FROM jsonb_to_recordset(p_items) AS x(variant_id UUID, qty INT, price_default DECIMAL, price_final DECIMAL)
    LOOP
        -- Check stock
        IF (SELECT qty FROM inventory WHERE variant_id = v_item.variant_id) < v_item.qty THEN
            RAISE EXCEPTION 'Stock insufficient for variant %', v_item.variant_id;
        END IF;

        -- Get cost for profit
        INSERT INTO order_items (order_id, variant_id, qty, unit_price_default, unit_price_final, unit_cost, profit)
        SELECT v_order_id, v_item.variant_id, v_item.qty, v_item.price_default, v_item.price_final, unit_cost, (v_item.price_final - COALESCE(unit_cost, 0)) * v_item.qty
        FROM product_variants WHERE id = v_item.variant_id;

        -- Update inventory
        UPDATE inventory SET qty = qty - v_item.qty WHERE variant_id = v_item.variant_id;
    END LOOP;

    -- Payment
    IF p_payment_amount > 0 THEN
        INSERT INTO payments (order_id, amount) VALUES (v_order_id, p_payment_amount);
    END IF;

    RETURN v_order_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
