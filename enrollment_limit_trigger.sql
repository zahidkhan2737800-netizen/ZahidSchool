-- =========================================================================================
-- enrollment_limit_trigger.sql
-- Prevents schools from enrolling more students than their max_students limit.
-- =========================================================================================

-- Create the enforcement function
CREATE OR REPLACE FUNCTION public.check_enrollment_limit()
RETURNS TRIGGER AS $$
DECLARE
    current_count INTEGER;
    max_allowed INTEGER;
BEGIN
    -- Count how many students this school already has
    SELECT COUNT(*) INTO current_count 
    FROM public.admissions 
    WHERE school_id = NEW.school_id AND status = 'Active';

    -- Get the school's student limit
    SELECT COALESCE(s.max_students, 100) INTO max_allowed 
    FROM public.schools s 
    WHERE s.id = NEW.school_id;

    -- Block the insert if the limit is reached
    IF current_count >= max_allowed THEN
        RAISE EXCEPTION 'Enrollment limit reached! This school is allowed a maximum of % students. Current: %. Please contact the software administrator to upgrade your plan.', max_allowed, current_count;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Apply trigger on admissions table
DROP TRIGGER IF EXISTS enforce_enrollment_limit ON public.admissions;
CREATE TRIGGER enforce_enrollment_limit
    BEFORE INSERT ON public.admissions
    FOR EACH ROW
    EXECUTE FUNCTION public.check_enrollment_limit();

-- =========================================================================================
-- DONE! Schools can now only enroll up to their max_students limit.
-- When they try to exceed it, they will see an error message asking them to contact you.
-- =========================================================================================
