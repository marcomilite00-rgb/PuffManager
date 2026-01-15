-- FIX COMPLETO: Aggiunge la colonna mancante e ripristina la logica di pagamento corretta

-- 1. Aggiungi la colonna updated_at alla tabella orders (causa dell'errore)
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 
        FROM information_schema.columns 
        WHERE table_name = 'orders' 
        AND column_name = 'updated_at'
    ) THEN
        ALTER TABLE orders ADD COLUMN updated_at TIMESTAMPTZ DEFAULT NOW();
    END IF;
END $$;

-- 2. Ridefinisci la funzione pay_reminder (per sicurezza)
-- Questa funzione:
--  - Aggiunge i soldi alla Cassa (INSERIMENTO su payments)
--  - Aggiorna lo Storico (UPDATE su orders aggiungendo l'importo al totale)
--  - Toglie il debito dal Promemoria
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
BEGIN
    -- Recupera dati promemoria
    SELECT * INTO v_reminder FROM reminders WHERE id = p_reminder_id;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Reminder not found';
    END IF;
    
    v_original_order_id := v_reminder.order_id;

    IF p_payment_amount <= 0 THEN
        RAISE EXCEPTION 'Payment amount must be positive';
    END IF;

    -- A. Registra il pagamento in Cassa (legato all'ordine originale)
    INSERT INTO payments (order_id, amount, created_at)
    VALUES (v_original_order_id, p_payment_amount, NOW());

    -- B. Aggiorna il totale dell'Ordine Originale (Storico)
    SELECT gross_total INTO v_current_gross FROM orders WHERE id = v_original_order_id;
    
    UPDATE orders 
    SET gross_total = COALESCE(v_current_gross, 0) + p_payment_amount,
        updated_at = NOW() -- Ora questa colonna esiste
    WHERE id = v_original_order_id;

    -- C. Aggiorna il Promemoria (Scala il debito)
    v_new_amount_due := v_reminder.amount_due - p_payment_amount;
    IF v_new_amount_due < 0.01 THEN v_new_amount_due := 0; END IF;

    UPDATE reminders 
    SET amount_due = v_new_amount_due,
        status = CASE WHEN v_new_amount_due = 0 THEN 'resolved' ELSE 'active' END,
        updated_at = NOW()
    WHERE id = p_reminder_id;

    -- D. Gestione Pallino Giallo (Stato Ordine)
    IF v_new_amount_due = 0 THEN
        -- Se saldato tutto, ordine COMPLETATO (via pallino)
        UPDATE orders SET status = 'COMPLETED' WHERE id = v_original_order_id;
    ELSE
        -- Se parziale, rimane PARTIAL_PAYMENT
        UPDATE orders SET status = 'PARTIAL_PAYMENT' WHERE id = v_original_order_id;
    END IF;

END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION pay_reminder(UUID, DECIMAL, UUID) TO authenticated;
