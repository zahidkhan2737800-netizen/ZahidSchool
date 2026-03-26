-- ═══════════════════════════════════════════════════════════════════════════════
-- Finance & Cash Flow Module - Database Setup
-- Run this script in your Supabase SQL Editor
-- ═══════════════════════════════════════════════════════════════════════════════

-- 1. Create Expenses Table
CREATE TABLE IF NOT EXISTS public.expenses (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    category TEXT NOT NULL, -- e.g., 'Salaries', 'Bills', 'Rent', 'Maintenance', 'Other'
    amount DECIMAL(10,2) NOT NULL CHECK (amount > 0),
    expense_date DATE NOT NULL DEFAULT CURRENT_DATE,
    description TEXT,
    created_by UUID REFERENCES auth.users(id),
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- 2. Create Other Revenue Table (Non-fee income)
CREATE TABLE IF NOT EXISTS public.other_revenue (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    category TEXT NOT NULL, -- e.g., 'Shop', 'Transport', 'Donations', 'Other'
    amount DECIMAL(10,2) NOT NULL CHECK (amount > 0),
    revenue_date DATE NOT NULL DEFAULT CURRENT_DATE,
    description TEXT,
    created_by UUID REFERENCES auth.users(id),
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- 3. Enable Row Level Security (RLS)
ALTER TABLE public.expenses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.other_revenue ENABLE ROW LEVEL SECURITY;

-- 4. Set Restrictions (Only authenticated personnel with 'finance' permission can access)
-- Note: Permission checks happen via auth.js in the frontend, but we secure the base DB for authenticated users
CREATE POLICY "Enable read access for authenticated users to expenses" 
ON public.expenses FOR SELECT TO authenticated USING (true);

CREATE POLICY "Enable insert access for authenticated users to expenses" 
ON public.expenses FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "Enable update access for authenticated users to expenses" 
ON public.expenses FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "Enable delete access for authenticated users to expenses" 
ON public.expenses FOR DELETE TO authenticated USING (true);


CREATE POLICY "Enable read access for authenticated users to other_revenue" 
ON public.other_revenue FOR SELECT TO authenticated USING (true);

CREATE POLICY "Enable insert access for authenticated users to other_revenue" 
ON public.other_revenue FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "Enable update access for authenticated users to other_revenue" 
ON public.other_revenue FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "Enable delete access for authenticated users to other_revenue" 
ON public.other_revenue FOR DELETE TO authenticated USING (true);
