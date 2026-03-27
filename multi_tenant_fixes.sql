-- =========================================================================================
-- multi_tenant_fixes.sql
-- Fixes TWO critical issues:
-- 1. Roll numbers must be unique PER SCHOOL, not globally
-- 2. Enrollment limit trigger must work correctly regardless of status values
-- =========================================================================================

-- FIX 1: Change roll_number uniqueness from global to per-school
-- Drop the old global constraint
ALTER TABLE public.admissions DROP CONSTRAINT IF EXISTS unique_roll_number;
ALTER TABLE public.admissions DROP CONSTRAINT IF EXISTS admissions_roll_number_key;

-- Create new composite constraint: roll numbers are unique WITHIN each school only
ALTER TABLE public.admissions ADD CONSTRAINT unique_roll_per_school UNIQUE(school_id, roll_number);

-- FIX 2: Rebuild enrollment limit trigger to count ALL students (not just 'Active')
CREATE OR REPLACE FUNCTION public.check_enrollment_limit()
RETURNS TRIGGER AS $$
DECLARE
    current_count INTEGER;
    max_allowed INTEGER;
BEGIN
    -- Count all students in this school (any status)
    SELECT COUNT(*) INTO current_count 
    FROM public.admissions 
    WHERE school_id = NEW.school_id;

    -- Get the school's student limit
    SELECT COALESCE(s.max_students, 100) INTO max_allowed 
    FROM public.schools s 
    WHERE s.id = NEW.school_id;

    -- Block the insert if the limit is reached
    IF current_count >= max_allowed THEN
        RAISE EXCEPTION 'Enrollment limit reached! This school is allowed a maximum of % students. Current count: %. Please contact the software administrator to upgrade your plan.', max_allowed, current_count;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Re-apply the trigger
DROP TRIGGER IF EXISTS enforce_enrollment_limit ON public.admissions;
CREATE TRIGGER enforce_enrollment_limit
    BEFORE INSERT ON public.admissions
    FOR EACH ROW
    EXECUTE FUNCTION public.check_enrollment_limit();

-- =========================================================================================
-- DONE! 
-- - Roll number 21 can now exist in both School A and School B independently.
-- - Schools cannot exceed their max_students limit.
-- =========================================================================================
