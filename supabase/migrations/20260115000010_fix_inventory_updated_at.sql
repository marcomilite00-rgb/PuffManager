-- FIX: Aggiunge la colonna 'updated_at' alla tabella 'inventory'
-- Questo risolve l'errore "column updated_at of relation inventory does not exist" durante la vendita diretta.

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 
        FROM information_schema.columns 
        WHERE table_name = 'inventory' 
        AND column_name = 'updated_at'
    ) THEN
        ALTER TABLE inventory ADD COLUMN updated_at TIMESTAMPTZ DEFAULT NOW();
    END IF;
END $$;
