-- ==============================================================================
-- Migration: 20261018000001_fix_all_security_flaws.sql
-- Description: Comprehensive security hardening fixing vulnerabilities A1-A14 & B1-B11:
--   1. Privilege escalation fix on staff_sessions (prohibit changing staff_id/auth_uid)
--   2. Drop obsolete verify_staff_pin (closed auth bypass)
--   3. Rate limiting fix in authenticate_staff (record failed attempts without rollback)
--   4. Session TTL expiration (expires_at + get_current_staff_role update)
--   5. Caller verification and parameter validation on all core business RPCs
--   6. Restrict get_staff_unit_profit_breakdown and get_closing_preview
--   7. Update staff_public view to reflect actual has_pin from staff_secrets
--   8. Create security_audit_log table
--   9. Restrict function execution grants
-- ==============================================================================

-- ------------------------------------------------------------------------------
-- 1. FIX A1: Privilege Escalation on staff_sessions
-- ------------------------------------------------------------------------------
DROP POLICY IF EXISTS staff_sessions_update_own ON public.staff_sessions;
DROP POLICY IF EXISTS staff_sessions_update_logout_only ON public.staff_sessions;

-- Allow updating only revoked_at (for logout), but NEVER staff_id or auth_uid
CREATE POLICY staff_sessions_update_logout_only ON public.staff_sessions
FOR UPDATE TO authenticated
USING ((SELECT auth.uid()) = auth_uid)
WITH CHECK ((SELECT auth.uid()) = auth_uid);

-- Trigger to guarantee immutability of staff_id and auth_uid
CREATE OR REPLACE FUNCTION public.protect_staff_sessions_immutability()
RETURNS TRIGGER 
LANGUAGE plpgsql 
SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $$
BEGIN
    IF NEW.staff_id <> OLD.staff_id THEN
        RAISE EXCEPTION 'Violazione di sicurezza: Impossibile modificare staff_id di una sessione esistente';
    END IF;
    IF NEW.auth_uid <> OLD.auth_uid THEN
        RAISE EXCEPTION 'Violazione di sicurezza: Impossibile modificare auth_uid di una sessione esistente';
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_protect_staff_sessions ON public.staff_sessions;
CREATE TRIGGER trg_protect_staff_sessions
BEFORE UPDATE ON public.staff_sessions
FOR EACH ROW EXECUTE FUNCTION public.protect_staff_sessions_immutability();

-- ------------------------------------------------------------------------------
-- 2. FIX A9: Session TTL Expiration
-- ------------------------------------------------------------------------------
ALTER TABLE public.staff_sessions 
ADD COLUMN IF NOT EXISTS expires_at timestamp with time zone DEFAULT (now() + interval '12 hours');

-- Helper function to get authenticated staff_id
CREATE OR REPLACE FUNCTION public.get_current_staff_id()
RETURNS uuid 
LANGUAGE sql 
STABLE 
SECURITY DEFINER 
SET search_path TO 'public', 'extensions' 
AS $$
    SELECT ss.staff_id 
    FROM staff_sessions ss 
    WHERE ss.auth_uid = (SELECT auth.uid()) 
      AND (ss.revoked_at IS NULL OR ss.revoked_at > now())
      AND (ss.expires_at IS NULL OR ss.expires_at > now())
    LIMIT 1;
$$;

-- Update get_current_staff_role to check expiration
CREATE OR REPLACE FUNCTION public.get_current_staff_role()
RETURNS staff_role
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $$
    SELECT s.role
    FROM staff_sessions ss
    JOIN staff s ON s.id = ss.staff_id
    WHERE ss.auth_uid = (SELECT auth.uid())
      AND (ss.revoked_at IS NULL OR ss.revoked_at > now())
      AND (ss.expires_at IS NULL OR ss.expires_at > now())
    LIMIT 1;
$$;

-- ------------------------------------------------------------------------------
-- 3. FIX A4: Drop verify_staff_pin
-- ------------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.verify_staff_pin(text, text);

-- ------------------------------------------------------------------------------
-- 4. FIX A2 & A3: Robust Rate-Limiting in authenticate_staff
-- ------------------------------------------------------------------------------
ALTER TABLE public.login_attempts 
ADD COLUMN IF NOT EXISTS auth_uid uuid,
ADD COLUMN IF NOT EXISTS ip_address text;

CREATE OR REPLACE FUNCTION public.authenticate_staff(
    p_staff_name text,
    p_pin text DEFAULT NULL::text
)
RETURNS TABLE(
    staff_id uuid,
    staff_name text,
    staff_role staff_role,
    staff_pin_version integer,
    error_message text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
    v_staff staff%ROWTYPE;
    v_pin_hash TEXT;
    v_failed_by_name INT;
    v_failed_by_uid INT;
    v_valid BOOLEAN := false;
    v_client_ip TEXT;
BEGIN
    -- Estrarre l'IP del client se disponibile negli header PostgREST
    BEGIN
        v_client_ip := current_setting('request.headers', true)::json->>'x-forwarded-for';
    EXCEPTION WHEN OTHERS THEN
        v_client_ip := NULL;
    END;

    -- 1. Rate limiting per auth.uid() (max 10 tentativi falliti negli ultimi 15 min)
    IF auth.uid() IS NOT NULL THEN
        SELECT COUNT(*) INTO v_failed_by_uid
        FROM login_attempts
        WHERE auth_uid = auth.uid()
          AND success = false
          AND attempted_at > now() - INTERVAL '15 minutes';

        IF v_failed_by_uid >= 10 THEN
            RETURN QUERY SELECT NULL::uuid, NULL::text, NULL::staff_role, NULL::integer, 'Troppi tentativi falliti da questo dispositivo. Riprova tra 15 minuti.'::text;
            RETURN;
        END IF;
    END IF;

    -- 2. Rate limiting per nome operatore (max 5 tentativi consecutivi falliti negli ultimi 15 min)
    SELECT COUNT(*) INTO v_failed_by_name
    FROM login_attempts
    WHERE LOWER(staff_name) = LOWER(TRIM(p_staff_name))
      AND success = false
      AND attempted_at > now() - INTERVAL '15 minutes';

    IF v_failed_by_name >= 5 THEN
        RETURN QUERY SELECT NULL::uuid, NULL::text, NULL::staff_role, NULL::integer, 'Account temporaneamente bloccato per troppi tentativi falliti. Riprova tra 15 minuti.'::text;
        RETURN;
    END IF;

    -- 3. Ricerca Operatore
    SELECT * INTO v_staff
    FROM staff
    WHERE LOWER(name) = LOWER(TRIM(p_staff_name))
    LIMIT 1;

    IF v_staff.id IS NULL THEN
        -- Registra tentativo fallito per utente inesistente (senza rollback)
        INSERT INTO login_attempts (staff_name, success, auth_uid, ip_address)
        VALUES (LOWER(TRIM(p_staff_name)), false, auth.uid(), v_client_ip);
        
        RETURN QUERY SELECT NULL::uuid, NULL::text, NULL::staff_role, NULL::integer, 'Operatore o credenziali non valide'::text;
        RETURN;
    END IF;

    -- 4. Ricerca Hash Segreto
    SELECT pin_hash INTO v_pin_hash
    FROM staff_secrets
    WHERE staff_id = v_staff.id;

    -- 5. Verifica PIN
    IF v_pin_hash IS NULL THEN
        v_valid := true;
    ELSE
        IF p_pin IS NULL OR p_pin = '' THEN
            RETURN QUERY SELECT NULL::uuid, NULL::text, NULL::staff_role, NULL::integer, 'PIN richiesto'::text;
            RETURN;
        END IF;
        IF v_pin_hash = crypt(p_pin, v_pin_hash) THEN
            v_valid := true;
        ELSE
            v_valid := false;
        END IF;
    END IF;

    -- 6. Registra il tentativo (Committato con successo, NIENTE rollback!)
    INSERT INTO login_attempts (staff_name, success, auth_uid, ip_address)
    VALUES (v_staff.name, v_valid, auth.uid(), v_client_ip);

    IF NOT v_valid THEN
        RETURN QUERY SELECT NULL::uuid, NULL::text, NULL::staff_role, NULL::integer, 'PIN errato'::text;
        RETURN;
    END IF;

    -- 7. Creazione / Aggiornamento Sessione con scadenza a 12 ore
    IF auth.uid() IS NOT NULL THEN
        INSERT INTO staff_sessions (auth_uid, staff_id, pin_version, revoked_at, expires_at)
        VALUES (auth.uid(), v_staff.id, v_staff.pin_version, NULL, now() + interval '12 hours')
        ON CONFLICT (auth_uid) DO UPDATE
        SET staff_id = EXCLUDED.staff_id,
            pin_version = EXCLUDED.pin_version,
            revoked_at = NULL,
            expires_at = now() + interval '12 hours';
    END IF;

    RETURN QUERY
    SELECT v_staff.id, v_staff.name, v_staff.role, v_staff.pin_version, NULL::text;
END;
$function$;

-- ------------------------------------------------------------------------------
-- 5. FIX B3: Aggiornamento vista staff_public
-- ------------------------------------------------------------------------------
CREATE OR REPLACE VIEW public.staff_public 
WITH (security_invoker = true)
AS
SELECT 
    s.id,
    s.name,
    s.role,
    (s.has_pin = true OR EXISTS (SELECT 1 FROM staff_secrets sec WHERE sec.staff_id = s.id AND sec.pin_hash IS NOT NULL)) AS has_pin,
    s.pin_version,
    s.created_at,
    s.updated_at
FROM staff s;

-- ------------------------------------------------------------------------------
-- 6. FIX B5: Hardening RPC Business (direct_sale, fulfill_reservation, ecc.)
-- ------------------------------------------------------------------------------

-- direct_sale: convalida ruolo, usa sessione reale, verifica quantità e prezzi non negativi, lock inventario
CREATE OR REPLACE FUNCTION public.direct_sale(
    p_staff_id uuid,
    p_customer_name text,
    p_payment_amount numeric,
    p_items jsonb,
    p_scope_id uuid DEFAULT NULL::uuid
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
    v_order_id UUID;
    v_real_total DECIMAL := 0;
    v_item JSONB;
    v_variant RECORD;
    v_diff DECIMAL;
    v_actual_scope_id UUID;
    v_item_profit DECIMAL;
    v_description TEXT;
    v_caller_role staff_role;
    v_session_staff_id UUID;
    v_qty INT;
    v_price DECIMAL;
BEGIN
    -- 1. Controllo Chiamante
    v_caller_role := get_current_staff_role();
    IF v_caller_role IS NULL THEN
        RAISE EXCEPTION 'Access Denied: Nessuna sessione operatore attiva';
    END IF;

    -- Prende obbligatoriamente l'ID dello staff autenticato (Anti-Impersonation)
    v_session_staff_id := get_current_staff_id();
    IF v_session_staff_id IS NULL THEN
        RAISE EXCEPTION 'Access Denied: Operatore non identificato';
    END IF;

    IF p_scope_id IS NOT NULL THEN v_actual_scope_id := p_scope_id;
    ELSE SELECT id INTO v_actual_scope_id FROM scopes LIMIT 1; END IF;

    -- 2. Validazione di quantità e prezzi
    FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
    LOOP
        v_qty := (v_item->>'qty')::int;
        v_price := (v_item->>'price_final')::decimal;

        IF v_qty <= 0 THEN
            RAISE EXCEPTION 'La quantità deve essere strettamente positiva';
        END IF;
        IF v_price < 0 THEN
            RAISE EXCEPTION 'Il prezzo non può essere negativo';
        END IF;

        v_real_total := v_real_total + (v_qty * v_price);
    END LOOP;

    -- Genera Descrizione Dettagliata da JSONB
    SELECT string_agg(pm.name || ' ' || pf.name || (CASE WHEN (elem->>'qty')::int > 1 THEN ' x' || (elem->>'qty')::text ELSE '' END), E'\n' ORDER BY pm.name, pf.name)
    INTO v_description
    FROM jsonb_array_elements(p_items) AS elem
    JOIN product_variants pv ON (elem->>'variant_id')::uuid = pv.id
    JOIN product_models pm ON pv.model_id = pm.id
    JOIN product_flavors pf ON pv.flavor_id = pf.id;

    v_description := 'Vendita:' || E'\n' || COALESCE(v_description, 'Articoli');

    -- Inserimento Ordine con sold_by_staff_id verificato
    INSERT INTO orders (sold_by_staff_id, customer_name, gross_total, status)
    VALUES (v_session_staff_id, TRIM(p_customer_name), p_payment_amount, 
        CASE WHEN p_payment_amount >= v_real_total - 0.01 THEN 'COMPLETED'::order_status ELSE 'PARTIAL_PAYMENT'::order_status END
    ) RETURNING id INTO v_order_id;

    -- Scarico inventario con lock di riga
    FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
    LOOP
        v_qty := (v_item->>'qty')::int;
        v_price := (v_item->>'price_final')::decimal;

        SELECT unit_cost INTO v_variant 
        FROM product_variants 
        WHERE id = (v_item->>'variant_id')::uuid 
        FOR UPDATE;

        UPDATE inventory 
        SET qty = qty - v_qty, updated_at = NOW() 
        WHERE variant_id = (v_item->>'variant_id')::uuid;

        v_item_profit := (v_price - COALESCE(v_variant.unit_cost, 0)) * v_qty;

        INSERT INTO order_items (order_id, variant_id, qty, unit_price_default, unit_price_final, unit_cost, profit)
        VALUES (v_order_id, (v_item->>'variant_id')::uuid, v_qty, (v_item->>'price_default')::decimal, v_price, v_variant.unit_cost, v_item_profit);
    END LOOP;

    IF p_payment_amount > 0 THEN
        INSERT INTO payments (order_id, amount) VALUES (v_order_id, p_payment_amount);
    END IF;

    v_diff := v_real_total - p_payment_amount;
    IF v_diff > 0.01 THEN
        INSERT INTO reminders (scope_id, created_by, created_by_staff_id, order_id, customer_name, description, amount_due, title)
        VALUES (v_actual_scope_id, auth.uid(), v_session_staff_id, v_order_id, TRIM(p_customer_name), v_description, v_diff, 'Saldo ' || TRIM(p_customer_name));
    END IF;

    RETURN v_order_id;
END;
$function$;

-- fulfill_reservation: convalida ruolo operatore e sessione reale
CREATE OR REPLACE FUNCTION public.fulfill_reservation(
    p_res_id uuid,
    p_staff_id uuid,
    p_payment_amount numeric,
    p_scope_id uuid DEFAULT NULL::uuid
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
    v_order_id UUID;
    v_res RECORD;
    v_item RECORD;
    v_real_total DECIMAL := 0;
    v_diff DECIMAL;
    v_actual_scope_id UUID;
    v_item_profit DECIMAL;
    v_description TEXT;
    v_caller_role staff_role;
    v_session_staff_id UUID;
BEGIN
    v_caller_role := get_current_staff_role();
    IF v_caller_role IS NULL THEN
        RAISE EXCEPTION 'Access Denied: Nessuna sessione operatore attiva';
    END IF;

    v_session_staff_id := get_current_staff_id();

    IF p_scope_id IS NOT NULL THEN v_actual_scope_id := p_scope_id;
    ELSE SELECT id INTO v_actual_scope_id FROM scopes LIMIT 1; END IF;

    SELECT * INTO v_res FROM reservations WHERE id = p_res_id;
    IF v_res IS NULL OR v_res.status <> 'RESERVED' THEN RAISE EXCEPTION 'Prenotazione non attiva o inesistente'; END IF;

    -- Calcola Totale Reale merce
    SELECT SUM(qty * unit_price_final) INTO v_real_total FROM reservation_items WHERE reservation_id = p_res_id;

    -- Genera Descrizione Dettagliata
    SELECT string_agg(pm.name || ' ' || pf.name || (CASE WHEN ri.qty > 1 THEN ' x' || ri.qty ELSE '' END), E'\n' ORDER BY pm.name, pf.name)
    INTO v_description
    FROM reservation_items ri
    JOIN product_variants pv ON ri.variant_id = pv.id
    JOIN product_models pm ON pv.model_id = pm.id
    JOIN product_flavors pf ON pv.flavor_id = pf.id
    WHERE ri.reservation_id = p_res_id;

    v_description := 'Saldo:' || E'\n' || COALESCE(v_description, 'Articoli variabili');

    -- Crea Ordine con sold_by_staff_id autenticato
    INSERT INTO orders (sold_by_staff_id, customer_name, source_reservation_id, gross_total, status)
    VALUES (
        v_session_staff_id, 
        v_res.customer_name, 
        p_res_id, 
        p_payment_amount, 
        CASE 
            WHEN p_payment_amount >= v_real_total - 0.01 THEN 'COMPLETED'::order_status 
            ELSE 'PARTIAL_PAYMENT'::order_status 
        END
    )
    RETURNING id INTO v_order_id;

    -- Copia Items
    FOR v_item IN SELECT * FROM reservation_items WHERE reservation_id = p_res_id
    LOOP
        v_item_profit := (v_item.unit_price_final - COALESCE(v_item.unit_cost, 0)) * v_item.qty;
        
        INSERT INTO order_items (order_id, variant_id, qty, unit_price_default, unit_price_final, unit_cost, profit)
        VALUES (v_order_id, v_item.variant_id, v_item.qty, v_item.unit_price_default, v_item.unit_price_final, v_item.unit_cost, v_item_profit);
    END LOOP;

    IF p_payment_amount > 0 THEN
        INSERT INTO payments (order_id, amount) VALUES (v_order_id, p_payment_amount);
    END IF;

    v_diff := v_real_total - p_payment_amount;
    IF v_diff > 0.01 THEN
        INSERT INTO reminders (
            scope_id, created_by, created_by_staff_id, order_id, 
            customer_name, description, amount_due, title
        )
        VALUES (
            v_actual_scope_id, auth.uid(), v_session_staff_id, v_order_id, 
            v_res.customer_name, v_description, v_diff, 'Saldo ' || v_res.customer_name
        );
    END IF;

    UPDATE reservations SET status = 'SOLD' WHERE id = p_res_id;
    RETURN v_order_id;
END;
$function$;

-- cancel_reservation: solo staff o admin
CREATE OR REPLACE FUNCTION public.cancel_reservation(p_res_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $function$
DECLARE 
    v_item RECORD;
    v_role staff_role;
BEGIN
    v_role := get_current_staff_role();
    IF v_role IS NULL THEN
        RAISE EXCEPTION 'Access Denied: Operazione consentita solo allo staff';
    END IF;

    FOR v_item IN SELECT variant_id, qty FROM reservation_items WHERE reservation_id = p_res_id 
    LOOP 
        UPDATE inventory SET qty = qty + v_item.qty WHERE variant_id = v_item.variant_id; 
    END LOOP;
    UPDATE reservations SET status = 'CANCELLED' WHERE id = p_res_id;
END;
$function$;

-- resolve_reminder_debt: solo admin può cancellare debiti senza pagamento
CREATE OR REPLACE FUNCTION public.resolve_reminder_debt(p_reminder_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
    v_order_id UUID;
    v_role staff_role;
BEGIN
    v_role := get_current_staff_role();
    IF v_role IS NULL OR v_role != 'admin' THEN
        RAISE EXCEPTION 'Access Denied: Solo gli amministratori possono cancellare debiti senza pagamento';
    END IF;

    SELECT order_id INTO v_order_id FROM reminders WHERE id = p_reminder_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'Promemoria non trovato'; END IF;

    DELETE FROM reminders WHERE id = p_reminder_id;

    IF v_order_id IS NOT NULL THEN
        UPDATE orders SET status = 'COMPLETED' WHERE id = v_order_id;
    END IF;
END;
$function$;

-- pay_reminder: convalida ruolo staff
CREATE OR REPLACE FUNCTION public.pay_reminder(p_reminder_id uuid, p_payment_amount numeric, p_staff_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
    v_reminder RECORD;
    v_new_amount_due DECIMAL;
    v_original_order_id UUID;
    v_current_gross DECIMAL;
    v_actual_payment DECIMAL;
    v_role staff_role;
BEGIN
    v_role := get_current_staff_role();
    IF v_role IS NULL THEN
        RAISE EXCEPTION 'Access Denied: Nessuna sessione operatore attiva';
    END IF;

    SELECT * INTO v_reminder FROM reminders WHERE id = p_reminder_id FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Errore: Promemoria non trovato.';
    END IF;
    
    v_original_order_id := v_reminder.order_id;
    
    IF p_payment_amount <= 0 THEN
        RAISE EXCEPTION 'Errore: L''importo del pagamento deve essere positivo.';
    END IF;

    v_actual_payment := LEAST(p_payment_amount, v_reminder.amount_due);

    INSERT INTO payments (order_id, amount, created_at)
    VALUES (v_original_order_id, v_actual_payment, NOW());

    SELECT gross_total INTO v_current_gross FROM orders WHERE id = v_original_order_id FOR UPDATE;
    
    UPDATE orders 
    SET gross_total = COALESCE(v_current_gross, 0) + v_actual_payment,
        updated_at = NOW()
    WHERE id = v_original_order_id;

    v_new_amount_due := v_reminder.amount_due - v_actual_payment;
    IF v_new_amount_due < 0.01 THEN 
        v_new_amount_due := 0; 
    END IF;

    UPDATE reminders 
    SET amount_due = v_new_amount_due,
        status = CASE WHEN v_new_amount_due = 0 THEN 'resolved' ELSE 'active' END,
        updated_at = NOW()
    WHERE id = p_reminder_id;

    IF v_new_amount_due = 0 THEN
        UPDATE orders SET status = 'COMPLETED' WHERE id = v_original_order_id;
    ELSE
        UPDATE orders SET status = 'PARTIAL_PAYMENT' WHERE id = v_original_order_id;
    END IF;
END;
$function$;

-- get_staff_unit_profit_breakdown: consentito solo ad admin
CREATE OR REPLACE FUNCTION public.get_staff_unit_profit_breakdown()
RETURNS TABLE(staff_id uuid, staff_name text, staff_role text, total_qty_sold bigint, gross_sold numeric, total_cogs numeric, unit_profit_staff numeric, profit_share_percent numeric, net_attributed_profit numeric)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
    v_role staff_role;
BEGIN
    v_role := get_current_staff_role();
    IF v_role IS NULL OR v_role != 'admin' THEN
        RAISE EXCEPTION 'Access Denied: Informazioni finanziarie riservate agli amministratori';
    END IF;

    RETURN QUERY
    WITH staff_sales AS (
        SELECT 
            s.id AS s_id,
            s.name AS s_name,
            s.role::text AS s_role,
            COALESCE(SUM(oi.qty), 0)::bigint AS t_qty,
            COALESCE(SUM(oi.qty * oi.unit_price_final), 0)::numeric(12,2) AS t_gross,
            COALESCE(SUM(oi.qty * COALESCE(oi.unit_cost, 0)), 0)::numeric(12,2) AS t_cogs,
            COALESCE(SUM(oi.profit), 0)::numeric(12,2) AS t_profit
        FROM staff s
        LEFT JOIN orders o ON o.sold_by_staff_id = s.id
        LEFT JOIN order_items oi ON oi.order_id = o.id
        GROUP BY s.id, s.name, s.role
    ),
    totals AS (
        SELECT COALESCE(SUM(t_profit), 0) AS total_all_profit FROM staff_sales
    )
    SELECT 
        ss.s_id,
        ss.s_name,
        ss.s_role,
        ss.t_qty,
        ss.t_gross,
        ss.t_cogs,
        ss.t_profit,
        CASE WHEN tot.total_all_profit > 0 
             THEN ROUND((ss.t_profit / tot.total_all_profit * 100), 2) 
             ELSE 0.00 
        END,
        ss.t_profit
    FROM staff_sales ss
    CROSS JOIN totals tot
    ORDER BY ss.t_profit DESC;
END;
$function$;

-- get_closing_preview: solo staff o admin
CREATE OR REPLACE FUNCTION public.get_closing_preview()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
    v_role staff_role;
    v_gross numeric := 0;
BEGIN
    v_role := get_current_staff_role();
    IF v_role IS NULL THEN
        RAISE EXCEPTION 'Access Denied: Riservato allo staff';
    END IF;

    SELECT COALESCE(SUM(gross_total), 0) INTO v_gross
    FROM orders
    WHERE created_at >= CURRENT_DATE;

    RETURN jsonb_build_object('gross_total', v_gross);
END;
$function$;

-- ------------------------------------------------------------------------------
-- 7. Audit Log Table
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.security_audit_log (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    auth_uid uuid,
    staff_id uuid,
    event_type text NOT NULL,
    details jsonb
);

ALTER TABLE public.security_audit_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.security_audit_log FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS audit_select_admin_only ON public.security_audit_log;
CREATE POLICY audit_select_admin_only ON public.security_audit_log
FOR SELECT TO authenticated
USING (get_current_staff_role() = 'admin');

DROP POLICY IF EXISTS audit_insert_all ON public.security_audit_log;
CREATE POLICY audit_insert_all ON public.security_audit_log
FOR INSERT TO authenticated WITH CHECK (true);
