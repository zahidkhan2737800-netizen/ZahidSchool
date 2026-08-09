-- =============================================
-- RECEIPTS TABLE — Run this in Supabase SQL Editor
-- Stores saved fee receipts for re-printing
-- =============================================

CREATE TABLE IF NOT EXISTS receipts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  receipt_number TEXT NOT NULL,
  student_id UUID,
  student_name TEXT NOT NULL,
  roll_number TEXT,
  father_name TEXT,
  class_name TEXT,
  fee_lines JSONB NOT NULL DEFAULT '[]',   -- [{ desc: "Monthly Fee (March 2026)", amount: 2500 }, ...]
  total_paid NUMERIC NOT NULL DEFAULT 0,
  remaining NUMERIC NOT NULL DEFAULT 0, -- frozen remaining balance for challans included on this receipt
  payment_method TEXT,
  payment_reference TEXT,
  remarks TEXT,
  collected_by TEXT,
  collected_by_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Keep older installations compatible when this setup file is run again.
ALTER TABLE public.receipts ADD COLUMN IF NOT EXISTS collected_by TEXT;
ALTER TABLE public.receipts
  ADD COLUMN IF NOT EXISTS collected_by_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL;

-- Enable Row Level Security
ALTER TABLE receipts ENABLE ROW LEVEL SECURITY;

-- Allow authenticated users full access
CREATE POLICY "Allow authenticated full access to receipts"
ON receipts FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Allow anon access (for local/offline use)
CREATE POLICY "Allow anon full access to receipts"
ON receipts FOR ALL TO anon USING (true) WITH CHECK (true);
