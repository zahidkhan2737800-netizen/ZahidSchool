-- ═══════════════════════════════════════════════════════════════════════════════
-- ENFORCE ROLL NUMBER UNIQUENESS
-- Run this script in the Supabase SQL Editor.
--
-- This will add a physical UNIQUE constraint to the 'roll_number' column in the
-- 'admissions' table so that the database physically rejects any duplicate 
-- roll numbers from ever being saved.
-- ═══════════════════════════════════════════════════════════════════════════════

-- Add the unique constraint
ALTER TABLE admissions ADD CONSTRAINT unique_roll_number UNIQUE(roll_number);

-- Note:
-- If you get an error saying "could not create unique index" or "key is duplicated", 
-- it means you already have duplicate roll numbers currently sitting in your table!
-- You must first go into the Supabase Table Editor, find the students with the 
-- duplicate roll numbers, change one of them, and then run this script again.
