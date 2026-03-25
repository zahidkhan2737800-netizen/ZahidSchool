-- ═══════════════════════════════════════════════════════════════════════════════
-- NUCLEAR RLS RESET FOR 'challans' TABLE
--
-- This script safely destroys ALL existing security policies on the 'challans' 
-- table (including any forgotten rogue policies allowing public access) and 
-- rebuilds them from scratch to strictly follow your 'permissions' table.
-- ═══════════════════════════════════════════════════════════════════════════════

-- 1. Ensure RLS is active
ALTER TABLE challans ENABLE ROW LEVEL SECURITY;

-- 2. Dynamically destroy EVERY single policy currently attached to the challans table
DO $$ 
DECLARE 
  pol record;
BEGIN 
  FOR pol IN SELECT policyname FROM pg_policies WHERE tablename = 'challans' LOOP
    EXECUTE 'DROP POLICY IF EXISTS "' || pol.policyname || '" ON challans';
  END LOOP;
END $$;

-- 3. Create the 4 STRICT backend-enforced policies linked entirely to RBAC configuration

-- VIEW Policy (can_view)
CREATE POLICY "Strict View Challans" 
ON challans FOR SELECT 
TO authenticated 
USING (
    EXISTS (
        SELECT 1 FROM user_roles ur
        JOIN permissions p ON p.role_id = ur.role_id
        WHERE ur.user_id = auth.uid() AND p.page_key = 'challans' AND p.can_view = true
    )
);

-- CREATE Policy (can_create)
CREATE POLICY "Strict Create Challans" 
ON challans FOR INSERT 
TO authenticated 
WITH CHECK (
    EXISTS (
        SELECT 1 FROM user_roles ur
        JOIN permissions p ON p.role_id = ur.role_id
        WHERE ur.user_id = auth.uid() AND p.page_key = 'challans' AND p.can_create = true
    )
);

-- EDIT Policy (can_edit)
CREATE POLICY "Strict Edit Challans" 
ON challans FOR UPDATE 
TO authenticated 
USING (
    EXISTS (
        SELECT 1 FROM user_roles ur
        JOIN permissions p ON p.role_id = ur.role_id
        WHERE ur.user_id = auth.uid() AND p.page_key = 'challans' AND p.can_edit = true
    )
);

-- DELETE Policy (can_delete)
CREATE POLICY "Strict Delete Challans" 
ON challans FOR DELETE 
TO authenticated 
USING (
    EXISTS (
        SELECT 1 FROM user_roles ur
        JOIN permissions p ON p.role_id = ur.role_id
        WHERE ur.user_id = auth.uid() AND p.page_key = 'challans' AND p.can_delete = true
    )
);

-- SUCCESS! The table is now completely bulletproof based on the permissions configuration.
