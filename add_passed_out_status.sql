-- ─── Add "Passed Out" to admissions status check constraint ───
-- Run this in Supabase SQL Editor

-- Step 1: Drop the existing check constraint
ALTER TABLE admissions DROP CONSTRAINT IF EXISTS admissions_status_check;

-- Step 2: Add it back with "Passed Out" included
ALTER TABLE admissions
    ADD CONSTRAINT admissions_status_check
    CHECK (status IN ('Active', 'Pending', 'Withdrawn', 'Passed Out'));
