-- Migration: Fix create_reservation to include unit_cost
-- Fixes: BUG-010 (missing unit_cost causes inflated profit on fulfillment)

CREATE OR REPLACE FUNCTION create_reservation(
    p_staff_id UUID,
    p_customer_name TEXT,
    p_items JSONB -- Array of {variant_id, qty, price_default, price_final}
) RETURNS UUID AS $$
DECLARE
    v_res_id UUID;
    v_item RECORD;
    v_variant_cost DECIMAL;
    v_available INT;
BEGIN
    -- Create reservation header
    INSERT INTO reservations (created_by_staff_id, customer_name, status)
    VALUES (p_staff_id, p_customer_name, 'RESERVED')
    RETURNING id INTO v_res_id;

    -- Process items
    FOR v_item IN SELECT * FROM jsonb_to_recordset(p_items) AS x(variant_id UUID, qty INT, price_default DECIMAL, price_final DECIMAL)
    LOOP
        -- Lock inventory row and check stock
        SELECT qty INTO v_available FROM inventory WHERE variant_id = v_item.variant_id FOR UPDATE;
        IF v_available IS NULL OR v_available < v_item.qty THEN
            RAISE EXCEPTION 'Stock insufficient for variant %. Available: %', v_item.variant_id, COALESCE(v_available, 0);
        END IF;

        -- Fetch current unit_cost from product_variants
        SELECT unit_cost INTO v_variant_cost FROM product_variants WHERE id = v_item.variant_id;

        -- Create item WITH unit_cost
        INSERT INTO reservation_items (reservation_id, variant_id, qty, unit_price_default, unit_price_final, unit_cost)
        VALUES (v_res_id, v_item.variant_id, v_item.qty, v_item.price_default, v_item.price_final, v_variant_cost);

        -- Update inventory with updated_at
        UPDATE inventory SET qty = qty - v_item.qty, updated_at = NOW() WHERE variant_id = v_item.variant_id;
    END LOOP;

    RETURN v_res_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION create_reservation(UUID, TEXT, JSONB) TO authenticated;
