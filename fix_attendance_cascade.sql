-- ═══════════════════════════════════════════════════════════════════════════════
-- FIX ATTENDANCE CASCADE DELETE
-- Run this script in the Supabase SQL Editor.
--
-- This updates the foreign key so that if you delete a student from 'admissions',
-- their attendance records will automatically be deleted (cascaded) instead of
-- throwing an error.
-- ═══════════════════════════════════════════════════════════════════════════════

ALTER TABLE attendance 
DROP CONSTRAINT IF EXISTS attendance_student_id_fkey;

ALTER TABLE attendance 
ADD CONSTRAINT attendance_student_id_fkey 
FOREIGN KEY (student_id) REFERENCES admissions(id) 
ON DELETE CASCADE;

-- Now you can go back to the Table Editor and successfully delete student 303!
