-- Migration: Multi-tenant Scopes & RLS for Reminders
-- 1. Create Scopes Tables
CREATE TABLE IF NOT EXISTS scopes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS scope_members (
    scope_id UUID REFERENCES scopes(id) ON DELETE CASCADE,
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE, -- Link to Supabase Auth
    role TEXT CHECK (role IN ('admin', 'staff', 'helper')),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    PRIMARY KEY (scope_id, user_id)
);

-- 2. Create Default Scope & Migrate Existing Staff
-- We assume current auth.users are staff. If 'staff' table exists effectively as profile, we map it.
-- NOTE: For this migration to work purely in SQL without external script, we need a default scope.
DO $$
DECLARE
    v_scope_id UUID;
BEGIN
    -- Create default scope if none exists
    IF NOT EXISTS (SELECT 1 FROM scopes) THEN
        INSERT INTO scopes (name) VALUES ('Main Store') RETURNING id INTO v_scope_id;
    ELSE
        SELECT id INTO v_scope_id FROM scopes LIMIT 1;
    END IF;

    -- Migrate existing users if any (best effort, assumes staff table has auth_id or similar, 
    -- but usually we rely on auth.users directly for RLS. 
    -- IF you have a separate staff table causing dual-source of truth, we proceed with careful mapping).
    -- Here we allow manual population or subsequent logic to fill scope_members.
END $$;

-- 3. Update Reminders Table
ALTER TABLE reminders 
ADD COLUMN IF NOT EXISTS scope_id UUID REFERENCES scopes(id),
ADD COLUMN IF NOT EXISTS created_by UUID REFERENCES auth.users(id), -- Transitioning from created_by_staff_id to auth.uid()
ADD COLUMN IF NOT EXISTS title TEXT,
ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

-- Backfill default scope for existing reminders
UPDATE reminders 
SET scope_id = (SELECT id FROM scopes LIMIT 1) 
WHERE scope_id IS NULL;

-- Make scope_id mandatory after backfill
ALTER TABLE reminders ALTER COLUMN scope_id SET NOT NULL;

-- 4. RLS Helper Functions
CREATE OR REPLACE FUNCTION is_admin_or_staff(p_scope_id UUID) 
RETURNS BOOLEAN AS $$
BEGIN
    RETURN EXISTS (
        SELECT 1 FROM scope_members 
        WHERE scope_id = p_scope_id 
        AND user_id = auth.uid() 
        AND role IN ('admin', 'staff')
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION is_helper(p_scope_id UUID) 
RETURNS BOOLEAN AS $$
BEGIN
    RETURN EXISTS (
        SELECT 1 FROM scope_members 
        WHERE scope_id = p_scope_id 
        AND user_id = auth.uid() 
        AND role = 'helper'
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION is_member(p_scope_id UUID)
RETURNS BOOLEAN AS $$
BEGIN
    RETURN EXISTS (
        SELECT 1 FROM scope_members
        WHERE scope_id = p_scope_id
        AND user_id = auth.uid()
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- 5. RLS Policies for Reminders
ALTER TABLE reminders ENABLE ROW LEVEL SECURITY;

-- Drop existing policies to be safe (re-apply clean)
DROP POLICY IF EXISTS "Admins/Staff view all reminders" ON reminders;
DROP POLICY IF EXISTS "Helpers view own reminders" ON reminders;
DROP POLICY IF EXISTS "Staff can create reminders" ON reminders;

-- SELECT
CREATE POLICY "reminders_select_admin_staff" ON reminders
FOR SELECT TO authenticated
USING ( is_admin_or_staff(scope_id) );

CREATE POLICY "reminders_select_helper" ON reminders
FOR SELECT TO authenticated
USING ( is_helper(scope_id) AND created_by = auth.uid() );

-- INSERT
CREATE POLICY "reminders_insert_admin_staff" ON reminders
FOR INSERT TO authenticated
WITH CHECK ( is_admin_or_staff(scope_id) );

CREATE POLICY "reminders_insert_helper" ON reminders
FOR INSERT TO authenticated
WITH CHECK ( is_helper(scope_id) AND created_by = auth.uid() );

-- UPDATE
CREATE POLICY "reminders_update_admin_staff" ON reminders
FOR UPDATE TO authenticated
USING ( is_admin_or_staff(scope_id) )
WITH CHECK ( is_admin_or_staff(scope_id) );

CREATE POLICY "reminders_update_helper" ON reminders
FOR UPDATE TO authenticated
USING ( is_helper(scope_id) AND created_by = auth.uid() )
WITH CHECK ( is_helper(scope_id) AND created_by = auth.uid() );

-- DELETE
CREATE POLICY "reminders_delete_admin_staff" ON reminders
FOR DELETE TO authenticated
USING ( is_admin_or_staff(scope_id) );

CREATE POLICY "reminders_delete_helper" ON reminders
FOR DELETE TO authenticated
USING ( is_helper(scope_id) AND created_by = auth.uid() );

-- 6. Trigger to auto-update updated_at
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

DROP TRIGGER IF EXISTS update_reminders_updated_at ON reminders;
CREATE TRIGGER update_reminders_updated_at
    BEFORE UPDATE ON reminders
    FOR EACH ROW
    EXECUTE PROCEDURE update_updated_at_column();
