-- Revert pin_code usage and ensure all PINs are strictly encrypted via bcrypt

UPDATE staff SET pin_code = NULL WHERE pin_code IS NOT NULL;

-- Restore update_staff_pin to only hash via bcrypt
CREATE OR REPLACE FUNCTION update_staff_pin(p_staff_id UUID, p_new_pin TEXT DEFAULT NULL)
RETURNS VOID AS $$
BEGIN
    IF p_new_pin IS NULL OR p_new_pin = '' THEN
        UPDATE staff 
        SET pin_hash = NULL, 
            pin_length = NULL,
            pin_version = COALESCE(pin_version, 0) + 1,
            updated_at = now()
        WHERE id = p_staff_id;
    ELSE
        IF NOT (p_new_pin ~ '^[0-9]{4,8}$') THEN
            RAISE EXCEPTION 'PIN must be 4-8 digits';
        END IF;
        
        UPDATE staff 
        SET pin_hash = crypt(p_new_pin, gen_salt('bf')),
            pin_length = LENGTH(p_new_pin),
            pin_version = COALESCE(pin_version, 0) + 1,
            updated_at = now()
        WHERE id = p_staff_id;
    END IF;
    
    UPDATE staff_sessions 
    SET revoked_at = now() 
    WHERE staff_id = p_staff_id AND revoked_at IS NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Restore create_staff to only hash via bcrypt
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

    IF LENGTH(TRIM(p_name)) = 0 THEN
        RAISE EXCEPTION 'Name cannot be empty';
    END IF;
    
    BEGIN
        v_role := p_role::staff_role;
    EXCEPTION WHEN OTHERS THEN
        RAISE EXCEPTION 'Invalid role: %', p_role;
    END;
    
    IF p_pin IS NOT NULL AND (LENGTH(p_pin) < 4 OR LENGTH(p_pin) > 8) THEN
        RAISE EXCEPTION 'PIN must be 4-8 digits';
    END IF;
    
    IF p_pin IS NOT NULL AND NOT (p_pin ~ '^[0-9]+$') THEN
        RAISE EXCEPTION 'PIN must be numeric';
    END IF;
    
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
