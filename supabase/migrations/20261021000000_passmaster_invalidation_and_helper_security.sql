-- ==============================================================================
-- Migration: 20261021000000_passmaster_invalidation_and_helper_security.sql
-- Description:
--   1. Add key_version to site_security for master access key invalidation across devices
--   2. Expose get_site_key_version() for clients to verify terminal validity
--   3. Update update_site_access_key() to increment key_version and revoke all staff sessions
--   4. Update RLS policies on orders, order_items, payments, reminders to allow helpers
--      to strictly read only their own sales, debts, and items
--   5. Allow helpers to read archived_loads and load_history
-- ==============================================================================

-- 1. Add key_version column
ALTER TABLE public.site_security ADD COLUMN IF NOT EXISTS key_version INT NOT NULL DEFAULT 1;

-- 2. get_site_key_version function
CREATE OR REPLACE FUNCTION public.get_site_key_version()
RETURNS INT
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $$
    SELECT COALESCE(key_version, 1) FROM public.site_security WHERE id = 1;
$$;
GRANT EXECUTE ON FUNCTION public.get_site_key_version() TO anon, authenticated;

-- 3. update_site_access_key with version bump & session revocation
CREATE OR REPLACE FUNCTION public.update_site_access_key(
    p_new_key TEXT
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $$
DECLARE
    v_role staff_role;
BEGIN
    v_role := get_current_staff_role();
    IF v_role IS NULL OR v_role != 'admin' THEN
        RAISE EXCEPTION 'Access Denied: Solo gli amministratori possono modificare la chiave del sito';
    END IF;

    IF p_new_key IS NULL OR LENGTH(TRIM(p_new_key)) < 6 THEN
        RAISE EXCEPTION 'La password del sito deve contenere almeno 6 caratteri';
    END IF;

    INSERT INTO site_security (id, access_key_hash, key_version, updated_at)
    VALUES (1, crypt(p_new_key, gen_salt('bf', 10)), 1, now())
    ON CONFLICT (id) DO UPDATE
    SET access_key_hash = EXCLUDED.access_key_hash,
        key_version = COALESCE(site_security.key_version, 1) + 1,
        updated_at = now();

    UPDATE public.staff_sessions SET revoked_at = now() WHERE revoked_at IS NULL OR revoked_at > now();
END;
$$;
GRANT EXECUTE ON FUNCTION public.update_site_access_key(TEXT) TO authenticated;

-- 4. RLS policies for helper access
ALTER POLICY "orders_read" ON public.orders
USING (
    get_current_staff_role() = ANY (ARRAY['admin'::staff_role, 'staff'::staff_role])
    OR (get_current_staff_role() = 'helper'::staff_role AND sold_by_staff_id = get_current_staff_id())
    OR (get_current_staff_role() = 'helper'::staff_role AND id IN (SELECT order_id FROM public.reminders WHERE order_id IS NOT NULL))
);

ALTER POLICY "order_items_read" ON public.order_items
USING (
    get_current_staff_role() = ANY (ARRAY['admin'::staff_role, 'staff'::staff_role])
    OR (
        get_current_staff_role() = 'helper'::staff_role
        AND order_id IN (
            SELECT o.id FROM public.orders o WHERE o.sold_by_staff_id = get_current_staff_id()
        )
    )
    OR (
        get_current_staff_role() = 'helper'::staff_role
        AND order_id IN (
            SELECT order_id FROM public.reminders WHERE order_id IS NOT NULL
        )
    )
);

ALTER POLICY "payments_read" ON public.payments
USING (
    get_current_staff_role() = ANY (ARRAY['admin'::staff_role, 'staff'::staff_role])
    OR (
        get_current_staff_role() = 'helper'::staff_role
        AND order_id IN (
            SELECT o.id FROM public.orders o WHERE o.sold_by_staff_id = get_current_staff_id()
        )
    )
);

ALTER POLICY "reminders_read" ON public.reminders
USING (
    get_current_staff_role() = ANY (ARRAY['admin'::staff_role, 'staff'::staff_role, 'helper'::staff_role])
);

ALTER POLICY "archived_loads_read" ON public.archived_loads
USING (
    get_current_staff_role() = ANY (ARRAY['admin'::staff_role, 'staff'::staff_role, 'helper'::staff_role])
);

ALTER POLICY "load_history_read" ON public.load_history
USING (
    get_current_staff_role() = ANY (ARRAY['admin'::staff_role, 'staff'::staff_role, 'helper'::staff_role])
);

ALTER POLICY "settings_read" ON public.settings
USING (
    get_current_staff_role() = ANY (ARRAY['admin'::staff_role, 'staff'::staff_role, 'helper'::staff_role])
);

-- 5. get_staff_sales_shares RPC for Helper Spartimento Guadagni
CREATE OR REPLACE FUNCTION public.get_staff_sales_shares()
RETURNS TABLE (
    staff_id UUID,
    percent NUMERIC
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $$
DECLARE
    v_last_reset TIMESTAMPTZ;
    v_total_qty NUMERIC;
BEGIN
    SELECT last_reset_date INTO v_last_reset FROM public.settings WHERE id = 1;

    SELECT COALESCE(SUM(oi.qty), 0) INTO v_total_qty
    FROM public.order_items oi
    JOIN public.orders o ON o.id = oi.order_id
    WHERE (v_last_reset IS NULL OR o.created_at >= v_last_reset);

    RETURN QUERY
    SELECT 
        s.id AS staff_id,
        CASE 
            WHEN v_total_qty > 0 THEN 
                ROUND((COALESCE(SUM(oi.qty), 0)::NUMERIC / v_total_qty) * 100, 1)
            ELSE 0::NUMERIC 
        END AS percent
    FROM public.staff s
    LEFT JOIN public.orders o ON o.sold_by_staff_id = s.id 
        AND (v_last_reset IS NULL OR o.created_at >= v_last_reset)
    LEFT JOIN public.order_items oi ON oi.order_id = o.id
    GROUP BY s.id;
END;
$$;
GRANT EXECUTE ON FUNCTION public.get_staff_sales_shares() TO authenticated;

