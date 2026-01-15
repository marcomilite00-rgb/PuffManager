-- FIX FORZATO: Riscrittura completa della logica di pagamento "Risolto"
-- 1. Rimuovi ogni traccia della funzione precedente per evitare conflitti
DROP FUNCTION IF EXISTS pay_reminder(UUID, DECIMAL, UUID);

-- 2. Ricrea la funzione con logica blindata
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
    -- Recupera il promemoria e l'ID dell'ordine originale
    SELECT * INTO v_reminder FROM reminders WHERE id = p_reminder_id;
    
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Errore: Promemoria non trovato.';
    END IF;
    
    v_original_order_id := v_reminder.order_id;
    
    -- Controllo di sicurezza sull'importo
    IF p_payment_amount <= 0 THEN
        RAISE EXCEPTION 'Errore: L''importo del pagamento deve essere positivo.';
    END IF;

    -- 1. CASSA: Inserisci il pagamento collegandolo all'ordine originale
    INSERT INTO payments (order_id, amount, created_at)
    VALUES (v_original_order_id, p_payment_amount, NOW());

    -- 2. STORICO: Aggiorna il totale dell'ordine esistente
    -- Somma l'importo appena pagato al totale che c'era già
    SELECT gross_total INTO v_current_gross FROM orders WHERE id = v_original_order_id;
    
    UPDATE orders 
    SET gross_total = COALESCE(v_current_gross, 0) + p_payment_amount,
        updated_at = NOW()
    WHERE id = v_original_order_id;

    -- 3. PROMEMORIA: Calcola il nuovo debito
    v_new_amount_due := v_reminder.amount_due - p_payment_amount;
    
    -- Correzione arrotondamenti (es. 0.0000001 diventa 0)
    IF v_new_amount_due < 0.01 THEN 
        v_new_amount_due := 0; 
    END IF;

    -- 4. AGGIORNA STATO PROMEMORIA
    UPDATE reminders 
    SET amount_due = v_new_amount_due,
        status = CASE WHEN v_new_amount_due = 0 THEN 'resolved' ELSE 'active' END,
        updated_at = NOW()
    WHERE id = p_reminder_id;

    -- 5. AGGIORNA PALLINO GIALLO (Stato Ordine)
    IF v_new_amount_due = 0 THEN
        -- Debito estinto -> Ordine Completato (Verde/Normale)
        UPDATE orders SET status = 'COMPLETED' WHERE id = v_original_order_id;
    ELSE
        -- Debito ancora presente -> Ordine Parziale (Giallo)
        UPDATE orders SET status = 'PARTIAL_PAYMENT' WHERE id = v_original_order_id;
    END IF;

END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Permessi
GRANT EXECUTE ON FUNCTION pay_reminder(UUID, DECIMAL, UUID) TO authenticated;
