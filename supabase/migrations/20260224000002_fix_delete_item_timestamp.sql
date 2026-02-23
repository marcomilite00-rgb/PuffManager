-- Migration: Fix delete_reservation_item to set updated_at on inventory
-- Fixes: BUG-011 (inconsistent updated_at on stock restore)

CREATE OR REPLACE FUNCTION delete_reservation_item(p_item_id UUID) RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions AS $$
DECLARE
    v_qty INT;
    v_variant_id UUID;
    v_res_status TEXT;
BEGIN
    -- Get qty, variant and check reservation status
    SELECT ri.qty, ri.variant_id, r.status
    INTO v_qty, v_variant_id, v_res_status
    FROM reservation_items ri
    JOIN reservations r ON ri.reservation_id = r.id
    WHERE ri.id = p_item_id;
    
    IF v_qty IS NULL THEN
        RAISE EXCEPTION 'Item not found';
    END IF;

    IF v_res_status != 'RESERVED' THEN
        RAISE EXCEPTION 'La prenotazione non è più attiva (Stato: %).', v_res_status;
    END IF;

    -- Return stock to inventory with updated_at
    UPDATE inventory 
    SET qty = qty + v_qty, updated_at = NOW()
    WHERE variant_id = v_variant_id;

    -- Delete the item
    DELETE FROM reservation_items WHERE id = p_item_id;
END;
$$;

GRANT EXECUTE ON FUNCTION delete_reservation_item(UUID) TO authenticated;
