-- =========================================================================================
-- alarm_schedules_setup.sql
-- Creates Supabase table and RLS for the School Bell Alarm System.
-- Run this once in Supabase SQL Editor.
-- =========================================================================================

CREATE TABLE IF NOT EXISTS public.alarm_schedules (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    day_of_week TEXT NOT NULL,
    period_name TEXT NOT NULL,
    ring_time TIME NOT NULL,
    is_active BOOLEAN DEFAULT true,
    school_id UUID REFERENCES public.schools(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_alarm_schedules_school_id ON public.alarm_schedules(school_id);
CREATE INDEX IF NOT EXISTS idx_alarm_schedules_day ON public.alarm_schedules(day_of_week);

ALTER TABLE public.alarm_schedules ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Tenant Isolation Policy" ON public.alarm_schedules;

CREATE POLICY "Tenant Isolation Policy" ON public.alarm_schedules
FOR ALL TO authenticated
USING (
    public.is_super_admin() OR
    school_id = public.get_current_user_school_id()
)
WITH CHECK (
    public.is_super_admin() OR
    school_id = public.get_current_user_school_id()
);

DROP TRIGGER IF EXISTS trg_set_school_alarm_schedules ON public.alarm_schedules;
CREATE TRIGGER trg_set_school_alarm_schedules
BEFORE INSERT ON public.alarm_schedules
FOR EACH ROW
EXECUTE FUNCTION public.trigger_set_school_id();

-- =========================================================================================
-- ALARM SCHEDULES SETUP COMPLETE.
-- =========================================================================================
