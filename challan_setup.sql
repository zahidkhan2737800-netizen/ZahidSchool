-- challan_setup.sql
-- Run this script to create the challans table for the fee management system

CREATE TABLE IF NOT EXISTS challans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id UUID REFERENCES admissions(id) ON DELETE CASCADE,
  roll_number TEXT NOT NULL,
  student_name TEXT NOT NULL,
  father_name TEXT NOT NULL DEFAULT 'N/A',
  class_name TEXT NOT NULL,
  fee_type TEXT NOT NULL,
  amount NUMERIC NOT NULL,
  paid_amount NUMERIC DEFAULT 0,
  payment_method TEXT,
  fee_month TEXT, -- 'January 2026', 'N/A', etc.
  issue_date DATE DEFAULT CURRENT_DATE,
  due_date DATE NOT NULL,
  status TEXT DEFAULT 'Unpaid' CHECK (status IN ('Unpaid', 'Partially Paid', 'Paid', 'Cancelled')),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(student_id, fee_type, fee_month)
);

-- If you have already created the table, run this command to enforce duplicate protection and new payment fields:
-- ALTER TABLE challans DROP CONSTRAINT IF EXISTS challans_status_check;
-- ALTER TABLE challans ADD CONSTRAINT challans_status_check CHECK (status IN ('Unpaid', 'Partially Paid', 'Paid', 'Cancelled'));
-- ALTER TABLE challans ADD COLUMN IF NOT EXISTS paid_amount NUMERIC DEFAULT 0;
-- ALTER TABLE challans ADD COLUMN IF NOT EXISTS payment_method TEXT;
-- ALTER TABLE challans ADD CONSTRAINT unique_challan UNIQUE(student_id, fee_type, fee_month);
-- ALTER TABLE challans ADD COLUMN IF NOT EXISTS father_name TEXT DEFAULT 'N/A';

-- Enable RLS
ALTER TABLE challans ENABLE ROW LEVEL SECURITY;

-- Allow public access for local app architecture
CREATE POLICY "Allow public select challans" ON challans FOR SELECT TO anon USING (true);
CREATE POLICY "Allow public insert challans" ON challans FOR INSERT TO anon WITH CHECK (true);
CREATE POLICY "Allow public update challans" ON challans FOR UPDATE TO anon USING (true);
CREATE POLICY "Allow public delete challans" ON challans FOR DELETE TO anon USING (true);
