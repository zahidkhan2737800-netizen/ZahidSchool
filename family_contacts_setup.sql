-- ═══════════════════════════════════════════════════════════════════════════════
-- family_contacts_setup.sql
-- Run this in your Supabase SQL Editor to create the Family Contacts table.
-- ═══════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.family_contacts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    family_mobile TEXT NOT NULL,
    month_key TEXT NOT NULL,
    c1_status TEXT, c1_date TIMESTAMPTZ,
    c2_status TEXT, c2_date TIMESTAMPTZ,
    c3_status TEXT, c3_date TIMESTAMPTZ,
    c4_status TEXT, c4_date TIMESTAMPTZ,
    c5_status TEXT, c5_date TIMESTAMPTZ,
    c6_status TEXT, c6_date TIMESTAMPTZ,
    c7_status TEXT, c7_date TIMESTAMPTZ,
    c8_status TEXT, c8_date TIMESTAMPTZ,
    pinned BOOLEAN DEFAULT false,
    complaint BOOLEAN DEFAULT false,
    commitment_notes TEXT,
    row_status TEXT DEFAULT 'Pending',
    -- Ensures one row per family per month
    UNIQUE(family_mobile, month_key) 
);

ALTER TABLE public.family_contacts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can manage family contacts"
    ON public.family_contacts
    FOR ALL
    USING (auth.role() = 'authenticated')
    WITH CHECK (auth.role() = 'authenticated');
