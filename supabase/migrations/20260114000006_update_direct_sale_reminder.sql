-- Migration: Update direct_sale to support partial payments and reminders
-- Should be applied after 20260114000005_reminders_system.sql

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
    v_items_desc TEXT := '';
    v_diff DECIMAL;
BEGIN
    -- Calculate total from JSON
    SELECT SUM((x->>'qty')::INT * (x->>'price_final')::DECIMAL) INTO v_total FROM jsonb_array_elements(p_items) AS x;

    -- Create Order
    INSERT INTO orders (sold_by_staff_id, customer_name, gross_total, status)
    VALUES (
        p_staff_id, 
        p_customer_name, 
        v_total, 
        CASE 
            WHEN p_payment_amount + 0.01 >= v_total THEN 'COMPLETED'::order_status 
            ELSE 'PARTIAL_PAYMENT'::order_status 
        END
    )
    RETURNING id INTO v_order_id;

    -- Process items
    FOR v_item IN SELECT * FROM jsonb_to_recordset(p_items) AS x(variant_id UUID, qty INT, price_default DECIMAL, price_final DECIMAL)
    LOOP
        -- Check stock
        IF (SELECT qty FROM inventory WHERE variant_id = v_item.variant_id) < v_item.qty THEN
            RAISE EXCEPTION 'Stock insufficient for variant %', v_item.variant_id;
        END IF;

        -- Get cost for profit and Insert order item
        -- We need to join with product_models and product_flavors to build description for reminder
        INSERT INTO order_items (order_id, variant_id, qty, unit_price_default, unit_price_final, unit_cost, profit)
        SELECT 
            v_order_id, 
            v_item.variant_id, 
            v_item.qty, 
            v_item.price_default, 
            v_item.price_final, 
            unit_cost, 
            (v_item.price_final - COALESCE(unit_cost, 0)) * v_item.qty
        FROM product_variants WHERE id = v_item.variant_id;

        -- Update inventory
        UPDATE inventory SET qty = qty - v_item.qty WHERE variant_id = v_item.variant_id;
        
        -- Append to description for reminder
        DECLARE
            v_model_name TEXT;
            v_flavor_name TEXT;
        BEGIN
            SELECT pm.name, pf.name INTO v_model_name, v_flavor_name
            FROM product_variants pv
            JOIN product_models pm ON pv.model_id = pm.id
            JOIN product_flavors pf ON pv.flavor_id = pf.id
            WHERE pv.id = v_item.variant_id;
            
            v_items_desc := v_items_desc || v_item.qty || 'x ' || v_model_name || ' ' || v_flavor_name || ', ';
        END;
    END LOOP;
    
    -- Remove trailing comma
    IF length(v_items_desc) > 2 THEN
        v_items_desc := substring(v_items_desc from 1 for length(v_items_desc) - 2);
    END IF;

    -- Payment
    IF p_payment_amount > 0 THEN
        INSERT INTO payments (order_id, amount) VALUES (v_order_id, p_payment_amount);
    END IF;
    
    -- Handle Reminder (Partial Payment)
    v_diff := v_total - p_payment_amount;
    IF v_diff > 0.01 THEN -- Use small epsilon for float comparison
        INSERT INTO reminders (created_by_staff_id, order_id, customer_name, description, amount_due)
        VALUES (p_staff_id, v_order_id, p_customer_name, v_items_desc, v_diff);
    END IF;

    RETURN v_order_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
