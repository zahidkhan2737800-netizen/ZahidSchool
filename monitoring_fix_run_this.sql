-- =====================================================
-- STEP 1: Add session_value columns to monitoring tables
-- =====================================================
ALTER TABLE monitoring_subjects ADD COLUMN IF NOT EXISTS session_value TEXT DEFAULT '';
ALTER TABLE monitoring_topics   ADD COLUMN IF NOT EXISTS session_value TEXT DEFAULT '';
ALTER TABLE monitoring_scores   ADD COLUMN IF NOT EXISTS session_value TEXT DEFAULT '';

-- =====================================================
-- STEP 2: Tag all your old data with session "2025-26"
-- =====================================================
UPDATE monitoring_subjects SET session_value = '2025-26' WHERE session_value = '' OR session_value IS NULL;
UPDATE monitoring_topics   SET session_value = '2025-26' WHERE session_value = '' OR session_value IS NULL;
UPDATE monitoring_scores   SET session_value = '2025-26' WHERE session_value = '' OR session_value IS NULL;
