-- Migration: Update reservation item with price support and stock limit
-- Purpose: Allow updating both quantity AND price for reservation items

CREATE OR REPLACE FUNCTION update_reservation_item(
    p_item_id UUID,
    p_new_qty INT,
    p_new_price DECIMAL DEFAULT NULL
) RETURNS VOID AS $$
DECLARE
    v_available INT;
    v_res_status TEXT;
    v_res_id UUID;
BEGIN
    -- Get old qty, variant and reservation status
    SELECT ri.qty, ri.variant_id, r.status, r.id 
    INTO v_old_qty, v_variant_id, v_res_status, v_res_id
    FROM reservation_items ri
    JOIN reservations r ON ri.reservation_id = r.id
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
