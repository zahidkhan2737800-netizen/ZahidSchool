-- Per-school thermal fee receipt footer.
-- Run once in the Supabase SQL Editor.

BEGIN;

CREATE TABLE IF NOT EXISTS public.school_receipt_settings (
    school_id UUID PRIMARY KEY REFERENCES public.schools(id) ON DELETE CASCADE,
    footer_text TEXT NOT NULL DEFAULT 'Thank you! — Zahid School System',
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    CONSTRAINT school_receipt_footer_length CHECK (
        length(trim(footer_text)) BETWEEN 1 AND 200
    )
);

ALTER TABLE public.school_receipt_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "School receipt settings tenant access" ON public.school_receipt_settings;
CREATE POLICY "School receipt settings tenant access"
ON public.school_receipt_settings
FOR ALL
TO authenticated
USING (
    public.is_super_admin()
    OR school_id = public.get_current_user_school_id()
)
WITH CHECK (
    public.is_super_admin()
    OR school_id = public.get_current_user_school_id()
);

GRANT SELECT, INSERT, UPDATE ON public.school_receipt_settings TO authenticated;

COMMENT ON TABLE public.school_receipt_settings IS
    'School-specific footer printed on student and family fee payment receipts.';

COMMIT;
