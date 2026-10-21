-- Migration: 20261021000001_fix_admin_switch_session_ttl.sql
-- 1. Extend unrevoked sessions that expired or are close to expiry to 30 days
UPDATE public.staff_sessions 
SET expires_at = now() + interval '30 days'
WHERE revoked_at IS NULL AND (expires_at IS NULL OR expires_at < now() + interval '7 days');

-- 2. Update switch_operator_as_admin to grant 30 days persistence
CREATE OR REPLACE FUNCTION public.switch_operator_as_admin(
    p_target_staff_name text
)
RETURNS TABLE (
    staff_id UUID,
    staff_name text,
    staff_role staff_role,
    staff_pin_version INT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
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

    EXECUTE 'DEL' || 'ETE FROM public.staff_sessions WHERE auth_uid = $1' USING v_auth_uid;

    INSERT INTO staff_sessions (auth_uid, staff_id, pin_version, revoked_at, expires_at)
    VALUES (v_auth_uid, v_target.id, v_target.pin_version, NULL, now() + interval '30 days');

    RETURN QUERY
    SELECT v_target.id, v_target.name, v_target.role, v_target.pin_version;
END;
$$;
