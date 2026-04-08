-- =========================================================================================
-- monitoring_tenant_fix.sql
-- Fixes teacher/accountant visibility for Monitoring module in multi-tenant mode.
-- Run this in Supabase SQL Editor.
-- =========================================================================================

DO $$
DECLARE
    target_tables TEXT[] := ARRAY['monitoring_subjects', 'monitoring_topics', 'monitoring_scores'];
    t TEXT;
BEGIN
    FOREACH t IN ARRAY target_tables
    LOOP
        IF EXISTS (
            SELECT 1
            FROM information_schema.tables
            WHERE table_schema = 'public' AND table_name = t
        ) THEN
            IF NOT EXISTS (
                SELECT 1
                FROM information_schema.columns
                WHERE table_schema = 'public' AND table_name = t AND column_name = 'school_id'
            ) THEN
                EXECUTE format(
                    'ALTER TABLE public.%I ADD COLUMN school_id UUID REFERENCES public.schools(id) ON DELETE CASCADE;',
                    t
                );
            END IF;

            EXECUTE format(
                'UPDATE public.%I SET school_id = ''00000000-0000-0000-0000-000000000000'' WHERE school_id IS NULL;',
                t
            );

            EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY;', t);
            EXECUTE format('DROP POLICY IF EXISTS "Tenant Isolation Policy" ON public.%I;', t);
            EXECUTE format('
                CREATE POLICY "Tenant Isolation Policy" ON public.%I
                FOR ALL TO authenticated
                USING (
                    public.is_super_admin() OR
                    school_id = public.get_current_user_school_id()
                )
                WITH CHECK (
                    public.is_super_admin() OR
                    school_id = public.get_current_user_school_id()
                );
            ', t);
        END IF;
    END LOOP;
END $$;

-- =========================================================================================
-- MONITORING TENANT FIX COMPLETE.
-- =========================================================================================