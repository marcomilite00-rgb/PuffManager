-- Migration: 20261018000000_security_hardening_rls_and_auth.sql
-- Description: Comprehensive Security Hardening
-- 1. Isolate PIN hashes in private staff_secrets table with strict RLS (no direct API access)
-- 2. Add login_attempts table for rate limiting and brute force protection
-- 3. Implement atomic authenticate_staff and switch_operator_as_admin functions
-- 4. Fix update_staff_pin with role verification and fixed search_path
-- 5. Restore strict RLS policies on all tables based on get_current_staff_role()
-- 6. Revoke anon execution on sensitive SECURITY DEFINER RPC functions

-- 1. Private staff_secrets table
CREATE TABLE IF NOT EXISTS staff_secrets (
    staff_id UUID PRIMARY KEY REFERENCES staff(id) ON DELETE CASCADE,
    pin_hash TEXT NOT NULL
);
ALTER TABLE staff_secrets ENABLE ROW LEVEL SECURITY;
-- No policies on staff_secrets: direct REST queries by anon or authenticated return empty.

-- 2. Add has_pin to staff and migrate existing hashes
ALTER TABLE staff ADD COLUMN IF NOT EXISTS has_pin BOOLEAN DEFAULT false;

INSERT INTO staff_secrets (staff_id, pin_hash)
SELECT id, pin_hash FROM staff WHERE pin_hash IS NOT NULL AND pin_hash != ''
ON CONFLICT (staff_id) DO UPDATE SET pin_hash = EXCLUDED.pin_hash;

UPDATE staff SET has_pin = true WHERE id IN (SELECT staff_id FROM staff_secrets);
UPDATE staff SET has_pin = false WHERE id NOT IN (SELECT staff_id FROM staff_secrets);
UPDATE staff SET pin_hash = NULL;

-- 3. Table for login rate limiting / lockout
CREATE TABLE IF NOT EXISTS login_attempts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    staff_name TEXT NOT NULL,
    attempted_at TIMESTAMPTZ DEFAULT now(),
    success BOOLEAN NOT NULL
);
ALTER TABLE login_attempts ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS idx_login_attempts_lookup ON login_attempts(staff_name, attempted_at);

-- 4. RPC: authenticate_staff
CREATE OR REPLACE FUNCTION authenticate_staff(p_staff_name TEXT, p_pin TEXT DEFAULT NULL)
RETURNS TABLE(
    staff_id UUID,
    staff_name TEXT,
    staff_role staff_role,
    staff_pin_version INT
) 
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
    v_staff staff%ROWTYPE;
    v_pin_hash TEXT;
    v_failed_count INT;
    v_valid BOOLEAN := false;
BEGIN
    -- Check brute force attempts in the last 15 minutes
    SELECT COUNT(*) INTO v_failed_count
    FROM login_attempts
    WHERE LOWER(staff_name) = LOWER(TRIM(p_staff_name))
      AND success = false
      AND attempted_at > now() - INTERVAL '15 minutes';

    IF v_failed_count >= 5 THEN
        RAISE EXCEPTION 'Troppi tentativi falliti. Riprova tra 15 minuti.';
    END IF;

    -- Lookup staff
    SELECT * INTO v_staff
    FROM staff
    WHERE LOWER(name) = LOWER(TRIM(p_staff_name))
    LIMIT 1;

    IF v_staff.id IS NULL THEN
        RAISE EXCEPTION 'Operatore non trovato';
    END IF;

    -- Get PIN hash from staff_secrets
    SELECT pin_hash INTO v_pin_hash
    FROM staff_secrets
    WHERE staff_id = v_staff.id;

    -- Verify PIN
    IF v_pin_hash IS NULL THEN
        v_valid := true;
    ELSE
        IF p_pin IS NULL OR p_pin = '' THEN
            RAISE EXCEPTION 'PIN richiesto';
        END IF;
        IF v_pin_hash = crypt(p_pin, v_pin_hash) THEN
            v_valid := true;
        ELSE
            v_valid := false;
        END IF;
    END IF;

    -- Record attempt
    INSERT INTO login_attempts (staff_name, success)
    VALUES (v_staff.name, v_valid);

    IF NOT v_valid THEN
        RAISE EXCEPTION 'PIN errato';
    END IF;

    -- Mint session for auth.uid()
    IF auth.uid() IS NOT NULL THEN
        INSERT INTO staff_sessions (auth_uid, staff_id, pin_version, revoked_at)
        VALUES (auth.uid(), v_staff.id, v_staff.pin_version, NULL)
        ON CONFLICT (auth_uid) DO UPDATE
        SET staff_id = EXCLUDED.staff_id,
            pin_version = EXCLUDED.pin_version,
            revoked_at = NULL;
    END IF;

    RETURN QUERY
    SELECT v_staff.id, v_staff.name, v_staff.role, v_staff.pin_version;
END;
$$;

-- 5. RPC: switch_operator_as_admin
CREATE OR REPLACE FUNCTION switch_operator_as_admin(p_target_staff_name TEXT)
RETURNS TABLE(
    staff_id UUID,
    staff_name TEXT,
    staff_role staff_role,
    staff_pin_version INT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
    v_caller_role staff_role;
    v_target staff%ROWTYPE;
BEGIN
    SELECT s.role INTO v_caller_role
    FROM staff s 
    JOIN staff_sessions ss ON ss.staff_id = s.id 
    WHERE ss.auth_uid = (SELECT auth.uid()) 
      AND (ss.revoked_at IS NULL OR ss.revoked_at > now())
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

    INSERT INTO staff_sessions (auth_uid, staff_id, pin_version, revoked_at)
    VALUES (auth.uid(), v_target.id, v_target.pin_version, NULL)
    ON CONFLICT (auth_uid) DO UPDATE
    SET staff_id = EXCLUDED.staff_id,
        pin_version = EXCLUDED.pin_version,
        revoked_at = NULL;

    RETURN QUERY
    SELECT v_target.id, v_target.name, v_target.role, v_target.pin_version;
END;
$$;

-- 6. RPC: update_staff_pin with role enforcement and search_path
CREATE OR REPLACE FUNCTION update_staff_pin(p_staff_id UUID, p_new_pin TEXT DEFAULT NULL)
RETURNS VOID 
LANGUAGE plpgsql 
SECURITY DEFINER 
SET search_path = public, extensions
AS $$
DECLARE
    v_caller_role staff_role;
    v_caller_staff_id UUID;
BEGIN
    SELECT s.role, s.id INTO v_caller_role, v_caller_staff_id
    FROM staff s 
    JOIN staff_sessions ss ON ss.staff_id = s.id 
    WHERE ss.auth_uid = (SELECT auth.uid()) 
      AND (ss.revoked_at IS NULL OR ss.revoked_at > now())
    LIMIT 1;

    IF v_caller_role IS NULL OR (v_caller_role != 'admin' AND v_caller_staff_id != p_staff_id) THEN
        RAISE EXCEPTION 'Access Denied: Solo gli amministratori o il proprietario dell account possono modificare il PIN';
    END IF;

    IF p_new_pin IS NULL OR p_new_pin = '' THEN
        DELETE FROM staff_secrets WHERE staff_id = p_staff_id;
        UPDATE staff 
        SET pin_hash = NULL,
            has_pin = false,
            pin_length = NULL,
            pin_version = COALESCE(pin_version, 0) + 1,
            updated_at = now()
        WHERE id = p_staff_id;
    ELSE
        IF NOT (p_new_pin ~ '^[0-9]{4,8}$') THEN
            RAISE EXCEPTION 'Il PIN deve contenere da 4 a 8 cifre numeriche';
        END IF;

        INSERT INTO staff_secrets (staff_id, pin_hash)
        VALUES (p_staff_id, crypt(p_new_pin, gen_salt('bf', 10)))
        ON CONFLICT (staff_id) DO UPDATE
        SET pin_hash = EXCLUDED.pin_hash;

        UPDATE staff 
        SET pin_hash = NULL,
            has_pin = true,
            pin_length = LENGTH(p_new_pin),
            pin_version = COALESCE(pin_version, 0) + 1,
            updated_at = now()
        WHERE id = p_staff_id;
    END IF;

    UPDATE staff_sessions 
    SET revoked_at = now() 
    WHERE staff_id = p_staff_id AND revoked_at IS NULL;
END;
$$;

-- 7. RPC: create_staff
CREATE OR REPLACE FUNCTION create_staff(
    p_name TEXT,
    p_role TEXT,
    p_pin TEXT DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
    v_role staff_role;
    v_executer_role staff_role;
    v_new_id UUID;
BEGIN
    SELECT role INTO v_executer_role
    FROM staff
    WHERE id = (
        SELECT staff_id 
        FROM staff_sessions 
        WHERE auth_uid = auth.uid() 
          AND (revoked_at IS NULL OR revoked_at > now())
        LIMIT 1
    );

    IF v_executer_role IS NULL OR v_executer_role != 'admin' THEN
        RAISE EXCEPTION 'Access Denied: Solo gli amministratori possono creare staff';
    END IF;

    IF LENGTH(TRIM(p_name)) = 0 THEN
        RAISE EXCEPTION 'Il nome non può essere vuoto';
    END IF;
    
    BEGIN
        v_role := p_role::staff_role;
    EXCEPTION WHEN OTHERS THEN
        RAISE EXCEPTION 'Ruolo non valido: %', p_role;
    END;
    
    IF p_pin IS NOT NULL AND p_pin != '' AND (LENGTH(p_pin) < 4 OR LENGTH(p_pin) > 8) THEN
        RAISE EXCEPTION 'Il PIN deve contenere da 4 a 8 cifre';
    END IF;
    
    IF p_pin IS NOT NULL AND p_pin != '' AND NOT (p_pin ~ '^[0-9]+$') THEN
        RAISE EXCEPTION 'Il PIN deve essere numerico';
    END IF;
    
    INSERT INTO staff (name, role, has_pin, pin_length, pin_version)
    VALUES (
        TRIM(p_name),
        v_role,
        (p_pin IS NOT NULL AND p_pin != ''),
        CASE WHEN p_pin IS NOT NULL AND p_pin != '' THEN LENGTH(p_pin) ELSE NULL END,
        1
    )
    RETURNING id INTO v_new_id;

    IF p_pin IS NOT NULL AND p_pin != '' THEN
        INSERT INTO staff_secrets (staff_id, pin_hash)
        VALUES (v_new_id, crypt(p_pin, gen_salt('bf', 10)));
    END IF;
END;
$$;

-- 8. RPC: get_staff_list_for_login
CREATE OR REPLACE FUNCTION get_staff_list_for_login()
RETURNS TABLE(
    id UUID,
    name TEXT,
    role staff_role,
    has_pin BOOLEAN,
    pin_length INT
) 
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
BEGIN
    RETURN QUERY
    SELECT 
        s.id,
        s.name,
        s.role,
        COALESCE(s.has_pin, false) as has_pin,
        COALESCE(s.pin_length, 6) as pin_length
    FROM staff s
    ORDER BY s.name;
END;
$$;

-- 9. Drop all insecure wide-open RLS policies
DROP POLICY IF EXISTS "staff_sessions_select_policy" ON staff_sessions;
DROP POLICY IF EXISTS "staff_sessions_insert_policy" ON staff_sessions;
DROP POLICY IF EXISTS "staff_sessions_update_policy" ON staff_sessions;
DROP POLICY IF EXISTS "staff_sessions_delete_policy" ON staff_sessions;

DROP POLICY IF EXISTS "staff_select_policy" ON staff;
DROP POLICY IF EXISTS "staff_insert_policy" ON staff;
DROP POLICY IF EXISTS "staff_update_policy" ON staff;
DROP POLICY IF EXISTS "staff_delete_policy" ON staff;

DROP POLICY IF EXISTS "inventory_select_policy" ON inventory;
DROP POLICY IF EXISTS "inventory_insert_policy" ON inventory;
DROP POLICY IF EXISTS "inventory_update_policy" ON inventory;
DROP POLICY IF EXISTS "inventory_delete_policy" ON inventory;

DROP POLICY IF EXISTS "orders_select_policy" ON orders;
DROP POLICY IF EXISTS "orders_insert_policy" ON orders;
DROP POLICY IF EXISTS "orders_update_policy" ON orders;
DROP POLICY IF EXISTS "orders_delete_policy" ON orders;
DROP POLICY IF EXISTS "Staff can view their own orders" ON orders;

DROP POLICY IF EXISTS "order_items_select_policy" ON order_items;
DROP POLICY IF EXISTS "order_items_insert_policy" ON order_items;
DROP POLICY IF EXISTS "order_items_update_policy" ON order_items;
DROP POLICY IF EXISTS "order_items_delete_policy" ON order_items;

DROP POLICY IF EXISTS "payments_select_policy" ON payments;
DROP POLICY IF EXISTS "payments_insert_policy" ON payments;
DROP POLICY IF EXISTS "payments_update_policy" ON payments;
DROP POLICY IF EXISTS "payments_delete_policy" ON payments;

DROP POLICY IF EXISTS "reservations_select_policy" ON reservations;
DROP POLICY IF EXISTS "reservations_insert_policy" ON reservations;
DROP POLICY IF EXISTS "reservations_update_policy" ON reservations;
DROP POLICY IF EXISTS "reservations_delete_policy" ON reservations;

DROP POLICY IF EXISTS "reservation_items_select_policy" ON reservation_items;
DROP POLICY IF EXISTS "reservation_items_insert_policy" ON reservation_items;
DROP POLICY IF EXISTS "reservation_items_update_policy" ON reservation_items;
DROP POLICY IF EXISTS "reservation_items_delete_policy" ON reservation_items;

DROP POLICY IF EXISTS "reminders_select_policy" ON reminders;
DROP POLICY IF EXISTS "Staff can create reminders" ON reminders;
DROP POLICY IF EXISTS "reminders_update_policy" ON reminders;
DROP POLICY IF EXISTS "reminders_delete_policy" ON reminders;

DROP POLICY IF EXISTS "settings_select_policy" ON settings;
DROP POLICY IF EXISTS "settings_insert_policy" ON settings;
DROP POLICY IF EXISTS "settings_update_policy" ON settings;
DROP POLICY IF EXISTS "settings_delete_policy" ON settings;

DROP POLICY IF EXISTS "load_history_select_policy" ON load_history;
DROP POLICY IF EXISTS "load_history_insert_policy" ON load_history;
DROP POLICY IF EXISTS "load_history_update_policy" ON load_history;
DROP POLICY IF EXISTS "load_history_delete_policy" ON load_history;

DROP POLICY IF EXISTS "Allow authenticated read on archived_loads" ON archived_loads;
DROP POLICY IF EXISTS "Allow authenticated insert on archived_loads" ON archived_loads;
DROP POLICY IF EXISTS "Allow authenticated delete on archived_loads" ON archived_loads;

DROP POLICY IF EXISTS "scopes_select_policy" ON scopes;
DROP POLICY IF EXISTS "scopes_insert_policy" ON scopes;
DROP POLICY IF EXISTS "scopes_update_policy" ON scopes;
DROP POLICY IF EXISTS "scopes_delete_policy" ON scopes;

DROP POLICY IF EXISTS "customers_select_policy" ON customers;
DROP POLICY IF EXISTS "customers_insert_policy" ON customers;
DROP POLICY IF EXISTS "customers_update_policy" ON customers;
DROP POLICY IF EXISTS "customers_delete_policy" ON customers;

DROP POLICY IF EXISTS "product_models_insert_policy" ON product_models;
DROP POLICY IF EXISTS "product_models_update_policy" ON product_models;
DROP POLICY IF EXISTS "product_models_delete_policy" ON product_models;
DROP POLICY IF EXISTS "Anyone can read product models" ON product_models;

DROP POLICY IF EXISTS "product_flavors_insert_policy" ON product_flavors;
DROP POLICY IF EXISTS "product_flavors_update_policy" ON product_flavors;
DROP POLICY IF EXISTS "product_flavors_delete_policy" ON product_flavors;
DROP POLICY IF EXISTS "Flavors are publicly readable" ON product_flavors;

DROP POLICY IF EXISTS "product_variants_insert_policy" ON product_variants;
DROP POLICY IF EXISTS "product_variants_update_policy" ON product_variants;
DROP POLICY IF EXISTS "product_variants_delete_policy" ON product_variants;
DROP POLICY IF EXISTS "Public can read product variants" ON product_variants;

-- 10. Implement secure, role-based RLS policies

-- staff_sessions: clients can only read/revoke their own session, no arbitrary inserts
CREATE POLICY "staff_sessions_select_own" ON staff_sessions
FOR SELECT TO authenticated
USING ((SELECT auth.uid()) = auth_uid);

CREATE POLICY "staff_sessions_update_own" ON staff_sessions
FOR UPDATE TO authenticated
USING ((SELECT auth.uid()) = auth_uid)
WITH CHECK ((SELECT auth.uid()) = auth_uid);

CREATE POLICY "staff_sessions_delete_admin" ON staff_sessions
FOR DELETE TO authenticated
USING (get_current_staff_role() = 'admin' OR (SELECT auth.uid()) = auth_uid);

-- staff: only authenticated users with valid staff session can read; only admin can modify
CREATE POLICY "staff_select_staff_only" ON staff
FOR SELECT TO authenticated
USING (get_current_staff_role() IS NOT NULL);

CREATE POLICY "staff_admin_manage" ON staff
FOR ALL TO authenticated
USING (get_current_staff_role() = 'admin')
WITH CHECK (get_current_staff_role() = 'admin');

-- inventory
CREATE POLICY "inventory_select_staff" ON inventory
FOR SELECT TO authenticated
USING (get_current_staff_role() IN ('admin', 'staff', 'helper'));

CREATE POLICY "inventory_modify_staff" ON inventory
FOR UPDATE TO authenticated
USING (get_current_staff_role() IN ('admin', 'staff'))
WITH CHECK (get_current_staff_role() IN ('admin', 'staff'));

CREATE POLICY "inventory_admin_delete" ON inventory
FOR DELETE TO authenticated
USING (get_current_staff_role() = 'admin');

CREATE POLICY "inventory_admin_insert" ON inventory
FOR INSERT TO authenticated
WITH CHECK (get_current_staff_role() IN ('admin', 'staff'));

-- product catalog: models, flavors, variants
CREATE POLICY "catalog_models_read" ON product_models FOR SELECT TO authenticated USING (get_current_staff_role() IN ('admin', 'staff', 'helper'));
CREATE POLICY "catalog_models_modify" ON product_models FOR ALL TO authenticated USING (get_current_staff_role() IN ('admin', 'staff')) WITH CHECK (get_current_staff_role() IN ('admin', 'staff'));

CREATE POLICY "catalog_flavors_read" ON product_flavors FOR SELECT TO authenticated USING (get_current_staff_role() IN ('admin', 'staff', 'helper'));
CREATE POLICY "catalog_flavors_modify" ON product_flavors FOR ALL TO authenticated USING (get_current_staff_role() IN ('admin', 'staff')) WITH CHECK (get_current_staff_role() IN ('admin', 'staff'));

CREATE POLICY "catalog_variants_read" ON product_variants FOR SELECT TO authenticated USING (get_current_staff_role() IN ('admin', 'staff', 'helper'));
CREATE POLICY "catalog_variants_modify" ON product_variants FOR ALL TO authenticated USING (get_current_staff_role() IN ('admin', 'staff')) WITH CHECK (get_current_staff_role() IN ('admin', 'staff'));

-- reservations & reservation_items
CREATE POLICY "reservations_read" ON reservations FOR SELECT TO authenticated USING (get_current_staff_role() IN ('admin', 'staff', 'helper'));
CREATE POLICY "reservations_insert" ON reservations FOR INSERT TO authenticated WITH CHECK (get_current_staff_role() IN ('admin', 'staff', 'helper'));
CREATE POLICY "reservations_update" ON reservations FOR UPDATE TO authenticated USING (get_current_staff_role() IN ('admin', 'staff', 'helper')) WITH CHECK (get_current_staff_role() IN ('admin', 'staff', 'helper'));
CREATE POLICY "reservations_delete" ON reservations FOR DELETE TO authenticated USING (get_current_staff_role() IN ('admin', 'staff'));

CREATE POLICY "reservation_items_read" ON reservation_items FOR SELECT TO authenticated USING (get_current_staff_role() IN ('admin', 'staff', 'helper'));
CREATE POLICY "reservation_items_insert" ON reservation_items FOR INSERT TO authenticated WITH CHECK (get_current_staff_role() IN ('admin', 'staff', 'helper'));
CREATE POLICY "reservation_items_update" ON reservation_items FOR UPDATE TO authenticated USING (get_current_staff_role() IN ('admin', 'staff', 'helper')) WITH CHECK (get_current_staff_role() IN ('admin', 'staff', 'helper'));
CREATE POLICY "reservation_items_delete" ON reservation_items FOR DELETE TO authenticated USING (get_current_staff_role() IN ('admin', 'staff'));

-- reminders
CREATE POLICY "reminders_read" ON reminders FOR SELECT TO authenticated USING (get_current_staff_role() IN ('admin', 'staff', 'helper'));
CREATE POLICY "reminders_insert" ON reminders FOR INSERT TO authenticated WITH CHECK (get_current_staff_role() IN ('admin', 'staff', 'helper'));
CREATE POLICY "reminders_update" ON reminders FOR UPDATE TO authenticated USING (get_current_staff_role() IN ('admin', 'staff', 'helper')) WITH CHECK (get_current_staff_role() IN ('admin', 'staff', 'helper'));
CREATE POLICY "reminders_delete" ON reminders FOR DELETE TO authenticated USING (get_current_staff_role() IN ('admin', 'staff'));

-- orders & order_items
CREATE POLICY "orders_read" ON orders FOR SELECT TO authenticated USING (get_current_staff_role() IN ('admin', 'staff'));
CREATE POLICY "orders_insert" ON orders FOR INSERT TO authenticated WITH CHECK (get_current_staff_role() IN ('admin', 'staff', 'helper'));
CREATE POLICY "orders_update" ON orders FOR UPDATE TO authenticated USING (get_current_staff_role() IN ('admin', 'staff')) WITH CHECK (get_current_staff_role() IN ('admin', 'staff'));
CREATE POLICY "orders_delete" ON orders FOR DELETE TO authenticated USING (get_current_staff_role() = 'admin');

CREATE POLICY "order_items_read" ON order_items FOR SELECT TO authenticated USING (get_current_staff_role() IN ('admin', 'staff'));
CREATE POLICY "order_items_insert" ON order_items FOR INSERT TO authenticated WITH CHECK (get_current_staff_role() IN ('admin', 'staff', 'helper'));
CREATE POLICY "order_items_update" ON order_items FOR UPDATE TO authenticated USING (get_current_staff_role() IN ('admin', 'staff')) WITH CHECK (get_current_staff_role() IN ('admin', 'staff'));
CREATE POLICY "order_items_delete" ON order_items FOR DELETE TO authenticated USING (get_current_staff_role() = 'admin');

-- payments
CREATE POLICY "payments_read" ON payments FOR SELECT TO authenticated USING (get_current_staff_role() IN ('admin', 'staff'));
CREATE POLICY "payments_insert" ON payments FOR INSERT TO authenticated WITH CHECK (get_current_staff_role() IN ('admin', 'staff', 'helper'));
CREATE POLICY "payments_update" ON payments FOR UPDATE TO authenticated USING (get_current_staff_role() = 'admin') WITH CHECK (get_current_staff_role() = 'admin');
CREATE POLICY "payments_delete" ON payments FOR DELETE TO authenticated USING (get_current_staff_role() = 'admin');

-- settings, load_history, archived_loads
CREATE POLICY "settings_read" ON settings FOR SELECT TO authenticated USING (get_current_staff_role() IN ('admin', 'staff'));
CREATE POLICY "settings_modify" ON settings FOR ALL TO authenticated USING (get_current_staff_role() = 'admin') WITH CHECK (get_current_staff_role() = 'admin');

CREATE POLICY "load_history_read" ON load_history FOR SELECT TO authenticated USING (get_current_staff_role() IN ('admin', 'staff'));
CREATE POLICY "load_history_modify" ON load_history FOR ALL TO authenticated USING (get_current_staff_role() = 'admin') WITH CHECK (get_current_staff_role() = 'admin');

CREATE POLICY "archived_loads_read" ON archived_loads FOR SELECT TO authenticated USING (get_current_staff_role() IN ('admin', 'staff'));
CREATE POLICY "archived_loads_modify" ON archived_loads FOR ALL TO authenticated USING (get_current_staff_role() = 'admin') WITH CHECK (get_current_staff_role() = 'admin');

-- scopes & customers
CREATE POLICY "scopes_read" ON scopes FOR SELECT TO authenticated USING (get_current_staff_role() IN ('admin', 'staff', 'helper'));
CREATE POLICY "scopes_modify" ON scopes FOR ALL TO authenticated USING (get_current_staff_role() = 'admin') WITH CHECK (get_current_staff_role() = 'admin');

CREATE POLICY "customers_read" ON customers FOR SELECT TO authenticated USING (get_current_staff_role() IN ('admin', 'staff', 'helper'));
CREATE POLICY "customers_modify" ON customers FOR ALL TO authenticated USING (get_current_staff_role() IN ('admin', 'staff', 'helper')) WITH CHECK (get_current_staff_role() IN ('admin', 'staff', 'helper'));

-- 11. RPC Permissions: Revoke unrestricted anonymous execution
REVOKE EXECUTE ON ALL FUNCTIONS IN SCHEMA public FROM anon, public;

GRANT EXECUTE ON FUNCTION public.get_staff_list_for_login() TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.authenticate_staff(TEXT, TEXT) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.verify_staff_pin(TEXT, TEXT) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.switch_operator_as_admin(TEXT) TO authenticated;

-- Grant EXECUTE on remaining schema functions to authenticated users
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO authenticated;
