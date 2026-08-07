-- Shared TeacherFee student rows and three selections.
-- Run this file once in the Supabase SQL Editor before using the T buttons.

CREATE TABLE IF NOT EXISTS public.teacher_fee_rows (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    school_id UUID NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
    student_id UUID NOT NULL REFERENCES public.admissions(id) ON DELETE CASCADE,
    source TEXT NOT NULL DEFAULT 'Student' CHECK (source IN ('Student', 'Family')),
    choice_1 TEXT CHECK (choice_1 IS NULL OR choice_1 IN ('Ask', 'Std 10', 'Std 40', 'St 80', 'Stc 10')),
    choice_2 TEXT CHECK (choice_2 IS NULL OR choice_2 IN ('Ask', 'Std 10', 'Std 40', 'St 80', 'Stc 10')),
    choice_3 TEXT CHECK (choice_3 IS NULL OR choice_3 IN ('Ask', 'Std 10', 'Std 40', 'St 80', 'Stc 10')),
    choice_4 TEXT CHECK (choice_4 IS NULL OR choice_4 IN ('Ask', 'Std 10', 'Std 40', 'St 80', 'Stc 10')),
    added_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    updated_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT teacher_fee_rows_school_student_unique UNIQUE (school_id, student_id)
);

-- Safe upgrade for installations that already created teacher_fee_rows.
ALTER TABLE public.teacher_fee_rows
    ADD COLUMN IF NOT EXISTS choice_4 TEXT;

ALTER TABLE public.teacher_fee_rows
    DROP CONSTRAINT IF EXISTS teacher_fee_rows_choice_4_check;

ALTER TABLE public.teacher_fee_rows
    ADD CONSTRAINT teacher_fee_rows_choice_4_check
    CHECK (choice_4 IS NULL OR choice_4 IN ('Ask', 'Std 10', 'Std 40', 'St 80', 'Stc 10'));

CREATE INDEX IF NOT EXISTS idx_teacher_fee_rows_school_created
    ON public.teacher_fee_rows (school_id, created_at);

CREATE INDEX IF NOT EXISTS idx_teacher_fee_rows_school_student
    ON public.teacher_fee_rows (school_id, student_id);

ALTER TABLE public.teacher_fee_rows ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Teacher fee rows tenant access" ON public.teacher_fee_rows;
CREATE POLICY "Teacher fee rows tenant access"
    ON public.teacher_fee_rows
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
    ON public.teacher_fee_rows
    TO authenticated;
