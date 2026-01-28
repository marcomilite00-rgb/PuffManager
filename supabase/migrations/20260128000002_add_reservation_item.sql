-- Migration: Add item to existing reservation
-- Purpose: Allow adding new items to an existing reservation, respecting stock limits

CREATE OR REPLACE FUNCTION add_reservation_item(
    p_reservation_id UUID,
    p_variant_id UUID,
    p_qty INT,
    p_price_final DECIMAL
) RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_res RECORD;
    v_variant RECORD;
    v_inventory RECORD;
    v_existing_item RECORD;
    v_item_id UUID;
BEGIN
    -- 1. Guard-rails: Check reservation exists and is RESERVED
    SELECT * INTO v_res FROM reservations WHERE id = p_reservation_id;
    IF v_res IS NULL THEN
        RAISE EXCEPTION 'Prenotazione non trovata.';
    END IF;
    IF v_res.status != 'RESERVED' THEN
        RAISE EXCEPTION 'La prenotazione non è più attiva.';
    END IF;

    -- 2. Guard-rails: Check variant exists
    SELECT * INTO v_variant FROM product_variants WHERE id = p_variant_id;
    IF v_variant IS NULL THEN
        RAISE EXCEPTION 'Variante non trovata.';
    END IF;

    -- 3. Guard-rails: Check stock availability
    SELECT * INTO v_inventory FROM inventory WHERE variant_id = p_variant_id;
    IF v_inventory IS NULL OR v_inventory.qty < p_qty THEN
        RAISE EXCEPTION 'Stock insufficiente. Disponibili: %', COALESCE(v_inventory.qty, 0);
    END IF;

    -- 4. Check if item already exists in this reservation
    SELECT * INTO v_existing_item 
    FROM reservation_items 
    WHERE reservation_id = p_reservation_id AND variant_id = p_variant_id;

    IF v_existing_item IS NOT NULL THEN
        -- Update existing item quantity
        UPDATE reservation_items 
        SET qty = qty + p_qty,
            unit_price_final = p_price_final
        WHERE id = v_existing_item.id
        RETURNING id INTO v_item_id;
    ELSE
        -- Insert new item
        INSERT INTO reservation_items (
            reservation_id, variant_id, qty, unit_price_default, unit_price_final, unit_cost
        ) VALUES (
            p_reservation_id, p_variant_id, p_qty, v_variant.default_price, p_price_final, v_variant.unit_cost
        )
        RETURNING id INTO v_item_id;
    END IF;

    -- 5. Deduct from inventory
    UPDATE inventory 
    SET qty = qty - p_qty, updated_at = NOW()
    WHERE variant_id = p_variant_id;

    RETURN v_item_id;
END;
$$;

-- Grant permissions
GRANT EXECUTE ON FUNCTION add_reservation_item(UUID, UUID, INT, DECIMAL) TO authenticated;
