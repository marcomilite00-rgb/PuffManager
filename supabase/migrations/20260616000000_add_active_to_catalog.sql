-- Add active and deleted columns to product_models and product_flavors to support logical deletion
ALTER TABLE product_models ADD COLUMN IF NOT EXISTS active BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE product_models ADD COLUMN IF NOT EXISTS deleted BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE product_flavors ADD COLUMN IF NOT EXISTS active BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE product_flavors ADD COLUMN IF NOT EXISTS deleted BOOLEAN NOT NULL DEFAULT false;

-- Add deleted column to product_variants
ALTER TABLE product_variants ADD COLUMN IF NOT EXISTS deleted BOOLEAN NOT NULL DEFAULT false;
