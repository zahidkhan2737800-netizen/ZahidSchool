-- =============================================
-- Add collected_by column to receipts table
-- Tracks which user/accountant collected the payment
-- Run this in Supabase SQL Editor
-- =============================================

ALTER TABLE receipts ADD COLUMN IF NOT EXISTS collected_by TEXT;
