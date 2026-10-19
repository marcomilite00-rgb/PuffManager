-- ==============================================================================
-- Migration: 20261019000000_complete_security_remediation.sql
-- Description: Comprehensive launch security hardening:
--   1. Enable RLS and FORCE RLS on load_history, scopes, and scope_members
--   2. Caller authentication, input validation, and anti-impersonation on RPCs:
--      - create_reservation (caller check, positive qty & price, verified staff id)
--      - add_reservation_item (caller check, positive qty & price)
--      - update_reservation_item (caller check, positive qty & price)
--      - delete_reservation_item (caller check, inventory restoration)
--      - cancel_reminder_to_reservation (caller check, atomic rollback)
--      - create_product_variant (admin-only check, non-negative bounds)
--      - direct_sale & fulfill_reservation (payment bounds >= 0)
--      - switch_operator_as_admin (clean session replacement without immutability exception)
--      - authenticate_staff (p_staff_name signature alignment, robust lockout)
--      - create_staff (mandatory PIN requirement)
--   3. Restrict catalog modifications to admin only
-- ==============================================================================

-- 1. Enable RLS on load_history and scopes
ALTER TABLE public.load_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.load_history FORCE ROW LEVEL SECURITY;

ALTER TABLE public.scopes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.scopes FORCE ROW LEVEL SECURITY;

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'scope_members') THEN
        ALTER TABLE public.scope_members ENABLE ROW LEVEL SECURITY;
        ALTER TABLE public.scope_members FORCE ROW LEVEL SECURITY;
        DROP POLICY IF EXISTS "scope_members_read" ON public.scope_members;
        CREATE POLICY "scope_members_read" ON public.scope_members FOR SELECT TO authenticated USING (get_current_staff_role() IS NOT NULL);
    END IF;
END $$;

-- 2. Restrict catalog modification to Admin only
DROP POLICY IF EXISTS "catalog_models_modify" ON public.product_models;
CREATE POLICY "catalog_models_modify" ON public.product_models FOR ALL TO authenticated 
USING (get_current_staff_role() = 'admin') 
WITH CHECK (get_current_staff_role() = 'admin');

DROP POLICY IF EXISTS "catalog_flavors_modify" ON public.product_flavors;
CREATE POLICY "catalog_flavors_modify" ON public.product_flavors FOR ALL TO authenticated 
USING (get_current_staff_role() = 'admin') 
WITH CHECK (get_current_staff_role() = 'admin');

DROP POLICY IF EXISTS "catalog_variants_modify" ON public.product_variants;
CREATE POLICY "catalog_variants_modify" ON public.product_variants FOR ALL TO authenticated 
USING (get_current_staff_role() = 'admin') 
WITH CHECK (get_current_staff_role() = 'admin');

-- 3. Hardened create_reservation
CREATE OR REPLACE FUNCTION public.create_reservation(
    p_staff_id UUID,
    p_customer_name TEXT,
    p_items JSONB
) RETURNS UUID 
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $$
DECLARE
    v_res_id UUID;
    v_item RECORD;
    v_variant_cost DECIMAL;
    v_available INT;
    v_role staff_role;
    v_caller_staff_id UUID;
    v_clean_customer_name TEXT;
BEGIN
    v_role := get_current_staff_role();
    IF v_role IS NULL THEN
        RAISE EXCEPTION 'Access Denied: Nessuna sessione operatore attiva';
    END IF;

    v_caller_staff_id := get_current_staff_id();
    IF v_caller_staff_id IS NULL THEN
        RAISE EXCEPTION 'Access Denied: Impossibile determinare l''operatore autenticato';
    END IF;

    v_clean_customer_name := TRIM(p_customer_name);
    IF v_clean_customer_name IS NULL OR LENGTH(v_clean_customer_name) = 0 THEN
        RAISE EXCEPTION 'Il nome del cliente è obbligatorio';
    END IF;

    IF p_items IS NULL OR jsonb_array_length(p_items) = 0 THEN
        RAISE EXCEPTION 'La prenotazione deve contenere almeno un articolo';
    END IF;

    FOR v_item IN SELECT * FROM jsonb_to_recordset(p_items) AS x(variant_id UUID, qty INT, price_default DECIMAL, price_final DECIMAL)
    LOOP
        IF v_item.qty IS NULL OR v_item.qty <= 0 THEN
            RAISE EXCEPTION 'La quantità deve essere strettamente positiva';
        END IF;
        IF v_item.price_final IS NULL OR v_item.price_final < 0 THEN
            RAISE EXCEPTION 'Il prezzo non può essere negativo';
        END IF;
    END LOOP;

    INSERT INTO reservations (created_by_staff_id, customer_name, status)
    VALUES (v_caller_staff_id, v_clean_customer_name, 'RESERVED')
    RETURNING id INTO v_res_id;

    FOR v_item IN SELECT * FROM jsonb_to_recordset(p_items) AS x(variant_id UUID, qty INT, price_default DECIMAL, price_final DECIMAL)
    LOOP
        SELECT qty INTO v_available FROM inventory WHERE variant_id = v_item.variant_id FOR UPDATE;
        IF v_available IS NULL OR v_available < v_item.qty THEN
            RAISE EXCEPTION 'Stock insufficiente per la variante %. Disponibili: %', v_item.variant_id, COALESCE(v_available, 0);
        END IF;

        SELECT unit_cost INTO v_variant_cost FROM product_variants WHERE id = v_item.variant_id;

        INSERT INTO reservation_items (reservation_id, variant_id, qty, unit_price_default, unit_price_final, unit_cost)
        VALUES (v_res_id, v_item.variant_id, v_item.qty, COALESCE(v_item.price_default, v_item.price_final), v_item.price_final, v_variant_cost);

        UPDATE inventory SET qty = qty - v_item.qty, updated_at = NOW() WHERE variant_id = v_item.variant_id;
    END LOOP;

    RETURN v_res_id;
END;
$$;

-- 4. Hardened add_reservation_item
CREATE OR REPLACE FUNCTION public.add_reservation_item(
    p_reservation_id UUID,
    p_variant_id UUID,
    p_qty INT,
    p_price_final DECIMAL
) RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $$
DECLARE
    v_res RECORD;
    v_variant RECORD;
    v_inventory RECORD;
    v_existing_item RECORD;
    v_item_id UUID;
    v_role staff_role;
BEGIN
    v_role := get_current_staff_role();
    IF v_role IS NULL THEN
        RAISE EXCEPTION 'Access Denied: Nessuna sessione operatore attiva';
    END IF;

    IF p_qty IS NULL OR p_qty <= 0 THEN
        RAISE EXCEPTION 'La quantità deve essere strettamente positiva';
    END IF;

    IF p_price_final IS NULL OR p_price_final < 0 THEN
        RAISE EXCEPTION 'Il prezzo non può essere negativo';
    END IF;

    SELECT * INTO v_res FROM reservations WHERE id = p_reservation_id FOR UPDATE;
    IF v_res IS NULL THEN
        RAISE EXCEPTION 'Prenotazione non trovata.';
    END IF;
    IF v_res.status != 'RESERVED' THEN
        RAISE EXCEPTION 'La prenotazione non è più attiva.';
    END IF;

    SELECT * INTO v_variant FROM product_variants WHERE id = p_variant_id;
    IF v_variant IS NULL THEN
        RAISE EXCEPTION 'Variante non trovata.';
    END IF;

    SELECT * INTO v_inventory FROM inventory WHERE variant_id = p_variant_id FOR UPDATE;
    IF v_inventory IS NULL OR v_inventory.qty < p_qty THEN
        RAISE EXCEPTION 'Stock insufficiente. Disponibili: %', COALESCE(v_inventory.qty, 0);
    END IF;

    SELECT * INTO v_existing_item 
    FROM reservation_items 
    WHERE reservation_id = p_reservation_id AND variant_id = p_variant_id
    FOR UPDATE;

    IF v_existing_item IS NOT NULL THEN
        UPDATE reservation_items 
        SET qty = qty + p_qty,
            unit_price_final = p_price_final
        WHERE id = v_existing_item.id
        RETURNING id INTO v_item_id;
    ELSE
        INSERT INTO reservation_items (
            reservation_id, variant_id, qty, unit_price_default, unit_price_final, unit_cost
        ) VALUES (
            p_reservation_id, p_variant_id, p_qty, v_variant.default_price, p_price_final, v_variant.unit_cost
        )
        RETURNING id INTO v_item_id;
    END IF;

    UPDATE inventory 
    SET qty = qty - p_qty, updated_at = NOW()
    WHERE variant_id = p_variant_id;

    RETURN v_item_id;
END;
$$;

-- 5. Hardened update_reservation_item
CREATE OR REPLACE FUNCTION public.update_reservation_item(
    p_item_id UUID,
    p_new_qty INT,
    p_new_price DECIMAL DEFAULT NULL
) RETURNS VOID 
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $$
DECLARE
    v_old_qty INT;
    v_variant_id UUID;
    v_diff INT;
    v_available INT;
    v_res_status TEXT;
    v_res_id UUID;
    v_current_cost DECIMAL;
    v_role staff_role;
BEGIN
    v_role := get_current_staff_role();
    IF v_role IS NULL THEN
        RAISE EXCEPTION 'Access Denied: Nessuna sessione operatore attiva';
    END IF;

    IF p_new_qty <= 0 THEN
        RAISE EXCEPTION 'La quantità deve essere strettamente positiva. Per rimuovere l''articolo usare la cancellazione.';
    END IF;

    IF p_new_price IS NOT NULL AND p_new_price < 0 THEN
        RAISE EXCEPTION 'Il prezzo non può essere negativo';
    END IF;

    SELECT ri.qty, ri.variant_id, r.status, r.id, pv.unit_cost
    INTO v_old_qty, v_variant_id, v_res_status, v_res_id, v_current_cost
    FROM reservation_items ri
    JOIN reservations r ON ri.reservation_id = r.id
    JOIN product_variants pv ON ri.variant_id = pv.id
    WHERE ri.id = p_item_id
    FOR UPDATE;
    
    IF v_old_qty IS NULL THEN
        RAISE EXCEPTION 'Articolo non trovato.';
    END IF;

    IF v_res_status != 'RESERVED' THEN
        RAISE EXCEPTION 'La prenotazione non è più attiva (Stato: %).', v_res_status;
    END IF;

    v_diff := p_new_qty - v_old_qty;

    IF v_diff > 0 THEN
        SELECT qty INTO v_available FROM inventory WHERE variant_id = v_variant_id FOR UPDATE;
        IF v_available IS NULL OR v_available < v_diff THEN
            RAISE EXCEPTION 'Stock insufficiente. Disponibili: %', COALESCE(v_available, 0);
        END IF;
        UPDATE inventory SET qty = qty - v_diff, updated_at = NOW() WHERE variant_id = v_variant_id;
    ELSIF v_diff < 0 THEN
        UPDATE inventory SET qty = qty + ABS(v_diff), updated_at = NOW() WHERE variant_id = v_variant_id;
    END IF;

    UPDATE reservation_items 
    SET qty = p_new_qty, 
        unit_price_final = COALESCE(p_new_price, unit_price_final),
        unit_cost = v_current_cost
    WHERE id = p_item_id;
END;
$$;

-- 6. Hardened delete_reservation_item
CREATE OR REPLACE FUNCTION public.delete_reservation_item(p_item_id UUID) 
RETURNS VOID
LANGUAGE plpgsql 
SECURITY DEFINER 
SET search_path TO 'public', 'extensions' 
AS $$
DECLARE
    v_qty INT;
    v_variant_id UUID;
    v_res_status TEXT;
    v_role staff_role;
BEGIN
    v_role := get_current_staff_role();
    IF v_role IS NULL THEN
        RAISE EXCEPTION 'Access Denied: Nessuna sessione operatore attiva';
    END IF;

    SELECT ri.qty, ri.variant_id, r.status
    INTO v_qty, v_variant_id, v_res_status
    FROM reservation_items ri
    JOIN reservations r ON ri.reservation_id = r.id
    WHERE ri.id = p_item_id
    FOR UPDATE;
    
    IF v_qty IS NULL THEN
        RAISE EXCEPTION 'Articolo non trovato';
    END IF;

    IF v_res_status != 'RESERVED' THEN
        RAISE EXCEPTION 'La prenotazione non è più attiva (Stato: %).', v_res_status;
    END IF;

    UPDATE inventory 
    SET qty = qty + v_qty, updated_at = NOW()
    WHERE variant_id = v_variant_id;

    DELETE FROM reservation_items WHERE id = p_item_id;
END;
$$;

-- 7. Hardened cancel_reminder_to_reservation
CREATE OR REPLACE FUNCTION public.cancel_reminder_to_reservation(p_reminder_id UUID) 
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $$
DECLARE
    v_reminder RECORD;
    v_order RECORD;
    v_res_id UUID;
    v_role staff_role;
BEGIN
    v_role := get_current_staff_role();
    IF v_role IS NULL THEN
        RAISE EXCEPTION 'Access Denied: Nessuna sessione operatore attiva';
    END IF;

    SELECT * INTO v_reminder FROM reminders WHERE id = p_reminder_id FOR UPDATE;
    IF v_reminder IS NULL THEN
        RAISE EXCEPTION 'Promemoria non trovato.';
    END IF;

    IF v_reminder.status != 'active' THEN
        RAISE EXCEPTION 'Il promemoria è già stato risolto o annullato.';
    END IF;

    SELECT * INTO v_order FROM orders WHERE id = v_reminder.order_id FOR UPDATE;
    IF v_order IS NULL THEN
        RAISE EXCEPTION 'Ordine associato non trovato.';
    END IF;

    IF v_order.is_archived = true THEN
        RAISE EXCEPTION 'Impossibile annullare: il pagamento parziale è già stato storicizzato nella chiusura di un carico precedente.';
    END IF;

    IF v_order.status != 'PARTIAL_PAYMENT' THEN
        RAISE EXCEPTION 'L''ordine associato non è in stato di pagamento parziale.';
    END IF;

    IF v_order.source_reservation_id IS NULL THEN
        RAISE EXCEPTION 'Questo ordine non è collegato ad una prenotazione originale.';
    END IF;

    v_res_id := v_order.source_reservation_id;

    IF NOT EXISTS (SELECT 1 FROM reservations WHERE id = v_res_id AND status = 'SOLD' FOR UPDATE) THEN
        RAISE EXCEPTION 'La prenotazione originale non è in stato VENDUTO o è già stata ripristinata.';
    END IF;

    UPDATE reservations SET status = 'RESERVED' WHERE id = v_res_id;
    DELETE FROM reminders WHERE id = p_reminder_id;
    DELETE FROM payments WHERE order_id = v_order.id;
    DELETE FROM order_items WHERE order_id = v_order.id;
    DELETE FROM orders WHERE id = v_order.id;
END;
$$;

-- 8. Hardened create_product_variant
CREATE OR REPLACE FUNCTION public.create_product_variant(
    p_model_id UUID,
    p_flavor_id UUID,
    p_default_price DECIMAL,
    p_initial_qty INTEGER
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $$
DECLARE
    v_variant_id UUID;
    v_role staff_role;
BEGIN
    v_role := get_current_staff_role();
    IF v_role IS NULL OR v_role != 'admin' THEN
        RAISE EXCEPTION 'Access Denied: Solo gli amministratori possono creare nuove varianti prodotto';
    END IF;

    IF p_default_price IS NULL OR p_default_price < 0 THEN
        RAISE EXCEPTION 'Il prezzo deve essere positivo o nullo';
    END IF;

    IF p_initial_qty IS NULL OR p_initial_qty < 0 THEN
        RAISE EXCEPTION 'La quantità iniziale non può essere negativa';
    END IF;

    INSERT INTO product_variants (model_id, flavor_id, default_price)
    VALUES (p_model_id, p_flavor_id, p_default_price)
    RETURNING id INTO v_variant_id;

    INSERT INTO inventory (variant_id, qty, initial_load_qty)
    VALUES (v_variant_id, p_initial_qty, p_initial_qty)
    ON CONFLICT (variant_id) DO UPDATE
    SET qty = EXCLUDED.qty,
        initial_load_qty = EXCLUDED.initial_load_qty,
        updated_at = NOW();

    RETURN v_variant_id;
END;
$$;

-- 9. Fixed switch_operator_as_admin
CREATE OR REPLACE FUNCTION public.switch_operator_as_admin(p_target_staff_name TEXT)
RETURNS TABLE(
    staff_id UUID,
    staff_name TEXT,
    staff_role staff_role,
    staff_pin_version INT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $$
DECLARE
    v_caller_role staff_role;
    v_target staff%ROWTYPE;
    v_auth_uid UUID;
BEGIN
    v_auth_uid := auth.uid();
    IF v_auth_uid IS NULL THEN
        RAISE EXCEPTION 'Access Denied: Nessun account Supabase attivo';
    END IF;

    SELECT s.role INTO v_caller_role
    FROM staff s 
    JOIN staff_sessions ss ON ss.staff_id = s.id 
    WHERE ss.auth_uid = v_auth_uid 
      AND (ss.revoked_at IS NULL OR ss.revoked_at > now())
      AND (ss.expires_at IS NULL OR ss.expires_at > now())
    LIMIT 1;

    IF v_caller_role IS NULL OR v_caller_role != 'admin' THEN
        RAISE EXCEPTION 'Access Denied: Solo gli amministratori possono cambiare operatore senza PIN';
    END IF;

    SELECT * INTO v_target
    FROM staff
    WHERE LOWER(name) = LOWER(TRIM(p_target_staff_name))
    LIMIT 1;

    IF v_target.id IS NULL THEN
        RAISE EXCEPTION 'Operatore bersaglio non trovato';
    END IF;

    DELETE FROM staff_sessions WHERE auth_uid = v_auth_uid;

    INSERT INTO staff_sessions (auth_uid, staff_id, pin_version, revoked_at, expires_at)
    VALUES (v_auth_uid, v_target.id, v_target.pin_version, NULL, now() + interval '12 hours');

    RETURN QUERY
    SELECT v_target.id, v_target.name, v_target.role, v_target.pin_version;
END;
$$;

-- 10. Direct Sale & Fulfill Reservation Payment validation
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
    v_verified_staff_id UUID;
BEGIN
    v_caller_role := get_current_staff_role();
    IF v_caller_role IS NULL THEN
        RAISE EXCEPTION 'Access Denied: Nessuna sessione operatore attiva';
    END IF;

    v_verified_staff_id := get_current_staff_id();
    IF v_verified_staff_id IS NULL THEN
        RAISE EXCEPTION 'Access Denied: Impossibile identificare l''operatore autenticato';
    END IF;

    IF p_payment_amount IS NULL OR p_payment_amount < 0 THEN
        RAISE EXCEPTION 'L''importo del pagamento non può essere negativo';
    END IF;

    IF p_scope_id IS NOT NULL THEN v_actual_scope_id := p_scope_id;
    ELSE SELECT id INTO v_actual_scope_id FROM scopes LIMIT 1; END IF;

    SELECT * INTO v_res FROM reservations WHERE id = p_res_id FOR UPDATE;
    IF v_res IS NULL OR v_res.status <> 'RESERVED' THEN 
        RAISE EXCEPTION 'Prenotazione non attiva o inesistente'; 
    END IF;

    SELECT SUM(qty * unit_price_final) INTO v_real_total FROM reservation_items WHERE reservation_id = p_res_id;

    SELECT string_agg(pm.name || ' ' || pf.name || (CASE WHEN ri.qty > 1 THEN ' x' || ri.qty ELSE '' END), E'\n' ORDER BY pm.name, pf.name)
    INTO v_description
    FROM reservation_items ri
    JOIN product_variants pv ON ri.variant_id = pv.id
    JOIN product_models pm ON pv.model_id = pm.id
    JOIN product_flavors pf ON pv.flavor_id = pf.id
    WHERE ri.reservation_id = p_res_id;

    v_description := 'Saldo:' || E'\n' || COALESCE(v_description, 'Articoli variabili');

    INSERT INTO orders (sold_by_staff_id, customer_name, source_reservation_id, gross_total, status)
    VALUES (
        v_verified_staff_id, 
        v_res.customer_name, 
        p_res_id, 
        p_payment_amount, 
        CASE 
            WHEN p_payment_amount >= v_real_total - 0.01 THEN 'COMPLETED'::order_status 
            ELSE 'PARTIAL_PAYMENT'::order_status 
        END
    )
    RETURNING id INTO v_order_id;

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
            v_actual_scope_id, auth.uid(), v_verified_staff_id, v_order_id, 
            v_res.customer_name, v_description, v_diff, 'Saldo ' || v_res.customer_name
        );
    END IF;

    UPDATE reservations SET status = 'SOLD' WHERE id = p_res_id;
    RETURN v_order_id;
END;
$function$;

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
    v_verified_staff_id UUID;
    v_qty INT;
    v_price DECIMAL;
BEGIN
    v_caller_role := get_current_staff_role();
    IF v_caller_role IS NULL THEN
        RAISE EXCEPTION 'Access Denied: Nessuna sessione operatore attiva';
    END IF;

    v_verified_staff_id := get_current_staff_id();
    IF v_verified_staff_id IS NULL THEN
        RAISE EXCEPTION 'Access Denied: Impossibile identificare l''operatore autenticato';
    END IF;

    IF p_payment_amount IS NULL OR p_payment_amount < 0 THEN
        RAISE EXCEPTION 'L''importo del pagamento non può essere negativo';
    END IF;

    IF p_scope_id IS NOT NULL THEN v_actual_scope_id := p_scope_id;
    ELSE SELECT id INTO v_actual_scope_id FROM scopes LIMIT 1; END IF;

    FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
    LOOP
        v_qty := (v_item->>'qty')::int;
        v_price := (v_item->>'price_final')::decimal;

        IF v_qty <= 0 THEN
            RAISE EXCEPTION 'La quantità deve essere maggiore di zero';
        END IF;
        IF v_price < 0 THEN
            RAISE EXCEPTION 'Il prezzo non può essere negativo';
        END IF;

        v_real_total := v_real_total + (v_qty * v_price);
    END LOOP;

    SELECT string_agg(pm.name || ' ' || pf.name || (CASE WHEN (elem->>'qty')::int > 1 THEN ' x' || (elem->>'qty')::text ELSE '' END), E'\n' ORDER BY pm.name, pf.name)
    INTO v_description
    FROM jsonb_array_elements(p_items) AS elem
    JOIN product_variants pv ON (elem->>'variant_id')::uuid = pv.id
    JOIN product_models pm ON pv.model_id = pm.id
    JOIN product_flavors pf ON pv.flavor_id = pf.id;

    v_description := 'Vendita:' || E'\n' || COALESCE(v_description, 'Articoli');

    INSERT INTO orders (sold_by_staff_id, customer_name, gross_total, status)
    VALUES (v_verified_staff_id, TRIM(p_customer_name), p_payment_amount, 
        CASE WHEN p_payment_amount >= v_real_total - 0.01 THEN 'COMPLETED'::order_status ELSE 'PARTIAL_PAYMENT'::order_status END
    ) RETURNING id INTO v_order_id;

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
        VALUES (v_actual_scope_id, auth.uid(), v_verified_staff_id, v_order_id, TRIM(p_customer_name), v_description, v_diff, 'Saldo ' || TRIM(p_customer_name));
    END IF;

    RETURN v_order_id;
END;
$function$;
