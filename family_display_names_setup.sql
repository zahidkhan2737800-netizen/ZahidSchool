-- Separate family display names from each student's biological father name.
-- Run once in Supabase SQL Editor. Safe to run again.

CREATE TABLE IF NOT EXISTS public.family_display_names (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    school_id UUID NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
    mobile_number TEXT NOT NULL,
    family_name TEXT NOT NULL,
    selected_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT family_display_names_school_mobile_unique UNIQUE (school_id, mobile_number)
);

CREATE INDEX IF NOT EXISTS idx_family_display_names_school_mobile
    ON public.family_display_names (school_id, mobile_number);

ALTER TABLE public.family_display_names ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Family display names shared within school" ON public.family_display_names;
CREATE POLICY "Family display names shared within school"
    ON public.family_display_names
    FOR ALL TO authenticated
    USING (
        public.is_super_admin()
        OR school_id = public.get_current_user_school_id()
    )
    WITH CHECK (
        public.is_super_admin()
        OR school_id = public.get_current_user_school_id()
    );

GRANT SELECT, INSERT, UPDATE, DELETE
    ON public.family_display_names
    TO authenticated;
