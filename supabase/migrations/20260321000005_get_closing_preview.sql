CREATE OR REPLACE FUNCTION get_closing_preview()
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
    v_last_reset TIMESTAMPTZ;
    v_gross_total NUMERIC(10,2);
BEGIN
    SELECT last_reset_date INTO v_last_reset
    FROM settings LIMIT 1;

    SELECT COALESCE(SUM(gross_total), 0) INTO v_gross_total
    FROM orders
    WHERE created_at >= v_last_reset
      AND (is_archived = false OR is_archived IS NULL);

    RETURN json_build_object('gross_total', v_gross_total);
END;
$$;

GRANT EXECUTE ON FUNCTION get_closing_preview() TO authenticated;
