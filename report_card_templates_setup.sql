CREATE TABLE IF NOT EXISTS public.report_card_templates (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    school_id UUID REFERENCES public.schools(id) ON DELETE CASCADE,
    class_name TEXT NOT NULL,
    term_name TEXT NOT NULL,
    data JSONB DEFAULT '[]'::jsonb,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(school_id, class_name, term_name)
);

ALTER TABLE public.report_card_templates ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Enable ALL for authenticated users on report_card_templates" ON public.report_card_templates FOR ALL USING (auth.role() = 'authenticated');
