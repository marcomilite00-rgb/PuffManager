-- ==============================================================================
-- Migration: 20261020000000_device_persistence_and_security_hardening.sql
-- Description:
--   1. Harden search_path on protect_staff_sessions_immutability & get_current_staff_id
--   2. Explicit deny-all policies on login_attempts, site_security, staff_secrets
--   3. Authenticate staff extended to 30-day device persistence
--   4. Update site security master access key hash
-- ==============================================================================

-- 1. Explicit deny-all policies for sensitive internal tables
DROP POLICY IF EXISTS "deny_all_direct_login_attempts" ON public.login_attempts;
CREATE POLICY "deny_all_direct_login_attempts" ON public.login_attempts
FOR ALL TO public
USING (false)
WITH CHECK (false);

DROP POLICY IF EXISTS "deny_all_direct_site_security" ON public.site_security;
CREATE POLICY "deny_all_direct_site_security" ON public.site_security
FOR ALL TO public
USING (false)
WITH CHECK (false);

DROP POLICY IF EXISTS "deny_all_direct_staff_secrets" ON public.staff_secrets;
CREATE POLICY "deny_all_direct_staff_secrets" ON public.staff_secrets
FOR ALL TO public
USING (false)
WITH CHECK (false);

-- 2. Immutable search_path on security functions
CREATE OR REPLACE FUNCTION public.protect_staff_sessions_immutability()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $$
BEGIN
    IF NEW.staff_id <> OLD.staff_id OR NEW.auth_uid <> OLD.auth_uid THEN
        RAISE EXCEPTION 'Sicurezza: Vietato modificare staff_id o auth_uid di una sessione esistente';
    END IF;
    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_current_staff_id()
RETURNS UUID
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $$
    SELECT ss.staff_id 
    FROM staff_sessions ss 
    WHERE ss.auth_uid = (SELECT auth.uid()) 
      AND (ss.revoked_at IS NULL OR ss.revoked_at > now()) 
    LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.get_current_staff_role()
RETURNS staff_role
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $$
    SELECT s.role 
    FROM staff s 
    JOIN staff_sessions ss ON ss.staff_id = s.id 
    WHERE ss.auth_uid = (SELECT auth.uid()) 
      AND (ss.revoked_at IS NULL OR ss.revoked_at > now())
    LIMIT 1;
$$;

-- 3. Authenticate staff with 30-day session lifespan
CREATE OR REPLACE FUNCTION public.authenticate_staff(
    p_staff_name TEXT,
    p_pin TEXT DEFAULT NULL
) RETURNS TABLE (
    staff_id UUID,
    staff_name TEXT,
    staff_role staff_role,
    staff_pin_version INT,
    error_message TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $$
DECLARE
    v_staff staff%ROWTYPE;
    v_pin_hash TEXT;
    v_failed_by_name INT;
    v_failed_by_uid INT;
    v_valid BOOLEAN := false;
    v_client_ip TEXT;
    v_auth_uid UUID;
BEGIN
    v_auth_uid := auth.uid();

    BEGIN
        v_client_ip := current_setting('request.headers', true)::json->>'x-forwarded-for';
    EXCEPTION WHEN OTHERS THEN
        v_client_ip := NULL;
    END;

    -- Rate limiting per auth.uid (max 10 attempts in 15 mins)
    IF v_auth_uid IS NOT NULL THEN
        SELECT COUNT(*) INTO v_failed_by_uid
        FROM login_attempts la
        WHERE la.auth_uid = v_auth_uid
          AND la.success = false
          AND la.attempted_at > now() - INTERVAL '15 minutes';

        IF v_failed_by_uid >= 10 THEN
            RETURN QUERY SELECT NULL::uuid, NULL::text, NULL::staff_role, NULL::integer, 'Troppi tentativi falliti da questo dispositivo. Riprova tra 15 minuti.'::text;
            RETURN;
        END IF;
    END IF;

    -- Rate limiting per staff name (progressive block to prevent DoS)
    SELECT COUNT(*) INTO v_failed_by_name
    FROM login_attempts la
    WHERE LOWER(la.staff_name) = LOWER(TRIM(p_staff_name))
      AND la.success = false
      AND la.attempted_at > now() - INTERVAL '15 minutes';

    IF v_failed_by_name >= 5 THEN
        RETURN QUERY SELECT NULL::uuid, NULL::text, NULL::staff_role, NULL::integer, 'Account temporaneamente protetto per troppi tentativi falliti. Riprova tra 15 minuti.'::text;
        RETURN;
    END IF;

    -- Lookup staff
    SELECT * INTO v_staff
    FROM staff s
    WHERE LOWER(s.name) = LOWER(TRIM(p_staff_name))
    LIMIT 1;

    IF v_staff.id IS NULL THEN
        INSERT INTO login_attempts (staff_name, success, auth_uid, ip_address)
        VALUES (LOWER(TRIM(p_staff_name)), false, v_auth_uid, v_client_ip);
        
        RETURN QUERY SELECT NULL::uuid, NULL::text, NULL::staff_role, NULL::integer, 'Operatore o credenziali non valide'::text;
        RETURN;
    END IF;

    -- Lookup secret hash
    SELECT sec.pin_hash INTO v_pin_hash
    FROM staff_secrets sec
    WHERE sec.staff_id = v_staff.id;

    IF v_pin_hash IS NULL THEN
        IF v_staff.has_pin IS FALSE THEN
            v_valid := true;
        ELSE
            RETURN QUERY SELECT NULL::uuid, NULL::text, NULL::staff_role, NULL::integer, 'PIN non configurato. Contatta un amministratore.'::text;
            RETURN;
        END IF;
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

    -- Record attempt
    INSERT INTO login_attempts (staff_name, success, auth_uid, ip_address)
    VALUES (v_staff.name, v_valid, v_auth_uid, v_client_ip);

    IF NOT v_valid THEN
        RETURN QUERY SELECT NULL::uuid, NULL::text, NULL::staff_role, NULL::integer, 'PIN errato'::text;
        RETURN;
    END IF;

    -- Update session cleanly (extend to 30 days persistence on device)
    IF v_auth_uid IS NOT NULL THEN
        DELETE FROM public.staff_sessions WHERE auth_uid = v_auth_uid;

        INSERT INTO staff_sessions (auth_uid, staff_id, pin_version, revoked_at, expires_at)
        VALUES (v_auth_uid, v_staff.id, v_staff.pin_version, NULL, now() + interval '30 days');
    END IF;

    RETURN QUERY
    SELECT v_staff.id, v_staff.name, v_staff.role, v_staff.pin_version, NULL::text;
END;
$$;
