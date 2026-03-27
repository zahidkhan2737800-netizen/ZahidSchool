-- ═══════════════════════════════════════════════════════════════════════════════
-- fee_head_types_setup.sql
-- Run this in your Supabase SQL Editor to add the Fee Head Types table.
-- ═══════════════════════════════════════════════════════════════════════════════

-- 1. Create Fee Head Types table (dropdown source)
CREATE TABLE IF NOT EXISTS public.fee_head_types (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL UNIQUE,
    description TEXT,
    created_by UUID REFERENCES auth.users(id),
    created_at TIMESTAMPTZ DEFAULT now()
);

-- 2. Seed common defaults so the dropdown is not empty on first load
INSERT INTO public.fee_head_types (name) VALUES
    ('Monthly Fee'),
    ('Exam Fee'),
    ('Transport Fee'),
    ('Book Fee'),
    ('Uniform Fee'),
    ('Admission Fee'),
    ('Late Payment Fee'),
    ('Other')
ON CONFLICT (name) DO NOTHING;

-- 3. Make amount optional in fee_heads if not already
ALTER TABLE public.fee_heads ALTER COLUMN amount DROP NOT NULL;
ALTER TABLE public.fee_heads ALTER COLUMN amount SET DEFAULT NULL;

-- 4. Enable RLS & grant access (same policy as fee_heads)
ALTER TABLE public.fee_head_types ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can manage fee head types"
    ON public.fee_head_types
    FOR ALL
    USING (auth.role() = 'authenticated')
    WITH CHECK (auth.role() = 'authenticated');
