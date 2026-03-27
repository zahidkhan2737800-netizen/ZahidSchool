-- =========================================================================================
-- saas_security_fix.sql
-- Tightens user_roles security for SaaS migration.
-- =========================================================================================

-- Ensure Row Level Security is ON for user_roles
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

-- Remove the old permissive policy if it exists
DROP POLICY IF EXISTS "Allow all user role management" ON public.user_roles;
DROP POLICY IF EXISTS "Users can view their own role" ON public.user_roles;

-- Create the SaaS isolation policy for user_roles
-- 1. Super Admins can see and manage EVERYONE.
-- 2. School Admins can see and manage only their own staff.
-- 3. Regular users can see themselves.
CREATE POLICY "SaaS User Management Isolation" ON public.user_roles 
FOR ALL TO authenticated 
USING (
    public.is_super_admin() OR 
    (school_id = public.get_current_user_school_id()) OR
    (user_id = auth.uid())
)
WITH CHECK (
    public.is_super_admin() OR 
    (school_id = public.get_current_user_school_id())
);

-- Separate RLS for roles table (everyone can see, only super admin can edit)
ALTER TABLE public.roles ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow all role management" ON public.roles;
CREATE POLICY "Super Admin Roles Management" ON public.roles FOR ALL TO authenticated USING (public.is_super_admin()) WITH CHECK (public.is_super_admin());
CREATE POLICY "Roles Viewable by All" ON public.roles FOR SELECT TO authenticated USING (true);

-- =========================================================================================
-- SECURITY FIX COMPLETED.
-- =========================================================================================
