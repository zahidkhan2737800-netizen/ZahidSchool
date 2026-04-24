CREATE TABLE IF NOT EXISTS public.report_cards (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    school_id UUID REFERENCES public.schools(id) ON DELETE CASCADE,
    student_id UUID REFERENCES public.admissions(id) ON DELETE CASCADE,
    term_name TEXT DEFAULT 'Mid Term',
    data JSONB DEFAULT '[]'::jsonb,
    grand_total NUMERIC DEFAULT 0,
    max_marks NUMERIC DEFAULT 0,
    percentage NUMERIC DEFAULT 0,
    remarks TEXT DEFAULT '',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(student_id, term_name)
);

ALTER TABLE public.report_cards ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Enable ALL for authenticated users on report_cards" ON public.report_cards FOR ALL USING (auth.role() = 'authenticated');
