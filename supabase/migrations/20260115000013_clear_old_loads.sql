-- Script to delete ONLY "Old Loads" (Previous sessions)
-- This clears the archived orders but keeps the current session active.

DO $$ 
DECLARE 
    v_last_reset TIMESTAMPTZ;
BEGIN
    -- 1. Get the current reset date
    SELECT last_reset_date INTO v_last_reset FROM settings LIMIT 1;

    -- 2. Delete related records that might have FKs
    -- Cleanup reminders associated with these old orders
    DELETE FROM reminders 
    WHERE order_id IN (SELECT id FROM orders WHERE created_at <= v_last_reset);

    -- 3. Delete orders (order_items and payments have ON DELETE CASCADE usually, but reminders didn't)
    DELETE FROM orders 
    WHERE created_at <= v_last_reset;

    -- 3. Reset the cumulative totals in settings (since they represent these old loads)
    UPDATE settings 
    SET 
        total_gross_earned = 0,
        total_net_earned = 0,
        updated_at = now()
    WHERE id = 1;

    -- 4. Clear the load history records as well
    DELETE FROM load_history;
END $$;
