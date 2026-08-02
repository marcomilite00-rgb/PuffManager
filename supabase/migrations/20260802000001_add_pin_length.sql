-- Add pin_length to staff so the login screen can show the correct number of PIN dots.

ALTER TABLE staff ADD COLUMN IF NOT EXISTS pin_length INT;

-- Backfill: assume 6-digit PINs for existing staff (consistent with previous default).
UPDATE staff SET pin_length = 6 WHERE pin_length IS NULL AND pin_hash IS NOT NULL;

-- ============================================
-- RPC: get_staff_list_for_login
-- Now also returns pin_length for the PIN dots.
-- ============================================
DROP FUNCTION IF EXISTS get_staff_list_for_login();

CREATE OR REPLACE FUNCTION get_staff_list_for_login()
RETURNS TABLE(
    id UUID,
    name TEXT,
    role staff_role,
    has_pin BOOLEAN,
    pin_length INT
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        s.id,
        s.name,
        s.role,
        (s.pin_hash IS NOT NULL) as has_pin,
        s.pin_length as pin_length
    FROM staff s
    ORDER BY s.name;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================
-- RPC: create_staff
-- Stores the PIN length when creating a member.
-- ============================================
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
BEGIN
    -- Authorization Check: Ensure executing user is an Admin
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
        RAISE EXCEPTION 'Access Denied: Only Admins can create staff';
    END IF;

    -- Input Validation
    IF LENGTH(TRIM(p_name)) = 0 THEN
        RAISE EXCEPTION 'Name cannot be empty';
    END IF;
    
    -- Cast role to enum type to validate
    BEGIN
        v_role := p_role::staff_role;
    EXCEPTION WHEN OTHERS THEN
        RAISE EXCEPTION 'Invalid role: %', p_role;
    END;
    
    -- PIN Validation
    IF p_pin IS NOT NULL AND (LENGTH(p_pin) < 4 OR LENGTH(p_pin) > 8) THEN
        RAISE EXCEPTION 'PIN must be 4-8 digits';
    END IF;
    
    IF p_pin IS NOT NULL AND NOT (p_pin ~ '^[0-9]+$') THEN
        RAISE EXCEPTION 'PIN must be numeric';
    END IF;
    
    -- Insert new staff
    INSERT INTO staff (name, role, pin_hash, pin_length)
    VALUES (
        TRIM(p_name),
        v_role,
        CASE 
            WHEN p_pin IS NOT NULL THEN crypt(p_pin, gen_salt('bf'))
            ELSE NULL
        END,
        CASE 
            WHEN p_pin IS NOT NULL THEN LENGTH(p_pin)
            ELSE NULL
        END
    );
END;
$$;

-- ============================================
-- RPC: update_staff_pin
-- Updates the PIN length when a PIN is changed/removed.
-- ============================================
CREATE OR REPLACE FUNCTION update_staff_pin(p_staff_id UUID, p_new_pin TEXT DEFAULT NULL)
RETURNS VOID AS $$
BEGIN
    IF p_new_pin IS NULL OR p_new_pin = '' THEN
        -- Delete PIN (staff can login without PIN)
        UPDATE staff 
        SET pin_hash = NULL, 
            pin_length = NULL,
            pin_version = COALESCE(pin_version, 0) + 1,
            updated_at = now()
        WHERE id = p_staff_id;
    ELSE
        -- Validate PIN format (4-8 digits)
        IF NOT (p_new_pin ~ '^[0-9]{4,8}$') THEN
            RAISE EXCEPTION 'PIN must be 4-8 digits';
        END IF;
        
        -- Hash and save new PIN using bcrypt
        UPDATE staff 
        SET pin_hash = crypt(p_new_pin, gen_salt('bf')),
            pin_length = LENGTH(p_new_pin),
            pin_version = COALESCE(pin_version, 0) + 1,
            updated_at = now()
        WHERE id = p_staff_id;
    END IF;
    
    -- Revoke all active sessions for this staff (they must re-login)
    UPDATE staff_sessions 
    SET revoked_at = now() 
    WHERE staff_id = p_staff_id AND revoked_at IS NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION get_staff_list_for_login() TO anon, authenticated;
GRANT EXECUTE ON FUNCTION verify_staff_pin(TEXT, TEXT) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION create_staff(TEXT, TEXT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION update_staff_pin(UUID, TEXT) TO authenticated;
