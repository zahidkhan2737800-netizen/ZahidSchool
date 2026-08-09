-- Add a WhatsApp-group membership marker to each student admission.
-- Run this once in the Supabase SQL Editor.

ALTER TABLE public.admissions
    ADD COLUMN IF NOT EXISTS whatsapp_group_status TEXT;

ALTER TABLE public.admissions
    DROP CONSTRAINT IF EXISTS admissions_whatsapp_group_status_check;

ALTER TABLE public.admissions
    ADD CONSTRAINT admissions_whatsapp_group_status_check
    CHECK (
        whatsapp_group_status IS NULL
        OR whatsapp_group_status = 'WG'
    );

COMMENT ON COLUMN public.admissions.whatsapp_group_status IS
    'WG means the student has been added to the WhatsApp group; NULL means not marked.';
