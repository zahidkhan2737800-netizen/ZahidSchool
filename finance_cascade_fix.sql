-- =========================================================================================
-- finance_cascade_fix.sql
-- Adds reference_id to expenses to permanently fix payroll cascade deletes.
-- =========================================================================================

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='expenses' AND column_name='reference_id') THEN
        ALTER TABLE public.expenses ADD COLUMN reference_id UUID;
    END IF;
END $$;
