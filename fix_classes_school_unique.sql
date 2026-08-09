-- =====================================================================================
-- FIX CLASS UNIQUENESS FOR MULTI-SCHOOL SAAS
-- Run once in the Supabase SQL Editor.
--
-- Before: UNIQUE (class_name, section)
--         One school blocked every other school from using the same class.
-- After:  UNIQUE (school_id, class_name, section)
--         Different schools may use the same class; duplicates remain blocked
--         inside the same school.
-- =====================================================================================

BEGIN;

ALTER TABLE public.classes
    ADD COLUMN IF NOT EXISTS school_id UUID REFERENCES public.schools(id) ON DELETE CASCADE;

INSERT INTO public.schools (id, school_name, is_active)
VALUES ('00000000-0000-0000-0000-000000000000', 'Zahid Primary School (Legacy)', TRUE)
ON CONFLICT (id) DO NOTHING;

UPDATE public.classes
SET school_id = '00000000-0000-0000-0000-000000000000'
WHERE school_id IS NULL;

ALTER TABLE public.classes
    ALTER COLUMN school_id SET NOT NULL;

ALTER TABLE public.classes
    DROP CONSTRAINT IF EXISTS classes_class_name_section_key;

ALTER TABLE public.classes
    DROP CONSTRAINT IF EXISTS classes_school_class_name_section_key;

ALTER TABLE public.classes
    ADD CONSTRAINT classes_school_class_name_section_key
    UNIQUE (school_id, class_name, section);

CREATE INDEX IF NOT EXISTS idx_classes_school_order
    ON public.classes (school_id, display_order, class_name, section);

COMMIT;

-- Verification:
-- SELECT conname, pg_get_constraintdef(oid)
-- FROM pg_constraint
-- WHERE conrelid = 'public.classes'::regclass
--   AND contype = 'u';
