-- Allow all authenticated users (including helpers) to view all reminders
DROP POLICY IF EXISTS "reminders_select_admin_staff" ON reminders;
DROP POLICY IF EXISTS "reminders_select_helper" ON reminders;
DROP POLICY IF EXISTS "Helpers view own reminders" ON reminders;
DROP POLICY IF EXISTS "Admins/Staff view all reminders" ON reminders;
DROP POLICY IF EXISTS "reminders_select_policy" ON reminders;

CREATE POLICY "reminders_select_policy" ON reminders
FOR SELECT TO authenticated USING (true);

