-- Make fee commitments specific to the selected contact month.
-- Run this once in the Supabase SQL Editor.

ALTER TABLE public.family_fee_commitments
    ADD COLUMN IF NOT EXISTS month_key TEXT;

-- Assign existing commitments to the month in which they were made.
UPDATE public.family_fee_commitments
SET month_key = TO_CHAR(commitment_made_on, 'YYYY-MM')
WHERE month_key IS NULL
   OR month_key !~ '^[0-9]{4}-(0[1-9]|1[0-2])$';

ALTER TABLE public.family_fee_commitments
    ALTER COLUMN month_key SET NOT NULL;

ALTER TABLE public.family_fee_commitments
    DROP CONSTRAINT IF EXISTS family_fee_commitments_month_key_check;

ALTER TABLE public.family_fee_commitments
    ADD CONSTRAINT family_fee_commitments_month_key_check
    CHECK (month_key ~ '^[0-9]{4}-(0[1-9]|1[0-2])$');

CREATE INDEX IF NOT EXISTS idx_family_fee_commitments_school_month_due
    ON public.family_fee_commitments (school_id, month_key, due_date);

COMMENT ON COLUMN public.family_fee_commitments.month_key IS
    'Selected family/student contact month in YYYY-MM format.';
