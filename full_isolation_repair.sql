-- =========================================================================================
-- full_isolation_repair.sql
-- Comprehensive fix: adds school_id to ALL missing tables, tags all existing data 
-- to Zahid Legacy school, and re-applies strict RLS everywhere.
-- =========================================================================================

-- PART 1: Add school_id to all key tables that are missing it
DO $$
DECLARE
    target_tables TEXT[] := ARRAY[
        'admissions', 'classes', 'attendance', 'challans', 
        'fee_heads', 'staff', 'family_contacts', 'fee_contacts', 
        'wa_templates', 'other_revenue', 'expenses', 'transactions',
        'receipts', 'staff_payroll', 'staff_attendance'
    ];
    t TEXT;
BEGIN
    FOREACH t IN ARRAY target_tables
    LOOP
        -- Check if table exists
        IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = t) THEN
            -- Add school_id column if missing
            IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = t AND column_name = 'school_id') THEN
                EXECUTE format('ALTER TABLE public.%I ADD COLUMN school_id UUID REFERENCES public.schools(id) ON DELETE CASCADE;', t);
            END IF;

            -- Tag ALL existing rows without a school_id as belonging to Zahid Legacy school
            EXECUTE format(
                'UPDATE public.%I SET school_id = ''00000000-0000-0000-0000-000000000000'' WHERE school_id IS NULL',
                t
            );

            -- Enable RLS
            EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY;', t);

            -- Clean and re-apply the Tenant Isolation Policy
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

-- PART 2: Fix user_roles — assign any leftover NULL school_id users to Legacy school
UPDATE public.user_roles 
SET school_id = '00000000-0000-0000-0000-000000000000' 
WHERE school_id IS NULL;

-- PART 3: Rebuild the auto-inject trigger for new inserts on all tables
DO $$
DECLARE
    target_tables TEXT[] := ARRAY[
        'admissions', 'classes', 'attendance', 'challans', 
        'fee_heads', 'staff', 'family_contacts', 'fee_contacts', 
        'wa_templates', 'other_revenue', 'expenses', 'transactions',
        'receipts', 'staff_payroll', 'staff_attendance'
    ];
    t TEXT;
BEGIN
    FOREACH t IN ARRAY target_tables
    LOOP
        IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = t) THEN
            EXECUTE format('DROP TRIGGER IF EXISTS ensure_school_id_on_insert_%I ON public.%I;', t, t);
            EXECUTE format('
                CREATE TRIGGER ensure_school_id_on_insert_%I
                BEFORE INSERT ON public.%I
                FOR EACH ROW EXECUTE FUNCTION public.trigger_set_school_id();
            ', t, t);
        END IF;
    END LOOP;
END $$;

-- =========================================================================================
-- FULL ISOLATION REPAIR COMPLETE.
-- All existing data is now tagged to Zahid Legacy school.
-- King (Kinf school) will see a completely blank system.
-- =========================================================================================
