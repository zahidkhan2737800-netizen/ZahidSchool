-- ═══════════════════════════════════════════════════════════════════════════════
-- Server-Side RBAC Enforcement for Challans
--
-- Run this in your Supabase SQL Editor to make the database physically block
-- unauthorized deletions, even if the user hacks the frontend.
-- ═══════════════════════════════════════════════════════════════════════════════

-- 1. Remove the weak generic policy that allowed anyone to delete challans
DROP POLICY IF EXISTS "Allow public delete challans" ON challans;

-- 2. Create the strict, hack-proof backend policy
-- It checks if the currently logged-in user (auth.uid()) has a role that gives
-- them 'can_delete' = true for the 'challans' page.
CREATE POLICY "Strict RBAC Delete Challans"
ON challans FOR DELETE 
TO authenticated
USING (
    EXISTS (
        SELECT 1 
        FROM user_roles ur
        JOIN permissions p ON p.role_id = ur.role_id
        WHERE ur.user_id = auth.uid()
          AND p.page_key = 'challans'
          AND p.can_delete = true
    )
);

-- Note: The other operations (select, insert, update) are still governed by the
-- existing policies from 'challan_setup.sql'. You can apply this exact same 
-- pattern to UPDATE, INSERT, etc., if you ever want to lock those down at the 
-- database level too!
