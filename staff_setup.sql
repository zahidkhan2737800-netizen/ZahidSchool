-- ═══════════════════════════════════════════════════════════════════════════════
-- Teacher & Staff Management Module - Database Setup
-- Run this script in your Supabase SQL Editor
-- ═══════════════════════════════════════════════════════════════════════════════

-- 1. Create Staff Profile Table
CREATE TABLE IF NOT EXISTS public.staff (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    employee_id TEXT UNIQUE NOT NULL,
    full_name TEXT NOT NULL,
    father_name TEXT,
    job_title TEXT DEFAULT 'Teacher' CHECK (job_title IN ('Teacher', 'Principal', 'Vice Principal', 'CEO', 'Accountant', 'Clerk', 'Office Staff', 'Peon', 'Other')),
    qualification TEXT,
    joining_date DATE NOT NULL DEFAULT CURRENT_DATE,
    whatsapp TEXT,
    mobile TEXT,
    experience TEXT,
    base_salary DECIMAL(10,2) NOT NULL DEFAULT 0,
    status TEXT NOT NULL DEFAULT 'Active' CHECK (status IN ('Active', 'Resigned', 'Terminated')),
    created_by UUID REFERENCES auth.users(id),
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- If the staff table already exists, add the column (safe to run multiple times)
ALTER TABLE public.staff ADD COLUMN IF NOT EXISTS job_title TEXT DEFAULT 'Teacher';

-- 2. Create Staff Attendance Table
CREATE TABLE IF NOT EXISTS public.staff_attendance (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    staff_id UUID REFERENCES public.staff(id) ON DELETE CASCADE,
    date DATE NOT NULL,
    status TEXT NOT NULL CHECK (status IN ('Present', 'Absent', 'Leave')),
    created_by UUID REFERENCES auth.users(id),
    created_at TIMESTAMPTZ DEFAULT now(),
    UNIQUE(staff_id, date) -- A staff member can only have one attendance record per day
);

-- 3. Create Staff Payroll / Challans Table
CREATE TABLE IF NOT EXISTS public.staff_payroll (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    staff_id UUID REFERENCES public.staff(id) ON DELETE CASCADE,
    salary_month TEXT NOT NULL, -- e.g., 'March 2026'
    base_salary DECIMAL(10,2) NOT NULL,
    leave_deductions DECIMAL(10,2) NOT NULL DEFAULT 0,
    advance_given DECIMAL(10,2) NOT NULL DEFAULT 0,
    net_payable DECIMAL(10,2) NOT NULL,
    status TEXT NOT NULL DEFAULT 'Unpaid' CHECK (status IN ('Unpaid', 'Paid')),
    payment_date DATE,
    created_by UUID REFERENCES auth.users(id),
    created_at TIMESTAMPTZ DEFAULT now(),
    UNIQUE(staff_id, salary_month) -- Generate one payslip per month per staff member
);

-- 4. Enable Row Level Security (RLS)
ALTER TABLE public.staff ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.staff_attendance ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.staff_payroll ENABLE ROW LEVEL SECURITY;

-- 5. Set RLS Policies (Grants access to all authenticated users; auth.js handles route protection)
CREATE POLICY "Enable read/write access for authenticated users to staff" 
ON public.staff FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "Enable read/write access for authenticated users to staff_attendance" 
ON public.staff_attendance FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "Enable read/write access for authenticated users to staff_payroll" 
ON public.staff_payroll FOR ALL TO authenticated USING (true) WITH CHECK (true);
