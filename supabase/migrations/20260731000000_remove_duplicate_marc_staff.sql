-- Remove duplicate staff member "MARC" and reassign all references to "MARCO"
-- This handles a test account that was accidentally created, duplicating MARCO.

DO $$
DECLARE
    v_marc_id UUID;
    v_marco_id UUID;
BEGIN
    -- Find MARC and MARCO
    SELECT id INTO v_marc_id FROM staff WHERE UPPER(name) = 'MARC';
    SELECT id INTO v_marco_id FROM staff WHERE UPPER(name) = 'MARCO';

    -- Only proceed if both exist and are different
    IF v_marc_id IS NOT NULL AND v_marco_id IS NOT NULL AND v_marc_id != v_marco_id THEN
        -- Reassign reservations
        UPDATE reservations SET created_by_staff_id = v_marco_id
        WHERE created_by_staff_id = v_marc_id;

        -- Reassign orders
        UPDATE orders SET sold_by_staff_id = v_marco_id
        WHERE sold_by_staff_id = v_marc_id;

        -- Reassign reminders
        UPDATE reminders SET created_by_staff_id = v_marco_id
        WHERE created_by_staff_id = v_marc_id;

        -- Reassign audit_log
        UPDATE audit_log SET staff_id = v_marco_id
        WHERE staff_id = v_marc_id;

        -- Reassign archived_loads
        UPDATE archived_loads SET created_by = v_marco_id
        WHERE created_by = v_marc_id;

        -- Delete staff_sessions (has ON DELETE CASCADE but delete explicitly)
        DELETE FROM staff_sessions WHERE staff_id = v_marc_id;

        -- Delete MARC
        DELETE FROM staff WHERE id = v_marc_id;

        RAISE NOTICE 'MARC (id=%) successfully merged into MARCO (id=%)', v_marc_id, v_marco_id;
    ELSIF v_marc_id IS NOT NULL AND v_marco_id IS NULL THEN
        -- MARCO doesn't exist but MARC does — rename MARC to MARCO
        UPDATE staff SET name = 'MARCO' WHERE id = v_marc_id;
        RAISE NOTICE 'MARC renamed to MARCO (id=%)', v_marc_id;
    ELSE
        RAISE NOTICE 'No duplicate MARC found — nothing to do';
    END IF;
END $$;
