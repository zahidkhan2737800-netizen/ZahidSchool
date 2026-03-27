-- ═══════════════════════════════════════════════════════════════════════════════
-- wa_templates_setup.sql
-- Run this in your Supabase SQL Editor to create the WhatsApp Templates table.
-- ═══════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.wa_templates (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    title TEXT NOT NULL,
    message_text TEXT NOT NULL,
    is_default BOOLEAN DEFAULT false,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Template 1: Gentle Reminder (Urdu Roman)
INSERT INTO public.wa_templates (title, message_text, is_default)
VALUES (
    'Urdu Polite Reminder',
    'Aslam Alaikum ada bachon ko fee reh rahi mehrbani kr ki juma kren 

{{BILL_DETAILS}}

Total: {{GRAND_TOTAL}}',
    true
) ON CONFLICT DO NOTHING;

-- Template 2: Direct Reminder (Urdu Roman)
INSERT INTO public.wa_templates (title, message_text, is_default)
VALUES (
    'Urdu Direct Reminder',
    'ada bachon ki fee abi tak juma nahe hoi mehrbani kr k juma krwae 

{{BILL_DETAILS}}

Total: {{GRAND_TOTAL}}',
    false
) ON CONFLICT DO NOTHING;

ALTER TABLE public.wa_templates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can manage templates"
    ON public.wa_templates
    FOR ALL
    USING (auth.role() = 'authenticated')
    WITH CHECK (auth.role() = 'authenticated');
