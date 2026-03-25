-- 1. Create the families table
CREATE TABLE IF NOT EXISTS families (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    family_name TEXT NOT NULL,
    mobile_number TEXT UNIQUE NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 2. Enable Row Level Security (RLS) on families
ALTER TABLE families ENABLE ROW LEVEL SECURITY;

-- 3. Create policies for the families table
CREATE POLICY "Enable all operations for authenticated users on families" 
ON families FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- 4. Add 'family_id' column to admissions table to link students
-- This is safe to run multiple times, it won't crash if it already exists
DO $$ 
BEGIN 
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name='admissions' AND column_name='family_id') THEN
        ALTER TABLE admissions ADD COLUMN family_id UUID REFERENCES families(id) ON DELETE SET NULL;
    END IF;
END $$;
