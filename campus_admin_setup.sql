-- =========================================================================================
-- CAMPUS ADMIN ROLE SETUP
-- =========================================================================================
-- Adds a dedicated role: campus_admin
-- Seeds a practical default permission preset for campus operations.
-- Safe to run multiple times.
-- =========================================================================================

BEGIN;

-- 1) Ensure role exists
INSERT INTO public.roles (role_name, description)
VALUES ('campus_admin', 'Campus-level administrator with operational access limited by campus isolation')
ON CONFLICT (role_name) DO UPDATE
SET description = EXCLUDED.description;

-- 2) Build default permissions for campus_admin
DO $$
DECLARE
    v_role_id UUID;
    p TEXT;
    all_pages TEXT[];

    -- pages campus_admin should be allowed to view/manage
    allowed_pages TEXT[] := ARRAY[
        'dashboard',
        'students',
        'family',
        'attendance',
        'monitoring',
        'homework',
        'complaints',
        'pending_withdrawn',
        'reports',
        'challans',
        'collect_fee',
        'collect_family_fee',
        'fee_contacts'
    ];
BEGIN
    SELECT id INTO v_role_id
    FROM public.roles
    WHERE role_name = 'campus_admin'
    LIMIT 1;

    IF v_role_id IS NULL THEN
        RAISE EXCEPTION 'campus_admin role creation failed.';
    END IF;

    -- discover page keys from existing permissions map
    SELECT ARRAY_AGG(DISTINCT page_key ORDER BY page_key)
    INTO all_pages
    FROM public.permissions;

    IF all_pages IS NULL THEN
        RAISE EXCEPTION 'permissions table appears empty; run RBAC setup first.';
    END IF;

    FOREACH p IN ARRAY all_pages
    LOOP
        IF p = ANY(allowed_pages) THEN
            -- allow operational actions for selected pages
            IF EXISTS (SELECT 1 FROM public.permissions WHERE role_id = v_role_id AND page_key = p) THEN
                UPDATE public.permissions
                SET can_view = true,
                    can_create = true,
                    can_edit = true,
                    can_delete = false
                WHERE role_id = v_role_id AND page_key = p;
            ELSE
                INSERT INTO public.permissions (role_id, page_key, can_view, can_create, can_edit, can_delete)
                VALUES (v_role_id, p, true, true, true, false);
            END IF;
        ELSE
            -- deny sensitive or central admin pages by default
            IF EXISTS (SELECT 1 FROM public.permissions WHERE role_id = v_role_id AND page_key = p) THEN
                UPDATE public.permissions
                SET can_view = false,
                    can_create = false,
                    can_edit = false,
                    can_delete = false
                WHERE role_id = v_role_id AND page_key = p;
            ELSE
                INSERT INTO public.permissions (role_id, page_key, can_view, can_create, can_edit, can_delete)
                VALUES (v_role_id, p, false, false, false, false);
            END IF;
        END IF;
    END LOOP;
END $$;

COMMIT;

-- Verify:
-- SELECT id, role_name, description FROM public.roles WHERE role_name = 'campus_admin';
-- SELECT page_key, can_view, can_create, can_edit, can_delete
-- FROM public.permissions
-- WHERE role_id = (SELECT id FROM public.roles WHERE role_name='campus_admin')
-- ORDER BY page_key;
