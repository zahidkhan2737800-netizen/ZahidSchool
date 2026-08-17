-- ─────────────────────────────────────────────────────────────────────────────
-- recover_old_session_data.sql
-- ─────────────────────────────────────────────────────────────────────────────
-- PURPOSE:
-- We added a "session_value" tag to isolate data per session.
-- Your old data was created before this tag existed, so its session tag is blank ('').
-- Run this script to update all blank records to your previous session name.

-- IMPORTANT: 
-- Replace '2026-2027' below with the EXACT name of the old session as it appears
-- in your session dropdown (e.g., '2026', '2025-2026', etc.).

DO $$ 
DECLARE
    -- 👇👇👇 CHANGE THIS VALUE TO YOUR EXACT OLD SESSION NAME 👇👇👇
    old_session_name TEXT := '2026-2027'; 
BEGIN
    -- 1. Recover Subjects
    UPDATE monitoring_subjects
    SET session_value = old_session_name
    WHERE session_value = '' OR session_value IS NULL;

    -- 2. Recover Topics
    UPDATE monitoring_topics
    SET session_value = old_session_name
    WHERE session_value = '' OR session_value IS NULL;

    -- 3. Recover Scores
    UPDATE monitoring_scores
    SET session_value = old_session_name
    WHERE session_value = '' OR session_value IS NULL;

END $$;
