-- PIN Security Migration
-- Enables secure PIN hashing with pgcrypto and session invalidation via pin_version

-- Enable pgcrypto for password hashing
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Add pin_version to staff for session invalidation tracking
ALTER TABLE staff ADD COLUMN IF NOT EXISTS pin_version INT DEFAULT 1;

-- Add updated_at column if not exists
ALTER TABLE staff ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT now();

-- Add pin_version to staff_sessions for validation
ALTER TABLE staff_sessions ADD COLUMN IF NOT EXISTS pin_version INT;

-- ============================================
-- RPC: verify_staff_pin
-- Returns validation result and staff info
-- If pin_hash is NULL, PIN is not required (valid without PIN)
-- ============================================
CREATE OR REPLACE FUNCTION verify_staff_pin(p_staff_name TEXT, p_pin TEXT DEFAULT NULL)
RETURNS TABLE(
    valid BOOLEAN, 
    staff_id UUID, 
    staff_name TEXT, 
    staff_role staff_role, 
    staff_pin_version INT,
    requires_pin BOOLEAN
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        CASE 
            WHEN s.pin_hash IS NULL THEN true  -- No PIN required, always valid
            WHEN p_pin IS NULL THEN false      -- PIN required but not provided
            WHEN s.pin_hash = crypt(p_pin, s.pin_hash) THEN true  -- PIN matches
            ELSE false                          -- PIN doesn't match
        END as valid,
        s.id as staff_id,
        s.name as staff_name,
        s.role as staff_role,
        s.pin_version as staff_pin_version,
        (s.pin_hash IS NOT NULL) as requires_pin
    FROM staff s 
    WHERE s.name = p_staff_name;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================
-- RPC: update_staff_pin
-- Hashes new PIN, increments version, invalidates all sessions
-- Pass NULL or empty string to delete PIN
-- ============================================
CREATE OR REPLACE FUNCTION update_staff_pin(p_staff_id UUID, p_new_pin TEXT DEFAULT NULL)
RETURNS VOID AS $$
BEGIN
    IF p_new_pin IS NULL OR p_new_pin = '' THEN
        -- Delete PIN (staff can login without PIN)
        UPDATE staff 
        SET pin_hash = NULL, 
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

-- ============================================
-- RPC: get_staff_list_for_login
-- Returns staff list with has_pin indicator (without exposing pin_hash)
-- ============================================
CREATE OR REPLACE FUNCTION get_staff_list_for_login()
RETURNS TABLE(
    id UUID,
    name TEXT,
    role staff_role,
    has_pin BOOLEAN
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        s.id,
        s.name,
        s.role,
        (s.pin_hash IS NOT NULL) as has_pin
    FROM staff s
    ORDER BY s.name;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================
-- Set default PINs (hashed with bcrypt)
-- Marco: 0509, Andrea: 2012, Jacopo: none
-- ============================================
DO $$
BEGIN
    -- Marco: PIN 0509
    UPDATE staff 
    SET pin_hash = crypt('0509', gen_salt('bf')), 
        pin_version = 1 
    WHERE name = 'Marco';
    
    -- Andrea: PIN 2012
    UPDATE staff 
    SET pin_hash = crypt('2012', gen_salt('bf')), 
        pin_version = 1 
    WHERE name = 'Andrea';
    
    -- Jacopo: No PIN
    UPDATE staff 
    SET pin_hash = NULL, 
        pin_version = 1 
    WHERE name = 'Jacopo';
END $$;

-- ============================================
-- Update RLS policy to hide pin_hash from select
-- ============================================
CREATE OR REPLACE VIEW staff_public AS
SELECT 
    id, 
    name, 
    role, 
    (pin_hash IS NOT NULL) as has_pin,
    pin_version,
    created_at, 
    updated_at
FROM staff;

-- Grant access to the view
GRANT SELECT ON staff_public TO authenticated, anon;
