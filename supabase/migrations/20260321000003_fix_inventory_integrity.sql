-- Migration: Fix Inventory Integrity
-- Purpose: 
-- 1. Backfill missing inventory records for all variants
-- 2. Add trigger to automatically create inventory record for new variants

-- 1. Backfill
INSERT INTO inventory (variant_id, qty)
SELECT id, 0 
FROM product_variants 
WHERE id NOT IN (SELECT variant_id FROM inventory)
ON CONFLICT (variant_id) DO NOTHING;

-- 2. Trigger Function
CREATE OR REPLACE FUNCTION handle_new_variant_inventory()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO inventory (variant_id, qty)
    VALUES (NEW.id, 0)
    ON CONFLICT (variant_id) DO NOTHING;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 3. Trigger
DROP TRIGGER IF EXISTS tr_new_variant_inventory ON product_variants;
CREATE TRIGGER tr_new_variant_inventory
AFTER INSERT ON product_variants
FOR EACH ROW
EXECUTE FUNCTION handle_new_variant_inventory();
