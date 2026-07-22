-- Run this script in the Supabase SQL Editor.
-- Go to: https://supabase.com/ -> Your Project -> SQL Editor -> New Query -> Paste and Run.

ALTER TABLE todos 
ADD COLUMN IF NOT EXISTS dashboard_pinned BOOLEAN DEFAULT FALSE;
