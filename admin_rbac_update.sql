-- 1. Enable full DELETE permissions for authenticated users (Admin RBAC update)
CREATE POLICY "Enable delete for authenticated users" 
ON public.admissions 
FOR DELETE 
TO authenticated 
USING (true);

-- 2. Ensure UPDATE permissions exist for inline edits
CREATE POLICY "Enable update for authenticated users" 
ON public.admissions 
FOR UPDATE 
TO authenticated 
USING (true)
WITH CHECK (true);
