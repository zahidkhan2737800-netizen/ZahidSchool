-- =========================================================================================
-- schools_upgrade.sql
-- Adds new business columns to the schools table for SaaS licensing.
-- =========================================================================================

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='schools' AND column_name='city') THEN
        ALTER TABLE public.schools ADD COLUMN city TEXT;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='schools' AND column_name='whatsapp') THEN
        ALTER TABLE public.schools ADD COLUMN whatsapp TEXT;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='schools' AND column_name='max_students') THEN
        ALTER TABLE public.schools ADD COLUMN max_students INTEGER DEFAULT 100;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='schools' AND column_name='monthly_fee') THEN
        ALTER TABLE public.schools ADD COLUMN monthly_fee NUMERIC DEFAULT 0;
    END IF;
END $$;

-- =========================================================================================
-- DONE! Run this then refresh saas_master_console.html
-- =========================================================================================
