CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TABLE IF NOT EXISTS public.exam_slip_schedule (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id UUID REFERENCES public.schools(id) ON DELETE CASCADE,
  class_id UUID NOT NULL REFERENCES public.classes(id) ON DELETE CASCADE,
  session_id UUID NOT NULL REFERENCES public.session(id) ON DELETE CASCADE,
  exam_name TEXT,
  schedule_json JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (school_id, class_id, session_id)
);

CREATE INDEX IF NOT EXISTS idx_exam_slip_school_id ON public.exam_slip_schedule(school_id);
CREATE INDEX IF NOT EXISTS idx_exam_slip_class_id ON public.exam_slip_schedule(class_id);
CREATE INDEX IF NOT EXISTS idx_exam_slip_session_id ON public.exam_slip_schedule(session_id);

ALTER TABLE public.exam_slip_schedule ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "exam_slip_select" ON public.exam_slip_schedule;
CREATE POLICY "exam_slip_select" ON public.exam_slip_schedule
  FOR SELECT
  USING (true);

DROP POLICY IF EXISTS "exam_slip_insert" ON public.exam_slip_schedule;
CREATE POLICY "exam_slip_insert" ON public.exam_slip_schedule
  FOR INSERT
  WITH CHECK (true);

DROP POLICY IF EXISTS "exam_slip_update" ON public.exam_slip_schedule;
CREATE POLICY "exam_slip_update" ON public.exam_slip_schedule
  FOR UPDATE
  USING (true)
  WITH CHECK (true);

DROP POLICY IF EXISTS "exam_slip_delete" ON public.exam_slip_schedule;
CREATE POLICY "exam_slip_delete" ON public.exam_slip_schedule
  FOR DELETE
  USING (true);

DROP TRIGGER IF EXISTS trg_exam_slip_updated_at ON public.exam_slip_schedule;
CREATE TRIGGER trg_exam_slip_updated_at
  BEFORE UPDATE ON public.exam_slip_schedule
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();