-- Student-specific recurring fee services (Transport, Hostel, etc.)
-- Run once in the Supabase SQL Editor before using the updated Admission
-- and Generate Challans pages.

BEGIN;

ALTER TABLE public.fee_head_types
    ADD COLUMN IF NOT EXISTS requires_student_assignment BOOLEAN NOT NULL DEFAULT FALSE;

-- Sensible defaults for existing schools. Other fee types can be changed from
-- Fee Heads Management after this migration is installed.
UPDATE public.fee_head_types
SET requires_student_assignment = TRUE
WHERE lower(trim(name)) IN (
    'transport fee', 'transport', 'hostel fee', 'hostel'
);

CREATE TABLE IF NOT EXISTS public.student_fee_head_assignments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    school_id UUID NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
    campus_id UUID NULL REFERENCES public.campuses(id) ON DELETE SET NULL,
    student_id UUID NOT NULL REFERENCES public.admissions(id) ON DELETE CASCADE,
    fee_type TEXT NOT NULL,
    amount_override NUMERIC NULL CHECK (amount_override IS NULL OR amount_override >= 0),
    discount_amount NUMERIC NOT NULL DEFAULT 0 CHECK (discount_amount >= 0),
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_by UUID NULL REFERENCES auth.users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT student_fee_head_assignments_school_student_type_key
        UNIQUE (school_id, student_id, fee_type)
);

-- Keep this setup file rerunnable when an older version of the assignments
-- table is already installed.
ALTER TABLE public.student_fee_head_assignments
    ADD COLUMN IF NOT EXISTS discount_amount NUMERIC NOT NULL DEFAULT 0 CHECK (discount_amount >= 0);

ALTER TABLE public.challans
    ADD COLUMN IF NOT EXISTS base_amount NUMERIC NULL,
    ADD COLUMN IF NOT EXISTS assigned_discount NUMERIC NOT NULL DEFAULT 0 CHECK (assigned_discount >= 0);

UPDATE public.challans
SET base_amount = amount
WHERE base_amount IS NULL;

CREATE INDEX IF NOT EXISTS idx_student_fee_head_assignments_school_type_active
    ON public.student_fee_head_assignments (school_id, fee_type, is_active);

CREATE INDEX IF NOT EXISTS idx_student_fee_head_assignments_student
    ON public.student_fee_head_assignments (student_id);

CREATE OR REPLACE FUNCTION public.set_student_fee_head_assignment_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    NEW.updated_at := now();
    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.validate_student_fee_head_assignment_scope()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM public.admissions AS student
        WHERE student.id = NEW.student_id
          AND student.school_id = NEW.school_id
    ) THEN
        RAISE EXCEPTION 'Student does not belong to the assignment school.';
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM public.fee_head_types AS fee_type_row
        WHERE fee_type_row.school_id = NEW.school_id
          AND fee_type_row.name = NEW.fee_type
    ) THEN
        RAISE EXCEPTION 'Fee type does not belong to the assignment school.';
    END IF;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS set_student_fee_head_assignment_updated_at
    ON public.student_fee_head_assignments;
CREATE TRIGGER set_student_fee_head_assignment_updated_at
    BEFORE UPDATE ON public.student_fee_head_assignments
    FOR EACH ROW
    EXECUTE FUNCTION public.set_student_fee_head_assignment_updated_at();

DROP TRIGGER IF EXISTS validate_student_fee_head_assignment_scope
    ON public.student_fee_head_assignments;
CREATE TRIGGER validate_student_fee_head_assignment_scope
    BEFORE INSERT OR UPDATE ON public.student_fee_head_assignments
    FOR EACH ROW
    EXECUTE FUNCTION public.validate_student_fee_head_assignment_scope();

-- Reuse the application's tenant trigger when it exists.
DO $$
BEGIN
    IF to_regprocedure('public.trigger_set_tenant_scope()') IS NOT NULL THEN
        DROP TRIGGER IF EXISTS ensure_tenant_scope_on_insert_student_fee_head_assignments
            ON public.student_fee_head_assignments;
        CREATE TRIGGER ensure_tenant_scope_on_insert_student_fee_head_assignments
            BEFORE INSERT ON public.student_fee_head_assignments
            FOR EACH ROW EXECUTE FUNCTION public.trigger_set_tenant_scope();
    ELSIF to_regprocedure('public.trigger_set_school_id()') IS NOT NULL THEN
        DROP TRIGGER IF EXISTS ensure_school_id_on_insert_student_fee_head_assignments
            ON public.student_fee_head_assignments;
        CREATE TRIGGER ensure_school_id_on_insert_student_fee_head_assignments
            BEFORE INSERT ON public.student_fee_head_assignments
            FOR EACH ROW EXECUTE FUNCTION public.trigger_set_school_id();
    END IF;
END $$;

ALTER TABLE public.student_fee_head_assignments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users manage own school student fee assignments"
    ON public.student_fee_head_assignments;
CREATE POLICY "Users manage own school student fee assignments"
    ON public.student_fee_head_assignments
    FOR ALL TO authenticated
    USING (school_id = public.get_current_user_school_id())
    WITH CHECK (school_id = public.get_current_user_school_id());

GRANT SELECT, INSERT, UPDATE, DELETE
    ON public.student_fee_head_assignments TO authenticated;

COMMIT;

-- IMPORTANT:
-- Old challans are deliberately NOT converted into assignments because an old
-- whole-school Transport/Hostel run may include students who never used that
-- service. Open each real service user's Admission record once, add/confirm the
-- service row, and save. That produces trustworthy assignments without enrolling
-- students from accidental historical challans.
