-- Admin Features Migration: Staff Creation & Register Closing
-- Includes security hardening (search_path, auth check) and atomic closing logic

-- 1. Enable pgcrypto extension explicitly in extensions schema
CREATE EXTENSION IF NOT EXISTS pgcrypto SCHEMA extensions;

-- 2. Create load_history table
CREATE TABLE IF NOT EXISTS load_history (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    gross_total NUMERIC(10,2) NOT NULL DEFAULT 0,
    net_total NUMERIC(10,2) NOT NULL DEFAULT 0,
    reinvest_amount NUMERIC(10,2) NOT NULL DEFAULT 0,
    money_spent_moved NUMERIC(10,2) NOT NULL DEFAULT 0
);

-- 3. Add last_reset_date to settings
ALTER TABLE settings 
ADD COLUMN IF NOT EXISTS last_reset_date TIMESTAMPTZ DEFAULT NOW();

-- 4. RPC: create_staff
-- Securely creates new staff with hashed PIN. Only Admin can execute.
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
    IF p_pin IS NOT NULL AND (LENGTH(p_pin) < 4 OR LENGTH(p_pin) > 6) THEN
        RAISE EXCEPTION 'PIN must be 4-6 digits';
    END IF;
    
    IF p_pin IS NOT NULL AND NOT (p_pin ~ '^[0-9]+$') THEN
        RAISE EXCEPTION 'PIN must be numeric';
    END IF;
    
    -- Insert new staff
    INSERT INTO staff (name, role, pin_hash)
    VALUES (
        TRIM(p_name),
        v_role,
        CASE 
            WHEN p_pin IS NOT NULL THEN crypt(p_pin, gen_salt('bf'))
            ELSE NULL
        END
    );
END;
$$;

-- 5. RPC: perform_closing_load
-- Atomically calculates totals, saves history, and resets register.
-- Uses precise timestamp windowing to prevent race conditions.
CREATE OR REPLACE FUNCTION perform_closing_load()
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
    v_executer_role staff_role;
    v_now TIMESTAMPTZ;
    v_last_reset TIMESTAMPTZ;
    v_reinvest_pct NUMERIC(5,2);
    v_reinvest_fixed NUMERIC(10,2);
    v_reinvest_mode TEXT;
    
    v_gross_total NUMERIC(10,2);
    v_reinvest_amount NUMERIC(10,2);
    v_net_total NUMERIC(10,2);
    v_current_money_spent NUMERIC(10,2);
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
        RAISE EXCEPTION 'Access Denied: Only Admins can perform closing';
    END IF;

    -- Capture fixed timestamp for atomic consistency
    v_now := NOW();
    
    -- Lock settings row to prevent concurrent closing operations
    SELECT 
        last_reset_date, 
        reinvest_mode,
        reinvest_value, -- used for both pct and fixed based on logic
        money_spent_total
    INTO 
        v_last_reset, 
        v_reinvest_mode,
        v_reinvest_fixed, -- temporarily hold value here
        v_current_money_spent
    FROM settings
    LIMIT 1
    FOR UPDATE;
    
    -- Calculate gross from orders in the exact time window
    -- Window: [last_reset_date, v_now)
    SELECT COALESCE(SUM(gross_total), 0)
    INTO v_gross_total
    FROM orders
    WHERE created_at >= v_last_reset 
      AND created_at < v_now;
      
    -- Calculate Reinvestment Amount
    IF v_reinvest_mode = 'percentage' THEN
        v_reinvest_amount := v_gross_total * (v_reinvest_fixed / 100);
    ELSE
        v_reinvest_amount := v_reinvest_fixed;
    END IF;
    
    -- Safety clamp: Reinvestment cannot exceed gross total (unless fixed logic allows debt, but typical cash logic stops at 0)
    -- Requirement says: "Totali non possono essere negativi"
    IF v_reinvest_amount > v_gross_total THEN
       -- Option: Cap it or Error? Requirement says "Validare e avvisare".
       -- Raising exception ensures integrity.
       RAISE EXCEPTION 'Reinvestment amount (€%) exceeds Gross Total (€%)', v_reinvest_amount, v_gross_total;
    END IF;
    
    v_net_total := v_gross_total - v_reinvest_amount;
    
    -- Insert into history
    INSERT INTO load_history (
        created_at,
        gross_total, 
        net_total, 
        reinvest_amount, 
        money_spent_moved
    )
    VALUES (
        v_now,
        v_gross_total, 
        v_net_total, 
        v_reinvest_amount, 
        v_reinvest_amount -- The amount that BECOMES the new money spent
    );
    
    -- Update settings
    UPDATE settings
    SET 
        last_reset_date = v_now,
        money_spent_total = v_reinvest_amount, -- Reset loop: reinvestment becomes expenses
        updated_at = v_now
    WHERE id = 1; -- Assume singleton settings row
    
    -- Return Summary
    RETURN json_build_object(
        'success', true,
        'gross_total', v_gross_total,
        'net_total', v_net_total,
        'reinvest_amount', v_reinvest_amount,
        'new_reset_date', v_now
    );
END;
$$;

-- Grant permissions (RLS policies are separate, but RPCs need execute)
GRANT EXECUTE ON FUNCTION create_staff(TEXT, TEXT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION perform_closing_load() TO authenticated;
