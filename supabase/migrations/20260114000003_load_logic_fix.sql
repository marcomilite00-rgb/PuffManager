-- Migration: Fix Closing Logic and Add Totals
-- 1. Add total tracking columns to settings
ALTER TABLE settings
ADD COLUMN IF NOT EXISTS total_gross_earned NUMERIC(10,2) DEFAULT 0,
ADD COLUMN IF NOT EXISTS total_net_earned NUMERIC(10,2) DEFAULT 0;

-- 2. Update perform_closing_load RPC
-- Changes: Accumulate money_spent, Update new totals columns, Reset fixed reinvestment
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
BEGIN
    -- Authorization Check
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

    v_now := NOW();
    
    -- Lock settings
    SELECT 
        last_reset_date, 
        reinvest_mode,
        reinvest_value
    INTO 
        v_last_reset, 
        v_reinvest_mode,
        v_reinvest_fixed
    FROM settings
    LIMIT 1
    FOR UPDATE;
    
    -- Calculate Gross from orders since last reset
    SELECT COALESCE(SUM(gross_total), 0)
    INTO v_gross_total
    FROM orders
    WHERE created_at >= v_last_reset 
      AND created_at < v_now;
      
    -- Calculate Reinvestment
    IF v_reinvest_mode = 'percentage' THEN
        v_reinvest_amount := v_gross_total * (v_reinvest_fixed / 100);
    ELSE
        v_reinvest_amount := v_reinvest_fixed;
    END IF;
    
    -- Safety clamp as per previous logic
    IF v_reinvest_amount > v_gross_total THEN
       RAISE EXCEPTION 'Reinvestment amount (€%) exceeds Gross Total (€%)', v_reinvest_amount, v_gross_total;
    END IF;
    
    v_net_total := v_gross_total - v_reinvest_amount;
    
    -- Insert History
    INSERT INTO load_history (
        created_at, gross_total, net_total, reinvest_amount, money_spent_moved
    ) VALUES (
        v_now, v_gross_total, v_net_total, v_reinvest_amount, v_reinvest_amount
    );
    
    -- Update Settings (Atomic State Transition)
    UPDATE settings
    SET 
        last_reset_date = v_now,
        updated_at = v_now,
        -- ACCUMULATE spending (Old logic was overwrite)
        money_spent_total = COALESCE(money_spent_total, 0) + v_reinvest_amount,
        -- ACCUMULATE totals
        total_gross_earned = COALESCE(total_gross_earned, 0) + v_gross_total,
        total_net_earned = COALESCE(total_net_earned, 0) + v_net_total,
        -- RESET fixed reinvestment value if mode is fixed (Percentage stays as config)
        reinvest_value = CASE 
            WHEN reinvest_mode = 'fixed' THEN 0 
            ELSE reinvest_value 
        END
    WHERE id = 1;
    
    RETURN json_build_object(
        'success', true,
        'gross_total', v_gross_total,
        'net_total', v_net_total,
        'reinvest_amount', v_reinvest_amount,
        'new_reset_date', v_now
    );
END;
$$;
