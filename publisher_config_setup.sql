-- Create Publisher Config Table
CREATE TABLE IF NOT EXISTS publisher_config (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    school_id UUID REFERENCES schools(id) ON DELETE CASCADE,
    campus_id UUID REFERENCES campuses(id) ON DELETE CASCADE,
    class_name TEXT NOT NULL,
    category TEXT NOT NULL,
    items JSONB NOT NULL DEFAULT '[]'::jsonb,
    complaint_prefix TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()),
    UNIQUE(school_id, class_name, category)
);

-- RLS
ALTER TABLE publisher_config ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Enable read for authenticated users on publisher_config" 
    ON publisher_config FOR SELECT 
    USING (auth.role() = 'authenticated');

CREATE POLICY "Enable insert for authenticated users on publisher_config" 
    ON publisher_config FOR INSERT 
    WITH CHECK (auth.role() = 'authenticated');

CREATE POLICY "Enable update for authenticated users on publisher_config" 
    ON publisher_config FOR UPDATE 
    USING (auth.role() = 'authenticated');

CREATE POLICY "Enable delete for authenticated users on publisher_config" 
    ON publisher_config FOR DELETE 
    USING (auth.role() = 'authenticated');
