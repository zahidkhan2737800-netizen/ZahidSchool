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

-- 2. Seed common defaults so the dropdown is not empty on first load.
-- Supports both the original single-school schema and the school-scoped SaaS schema.
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'fee_head_types'
          AND column_name = 'school_id'
    ) THEN
        EXECUTE $school_seed$
            INSERT INTO public.fee_head_types (school_id, name)
            SELECT school_data.id, fee_type.name
            FROM public.schools AS school_data
            CROSS JOIN (VALUES
                ('Monthly Fee'), ('Exam Fee'), ('Transport Fee'), ('Book Fee'),
                ('Uniform Fee'), ('Admission Fee'), ('Late Payment Fee'), ('Other')
            ) AS fee_type(name)
            ON CONFLICT (school_id, name) DO NOTHING
        $school_seed$;
    ELSE
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
    END IF;
END $$;

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
