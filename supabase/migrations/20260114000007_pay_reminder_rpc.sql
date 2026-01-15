-- Migration: Pay Reminder RPC
-- Purpose: Allow partial or full payment of a reminder, updating the order and reminder status.

CREATE OR REPLACE FUNCTION pay_reminder(
    p_reminder_id UUID,
    p_payment_amount DECIMAL,
    p_staff_id UUID
) RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_reminder RECORD;
    v_new_amount_due DECIMAL;
BEGIN
    -- Get reminder info
    SELECT * INTO v_reminder FROM reminders WHERE id = p_reminder_id;
    
    IF v_reminder IS NULL THEN
        RAISE EXCEPTION 'Reminder not found';
    END IF;
    
    IF v_reminder.status <> 'active' THEN
        RAISE EXCEPTION 'Reminder is already resolved';
    END IF;

    -- Update Reminder Amount
    v_new_amount_due := v_reminder.amount_due - p_payment_amount;
    
    -- Insert Payment linked to the original Order
    INSERT INTO payments (order_id, amount) 
    VALUES (v_reminder.order_id, p_payment_amount);

    IF v_new_amount_due <= 0.01 THEN
        -- Fully paid
        UPDATE reminders 
        SET amount_due = 0, status = 'resolved' 
        WHERE id = p_reminder_id;
        
        -- Update Order status to COMPLETED
        UPDATE orders 
        SET status = 'COMPLETED' 
        WHERE id = v_reminder.order_id;
    ELSE
        -- Still partial
        UPDATE reminders 
        SET amount_due = v_new_amount_due 
        WHERE id = p_reminder_id;
    END IF;
END;
$$;
