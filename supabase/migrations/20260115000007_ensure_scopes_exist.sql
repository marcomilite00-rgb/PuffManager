-- FIX CRITICO: Crea la tabella 'scopes' e le colonne mancanti se non esistono
-- Questo errore appare perché la prima migrazione (quella dei "scopes") non è stata eseguita.

-- 1. Crea tabella scopes se non esiste
CREATE TABLE IF NOT EXISTS scopes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. Inserisci uno scope di default se la tabella è vuota
INSERT INTO scopes (name)
SELECT 'Store'
WHERE NOT EXISTS (SELECT 1 FROM scopes);

-- 3. Assicurati che la tabella reminders abbia le colonne nuove (scope_id, title, created_by)
DO $$
BEGIN
    -- scope_id
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'reminders' AND column_name = 'scope_id') THEN
        ALTER TABLE reminders ADD COLUMN scope_id UUID REFERENCES scopes(id);
    END IF;

    -- title
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'reminders' AND column_name = 'title') THEN
        ALTER TABLE reminders ADD COLUMN title TEXT;
    END IF;

    -- created_by
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'reminders' AND column_name = 'created_by') THEN
        ALTER TABLE reminders ADD COLUMN created_by UUID REFERENCES auth.users(id);
    END IF;
END $$;
