-- ═══════════════════════════════════════════════════════════════════════════════
-- global_fee_setup.sql
-- Run this in your Supabase SQL Editor to enable Global Fee Heads
-- (This allows a single fee row like "Book Fee" to apply to ALL classes automatically)
-- ═══════════════════════════════════════════════════════════════════════════════

-- 1. Strip the NOT NULL requirement from class_id so we can save NULL for global fees
ALTER TABLE public.fee_heads ALTER COLUMN class_id DROP NOT NULL;

-- 2. (Optional) Purge exact duplicates if you want to clean up previously spammed rows.
-- The easiest way is to use the UI to delete the old ones manually, but the schema now supports global rows.
