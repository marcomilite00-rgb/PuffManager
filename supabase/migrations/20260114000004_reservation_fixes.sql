-- RPC: delete_reservation_item
-- Purpose: Delete a single item from a reservation and return its quantity to inventory
CREATE OR REPLACE FUNCTION delete_reservation_item(
    p_item_id UUID
) RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
    v_qty INT;
    v_variant_id UUID;
BEGIN
    -- Get qty and variant from the item to be deleted
    SELECT qty, variant_id 
    INTO v_qty, v_variant_id 
    FROM reservation_items 
    WHERE id = p_item_id;
    
    IF v_qty IS NULL THEN
        RAISE EXCEPTION 'Item not found';
    END IF;

    -- Return stock to inventory
    UPDATE inventory 
    SET qty = qty + v_qty 
    WHERE variant_id = v_variant_id;

    -- Delete the item
    DELETE FROM reservation_items 
    WHERE id = p_item_id;
END;
$$;
