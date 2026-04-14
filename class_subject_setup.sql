-- Create updated_at trigger function if it doesn't exist
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create class_subject junction table
-- This maps subjects to specific classes (many-to-many relationship)
-- Each class can have multiple subjects, each subject can be assigned to multiple classes

CREATE TABLE IF NOT EXISTS public.class_subject (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id UUID REFERENCES public.schools(id) ON DELETE CASCADE,
  class_id UUID NOT NULL REFERENCES public.classes(id) ON DELETE CASCADE,
  subject_id UUID NOT NULL REFERENCES public.subject(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  
  -- Prevent duplicate assignments of the same subject to the same class
  UNIQUE(class_id, subject_id)
);

-- Create indexes for faster queries
CREATE INDEX IF NOT EXISTS idx_class_subject_class_id ON public.class_subject(class_id);
CREATE INDEX IF NOT EXISTS idx_class_subject_subject_id ON public.class_subject(subject_id);
CREATE INDEX IF NOT EXISTS idx_class_subject_school_id ON public.class_subject(school_id);

-- Enable RLS
ALTER TABLE public.class_subject ENABLE ROW LEVEL SECURITY;

-- RLS Policies: Allow all authenticated users to read/write
-- (matches simplified pattern used in curriculum_and_session_setup.sql)
DROP POLICY IF EXISTS "class_subject_select" ON public.class_subject;
CREATE POLICY "class_subject_select" ON public.class_subject
  FOR SELECT
  USING (true);

DROP POLICY IF EXISTS "class_subject_insert" ON public.class_subject;
CREATE POLICY "class_subject_insert" ON public.class_subject
  FOR INSERT
  WITH CHECK (true);

DROP POLICY IF EXISTS "class_subject_update" ON public.class_subject;
CREATE POLICY "class_subject_update" ON public.class_subject
  FOR UPDATE
  USING (true)
  WITH CHECK (true);

DROP POLICY IF EXISTS "class_subject_delete" ON public.class_subject;
CREATE POLICY "class_subject_delete" ON public.class_subject
  FOR DELETE
  USING (true);

-- Create updated_at trigger
DROP TRIGGER IF EXISTS trg_class_subject_updated_at ON public.class_subject;
CREATE TRIGGER trg_class_subject_updated_at
  BEFORE UPDATE ON public.class_subject
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();
