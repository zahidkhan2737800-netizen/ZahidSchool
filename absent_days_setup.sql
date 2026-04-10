-- =========================================================================================
-- absent_days_setup.sql
-- Creates Supabase table and RLS for Absent Days page.
-- Run this once in Supabase SQL Editor.
-- =========================================================================================

CREATE TABLE IF NOT EXISTS public.absent_days (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    student_id UUID REFERENCES public.admissions(id) ON DELETE SET NULL,
    roll TEXT NOT NULL,
    name TEXT NOT NULL,
    father TEXT NOT NULL,
    class_name TEXT NOT NULL,
    months JSONB NOT NULL DEFAULT '{}'::jsonb,
    school_id UUID REFERENCES public.schools(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_absent_days_school_id ON public.absent_days(school_id);
CREATE INDEX IF NOT EXISTS idx_absent_days_roll ON public.absent_days(roll);

ALTER TABLE public.absent_days ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Tenant Isolation Policy" ON public.absent_days;

CREATE POLICY "Tenant Isolation Policy" ON public.absent_days
FOR ALL TO authenticated
USING (
    public.is_super_admin() OR
    school_id = public.get_current_user_school_id()
)
WITH CHECK (
    public.is_super_admin() OR
    school_id = public.get_current_user_school_id()
);

DROP TRIGGER IF EXISTS trg_set_school_absent_days ON public.absent_days;
CREATE TRIGGER trg_set_school_absent_days
BEFORE INSERT ON public.absent_days
FOR EACH ROW
EXECUTE FUNCTION public.trigger_set_school_id();

-- =========================================================================================
-- ABSENT DAYS SETUP COMPLETE.
-- =========================================================================================
