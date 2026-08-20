-- Add per-student discounts to Transport, Hostel, and other additional heads.
-- Run this file if student_fee_head_assignments_setup.sql was installed earlier.

BEGIN;

ALTER TABLE public.student_fee_head_assignments
    ADD COLUMN IF NOT EXISTS discount_amount NUMERIC NOT NULL DEFAULT 0 CHECK (discount_amount >= 0);

ALTER TABLE public.challans
    ADD COLUMN IF NOT EXISTS base_amount NUMERIC NULL,
    ADD COLUMN IF NOT EXISTS assigned_discount NUMERIC NOT NULL DEFAULT 0 CHECK (assigned_discount >= 0);

UPDATE public.challans
SET base_amount = amount
WHERE base_amount IS NULL;

COMMIT;
