-- ═══════════════════════════════════════════════════════════════════
-- complaints table — used by Homework Publisher & Complaint Diary
-- Run this in Supabase SQL Editor
-- ═══════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS complaints (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  roll TEXT NOT NULL,
  class_name TEXT,
  date DATE NOT NULL DEFAULT CURRENT_DATE,
  complaint TEXT NOT NULL DEFAULT '',
  category TEXT DEFAULT 'Homework',
  status TEXT DEFAULT 'Pending',
  contact_status TEXT DEFAULT '',
  subjects TEXT[] DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Row Level Security
ALTER TABLE complaints ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all for anon" ON complaints FOR ALL USING (true) WITH CHECK (true);

-- Index for common queries
CREATE INDEX IF NOT EXISTS idx_complaints_date ON complaints(date DESC);
CREATE INDEX IF NOT EXISTS idx_complaints_roll ON complaints(roll);
CREATE INDEX IF NOT EXISTS idx_complaints_category ON complaints(category);
