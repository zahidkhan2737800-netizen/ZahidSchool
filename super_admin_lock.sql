-- =========================================================================================
-- SUPER ADMIN LOCK (STRICT)
-- =========================================================================================
-- Enforces:
-- 1) ONLY zahid@gmail.com can hold role super_admin
-- 2) ONLY ONE super_admin row exists in user_roles
-- 3) Existing data is normalized to match this rule
--
-- Run this in Supabase SQL editor as project owner.
-- =========================================================================================

BEGIN;

-- 1) Ensure super_admin role exists
INSERT INTO public.roles (role_name, description)
VALUES ('super_admin', 'SaaS Owner - Controls all schools and billing')
ON CONFLICT (role_name) DO NOTHING;

-- 2) Identify IDs we need
DO $$
DECLARE
    v_super_role_id UUID;
    v_owner_user_id UUID;
BEGIN
    SELECT id INTO v_super_role_id
    FROM public.roles
    WHERE role_name = 'super_admin'
    LIMIT 1;

    SELECT id INTO v_owner_user_id
    FROM auth.users
    WHERE lower(email) = 'zahid@gmail.com'
    LIMIT 1;

    IF v_owner_user_id IS NULL THEN
        RAISE EXCEPTION 'Owner email zahid@gmail.com not found in auth.users. Create this auth account first.';
    END IF;

    -- Demote any other existing super_admin assignments
    UPDATE public.user_roles ur
    SET role_id = (
        SELECT id FROM public.roles WHERE role_name = 'admin' LIMIT 1
    )
    WHERE ur.role_id = v_super_role_id
      AND ur.user_id <> v_owner_user_id;

    -- Ensure owner has super_admin role
    IF EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = v_owner_user_id) THEN
        UPDATE public.user_roles
        SET role_id = v_super_role_id
        WHERE user_id = v_owner_user_id;
    ELSE
        INSERT INTO public.user_roles (user_id, email, full_name, role_id, school_id)
        SELECT
            au.id,
            au.email,
            COALESCE(NULLIF(au.raw_user_meta_data->>'full_name', ''), 'Owner'),
            v_super_role_id,
            '00000000-0000-0000-0000-000000000000'::uuid
        FROM auth.users au
        WHERE au.id = v_owner_user_id;
    END IF;
END $$;

-- 3) Trigger to hard-block illegal super_admin assignment attempts
CREATE OR REPLACE FUNCTION public.enforce_single_owner_super_admin()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_super_role_id UUID;
    v_owner_user_id UUID;
    v_target_role_name TEXT;
BEGIN
    SELECT id INTO v_super_role_id
    FROM public.roles
    WHERE role_name = 'super_admin'
    LIMIT 1;

    SELECT id INTO v_owner_user_id
    FROM auth.users
    WHERE lower(email) = 'zahid@gmail.com'
    LIMIT 1;

    IF v_owner_user_id IS NULL THEN
        RAISE EXCEPTION 'Security lock: owner account zahid@gmail.com is missing.';
    END IF;

    SELECT role_name INTO v_target_role_name
    FROM public.roles
    WHERE id = NEW.role_id
    LIMIT 1;

    IF v_target_role_name = 'super_admin' THEN
        IF NEW.user_id <> v_owner_user_id THEN
            RAISE EXCEPTION 'Only zahid@gmail.com can be assigned super_admin role.';
        END IF;

        IF EXISTS (
            SELECT 1
            FROM public.user_roles ur
            WHERE ur.role_id = v_super_role_id
              AND ur.user_id <> NEW.user_id
              AND (TG_OP = 'INSERT' OR ur.id <> NEW.id)
        ) THEN
            RAISE EXCEPTION 'Only one super_admin is allowed in this system.';
        END IF;
    END IF;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_single_owner_super_admin ON public.user_roles;
CREATE TRIGGER trg_enforce_single_owner_super_admin
BEFORE INSERT OR UPDATE ON public.user_roles
FOR EACH ROW
EXECUTE FUNCTION public.enforce_single_owner_super_admin();

COMMIT;

-- Verification query:
-- SELECT ur.user_id, ur.email, r.role_name
-- FROM public.user_roles ur
-- JOIN public.roles r ON r.id = ur.role_id
-- WHERE r.role_name = 'super_admin';
