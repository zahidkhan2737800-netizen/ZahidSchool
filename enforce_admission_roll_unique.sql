-- ═══════════════════════════════════════════════════════════════════════════════
-- ENFORCE ROLL NUMBER UNIQUENESS
-- Run this script in the Supabase SQL Editor.
--
-- This adds a physical school-scoped UNIQUE constraint to the admissions table.
-- Roll numbers cannot repeat inside one school, but different schools may use the same roll.
-- ═══════════════════════════════════════════════════════════════════════════════

-- Add a school-scoped unique constraint. The same roll number may be used by a
-- different SaaS customer, but cannot be duplicated inside one school.
ALTER TABLE public.admissions DROP CONSTRAINT IF EXISTS unique_roll_number;
ALTER TABLE public.admissions DROP CONSTRAINT IF EXISTS admissions_roll_number_key;
ALTER TABLE public.admissions DROP CONSTRAINT IF EXISTS unique_roll_per_school;
ALTER TABLE public.admissions DROP CONSTRAINT IF EXISTS admissions_school_roll_number_key;
ALTER TABLE public.admissions
    ADD CONSTRAINT unique_roll_per_school UNIQUE (school_id, roll_number);

-- Note:
-- If you get an error saying "could not create unique index" or "key is duplicated",
-- it means you already have duplicate roll numbers inside the same school!
-- You must first go into the Supabase Table Editor, find the students with the
-- duplicate roll numbers, change one of them, and then run this script again.
