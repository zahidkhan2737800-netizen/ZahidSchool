-- Run this SQL in your Supabase SQL Editor to recreate or update the table

DROP TABLE IF EXISTS admissions;

CREATE TABLE admissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id TEXT UNIQUE NOT NULL,
  roll_number TEXT NOT NULL,
  
  -- Student Info
  full_name TEXT NOT NULL,
  dob DATE,
  age_extracted TEXT,
  gender TEXT,
  place_of_birth TEXT,
  
  -- ID & Address
  bform_number TEXT,
  home_address TEXT,
  
  -- Parents / Guardian
  father_name TEXT,
  father_cnic TEXT,
  father_occ TEXT,
  father_mobile TEXT,
  father_whatsapp TEXT,
  mother_name TEXT,
  mother_cnic TEXT,
  mother_occ TEXT,
  mother_mobile TEXT,
  guardian_name TEXT,
  guardian_rel TEXT,
  guardian_contact TEXT,
  
  -- Academic
  last_school TEXT,
  class_passed TEXT,
  transfer_cert TEXT,
  
  -- Admission Details
  applying_for_class TEXT,
  session TEXT,
  admission_date DATE,
  campus TEXT,
  
  -- Medical
  medical_condition TEXT,
  
  -- Fee Info
  admission_fee NUMERIC,
  monthly_fee NUMERIC,
  discount NUMERIC,
  sibling_in_school TEXT,
  
  -- Admin specific
  status TEXT DEFAULT 'Pending' CHECK (status IN ('Pending', 'Active', 'Withdrawn')),
  
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Enable Row Level Security (RLS) on the table
ALTER TABLE admissions ENABLE ROW LEVEL SECURITY;

-- Create policy to allow anonymous inserts (since public users will submit the form)
CREATE POLICY "Allow public inserts" ON admissions 
FOR INSERT TO anon 
WITH CHECK (true);

-- Create policy to allow basic reads (in case you want to test fetching)
CREATE POLICY "Allow public select" ON admissions 
FOR SELECT TO anon 
USING (true);

-- Run this command if you previously created the table without the whatsapp column:
-- ALTER TABLE admissions ADD COLUMN IF NOT EXISTS father_whatsapp TEXT;

-- Run this command to add the updated_at column to track status changes:
-- ALTER TABLE admissions ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW();

-- =====================================
-- CLASSES TABLE SETUP
-- =====================================

CREATE TABLE IF NOT EXISTS classes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  class_name TEXT NOT NULL,
  section TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(class_name, section)
);

-- Enable RLS
ALTER TABLE classes ENABLE ROW LEVEL SECURITY;

-- Allow public to read and insert (since this is a simple local app)
CREATE POLICY "Allow public select classes" ON classes FOR SELECT TO anon USING (true);
CREATE POLICY "Allow public insert classes" ON classes FOR INSERT TO anon WITH CHECK (true);

-- =====================================
-- FEE HEADS TABLE SETUP
-- =====================================

CREATE TABLE IF NOT EXISTS fee_heads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  class_id UUID REFERENCES classes(id) ON DELETE CASCADE,
  fee_type TEXT NOT NULL,
  amount NUMERIC NOT NULL,
  is_monthly BOOLEAN DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- If you already created the table previously without the checkbox, run this carefully:
-- ALTER TABLE fee_heads ADD COLUMN IF NOT EXISTS is_monthly BOOLEAN DEFAULT false;

-- Enable RLS
ALTER TABLE fee_heads ENABLE ROW LEVEL SECURITY;

-- Allow public to read and insert
CREATE POLICY "Allow public select fee_heads" ON fee_heads FOR SELECT TO anon USING (true);
CREATE POLICY "Allow public insert fee_heads" ON fee_heads FOR INSERT TO anon WITH CHECK (true);

