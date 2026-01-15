-- RPC: update_reservation_item
CREATE OR REPLACE FUNCTION update_reservation_item(
    p_item_id UUID,
    p_new_qty INT
) RETURNS VOID AS $$
DECLARE
    v_old_qty INT;
    v_variant_id UUID;
    v_diff INT;
BEGIN
    -- Get old qty and variant
    SELECT qty, variant_id INTO v_old_qty, v_variant_id FROM reservation_items WHERE id = p_item_id;
    
    v_diff := p_new_qty - v_old_qty;

    -- If increasing qty, check stock
    IF v_diff > 0 THEN
        IF (SELECT qty FROM inventory WHERE variant_id = v_variant_id) < v_diff THEN
            RAISE EXCEPTION 'Stock insufficient for increase';
        END IF;
        UPDATE inventory SET qty = qty - v_diff WHERE variant_id = v_variant_id;
    -- If decreasing qty, restore stock
    ELSIF v_diff < 0 THEN
        UPDATE inventory SET qty = qty + ABS(v_diff) WHERE variant_id = v_variant_id;
    END IF;

    -- Update item qty
    UPDATE reservation_items SET qty = p_new_qty WHERE id = p_item_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
