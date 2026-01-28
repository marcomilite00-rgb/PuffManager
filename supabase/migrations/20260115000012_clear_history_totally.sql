-- Migration to completely reset history and financial totals

-- 1. Remove all financial transaction data
DELETE FROM reminders;
DELETE FROM payments;
DELETE FROM order_items;
DELETE FROM orders;
DELETE FROM load_history;

-- 2. Reset settings totals and session date
UPDATE settings 
SET 
  total_gross_earned = 0, 
  total_net_earned = 0, 
  money_spent_total = 0,
  last_reset_date = now(),
  updated_at = now();

-- 3. Also clear reminders that were resolved/deleted if needed (optional but recommended for a clean history)
-- DELETE FROM reminders WHERE amount_due = 0;
