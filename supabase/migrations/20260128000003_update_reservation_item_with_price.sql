-- Migration: Update reservation item with price support and stock limit
-- Purpose: Allow updating both quantity AND price for reservation items

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
BEGIN
    -- Get old qty and variant
    SELECT qty, variant_id INTO v_old_qty, v_variant_id FROM reservation_items WHERE id = p_item_id;
    
    IF v_old_qty IS NULL THEN
        RAISE EXCEPTION 'Item non trovato.';
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

    -- Update item qty and optionally price
    IF p_new_price IS NOT NULL THEN
        UPDATE reservation_items SET qty = p_new_qty, unit_price_final = p_new_price WHERE id = p_item_id;
    ELSE
        UPDATE reservation_items SET qty = p_new_qty WHERE id = p_item_id;
    END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant permissions
GRANT EXECUTE ON FUNCTION update_reservation_item(UUID, INT, DECIMAL) TO authenticated;
