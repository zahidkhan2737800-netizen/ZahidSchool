-- =====================================================================================
-- SCHOOL SUBSCRIPTION PAGE ACCESS
-- Run once in Supabase SQL Editor as the project owner.
-- Existing schools remain unrestricted until a Super Admin enables Custom Access.
-- =====================================================================================

BEGIN;

ALTER TABLE public.schools
    ADD COLUMN IF NOT EXISTS access_control_enabled BOOLEAN NOT NULL DEFAULT FALSE;

-- School users may read their assigned school, but only the software Super Admin
-- may change subscription fields (including access_control_enabled).
ALTER TABLE public.schools ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Schools Isolation" ON public.schools;
DROP POLICY IF EXISTS "Schools readable by assigned tenant" ON public.schools;
DROP POLICY IF EXISTS "Schools managed by super admin" ON public.schools;

CREATE POLICY "Schools readable by assigned tenant"
ON public.schools
FOR SELECT
TO authenticated
USING (
    public.is_super_admin()
    OR id = public.get_current_user_school_id()
);

CREATE POLICY "Schools managed by super admin"
ON public.schools
FOR ALL
TO authenticated
USING (public.is_super_admin())
WITH CHECK (public.is_super_admin());

CREATE TABLE IF NOT EXISTS public.school_page_access (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    school_id UUID NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
    page_key TEXT NOT NULL,
    is_enabled BOOLEAN NOT NULL DEFAULT TRUE,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    CONSTRAINT school_page_access_school_page_unique UNIQUE (school_id, page_key),
    CONSTRAINT school_page_access_page_key_not_blank CHECK (length(trim(page_key)) > 0)
);

CREATE INDEX IF NOT EXISTS school_page_access_school_idx
    ON public.school_page_access (school_id);

ALTER TABLE public.school_page_access ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "School page access readable by tenant" ON public.school_page_access;
DROP POLICY IF EXISTS "School page access managed by super admin" ON public.school_page_access;

CREATE POLICY "School page access readable by tenant"
ON public.school_page_access
FOR SELECT
TO authenticated
USING (
    public.is_super_admin()
    OR school_id = public.get_current_user_school_id()
);

CREATE POLICY "School page access managed by super admin"
ON public.school_page_access
FOR ALL
TO authenticated
USING (public.is_super_admin())
WITH CHECK (public.is_super_admin());

GRANT SELECT ON public.school_page_access TO authenticated;
GRANT INSERT, UPDATE, DELETE ON public.school_page_access TO authenticated;

-- Reusable server-side check for future APIs and RLS policies.
CREATE OR REPLACE FUNCTION public.is_school_page_allowed(p_page_key TEXT)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT CASE
        WHEN public.is_super_admin() THEN TRUE
        ELSE COALESCE((
            SELECT CASE
                WHEN s.access_control_enabled IS NOT TRUE THEN TRUE
                ELSE EXISTS (
                    SELECT 1
                    FROM public.school_page_access spa
                    WHERE spa.school_id = s.id
                      AND spa.page_key = lower(trim(p_page_key))
                      AND spa.is_enabled = TRUE
                )
            END
            FROM public.schools s
            WHERE s.id = public.get_current_user_school_id()
              AND s.is_active = TRUE
        ), FALSE)
    END;
$$;

REVOKE ALL ON FUNCTION public.is_school_page_allowed(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_school_page_allowed(TEXT) TO authenticated;

COMMENT ON COLUMN public.schools.access_control_enabled IS
    'FALSE keeps legacy full access; TRUE enforces rows in school_page_access.';
COMMENT ON TABLE public.school_page_access IS
    'Per-school HTML page entitlements controlled only by the software Super Admin.';

COMMIT;

-- Verification:
-- SELECT id, school_name, monthly_fee, access_control_enabled FROM public.schools ORDER BY school_name;
-- SELECT school_id, page_key, is_enabled FROM public.school_page_access ORDER BY school_id, page_key;
