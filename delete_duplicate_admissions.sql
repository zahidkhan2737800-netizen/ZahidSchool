-- ═══════════════════════════════════════════════════════════════════════════════
-- DELETE DUPLICATE ADMISSIONS (AUTOMATIC)
-- Run this script in the Supabase SQL Editor.
--
-- This script safely finds all students sharing the exact same Roll Number.
-- It will KEEP the oldest (original) student and AUTOMATICALLY DELETE 
-- all the newer duplicates.
-- ═══════════════════════════════════════════════════════════════════════════════

DELETE FROM admissions
WHERE id IN (
  SELECT id
  FROM (
    SELECT id,
    ROW_NUMBER() OVER( PARTITION BY roll_number ORDER BY created_at ASC ) as row_num
    FROM admissions
  ) t
  WHERE t.row_num > 1
);

-- After running this, run your enforce_admission_roll_unique.sql script!
