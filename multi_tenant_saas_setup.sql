-- =========================================================================================
-- COMPLETE MULTI-TENANT (SAAS) SETUP FOR ZAHID SCHOOL MANAGEMENT SYSTEM
-- =========================================================================================
-- This script transforms the system into a SaaS platform. It adds the "schools" table,
-- injects "school_id" into all existing tables, and enforces Row Level Security (RLS)
-- so that users can ONLY see, create, edit, or delete data belonging to their specific school.
-- =========================================================================================

-- 1. Create the Master "schools" Table
CREATE TABLE IF NOT EXISTS public.schools (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    school_name TEXT NOT NULL,
    address TEXT,
    contact_phone TEXT,
    is_active BOOLEAN DEFAULT true, -- Super Admin can toggle this to false to block access
    created_at TIMESTAMPTZ DEFAULT now()
);

-- Insert a default "Primary School" for all existing data to prevent it from breaking
INSERT INTO public.schools (id, school_name, is_active) 
VALUES ('00000000-0000-0000-0000-000000000000', 'Zahid Primary School (Legacy)', true)
ON CONFLICT DO NOTHING;

-- 2. Add Super Admin Role
INSERT INTO public.roles (role_name, description) 
VALUES ('super_admin', 'SaaS Owner - Controls all schools and billing')
ON CONFLICT DO NOTHING;

-- 3. Update User Roles mapping to directly belong to a School
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='user_roles' AND column_name='school_id') THEN
        ALTER TABLE public.user_roles ADD COLUMN school_id UUID REFERENCES public.schools(id) ON DELETE CASCADE;
        -- Set all existing users to the legacy school so they don't lose access
        UPDATE public.user_roles SET school_id = '00000000-0000-0000-0000-000000000000' WHERE school_id IS NULL;
    END IF;
END $$;

-- 4. Automatically Inject school_id to all operational tables
DO $$
DECLARE
    target_tables TEXT[] := ARRAY['admissions', 'classes', 'attendance', 'challans', 'receipts', 'fee_heads', 'finance', 'staff', 'family_contacts', 'fee_contacts', 'wa_templates', 'permissions'];
    t TEXT;
BEGIN
    FOREACH t IN ARRAY target_tables
    LOOP
        -- Check if table actually exists in the database before trying to alter it
        IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name=t) THEN
            EXECUTE format('
                DO $inner$
                BEGIN
                    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name=%L AND column_name=''school_id'') THEN
                        ALTER TABLE public.%I ADD COLUMN school_id UUID REFERENCES public.schools(id) ON DELETE CASCADE;
                        -- Migrate existing data to the primary legacy school
                        UPDATE public.%I SET school_id = ''00000000-0000-0000-0000-000000000000'' WHERE school_id IS NULL;
                    END IF;
                END $inner$;
            ', t, t, t);
        END IF;
    END LOOP;
END $$;

-- 5. Build Helper Function for RLS
-- This function quickly finds out which school the logged-in user belongs to
CREATE OR REPLACE FUNCTION public.get_current_user_school_id() 
RETURNS UUID AS $$
DECLARE
    v_school_id UUID;
BEGIN
    SELECT school_id INTO v_school_id FROM public.user_roles WHERE user_id = auth.uid() LIMIT 1;
    RETURN v_school_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Build Helper Function to check if user is Super Admin
CREATE OR REPLACE FUNCTION public.is_super_admin() 
RETURNS BOOLEAN AS $$
DECLARE
    v_is_super BOOLEAN;
BEGIN
    SELECT EXISTS (
        SELECT 1 FROM public.user_roles ur 
        JOIN public.roles r ON ur.role_id = r.id 
        WHERE ur.user_id = auth.uid() AND r.role_name = 'super_admin'
    ) INTO v_is_super;
    RETURN v_is_super;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 6. Build Trigger Helper to auto-inject school_id on INSERT
CREATE OR REPLACE FUNCTION public.trigger_set_school_id()
RETURNS TRIGGER AS $$
BEGIN
    -- If the user isn't a super admin inserting manually, auto-set their own school_id
    IF NEW.school_id IS NULL AND NOT public.is_super_admin() THEN
        NEW.school_id := public.get_current_user_school_id();
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 7. Apply Trigger to all Operational Tables
DO $$
DECLARE
    target_tables TEXT[] := ARRAY['admissions', 'classes', 'attendance', 'challans', 'receipts', 'fee_heads', 'finance', 'staff', 'family_contacts', 'fee_contacts', 'wa_templates'];
    t TEXT;
BEGIN
    FOREACH t IN ARRAY target_tables
    LOOP
        IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name=t) THEN
            -- Drop old trigger if exists to prevent duplicates
            EXECUTE format('DROP TRIGGER IF EXISTS ensure_school_id_on_insert_%I ON public.%I', t, t);
            
            -- Create Trigger
            EXECUTE format('
                CREATE TRIGGER ensure_school_id_on_insert_%I
                BEFORE INSERT ON public.%I
                FOR EACH ROW EXECUTE FUNCTION public.trigger_set_school_id();
            ', t, t);
        END IF;
    END LOOP;
END $$;

-- 8. Apply RLS Multi-Tenant Overlay Policies
-- This guarantees that NO Javascript needs to be modified. The DB will silently filter out other schools' data.
DO $$
DECLARE
    target_tables TEXT[] := ARRAY['admissions', 'classes', 'attendance', 'challans', 'receipts', 'fee_heads', 'finance', 'staff', 'family_contacts', 'fee_contacts', 'wa_templates'];
    t TEXT;
BEGIN
    FOREACH t IN ARRAY target_tables
    LOOP
        IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name=t) THEN
            -- Ensure RLS is enabled
            EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY;', t);
            
            -- Clean up ANY existing permissive policies that bypass our new SaaS architecture
            EXECUTE format('DROP POLICY IF EXISTS "Enable all access" ON public.%I', t);
            EXECUTE format('DROP POLICY IF EXISTS "Enable full access for authenticated users" ON public.%I', t);
            EXECUTE format('DROP POLICY IF EXISTS "Authenticated users can do everything" ON public.%I', t);
            EXECUTE format('DROP POLICY IF EXISTS "Tenant Isolation Policy" ON public.%I', t);
            
            -- Apply Strict Multi-Tenant Policy
            EXECUTE format('
                CREATE POLICY "Tenant Isolation Policy" ON public.%I 
                FOR ALL TO authenticated 
                USING (
                    public.is_super_admin() OR 
                    (school_id = public.get_current_user_school_id() AND EXISTS (SELECT 1 FROM public.schools WHERE id = school_id AND is_active = true))
                )
                WITH CHECK (
                    public.is_super_admin() OR 
                    (school_id = public.get_current_user_school_id() AND EXISTS (SELECT 1 FROM public.schools WHERE id = school_id AND is_active = true))
                );
            ', t);
        END IF;
    END LOOP;
END $$;

-- Separate RLS for schools table (Super Admin only vs Read-only for assigned school)
ALTER TABLE public.schools ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Schools Isolation" ON public.schools;
CREATE POLICY "Schools Isolation" ON public.schools 
FOR ALL TO authenticated 
USING (
    public.is_super_admin() OR id = public.get_current_user_school_id()
);

-- =========================================================================================
-- SETUP COMPLETED SUCCESSFULLY.
-- =========================================================================================
