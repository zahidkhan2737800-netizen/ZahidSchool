-- =============================================================================
-- Secure user-account deletion for Access Control
-- Run once in the Supabase SQL Editor.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.delete_managed_user(p_user_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_caller_role TEXT;
    v_target_role TEXT;
    v_target_email TEXT;
    v_fk RECORD;
BEGIN
    IF auth.uid() IS NULL THEN
        RAISE EXCEPTION 'Authentication required.' USING ERRCODE = '42501';
    END IF;

    SELECT lower(r.role_name)
      INTO v_caller_role
      FROM public.user_roles ur
      JOIN public.roles r ON r.id = ur.role_id
     WHERE ur.user_id = auth.uid()
     LIMIT 1;

    IF v_caller_role IS DISTINCT FROM 'super_admin' THEN
        RAISE EXCEPTION 'Only the Super Admin can delete user accounts.' USING ERRCODE = '42501';
    END IF;

    IF p_user_id IS NULL THEN
        RAISE EXCEPTION 'A user ID is required.' USING ERRCODE = '22023';
    END IF;

    IF p_user_id = auth.uid() THEN
        RAISE EXCEPTION 'You cannot delete your own account.' USING ERRCODE = '42501';
    END IF;

    SELECT au.email, lower(r.role_name)
      INTO v_target_email, v_target_role
      FROM auth.users au
      LEFT JOIN public.user_roles ur ON ur.user_id = au.id
      LEFT JOIN public.roles r ON r.id = ur.role_id
     WHERE au.id = p_user_id
     LIMIT 1;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'User account was not found.' USING ERRCODE = 'P0002';
    END IF;

    IF v_target_role = 'super_admin' OR lower(COALESCE(v_target_email, '')) = 'zahid@gmail.com' THEN
        RAISE EXCEPTION 'The protected Super Admin account cannot be deleted.' USING ERRCODE = '42501';
    END IF;

    -- Remove the access profile explicitly. If a later step fails, the entire
    -- function transaction rolls back and this row is restored automatically.
    DELETE FROM public.user_roles WHERE user_id = p_user_id;

    -- Preserve historical rows. Nullable public columns that reference auth.users
    -- are cleared before deleting the login. ON DELETE CASCADE references, such as
    -- user_roles.user_id, are left for PostgreSQL to cascade normally.
    FOR v_fk IN
        SELECT ns.nspname AS schema_name,
               tbl.relname AS table_name,
               col.attname AS column_name,
               col.attnotnull AS is_required
          FROM pg_constraint con
          JOIN pg_class tbl ON tbl.oid = con.conrelid
          JOIN pg_namespace ns ON ns.oid = tbl.relnamespace
          JOIN pg_attribute col
            ON col.attrelid = tbl.oid
           AND col.attnum = con.conkey[1]
         WHERE con.contype = 'f'
           AND con.confrelid = 'auth.users'::regclass
           AND ns.nspname = 'public'
           AND array_length(con.conkey, 1) = 1
           AND con.confdeltype IN ('a', 'r')
           AND NOT (tbl.relname = 'user_roles' AND col.attname = 'user_id')
    LOOP
        IF v_fk.is_required THEN
            RAISE EXCEPTION
                'Cannot delete this user because %.%.% requires the user ID.',
                v_fk.schema_name, v_fk.table_name, v_fk.column_name;
        END IF;

        EXECUTE format(
            'UPDATE %I.%I SET %I = NULL WHERE %I = $1',
            v_fk.schema_name,
            v_fk.table_name,
            v_fk.column_name,
            v_fk.column_name
        ) USING p_user_id;
    END LOOP;

    DELETE FROM auth.users WHERE id = p_user_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'User account was not found.' USING ERRCODE = 'P0002';
    END IF;

    RETURN jsonb_build_object(
        'deleted', true,
        'user_id', p_user_id,
        'email', v_target_email
    );
END;
$$;

REVOKE ALL ON FUNCTION public.delete_managed_user(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.delete_managed_user(UUID) FROM anon;
GRANT EXECUTE ON FUNCTION public.delete_managed_user(UUID) TO authenticated;

COMMENT ON FUNCTION public.delete_managed_user(UUID) IS
'Permanently deletes a non-Super-Admin Auth user. Callable only by an authenticated Super Admin.';
