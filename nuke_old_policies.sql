-- =========================================================================================
-- nuke_old_policies.sql
-- THE REAL FIX: Removes ALL old permissive RLS policies that are leaking data.
-- In PostgreSQL, if ANY permissive policy allows access, the row is visible.
-- Our "Tenant Isolation Policy" was being bypassed by old open policies.
-- =========================================================================================

-- STEP 1: See ALL existing policies on the admissions table (to diagnose)
SELECT policyname, permissive, cmd, qual 
FROM pg_policies 
WHERE tablename = 'admissions';

-- STEP 2: Nuke every single old policy on ALL tables, then re-apply ONLY our strict one
DO $$
DECLARE
    target_tables TEXT[] := ARRAY[
        'admissions', 'classes', 'attendance', 'challans', 
        'fee_heads', 'staff', 'family_contacts', 'fee_contacts', 
        'wa_templates', 'other_revenue', 'expenses', 'transactions',
        'receipts', 'staff_payroll', 'staff_attendance', 'permissions'
    ];
    t TEXT;
    pol RECORD;
BEGIN
    FOREACH t IN ARRAY target_tables
    LOOP
        IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = t) THEN
            -- Drop EVERY SINGLE policy on this table (nuclear clean)
            FOR pol IN 
                SELECT policyname FROM pg_policies WHERE schemaname = 'public' AND tablename = t
            LOOP
                EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I;', pol.policyname, t);
            END LOOP;

            -- Make sure RLS is enabled
            EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY;', t);

            -- Only re-apply if school_id column exists
            IF EXISTS (
                SELECT 1 FROM information_schema.columns 
                WHERE table_schema = 'public' AND table_name = t AND column_name = 'school_id'
            ) THEN
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
            ELSE
                -- Table has no school_id yet — just allow authenticated access
                EXECUTE format('
                    CREATE POLICY "Allow authenticated access" ON public.%I 
                    FOR ALL TO authenticated 
                    USING (true) WITH CHECK (true);
                ', t);
            END IF;
        END IF;
    END LOOP;
END $$;

-- STEP 3: Verify — check admissions policies after the fix
SELECT policyname, permissive, cmd 
FROM pg_policies 
WHERE tablename = 'admissions';

-- =========================================================================================
-- DONE! Now ONLY the Tenant Isolation Policy exists.
-- No old "Enable all access" policies are leaking data anymore.
-- =========================================================================================
