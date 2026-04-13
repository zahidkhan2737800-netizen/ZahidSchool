-- =============================================================
-- RESTORE SUPER ADMIN — Run in Supabase SQL Editor
-- Fixes: zahid@gmail.com accidentally demoted to admin
-- Run each block separately (not all at once)
-- =============================================================

-- STEP 1: Disable the lock trigger temporarily
ALTER TABLE public.user_roles DISABLE TRIGGER trg_enforce_single_owner_super_admin;

-- STEP 2: Direct update using known user_id
UPDATE public.user_roles
SET role_id = (
    SELECT id FROM public.roles WHERE role_name = 'super_admin' LIMIT 1
)
WHERE user_id = '3be75394-e806-4154-98a0-8168fd7da531';

-- STEP 3: Re-enable the trigger
ALTER TABLE public.user_roles ENABLE TRIGGER trg_enforce_single_owner_super_admin;

-- STEP 4: Verify — should show: zahid@gmail.com | super_admin
SELECT
    au.email,
    r.role_name,
    ur.user_id
FROM public.user_roles ur
JOIN public.roles r ON r.id = ur.role_id
JOIN auth.users au ON au.id = ur.user_id
WHERE ur.user_id = '3be75394-e806-4154-98a0-8168fd7da531';
