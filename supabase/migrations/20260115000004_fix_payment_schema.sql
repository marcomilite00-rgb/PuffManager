-- Migration: Final Fix for Payment Logic & Schema
-- 1. Fix Schema: Add updated_at to reminders if missing
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 
        FROM information_schema.columns 
        WHERE table_name = 'reminders' 
        AND column_name = 'updated_at'
    ) THEN
        ALTER TABLE reminders ADD COLUMN updated_at TIMESTAMPTZ DEFAULT NOW();
    END IF;
END $$;

-- 2. Drop existing functions to ensure clean slate (avoiding signature conflicts)
DROP FUNCTION IF EXISTS pay_reminder(UUID, DECIMAL, UUID);
DROP FUNCTION IF EXISTS resolve_reminder_debt(UUID);

-- 3. Re-create pay_reminder with strict logic (UPDATED: Updates Original Order)
-- Handles Partial & Full payments.
-- Updates the ORIGINAL Order's gross_total (adding the new payment).
-- Creates a payment record linked to the ORIGINAL Order.
CREATE OR REPLACE FUNCTION pay_reminder(
    p_reminder_id UUID,
    p_payment_amount DECIMAL,
    p_staff_id UUID
) RETURNS VOID AS $$
DECLARE
    v_reminder RECORD;
    v_new_amount_due DECIMAL;
    v_original_order_id UUID;
    v_current_gross DECIMAL;
BEGIN
    -- Get reminder
    SELECT * INTO v_reminder FROM reminders WHERE id = p_reminder_id;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Reminder not found';
    END IF;
    
    v_original_order_id := v_reminder.order_id;

    -- Validate
    IF p_payment_amount <= 0 THEN
        RAISE EXCEPTION 'Payment amount must be positive';
    END IF;

    -- 1. Register Payment (Linked to ORIGINAL order)
    INSERT INTO payments (order_id, amount, created_at)
    VALUES (v_original_order_id, p_payment_amount, NOW());

    -- 2. Update ORIGINAL Order Total
    -- fetching current total first to be safe (though could do atomic update)
    SELECT gross_total INTO v_current_gross FROM orders WHERE id = v_original_order_id;
    
    UPDATE orders 
    SET gross_total = v_current_gross + p_payment_amount,
        updated_at = NOW()
    WHERE id = v_original_order_id;

    -- 3. Update Reminder
    v_new_amount_due := v_reminder.amount_due - p_payment_amount;
    
    -- Precision fix
    IF v_new_amount_due < 0.01 THEN v_new_amount_due := 0; END IF;

    UPDATE reminders 
    SET amount_due = v_new_amount_due,
        status = CASE WHEN v_new_amount_due = 0 THEN 'resolved' ELSE 'active' END,
        updated_at = NOW()
    WHERE id = p_reminder_id;

    -- 4. Update Order Status (Yellow Dot Control)
    -- If fully paid (reminder resolved), remove yellow dot (COMPLETED).
    -- If still partial, ensure it stays PARTIAL_PAYMENT.
    IF v_new_amount_due = 0 THEN
        UPDATE orders SET status = 'COMPLETED' WHERE id = v_original_order_id;
    ELSE
        UPDATE orders SET status = 'PARTIAL_PAYMENT' WHERE id = v_original_order_id;
    END IF;

END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- 4. Re-create resolve_reminder_debt
-- Handles "Elimina": cancels debt, removes yellow dot, NO CASH MOVEMENT.
-- "Lascia il prezzo finale così com'è" -> No update to gross_total.
CREATE OR REPLACE FUNCTION resolve_reminder_debt(
    p_reminder_id UUID
) RETURNS VOID AS $$
DECLARE
    v_order_id UUID;
BEGIN
    SELECT order_id INTO v_order_id FROM reminders WHERE id = p_reminder_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'Reminder not found'; END IF;

    -- Delete Reminder
    DELETE FROM reminders WHERE id = p_reminder_id;

    -- Update Original Order to COMPLETED (Removes Yellow Dot)
    UPDATE orders 
    SET status = 'COMPLETED' 
    WHERE id = v_order_id;

END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- 5. Grant Permissions
GRANT EXECUTE ON FUNCTION pay_reminder(UUID, DECIMAL, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION resolve_reminder_debt(UUID) TO authenticated;
