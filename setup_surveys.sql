-- Run this script in your Supabase SQL Editor to create the new Surveys table

CREATE TABLE IF NOT EXISTS public.student_surveys (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    school_id UUID REFERENCES schools(id),
    student_id UUID REFERENCES admissions(id) ON DELETE CASCADE,
    survey_name TEXT NOT NULL,
    status TEXT DEFAULT 'Pending',
    survey_date DATE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()),
    UNIQUE(student_id, survey_name)
);

-- Enable RLS
ALTER TABLE public.student_surveys ENABLE ROW LEVEL SECURITY;

-- Add policies for authenticated users
CREATE POLICY "Enable ALL for authenticated users on student_surveys" 
ON public.student_surveys FOR ALL 
USING (auth.role() = 'authenticated')
WITH CHECK (auth.role() = 'authenticated');
