-- Migration: Payment & Debt Resolution RPCs
-- 1. pay_reminder: Handles partial/full payments for reminders
CREATE OR REPLACE FUNCTION pay_reminder(
    p_reminder_id UUID,
    p_payment_amount DECIMAL,
    p_staff_id UUID
) RETURNS VOID AS $$
DECLARE
    v_reminder RECORD;
    v_new_amount_due DECIMAL;
    v_order_status order_status;
BEGIN
    -- Get reminder details
    SELECT * INTO v_reminder FROM reminders WHERE id = p_reminder_id;
    
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Reminder not found';
    END IF;

    -- Validate amount
    IF p_payment_amount <= 0 THEN
        RAISE EXCEPTION 'Payment amount must be positive';
    END IF;

    -- 1. Register Payment (Updates Cassa/Storico)
    INSERT INTO payments (order_id, amount, created_at)
    VALUES (v_reminder.order_id, p_payment_amount, NOW());

    -- 2. Update Reminder Amount
    v_new_amount_due := v_reminder.amount_due - p_payment_amount;
    
    -- Handle floating point precision issues
    IF v_new_amount_due < 0.01 THEN 
        v_new_amount_due := 0; 
    END IF;

    -- 3. Update Reminder Status
    UPDATE reminders 
    SET amount_due = v_new_amount_due,
        status = CASE WHEN v_new_amount_due = 0 THEN 'resolved' ELSE 'active' END,
        updated_at = NOW()
    WHERE id = p_reminder_id;

    -- 4. Update Order Status
    -- If fully paid, mark COMPLETED. If partially paid (still has reminder active), mark PARTIAL_PAYMENT.
    v_order_status := CASE WHEN v_new_amount_due = 0 THEN 'COMPLETED'::order_status ELSE 'PARTIAL_PAYMENT'::order_status END;

    UPDATE orders 
    SET status = v_order_status 
    WHERE id = v_reminder.order_id;

END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- 2. resolve_reminder_debt: Handles "Elimina" (Write off debt)
-- Removes reminder, marks order completed, BUT DOES NOT create a payment.
CREATE OR REPLACE FUNCTION resolve_reminder_debt(
    p_reminder_id UUID
) RETURNS VOID AS $$
DECLARE
    v_order_id UUID;
BEGIN
    -- Get order_id before deleting
    SELECT order_id INTO v_order_id FROM reminders WHERE id = p_reminder_id;
    
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Reminder not found';
    END IF;

    -- 1. Delete Reminder (or soft delete if preferred, user asked for "Elimina")
    DELETE FROM reminders WHERE id = p_reminder_id;

    -- 2. Update Order Status to COMPLETED (Removes Yellow Dot)
    -- effectively writing off the remaining bad debt
    UPDATE orders 
    SET status = 'COMPLETED' 
    WHERE id = v_order_id;

END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant permissions
GRANT EXECUTE ON FUNCTION pay_reminder(UUID, DECIMAL, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION resolve_reminder_debt(UUID) TO authenticated;
