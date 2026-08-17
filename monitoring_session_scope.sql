-- ─────────────────────────────────────────────────────────────────────────────
-- monitoring_session_scope.sql
-- Adds session_value column to monitoring tables so that each session
-- gets a completely fresh, isolated set of subjects, topics, and scores.
-- Safe to run multiple times (uses IF NOT EXISTS / DO $$ blocks).
-- ─────────────────────────────────────────────────────────────────────────────

-- 1. monitoring_subjects ── add session_value
ALTER TABLE monitoring_subjects
    ADD COLUMN IF NOT EXISTS session_value TEXT DEFAULT '';

-- 2. monitoring_topics ── add session_value
ALTER TABLE monitoring_topics
    ADD COLUMN IF NOT EXISTS session_value TEXT DEFAULT '';

-- 3. monitoring_scores ── add session_value + update unique constraint
ALTER TABLE monitoring_scores
    ADD COLUMN IF NOT EXISTS session_value TEXT DEFAULT '';

-- Drop old unique constraint on (student_id, topic_id) if it exists,
-- then recreate it scoped to (student_id, topic_id, session_value)
DO $$
BEGIN
    -- Drop old constraint (name may vary — try common names)
    IF EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'monitoring_scores_student_id_topic_id_key'
    ) THEN
        ALTER TABLE monitoring_scores
            DROP CONSTRAINT monitoring_scores_student_id_topic_id_key;
    END IF;

    -- Add new session-scoped unique constraint if it doesn't already exist
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'monitoring_scores_student_topic_session_key'
    ) THEN
        ALTER TABLE monitoring_scores
            ADD CONSTRAINT monitoring_scores_student_topic_session_key
            UNIQUE (student_id, topic_id, session_value);
    END IF;
END $$;

-- 4. Backfill existing rows: stamp all old data as belonging to the first 
--    session alphabetically per school (safe default — old data stays accessible
--    from the first session, not lost).
--    You can manually re-assign if needed, but this prevents a blank screen.

-- (No automatic backfill needed — old rows will simply not appear when a NEW
--  session is selected because session_value will be '' and new sessions will
--  have a proper value. Old sessions with '' will still load the old data.)
