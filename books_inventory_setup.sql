-- Books Inventory Setup
CREATE TABLE IF NOT EXISTS books_inventory (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    school_id UUID REFERENCES schools(id) ON DELETE CASCADE,
    book_number TEXT,
    name TEXT NOT NULL,
    class_name TEXT NOT NULL,
    date_added DATE NOT NULL,
    cost_price NUMERIC DEFAULT 0,
    selling_price NUMERIC DEFAULT 0,
    quantity INTEGER DEFAULT 1,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now())
);

CREATE TABLE IF NOT EXISTS book_sales (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    school_id UUID REFERENCES schools(id) ON DELETE CASCADE,
    buyer_roll TEXT,
    buyer_name TEXT,
    buyer_father TEXT,
    buyer_class TEXT,
    sale_date DATE NOT NULL,
    total_amount NUMERIC DEFAULT 0,
    items JSONB NOT NULL DEFAULT '[]'::jsonb,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now())
);

-- RLS
ALTER TABLE books_inventory ENABLE ROW LEVEL SECURITY;
ALTER TABLE book_sales ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Enable read for authenticated users on books_inventory" 
    ON books_inventory FOR SELECT 
    USING (auth.role() = 'authenticated');

CREATE POLICY "Enable insert for authenticated users on books_inventory" 
    ON books_inventory FOR INSERT 
    WITH CHECK (auth.role() = 'authenticated');

CREATE POLICY "Enable update for authenticated users on books_inventory" 
    ON books_inventory FOR UPDATE 
    USING (auth.role() = 'authenticated');

CREATE POLICY "Enable delete for authenticated users on books_inventory" 
    ON books_inventory FOR DELETE 
    USING (auth.role() = 'authenticated');

CREATE POLICY "Enable read for authenticated users on book_sales" 
    ON book_sales FOR SELECT 
    USING (auth.role() = 'authenticated');

CREATE POLICY "Enable insert for authenticated users on book_sales" 
    ON book_sales FOR INSERT 
    WITH CHECK (auth.role() = 'authenticated');

CREATE POLICY "Enable update for authenticated users on book_sales" 
    ON book_sales FOR UPDATE 
    USING (auth.role() = 'authenticated');

CREATE POLICY "Enable delete for authenticated users on book_sales" 
    ON book_sales FOR DELETE 
    USING (auth.role() = 'authenticated');
