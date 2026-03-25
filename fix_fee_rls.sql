-- =============================================
-- FIX: Missing RLS Policies on Fee Collection Tables
-- Run this in Supabase SQL Editor
-- Fixes: staff with 'collect_fee' permission
--        being blocked when saving fee receipts
-- =============================================

-- 1. TRANSACTIONS TABLE
--    Created after original RBAC setup — missing RLS policies

CREATE TABLE IF NOT EXISTS transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  receipt_number TEXT,
  student_id UUID,
  student_name TEXT,
  roll_number TEXT,
  class_name TEXT,
  father_name TEXT,
  description TEXT,
  amount NUMERIC DEFAULT 0,
  payment_method TEXT,
  payment_reference TEXT,
  remarks TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

ALTER TABLE transactions ENABLE ROW LEVEL SECURITY;

-- Drop if exists (to avoid duplicate policy errors on re-run)
DROP POLICY IF EXISTS "Allow authenticated full access to transactions" ON transactions;
DROP POLICY IF EXISTS "Allow anon full access to transactions" ON transactions;

CREATE POLICY "Allow authenticated full access to transactions"
ON transactions FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "Allow anon full access to transactions"
ON transactions FOR ALL TO anon USING (true) WITH CHECK (true);

-- 2. RECEIPTS TABLE (re-run safe — ensures policies exist)

ALTER TABLE receipts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow authenticated full access to receipts" ON receipts;
DROP POLICY IF EXISTS "Allow anon full access to receipts" ON receipts;

CREATE POLICY "Allow authenticated full access to receipts"
ON receipts FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "Allow anon full access to receipts"
ON receipts FOR ALL TO anon USING (true) WITH CHECK (true);

-- 3. CHALLANS TABLE — ensure staff can update payment status

DROP POLICY IF EXISTS "Allow authenticated full access to challans" ON challans;
DROP POLICY IF EXISTS "Allow anon full access to challans" ON challans;

ALTER TABLE challans ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow authenticated full access to challans"
ON challans FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "Allow anon full access to challans"
ON challans FOR ALL TO anon USING (true) WITH CHECK (true);

-- Done! Staff with 'collect_fee' permission can now:
-- ✅ READ challans
-- ✅ UPDATE challan paid_amount and status
-- ✅ INSERT into receipts
-- ✅ INSERT into transactions
