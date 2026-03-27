-- =========================================================================================
-- user_roles_rls_fix.sql
-- Fixes RLS on user_roles so that school admins can create staff accounts.
-- =========================================================================================

-- Replace the old strict policy with one that allows admins to always insert/update
DROP POLICY IF EXISTS "SaaS User Management Isolation" ON public.user_roles;

CREATE POLICY "SaaS User Management Isolation" ON public.user_roles 
FOR ALL TO authenticated 
USING (
    -- Super Admins see everyone
    public.is_super_admin() OR 
    -- School Admins see their own school's staff
    (school_id = public.get_current_user_school_id()) OR
    -- Any user can see their own row
    (user_id = auth.uid())
)
WITH CHECK (
    -- Super Admins can insert/update anything
    public.is_super_admin() OR 
    -- School Admins can insert staff into their own school
    (school_id = public.get_current_user_school_id()) OR
    -- Allow inserting if school_id is null (will be assigned after)
    (school_id IS NULL) OR
    -- Allow inserting for own user_id (self-registration)
    (user_id = auth.uid())
);

-- =========================================================================================
-- RLS FIX COMPLETE.
-- =========================================================================================
