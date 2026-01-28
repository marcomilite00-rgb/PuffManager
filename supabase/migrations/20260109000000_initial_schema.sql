-- ENUMS
CREATE TYPE staff_role AS ENUM ('admin', 'staff', 'helper');
CREATE TYPE reservation_status AS ENUM ('RESERVED', 'CANCELLED', 'SOLD');
CREATE TYPE order_status AS ENUM ('COMPLETED', 'PARTIAL_PAYMENT');

-- TABLES
CREATE TABLE staff (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL UNIQUE,
    role staff_role NOT NULL,
    pin_hash TEXT,
    pin_enabled BOOLEAN DEFAULT false,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE staff_sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    auth_uid UUID NOT NULL,
    staff_id UUID REFERENCES staff(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ DEFAULT now(),
    revoked_at TIMESTAMPTZ,
    UNIQUE(auth_uid)
);

CREATE TABLE product_models (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL UNIQUE
);

CREATE TABLE product_flavors (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL UNIQUE
);

CREATE TABLE product_variants (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    model_id UUID REFERENCES product_models(id) ON DELETE CASCADE,
    flavor_id UUID REFERENCES product_flavors(id) ON DELETE CASCADE,
    default_price DECIMAL(10,2) NOT NULL DEFAULT 0,
    unit_cost DECIMAL(10,2),
    photo_urls JSONB DEFAULT '[]'::jsonb,
    video_urls JSONB DEFAULT '[]'::jsonb,
    active BOOLEAN DEFAULT true,
    UNIQUE(model_id, flavor_id)
);

CREATE TABLE inventory (
    variant_id UUID PRIMARY KEY REFERENCES product_variants(id) ON DELETE CASCADE,
    qty INT NOT NULL DEFAULT 0 CHECK (qty >= 0)
);

CREATE TABLE customers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL UNIQUE,
    created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE reservations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    created_at TIMESTAMPTZ DEFAULT now(),
    created_by_staff_id UUID REFERENCES staff(id),
    customer_name TEXT,
    customer_id UUID REFERENCES customers(id),
    status reservation_status DEFAULT 'RESERVED',
    total_override DECIMAL(10,2),
    notes TEXT
);

CREATE TABLE reservation_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    reservation_id UUID REFERENCES reservations(id) ON DELETE CASCADE,
    variant_id UUID REFERENCES product_variants(id),
    qty INT NOT NULL CHECK (qty > 0),
    unit_price_default DECIMAL(10,2),
    unit_price_final DECIMAL(10,2)
);

CREATE TABLE orders (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    created_at TIMESTAMPTZ DEFAULT now(),
    sold_by_staff_id UUID REFERENCES staff(id),
    customer_name TEXT,
    customer_id UUID REFERENCES customers(id),
    source_reservation_id UUID REFERENCES reservations(id),
    gross_total DECIMAL(10,2) NOT NULL,
    status order_status DEFAULT 'COMPLETED',
    notes TEXT
);

CREATE TABLE order_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id UUID REFERENCES orders(id) ON DELETE CASCADE,
    variant_id UUID REFERENCES product_variants(id),
    qty INT NOT NULL CHECK (qty > 0),
    unit_price_default DECIMAL(10,2),
    unit_price_final DECIMAL(10,2),
    unit_cost DECIMAL(10,2),
    profit DECIMAL(10,2)
);

CREATE TABLE payments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id UUID REFERENCES orders(id) ON DELETE CASCADE,
    amount DECIMAL(10,2) NOT NULL,
    created_at TIMESTAMPTZ DEFAULT now(),
    note TEXT
);

CREATE TABLE settings (
    id INT PRIMARY KEY DEFAULT 1,
    money_spent_total DECIMAL(10,2) DEFAULT 0,
    reinvest_mode TEXT DEFAULT 'percentage', -- 'percentage' or 'fixed'
    reinvest_value DECIMAL(10,2) DEFAULT 30,
    updated_at TIMESTAMPTZ DEFAULT now(),
    CONSTRAINT singleton CHECK (id = 1)
);

CREATE TABLE audit_log (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    created_at TIMESTAMPTZ DEFAULT now(),
    staff_id UUID REFERENCES staff(id),
    action TEXT NOT NULL,
    entity TEXT NOT NULL,
    entity_id UUID,
    payload_json JSONB
);

-- INDEXES
CREATE INDEX idx_staff_sessions_auth_uid ON staff_sessions(auth_uid);
CREATE INDEX idx_staff_role ON staff(role);
CREATE INDEX idx_inventory_qty ON inventory(qty);
CREATE INDEX idx_reservations_status ON reservations(status);
CREATE INDEX idx_orders_created_at ON orders(created_at);

-- RLS
ALTER TABLE staff ENABLE ROW LEVEL SECURITY;
ALTER TABLE staff_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE product_models ENABLE ROW LEVEL SECURITY;
ALTER TABLE product_flavors ENABLE ROW LEVEL SECURITY;
ALTER TABLE product_variants ENABLE ROW LEVEL SECURITY;
ALTER TABLE inventory ENABLE ROW LEVEL SECURITY;
ALTER TABLE customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE reservations ENABLE ROW LEVEL SECURITY;
ALTER TABLE reservation_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE order_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_log ENABLE ROW LEVEL SECURITY;

-- HELPERS
CREATE OR REPLACE FUNCTION get_current_staff_role() RETURNS staff_role AS $$
    SELECT s.role FROM staff s 
    JOIN staff_sessions ss ON ss.staff_id = s.id 
    WHERE ss.auth_uid = auth.uid() AND ss.revoked_at IS NULL
    LIMIT 1;
$$ LANGUAGE sql STABLE SECURITY DEFINER;

-- POLICIES

-- Product & Inventory (Public-ish within Staff)
CREATE POLICY "Staff can view products" ON product_models FOR SELECT USING (true);
CREATE POLICY "Staff can view flavors" ON product_flavors FOR SELECT USING (true);
CREATE POLICY "Staff can view variants" ON product_variants FOR SELECT USING (true);
CREATE POLICY "Staff can view inventory" ON inventory FOR SELECT USING (true);

-- Admin/Staff can manage products
CREATE POLICY "Admin/Staff can manage models" ON product_models FOR ALL 
USING (get_current_staff_role() IN ('admin', 'staff'));

CREATE POLICY "Admin/Staff can manage flavors" ON product_flavors FOR ALL 
USING (get_current_staff_role() IN ('admin', 'staff'));

CREATE POLICY "Admin/Staff can manage variants" ON product_variants FOR ALL 
USING (get_current_staff_role() IN ('admin', 'staff'));

CREATE POLICY "Admin/Staff can manage inventory" ON inventory FOR ALL 
USING (get_current_staff_role() IN ('admin', 'staff'));

-- Reservations
CREATE POLICY "Helpers can manage reservations" ON reservations FOR ALL 
USING (get_current_staff_role() IN ('admin', 'staff', 'helper'));

CREATE POLICY "Helpers can manage reservation items" ON reservation_items FOR ALL 
USING (get_current_staff_role() IN ('admin', 'staff', 'helper'));

-- Orders & Payments (Admin/Staff only)
CREATE POLICY "Admin/Staff can manage orders" ON orders FOR ALL 
USING (get_current_staff_role() IN ('admin', 'staff'));

CREATE POLICY "Admin/Staff can manage order items" ON order_items FOR ALL 
USING (get_current_staff_role() IN ('admin', 'staff'));

CREATE POLICY "Admin/Staff can manage payments" ON payments FOR ALL 
USING (get_current_staff_role() IN ('admin', 'staff'));

-- Special for Helper: they can CREATE orders via RPC, but let's allow INSERT if we want or just keep it tight.
-- Requirement says: "can create orders (Prenota/Incassa)".
-- Prenota -> Reservations (Allowed above)
-- Incassa -> Orders. Let's allow Helper to INSERT into orders/items for Incassa.
CREATE POLICY "Helper can create orders" ON orders FOR INSERT 
WITH CHECK (get_current_staff_role() = 'helper');

CREATE POLICY "Helper can create order items" ON order_items FOR INSERT 
WITH CHECK (get_current_staff_role() = 'helper');

-- Customers (Admin/Staff only for management, maybe Helper for view?)
CREATE POLICY "Admin/Staff can manage customers" ON customers FOR ALL 
USING (get_current_staff_role() IN ('admin', 'staff'));

-- Settings (Admin/Staff view, Admin only edit?) 
-- Plan says: "Staff: same as Admin except dev mode".
-- Spese globali editabili da admin.
CREATE POLICY "Admin/Staff can view settings" ON settings FOR SELECT 
USING (get_current_staff_role() IN ('admin', 'staff'));

CREATE POLICY "Admin can update settings" ON settings FOR UPDATE 
USING (get_current_staff_role() = 'admin');

-- Staff management (Admin only)
CREATE POLICY "Admin can manage staff" ON staff FOR ALL 
USING (get_current_staff_role() = 'admin');

-- REALTIME
ALTER PUBLICATION supabase_realtime ADD TABLE inventory, reservations, reservation_items, orders, order_items, settings;
