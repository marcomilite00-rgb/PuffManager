-- Migration: Fix Database RLS Policies, Function Search Paths, and Foreign Key Indexes
-- Date: 2026-10-16
-- Description:
-- 1. Sets fixed search_path = public, extensions on all 17 public RPC functions
-- 2. Creates covering indexes on all 16 unindexed foreign keys
-- 3. Implements comprehensive RLS policies across all tables in public schema to allow
--    authenticated staff to login (via staff_sessions), access inventory, orders, reservations, etc.

-- 1. Helper function
CREATE OR REPLACE FUNCTION get_current_staff_role() 
RETURNS staff_role AS $$
    SELECT s.role FROM staff s 
    JOIN staff_sessions ss ON ss.staff_id = s.id 
    WHERE ss.auth_uid = (SELECT auth.uid()) 
      AND (ss.revoked_at IS NULL OR ss.revoked_at > now())
    LIMIT 1;
$$ LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, extensions;

-- 2. Fixed search_path on functions
ALTER FUNCTION public.add_product_flavor(p_name text) SET search_path = public, extensions;
ALTER FUNCTION public.add_product_model(p_name text) SET search_path = public, extensions;
ALTER FUNCTION public.add_reservation_item(p_reservation_id uuid, p_variant_id uuid, p_qty integer, p_price_final numeric) SET search_path = public, extensions;
ALTER FUNCTION public.cancel_reminder_to_reservation(p_reminder_id uuid) SET search_path = public, extensions;
ALTER FUNCTION public.cancel_reservation(p_res_id uuid) SET search_path = public, extensions;
ALTER FUNCTION public.create_product_variant(p_default_price numeric, p_flavor_id uuid, p_initial_qty integer, p_model_id uuid) SET search_path = public, extensions;
ALTER FUNCTION public.create_reservation(p_staff_id uuid, p_customer_name text, p_items jsonb) SET search_path = public, extensions;
ALTER FUNCTION public.direct_sale(p_staff_id uuid, p_customer_name text, p_payment_amount numeric, p_items jsonb, p_scope_id uuid) SET search_path = public, extensions;
ALTER FUNCTION public.fulfill_reservation(p_res_id uuid, p_staff_id uuid, p_payment_amount numeric, p_scope_id uuid) SET search_path = public, extensions;
ALTER FUNCTION public.get_staff_list_for_login() SET search_path = public, extensions;
ALTER FUNCTION public.handle_new_variant_inventory() SET search_path = public, extensions;
ALTER FUNCTION public.pay_reminder(p_reminder_id uuid, p_payment_amount numeric, p_staff_id uuid) SET search_path = public, extensions;
ALTER FUNCTION public.resolve_reminder_debt(p_reminder_id uuid) SET search_path = public, extensions;
ALTER FUNCTION public.update_reservation_item(p_item_id uuid, p_new_qty integer) SET search_path = public, extensions;
ALTER FUNCTION public.update_reservation_item(p_item_id uuid, p_new_qty integer, p_new_price numeric) SET search_path = public, extensions;
ALTER FUNCTION public.update_staff_pin(p_staff_id uuid, p_new_pin text) SET search_path = public, extensions;
ALTER FUNCTION public.verify_staff_pin(p_staff_name text, p_pin text) SET search_path = public, extensions;

-- 3. Foreign key covering indexes
CREATE INDEX IF NOT EXISTS idx_archived_loads_created_by ON archived_loads(created_by);
CREATE INDEX IF NOT EXISTS idx_order_items_order_id ON order_items(order_id);
CREATE INDEX IF NOT EXISTS idx_order_items_variant_id ON order_items(variant_id);
CREATE INDEX IF NOT EXISTS idx_orders_customer_id ON orders(customer_id);
CREATE INDEX IF NOT EXISTS idx_orders_sold_by_staff_id ON orders(sold_by_staff_id);
CREATE INDEX IF NOT EXISTS idx_orders_source_reservation_id ON orders(source_reservation_id);
CREATE INDEX IF NOT EXISTS idx_payments_order_id ON payments(order_id);
CREATE INDEX IF NOT EXISTS idx_product_variants_flavor_id ON product_variants(flavor_id);
CREATE INDEX IF NOT EXISTS idx_reminders_created_by ON reminders(created_by);
CREATE INDEX IF NOT EXISTS idx_reminders_created_by_staff_id ON reminders(created_by_staff_id);
CREATE INDEX IF NOT EXISTS idx_reminders_order_id ON reminders(order_id);
CREATE INDEX IF NOT EXISTS idx_reminders_scope_id ON reminders(scope_id);
CREATE INDEX IF NOT EXISTS idx_reservation_items_reservation_id ON reservation_items(reservation_id);
CREATE INDEX IF NOT EXISTS idx_reservation_items_variant_id ON reservation_items(variant_id);
CREATE INDEX IF NOT EXISTS idx_reservations_created_by_staff_id ON reservations(created_by_staff_id);
CREATE INDEX IF NOT EXISTS idx_staff_sessions_staff_id ON staff_sessions(staff_id);

-- 4. RLS Policies
-- staff_sessions
CREATE POLICY "staff_sessions_select_policy" ON staff_sessions
FOR SELECT TO authenticated, anon
USING (true);

CREATE POLICY "staff_sessions_insert_policy" ON staff_sessions
FOR INSERT TO authenticated, anon
WITH CHECK ((SELECT auth.uid()) = auth_uid);

CREATE POLICY "staff_sessions_update_policy" ON staff_sessions
FOR UPDATE TO authenticated, anon
USING ((SELECT auth.uid()) = auth_uid)
WITH CHECK ((SELECT auth.uid()) = auth_uid);

CREATE POLICY "staff_sessions_delete_policy" ON staff_sessions
FOR DELETE TO authenticated
USING (true);

-- staff
CREATE POLICY "staff_select_policy" ON staff
FOR SELECT TO authenticated, anon
USING (true);

CREATE POLICY "staff_insert_policy" ON staff
FOR INSERT TO authenticated
WITH CHECK (true);

CREATE POLICY "staff_update_policy" ON staff
FOR UPDATE TO authenticated
USING (true)
WITH CHECK (true);

CREATE POLICY "staff_delete_policy" ON staff
FOR DELETE TO authenticated
USING (true);

-- inventory
CREATE POLICY "inventory_select_policy" ON inventory
FOR SELECT TO authenticated, anon
USING (true);

CREATE POLICY "inventory_insert_policy" ON inventory
FOR INSERT TO authenticated
WITH CHECK (true);

CREATE POLICY "inventory_update_policy" ON inventory
FOR UPDATE TO authenticated
USING (true)
WITH CHECK (true);

CREATE POLICY "inventory_delete_policy" ON inventory
FOR DELETE TO authenticated
USING (true);

-- settings
CREATE POLICY "settings_select_policy" ON settings
FOR SELECT TO authenticated, anon
USING (true);

CREATE POLICY "settings_insert_policy" ON settings
FOR INSERT TO authenticated
WITH CHECK (true);

CREATE POLICY "settings_update_policy" ON settings
FOR UPDATE TO authenticated
USING (true)
WITH CHECK (true);

CREATE POLICY "settings_delete_policy" ON settings
FOR DELETE TO authenticated
USING (true);

-- reservations & reservation_items
CREATE POLICY "reservations_select_policy" ON reservations
FOR SELECT TO authenticated
USING (true);

CREATE POLICY "reservations_insert_policy" ON reservations
FOR INSERT TO authenticated
WITH CHECK (true);

CREATE POLICY "reservations_update_policy" ON reservations
FOR UPDATE TO authenticated
USING (true)
WITH CHECK (true);

CREATE POLICY "reservations_delete_policy" ON reservations
FOR DELETE TO authenticated
USING (true);

CREATE POLICY "reservation_items_select_policy" ON reservation_items
FOR SELECT TO authenticated
USING (true);

CREATE POLICY "reservation_items_insert_policy" ON reservation_items
FOR INSERT TO authenticated
WITH CHECK (true);

CREATE POLICY "reservation_items_update_policy" ON reservation_items
FOR UPDATE TO authenticated
USING (true)
WITH CHECK (true);

CREATE POLICY "reservation_items_delete_policy" ON reservation_items
FOR DELETE TO authenticated
USING (true);

-- orders & order_items
CREATE POLICY "orders_select_policy" ON orders
FOR SELECT TO authenticated
USING (true);

CREATE POLICY "orders_insert_policy" ON orders
FOR INSERT TO authenticated
WITH CHECK (true);

CREATE POLICY "orders_update_policy" ON orders
FOR UPDATE TO authenticated
USING (true)
WITH CHECK (true);

CREATE POLICY "orders_delete_policy" ON orders
FOR DELETE TO authenticated
USING (true);

CREATE POLICY "order_items_select_policy" ON order_items
FOR SELECT TO authenticated
USING (true);

CREATE POLICY "order_items_insert_policy" ON order_items
FOR INSERT TO authenticated
WITH CHECK (true);

CREATE POLICY "order_items_update_policy" ON order_items
FOR UPDATE TO authenticated
USING (true)
WITH CHECK (true);

CREATE POLICY "order_items_delete_policy" ON order_items
FOR DELETE TO authenticated
USING (true);

-- payments
CREATE POLICY "payments_select_policy" ON payments
FOR SELECT TO authenticated
USING (true);

CREATE POLICY "payments_insert_policy" ON payments
FOR INSERT TO authenticated
WITH CHECK (true);

CREATE POLICY "payments_update_policy" ON payments
FOR UPDATE TO authenticated
USING (true)
WITH CHECK (true);

CREATE POLICY "payments_delete_policy" ON payments
FOR DELETE TO authenticated
USING (true);

-- load_history
CREATE POLICY "load_history_select_policy" ON load_history
FOR SELECT TO authenticated
USING (true);

CREATE POLICY "load_history_insert_policy" ON load_history
FOR INSERT TO authenticated
WITH CHECK (true);

CREATE POLICY "load_history_update_policy" ON load_history
FOR UPDATE TO authenticated
USING (true)
WITH CHECK (true);

CREATE POLICY "load_history_delete_policy" ON load_history
FOR DELETE TO authenticated
USING (true);

-- scopes
CREATE POLICY "scopes_select_policy" ON scopes
FOR SELECT TO authenticated
USING (true);

CREATE POLICY "scopes_insert_policy" ON scopes
FOR INSERT TO authenticated
WITH CHECK (true);

CREATE POLICY "scopes_update_policy" ON scopes
FOR UPDATE TO authenticated
USING (true)
WITH CHECK (true);

CREATE POLICY "scopes_delete_policy" ON scopes
FOR DELETE TO authenticated
USING (true);

-- customers
CREATE POLICY "customers_select_policy" ON customers
FOR SELECT TO authenticated
USING (true);

CREATE POLICY "customers_insert_policy" ON customers
FOR INSERT TO authenticated
WITH CHECK (true);

CREATE POLICY "customers_update_policy" ON customers
FOR UPDATE TO authenticated
USING (true)
WITH CHECK (true);

CREATE POLICY "customers_delete_policy" ON customers
FOR DELETE TO authenticated
USING (true);

-- product_models, product_flavors, product_variants write policies
CREATE POLICY "product_models_insert_policy" ON product_models FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "product_models_update_policy" ON product_models FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "product_models_delete_policy" ON product_models FOR DELETE TO authenticated USING (true);

CREATE POLICY "product_flavors_insert_policy" ON product_flavors FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "product_flavors_update_policy" ON product_flavors FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "product_flavors_delete_policy" ON product_flavors FOR DELETE TO authenticated USING (true);

CREATE POLICY "product_variants_insert_policy" ON product_variants FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "product_variants_update_policy" ON product_variants FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "product_variants_delete_policy" ON product_variants FOR DELETE TO authenticated USING (true);

-- reminders
CREATE POLICY "reminders_update_policy" ON reminders FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "reminders_delete_policy" ON reminders FOR DELETE TO authenticated USING (true);
