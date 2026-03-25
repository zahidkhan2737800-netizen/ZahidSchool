-- Add the custom Family Number column to admissions table
-- This allows assigning a unique, short, human-readable ID like "1", "2", "3" to each family (grouped by mobile).
ALTER TABLE admissions ADD COLUMN IF NOT EXISTS family_id_manual TEXT;
