-- =========================================================================================
-- king_reassign_fix.sql
-- Diagnoses and fixes King's school assignment directly.
-- =========================================================================================

-- STEP 1: See what school King currently has assigned
SELECT ur.email, ur.full_name, ur.school_id, s.school_name
FROM public.user_roles ur
LEFT JOIN public.schools s ON s.id = ur.school_id
WHERE ur.email = 'King@gmail.com';

-- STEP 2: See all available schools and their IDs
SELECT id, school_name FROM public.schools;

-- STEP 3: Forcibly reassign King to the Kinf school
-- (Replace the Kinf UUID below with the correct one from STEP 2 output)
UPDATE public.user_roles
SET school_id = '8542db0c-7024-4ec2-aa29-ad4723408e25'  -- This is the Kinf school ID from your console
WHERE email = 'King@gmail.com';

-- STEP 4: Verify the update worked
SELECT ur.email, ur.full_name, ur.school_id, s.school_name
FROM public.user_roles ur
LEFT JOIN public.schools s ON s.id = ur.school_id
WHERE ur.email = 'King@gmail.com';

-- =========================================================================================
-- After running this, have King log out and log back in.
-- He will see ZERO students (blank Kinf school). 
-- =========================================================================================
