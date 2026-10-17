-- Make reminders.created_by_staff_id nullable so staff can be deleted
ALTER TABLE reminders ALTER COLUMN created_by_staff_id DROP NOT NULL;

-- Allow ON DELETE SET NULL for safety
ALTER TABLE reminders DROP CONSTRAINT IF EXISTS reminders_created_by_staff_id_fkey;
ALTER TABLE reminders
  ADD CONSTRAINT reminders_created_by_staff_id_fkey
  FOREIGN KEY (created_by_staff_id) REFERENCES staff(id) ON DELETE SET NULL;