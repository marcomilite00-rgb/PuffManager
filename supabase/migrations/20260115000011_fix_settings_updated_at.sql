-- Migration to fix missing 'updated_at' column in settings table

-- 1. Ensure updated_at exists
ALTER TABLE settings 
ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT now();

-- 2. Ensure total tracking columns exist (safeguard)
ALTER TABLE settings
ADD COLUMN IF NOT EXISTS total_gross_earned NUMERIC(10,2) DEFAULT 0,
ADD COLUMN IF NOT EXISTS total_net_earned NUMERIC(10,2) DEFAULT 0;

-- 3. Ensure last_reset_date exists (safeguard)
ALTER TABLE settings 
ADD COLUMN IF NOT EXISTS last_reset_date TIMESTAMPTZ DEFAULT now();
