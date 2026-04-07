-- =========================================================================================
-- fix_missing_challans_and_revenue.sql
-- Run this in your Supabase SQL Editor to fix the issue where records created by the Admin
-- are invisible to Accountants and assigned Teachers.
-- =========================================================================================

-- 1. FIX THE TRIGGER: Super Admins were unintentionally bypassing the school_id assignment.
-- If they didn't explicitly select a school_id in the frontend, it resulted in NULL.
-- This ensures that EVERY record created by ANY user gets a school_id.
CREATE OR REPLACE FUNCTION public.trigger_set_school_id()
RETURNS TRIGGER AS $$
BEGIN
    -- ALWAYS fall back to the user's primary school_id if the frontend doesn't provide one,
    -- even for super admins. This fixes the "invisible records" bug.
    IF NEW.school_id IS NULL THEN
        NEW.school_id := public.get_current_user_school_id();
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- 2. REPAIR EXISTING DATA: Any challans, receipts, or transactions currently suffering 
-- from NULL school_id (which hides them from accountants/teachers) will be assigned 
-- to the primary legacy school so that everyone can see them again.
DO $$
DECLARE
    target_tables TEXT[] := ARRAY[
        'admissions', 'classes', 'attendance', 'challans', 
        'receipts', 'fee_heads', 'finance', 'staff', 
        'family_contacts', 'fee_contacts', 'wa_templates', 
        'other_revenue', 'expenses', 'transactions', 
        'staff_payroll', 'staff_attendance'
    ];
    t TEXT;
BEGIN
    FOREACH t IN ARRAY target_tables
    LOOP
        IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = t) THEN
            IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = t AND column_name = 'school_id') THEN
                EXECUTE format(
                    'UPDATE public.%I SET school_id = ''00000000-0000-0000-0000-000000000000'' WHERE school_id IS NULL',
                    t
                );
            END IF;
        END IF;
    END LOOP;
END $$;


-- 3. ENSURE TENANT ISOLATION POLICY IS ACTIVE ON CHALLANS/TRANSACTIONS
-- In case previous scripts overwrote policies, we guarantee the baseline SaaS policy is enforced.
DO $$
DECLARE
    target_tables TEXT[] := ARRAY['challans', 'transactions', 'other_revenue', 'receipts'];
    t TEXT;
BEGIN
    FOREACH t IN ARRAY target_tables
    LOOP
        IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = t) THEN
            IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = t AND column_name = 'school_id') THEN
                
                -- Ensure RLS is enabled
                EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY;', t);
                
                -- Drop any rogue "nuclear" or public policies that might leak data
                EXECUTE format('DROP POLICY IF EXISTS "Strict View Challans" ON public.%I', t);
                EXECUTE format('DROP POLICY IF EXISTS "Strict Create Challans" ON public.%I', t);
                EXECUTE format('DROP POLICY IF EXISTS "Strict Edit Challans" ON public.%I', t);
                EXECUTE format('DROP POLICY IF EXISTS "Strict Delete Challans" ON public.%I', t);
                EXECUTE format('DROP POLICY IF EXISTS "Allow public select challans" ON public.%I', t);
                
                -- Ensure Tenant Isolation Policy exists
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
        END IF;
    END LOOP;
END $$;
