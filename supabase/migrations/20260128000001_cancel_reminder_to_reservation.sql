-- Migration: Cancel Reminder to Reservation
-- Purpose: Reverts a partial sale, returning it to reservation state and removing it from history.

CREATE OR REPLACE FUNCTION cancel_reminder_to_reservation(
    p_reminder_id UUID
) RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_reminder RECORD;
    v_order RECORD;
    v_res_id UUID;
BEGIN
    -- 1. Guard-rails: Check reminder existence and status
    SELECT * INTO v_reminder FROM reminders WHERE id = p_reminder_id;
    IF v_reminder IS NULL THEN
        RAISE EXCEPTION 'Promemoria non trovato.';
    END IF;

    IF v_reminder.status != 'active' THEN
        RAISE EXCEPTION 'Il promemoria è già stato risolto o annullato.';
    END IF;

    -- 2. Guard-rails: Check order existence and status
    SELECT * INTO v_order FROM orders WHERE id = v_reminder.order_id;
    IF v_order IS NULL THEN
        RAISE EXCEPTION 'Ordine associato non trovato.';
    END IF;

    IF v_order.status != 'PARTIAL_PAYMENT' THEN
        RAISE EXCEPTION 'L''ordine associato non è in stato di pagamento parziale.';
    END IF;

    IF v_order.source_reservation_id IS NULL THEN
        RAISE EXCEPTION 'Questo ordine non è collegato ad una prenotazione originale.';
    END IF;

    v_res_id := v_order.source_reservation_id;

    -- 3. Guard-rails: Check reservation status
    IF NOT EXISTS (SELECT 1 FROM reservations WHERE id = v_res_id AND status = 'SOLD') THEN
        RAISE EXCEPTION 'La prenotazione originale non è in stato VENDUTO o è già stata ripristinata.';
    END IF;

    -- 4. ATOMIC OPERATIONS
    
    -- A. Restore Reservation to RESERVED status
    UPDATE reservations 
    SET status = 'RESERVED' 
    WHERE id = v_res_id;

    -- B. Delete the reminder FIRST (it has FK to orders)
    DELETE FROM reminders 
    WHERE id = p_reminder_id;

    -- C. Delete associated payments
    DELETE FROM payments 
    WHERE order_id = v_order.id;

    -- D. Delete order items
    DELETE FROM order_items 
    WHERE order_id = v_order.id;

    -- E. Finally, delete the order (Removes from History)
    DELETE FROM orders 
    WHERE id = v_order.id;

END;
$$;

-- Grant permissions
GRANT EXECUTE ON FUNCTION cancel_reminder_to_reservation(UUID) TO authenticated;
