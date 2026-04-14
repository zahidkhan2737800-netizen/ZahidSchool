CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TABLE IF NOT EXISTS public.examination (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id UUID REFERENCES public.schools(id) ON DELETE CASCADE,
  session_id UUID REFERENCES public.session(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  start_date DATE NOT NULL,
  end_date DATE,
  result_announcement_date DATE,
  fee NUMERIC(12,2),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT examination_dates_check CHECK (end_date IS NULL OR end_date >= start_date),
  CONSTRAINT examination_fee_check CHECK (fee IS NULL OR fee >= 0)
);

ALTER TABLE public.examination
  ALTER COLUMN end_date DROP NOT NULL;

ALTER TABLE public.examination
  DROP CONSTRAINT IF EXISTS examination_dates_check;

ALTER TABLE public.examination
  ADD CONSTRAINT examination_dates_check CHECK (
    (end_date IS NULL OR end_date >= start_date)
    AND (result_announcement_date IS NULL OR end_date IS NULL OR result_announcement_date >= end_date)
  );

CREATE INDEX IF NOT EXISTS idx_examination_school_id ON public.examination(school_id);
CREATE INDEX IF NOT EXISTS idx_examination_session_id ON public.examination(session_id);
CREATE INDEX IF NOT EXISTS idx_examination_start_date ON public.examination(start_date);

ALTER TABLE public.examination ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "examination_select" ON public.examination;
CREATE POLICY "examination_select" ON public.examination
  FOR SELECT
  USING (true);

DROP POLICY IF EXISTS "examination_insert" ON public.examination;
CREATE POLICY "examination_insert" ON public.examination
  FOR INSERT
  WITH CHECK (true);

DROP POLICY IF EXISTS "examination_update" ON public.examination;
CREATE POLICY "examination_update" ON public.examination
  FOR UPDATE
  USING (true)
  WITH CHECK (true);

DROP POLICY IF EXISTS "examination_delete" ON public.examination;
CREATE POLICY "examination_delete" ON public.examination
  FOR DELETE
  USING (true);

DROP TRIGGER IF EXISTS trg_examination_updated_at ON public.examination;
CREATE TRIGGER trg_examination_updated_at
  BEFORE UPDATE ON public.examination
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();