CREATE TABLE IF NOT EXISTS marks (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    school_id UUID REFERENCES schools(id) ON DELETE CASCADE,
    exam_id UUID REFERENCES examination(id) ON DELETE CASCADE,
    exam_name VARCHAR(255),
    class VARCHAR(255) NOT NULL,
    student_id UUID REFERENCES admissions(id) ON DELETE CASCADE,
    roll_number VARCHAR(50),
    name VARCHAR(255),
    marks JSONB DEFAULT '{}'::jsonb,
    total NUMERIC(10,2) DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()),
    UNIQUE(school_id, exam_id, class, student_id)
);

-- RLS
ALTER TABLE marks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view marks for their school"
ON marks FOR SELECT
USING (school_id = (SELECT school_id FROM user_roles WHERE user_id = auth.uid() LIMIT 1));

CREATE POLICY "Users can insert marks for their school"
ON marks FOR INSERT
WITH CHECK (school_id = (SELECT school_id FROM user_roles WHERE user_id = auth.uid() LIMIT 1));

CREATE POLICY "Users can update marks for their school"
ON marks FOR UPDATE
USING (school_id = (SELECT school_id FROM user_roles WHERE user_id = auth.uid() LIMIT 1))
WITH CHECK (school_id = (SELECT school_id FROM user_roles WHERE user_id = auth.uid() LIMIT 1));

CREATE POLICY "Users can delete marks for their school"
ON marks FOR DELETE
USING (school_id = (SELECT school_id FROM user_roles WHERE user_id = auth.uid() LIMIT 1));
