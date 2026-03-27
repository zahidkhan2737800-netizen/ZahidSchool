-- =========================================================================================
-- enrollment_limit_v2.sql
-- FIXED: Looks up school_id directly from user_roles instead of relying on trigger order.
-- =========================================================================================

CREATE OR REPLACE FUNCTION public.check_enrollment_limit()
RETURNS TRIGGER AS $$
DECLARE
    current_count INTEGER;
    max_allowed INTEGER;
    the_school_id UUID;
BEGIN
    -- Get the school_id — use NEW if already set, otherwise look it up from user_roles
    IF NEW.school_id IS NOT NULL THEN
        the_school_id := NEW.school_id;
    ELSE
        SELECT school_id INTO the_school_id
        FROM public.user_roles
        WHERE user_id = auth.uid()
        LIMIT 1;
    END IF;

    -- If we still can't find a school, let it pass (super admin or legacy)
    IF the_school_id IS NULL THEN
        RETURN NEW;
    END IF;

    -- Count all students in this school
    SELECT COUNT(*) INTO current_count 
    FROM public.admissions 
    WHERE school_id = the_school_id;

    -- Get the school's student limit
    SELECT COALESCE(s.max_students, 100) INTO max_allowed 
    FROM public.schools s 
    WHERE s.id = the_school_id;

    -- Block the insert if the limit is reached
    IF current_count >= max_allowed THEN
        RAISE EXCEPTION 'Enrollment limit reached! This school is allowed a maximum of % students. Current: %. Please contact the software administrator to upgrade your plan.', max_allowed, current_count;
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
-- DONE! The trigger now independently looks up school_id, so trigger order doesn't matter.
-- =========================================================================================
