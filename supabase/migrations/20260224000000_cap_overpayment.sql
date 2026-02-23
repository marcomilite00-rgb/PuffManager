-- Migration: Cap overpayment in pay_reminder + row locking
-- Fixes: BUG-009 (overpayment not prevented) + race-condition safety

DROP FUNCTION IF EXISTS pay_reminder(UUID, DECIMAL, UUID);

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
    v_actual_payment DECIMAL;
BEGIN
    -- Lock the reminder row to prevent concurrent payment race conditions
    SELECT * INTO v_reminder FROM reminders WHERE id = p_reminder_id FOR UPDATE;
    
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Errore: Promemoria non trovato.';
    END IF;
    
    v_original_order_id := v_reminder.order_id;
    
    -- Validate positive amount
    IF p_payment_amount <= 0 THEN
        RAISE EXCEPTION 'Errore: L''importo del pagamento deve essere positivo.';
    END IF;

    -- Cap payment at remaining debt (reject silently — excess is ignored)
    v_actual_payment := LEAST(p_payment_amount, v_reminder.amount_due);

    -- 1. CASSA: Register payment on original order
    INSERT INTO payments (order_id, amount, created_at)
    VALUES (v_original_order_id, v_actual_payment, NOW());

    -- 2. STORICO: Update original order gross_total (cumulative paid)
    -- Lock the order row too
    SELECT gross_total INTO v_current_gross FROM orders WHERE id = v_original_order_id FOR UPDATE;
    
    UPDATE orders 
    SET gross_total = COALESCE(v_current_gross, 0) + v_actual_payment,
        updated_at = NOW()
    WHERE id = v_original_order_id;

    -- 3. PROMEMORIA: Calculate new debt
    v_new_amount_due := v_reminder.amount_due - v_actual_payment;
    
    -- Rounding correction
    IF v_new_amount_due < 0.01 THEN 
        v_new_amount_due := 0; 
    END IF;

    -- 4. Update reminder status
    UPDATE reminders 
    SET amount_due = v_new_amount_due,
        status = CASE WHEN v_new_amount_due = 0 THEN 'resolved' ELSE 'active' END,
        updated_at = NOW()
    WHERE id = p_reminder_id;

    -- 5. Update order status (yellow dot logic)
    IF v_new_amount_due = 0 THEN
        UPDATE orders SET status = 'COMPLETED' WHERE id = v_original_order_id;
    ELSE
        UPDATE orders SET status = 'PARTIAL_PAYMENT' WHERE id = v_original_order_id;
    END IF;

END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION pay_reminder(UUID, DECIMAL, UUID) TO authenticated;
