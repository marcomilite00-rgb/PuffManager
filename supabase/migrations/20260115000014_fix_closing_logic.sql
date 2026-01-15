    -- Migration to refresh perform_closing_load logic
    -- Strictly implements the user's requested flow for closing.

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
        
        -- Calculate Gross from ACTUAL PAYMENTS since last reset
        -- (This ensures we move what's actually in the cash register)
        SELECT COALESCE(SUM(p.amount), 0)
        INTO v_gross_total
        FROM payments p
        JOIN orders o ON p.order_id = o.id
        WHERE o.created_at >= v_last_reset 
        AND o.created_at < v_now;
        
        -- Calculate Reinvestment
        IF v_reinvest_mode = 'percentage' THEN
            v_reinvest_amount := v_gross_total * (v_reinvest_fixed / 100);
        ELSE
            -- Fixed amount
            v_reinvest_amount := v_reinvest_fixed;
        END IF;
        
        -- Safety clamp: Cannot reinvest more than gross
        IF v_reinvest_amount > v_gross_total THEN
        -- Option 1: Raise Error
        -- RAISE EXCEPTION 'Reinvestment amount (%\u20AC) exceeds Gross Total (%\u20AC)', v_reinvest_amount, v_gross_total;
        -- Option 2: Cap at Gross (More user friendly for fixed amounts)
        v_reinvest_amount := v_gross_total;
        END IF;
        
        v_net_total := v_gross_total - v_reinvest_amount;
        
        -- Insert History
        INSERT INTO load_history (
            created_at, gross_total, net_total, reinvest_amount, money_spent_moved
        ) VALUES (
            v_now, v_gross_total, v_net_total, v_reinvest_amount, v_reinvest_amount
        );
        
        -- Update Settings:
        -- 1. Move Reinvestment -> Money Spent
        -- 2. Move Gross -> Total Gross History
        -- 3. Move Net -> Total Net History
        -- 4. Reset Reinvestment Value (if fixed mode)
        -- 5. Update last_reset_date (This resets the Staff/Cassa view)
        
        UPDATE settings
        SET 
            last_reset_date = v_now,
            updated_at = v_now,
            
            -- 1. Accumulate Reinvestment into Spent
            money_spent_total = COALESCE(money_spent_total, 0) + v_reinvest_amount,
            
            -- 2 & 3. Accumulate History Totals
            total_gross_earned = COALESCE(total_gross_earned, 0) + v_gross_total,
            total_net_earned = COALESCE(total_net_earned, 0) + v_net_total,
            
            -- 4. Reset reinvestment value (Always reset to 0 as requested)
            reinvest_value = 0
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
