-- collect_fee_setup.sql
-- Run this script to create the transactions table for payment tracking and receipts

CREATE TABLE IF NOT EXISTS transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  receipt_number TEXT UNIQUE NOT NULL,
  student_id UUID REFERENCES admissions(id) ON DELETE CASCADE,
  roll_number TEXT NOT NULL,
  challan_id UUID REFERENCES challans(id) ON DELETE CASCADE,
  fee_details TEXT NOT NULL, -- e.g. "Monthly Fee (December 2026)"
  amount_paid NUMERIC NOT NULL,
  fine_amount NUMERIC DEFAULT 0,
  discount_amount NUMERIC DEFAULT 0,
  payment_date DATE DEFAULT CURRENT_DATE,
  payment_method TEXT NOT NULL,
  payment_reference TEXT, -- for online/bank transaction IDs
  remarks TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE transactions ENABLE ROW LEVEL SECURITY;

-- Allow public access for local app architecture
CREATE POLICY "Allow public select transactions" ON transactions FOR SELECT TO anon USING (true);
CREATE POLICY "Allow public insert transactions" ON transactions FOR INSERT TO anon WITH CHECK (true);
CREATE POLICY "Allow public update transactions" ON transactions FOR UPDATE TO anon USING (true);
CREATE POLICY "Allow public delete transactions" ON transactions FOR DELETE TO anon USING (true);
