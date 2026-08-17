-- Run this in your Supabase SQL Editor

-- 1. Add the family_status column to family_display_names table
ALTER TABLE family_display_names ADD COLUMN IF NOT EXISTS family_status VARCHAR(10) DEFAULT 'Not Set';
