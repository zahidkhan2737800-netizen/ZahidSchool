-- =========================================================================================
-- data_isolation_fix.sql
-- Fixes existing rows with NULL school_id and verifies RLS is enforced on all tables.
-- Run this in Supabase SQL Editor.
-- =========================================================================================

-- STEP 1: Tag ALL existing rows that still have NULL school_id 
-- with the Legacy school (00000000-0000-0000-0000-000000000000)
-- This means all YOUR current students, challans etc. belong to "Zahid Primary School (Legacy)"
DO $$
DECLARE
    target_tables TEXT[] := ARRAY[
        'admissions', 'classes', 'attendance', 'challans', 
        'fee_heads', 'staff', 'family_contacts', 'fee_contacts', 
        'wa_templates', 'other_revenue', 'expenses', 'transactions'
    ];
    t TEXT;
BEGIN
    FOREACH t IN ARRAY target_tables
    LOOP
        IF EXISTS (
            SELECT 1 FROM information_schema.columns 
            WHERE table_schema = 'public' AND table_name = t AND column_name = 'school_id'
        ) THEN
            EXECUTE format(
                'UPDATE public.%I SET school_id = ''00000000-0000-0000-0000-000000000000'' WHERE school_id IS NULL',
                t
            );
        END IF;
    END LOOP;
END $$;

-- STEP 2: Verify RLS is enabled and the Tenant Isolation Policy exists on all key tables
-- (Re-applies it safely if missing)
DO $$
DECLARE
    target_tables TEXT[] := ARRAY[
        'admissions', 'classes', 'attendance', 'challans', 
        'fee_heads', 'staff', 'family_contacts', 'fee_contacts', 
        'wa_templates', 'other_revenue', 'expenses', 'transactions'
    ];
    t TEXT;
BEGIN
    FOREACH t IN ARRAY target_tables
    LOOP
        IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = t) THEN
            -- Enable RLS
            EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY;', t);

            -- Only apply school_id-based RLS if the column actually exists on this table
            IF EXISTS (
                SELECT 1 FROM information_schema.columns 
                WHERE table_schema = 'public' AND table_name = t AND column_name = 'school_id'
            ) THEN
                -- Drop old policy if it exists (clean slate)
                EXECUTE format('DROP POLICY IF EXISTS "Tenant Isolation Policy" ON public.%I;', t);

                -- Re-create strict tenant isolation
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
        END IF;
    END LOOP;
END $$;

-- STEP 3: Also fix user_roles - assign any NULL school_id users to Legacy school
UPDATE public.user_roles 
SET school_id = '00000000-0000-0000-0000-000000000000' 
WHERE school_id IS NULL;

-- =========================================================================================
-- DATA ISOLATION FIX COMPLETE!
-- King (Kinf school) will now only see Kinf data.
-- Zahid (Legacy school) will only see Zahid data.
-- =========================================================================================
