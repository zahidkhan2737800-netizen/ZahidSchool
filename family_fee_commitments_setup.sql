-- Family fee commitments
-- Run this file once in the Supabase SQL Editor before using the Co button.

CREATE TABLE IF NOT EXISTS public.family_fee_commitments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    school_id UUID NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
    family_mobile TEXT NOT NULL,
    family_no TEXT,
    family_name TEXT NOT NULL,
    members JSONB NOT NULL DEFAULT '[]'::jsonb,
    days_promised INTEGER NOT NULL CHECK (days_promised >= 0),
    month_key TEXT NOT NULL CHECK (month_key ~ '^[0-9]{4}-(0[1-9]|1[0-2])$'),
    commitment_made_on DATE NOT NULL,
    due_date DATE NOT NULL,
    created_by_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    created_by TEXT,
    status TEXT NOT NULL DEFAULT 'Pending' CHECK (status IN ('Pending', 'Completed')),
    completed_at TIMESTAMPTZ,
    completed_by TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_family_fee_commitments_school_due
    ON public.family_fee_commitments (school_id, due_date);

CREATE INDEX IF NOT EXISTS idx_family_fee_commitments_school_status_due
    ON public.family_fee_commitments (school_id, status, due_date);

CREATE INDEX IF NOT EXISTS idx_family_fee_commitments_school_month_due
    ON public.family_fee_commitments (school_id, month_key, due_date);

ALTER TABLE public.family_fee_commitments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Family commitments tenant access" ON public.family_fee_commitments;
CREATE POLICY "Family commitments tenant access"
    ON public.family_fee_commitments
    FOR ALL
    TO authenticated
    USING (
        public.is_super_admin()
        OR school_id = public.get_current_user_school_id()
    )
    WITH CHECK (
        public.is_super_admin()
        OR school_id = public.get_current_user_school_id()
    );

GRANT SELECT, INSERT, UPDATE, DELETE
    ON public.family_fee_commitments
    TO authenticated;
