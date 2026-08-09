-- Fee Paid Log consistency repair.
-- Run once in Supabase SQL Editor. It is safe to run again.

ALTER TABLE public.transactions
    ADD COLUMN IF NOT EXISTS school_id UUID REFERENCES public.schools(id) ON DELETE CASCADE;
ALTER TABLE public.transactions
    ADD COLUMN IF NOT EXISTS collected_by TEXT;
ALTER TABLE public.transactions
    ADD COLUMN IF NOT EXISTS collected_by_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL;

ALTER TABLE public.receipts
    ADD COLUMN IF NOT EXISTS school_id UUID REFERENCES public.schools(id) ON DELETE CASCADE;
ALTER TABLE public.receipts
    ADD COLUMN IF NOT EXISTS collected_by TEXT;
ALTER TABLE public.receipts
    ADD COLUMN IF NOT EXISTS collected_by_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL;

-- Recover the school for older fee rows from their student or challan.
UPDATE public.transactions AS transaction_row
SET school_id = admission.school_id
FROM public.admissions AS admission
WHERE transaction_row.school_id IS NULL
  AND transaction_row.student_id = admission.id
  AND admission.school_id IS NOT NULL;

UPDATE public.transactions AS transaction_row
SET school_id = challan.school_id
FROM public.challans AS challan
WHERE transaction_row.school_id IS NULL
  AND transaction_row.challan_id = challan.id
  AND challan.school_id IS NOT NULL;

UPDATE public.receipts AS receipt
SET school_id = admission.school_id
FROM public.admissions AS admission
WHERE receipt.school_id IS NULL
  AND receipt.student_id = admission.id
  AND admission.school_id IS NOT NULL;

-- Recover collector names on older transaction rows from their saved receipts.
UPDATE public.transactions AS transaction_row
SET collected_by = COALESCE(
        transaction_row.collected_by,
        (
            SELECT receipt.collected_by
            FROM public.receipts AS receipt
            WHERE receipt.student_id = transaction_row.student_id
              AND NULLIF(BTRIM(receipt.collected_by), '') IS NOT NULL
              AND (
                  receipt.receipt_number = transaction_row.receipt_number
                  OR receipt.receipt_number = REGEXP_REPLACE(transaction_row.receipt_number, '-[0-9]+$', '')
                  OR (
                      NULLIF(BTRIM(receipt.payment_reference), '') IS NOT NULL
                      AND receipt.payment_reference = transaction_row.payment_reference
                  )
              )
            ORDER BY
                CASE WHEN receipt.receipt_number = transaction_row.receipt_number THEN 0 ELSE 1 END,
                receipt.created_at DESC
            LIMIT 1
        )
    )
WHERE NULLIF(BTRIM(transaction_row.collected_by), '') IS NULL;

-- Resolve collector user IDs by the saved name where possible.
UPDATE public.receipts AS receipt
SET collected_by_user_id = role_row.user_id
FROM public.user_roles AS role_row
WHERE receipt.collected_by_user_id IS NULL
  AND NULLIF(BTRIM(receipt.collected_by), '') IS NOT NULL
  AND LOWER(BTRIM(role_row.full_name)) = LOWER(BTRIM(receipt.collected_by))
  AND (receipt.school_id IS NULL OR role_row.school_id = receipt.school_id);

UPDATE public.transactions AS transaction_row
SET collected_by_user_id = role_row.user_id
FROM public.user_roles AS role_row
WHERE transaction_row.collected_by_user_id IS NULL
  AND NULLIF(BTRIM(transaction_row.collected_by), '') IS NOT NULL
  AND LOWER(BTRIM(role_row.full_name)) = LOWER(BTRIM(transaction_row.collected_by))
  AND (transaction_row.school_id IS NULL OR role_row.school_id = transaction_row.school_id);

CREATE INDEX IF NOT EXISTS idx_transactions_school_created
    ON public.transactions (school_id, created_at);
CREATE INDEX IF NOT EXISTS idx_receipts_school_created
    ON public.receipts (school_id, created_at);

-- Always stamp future fee rows with the signed-in user's school and identity.
CREATE OR REPLACE FUNCTION public.set_fee_log_identity()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.school_id IS NULL THEN
        NEW.school_id := public.get_current_user_school_id();
    END IF;

    IF NEW.collected_by_user_id IS NULL THEN
        NEW.collected_by_user_id := auth.uid();
    END IF;

    IF NULLIF(BTRIM(NEW.collected_by), '') IS NULL AND auth.uid() IS NOT NULL THEN
        SELECT user_role.full_name
        INTO NEW.collected_by
        FROM public.user_roles AS user_role
        WHERE user_role.user_id = auth.uid()
        LIMIT 1;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

DROP TRIGGER IF EXISTS set_fee_log_identity_transactions ON public.transactions;
CREATE TRIGGER set_fee_log_identity_transactions
    BEFORE INSERT OR UPDATE ON public.transactions
    FOR EACH ROW EXECUTE FUNCTION public.set_fee_log_identity();

DROP TRIGGER IF EXISTS set_fee_log_identity_receipts ON public.receipts;
CREATE TRIGGER set_fee_log_identity_receipts
    BEFORE INSERT OR UPDATE ON public.receipts
    FOR EACH ROW EXECUTE FUNCTION public.set_fee_log_identity();

-- Every authenticated user in the same school sees the same fee log.
ALTER TABLE public.transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.receipts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow authenticated full access to transactions" ON public.transactions;
DROP POLICY IF EXISTS "Allow anon full access to transactions" ON public.transactions;
DROP POLICY IF EXISTS "Allow public select transactions" ON public.transactions;
DROP POLICY IF EXISTS "Allow public insert transactions" ON public.transactions;
DROP POLICY IF EXISTS "Allow public update transactions" ON public.transactions;
DROP POLICY IF EXISTS "Allow public delete transactions" ON public.transactions;
DROP POLICY IF EXISTS "Tenant Isolation Policy" ON public.transactions;
DROP POLICY IF EXISTS "Fee transactions shared within school" ON public.transactions;
CREATE POLICY "Fee transactions shared within school"
    ON public.transactions
    FOR ALL TO authenticated
    USING (
        public.is_super_admin()
        OR school_id = public.get_current_user_school_id()
    )
    WITH CHECK (
        public.is_super_admin()
        OR school_id = public.get_current_user_school_id()
    );

DROP POLICY IF EXISTS "Allow authenticated full access to receipts" ON public.receipts;
DROP POLICY IF EXISTS "Allow anon full access to receipts" ON public.receipts;
DROP POLICY IF EXISTS "Tenant Isolation Policy" ON public.receipts;
DROP POLICY IF EXISTS "Fee receipts shared within school" ON public.receipts;
CREATE POLICY "Fee receipts shared within school"
    ON public.receipts
    FOR ALL TO authenticated
    USING (
        public.is_super_admin()
        OR school_id = public.get_current_user_school_id()
    )
    WITH CHECK (
        public.is_super_admin()
        OR school_id = public.get_current_user_school_id()
    );

GRANT SELECT, INSERT, UPDATE, DELETE ON public.transactions TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.receipts TO authenticated;

-- Force PostgREST/Supabase to expose the new columns immediately.
NOTIFY pgrst, 'reload schema';
