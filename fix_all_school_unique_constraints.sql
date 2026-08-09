-- =====================================================================================
-- fix_all_school_unique_constraints.sql
-- Run once in the Supabase SQL Editor after the multi-tenant/SaaS setup.
--
-- Business identifiers may repeat in different schools. This migration changes the
-- remaining global UNIQUE constraints to school-scoped UNIQUE constraints.
-- It is safe to run more than once.
-- =====================================================================================

BEGIN;

-- Keep all legacy rows attached to a valid school before school_id becomes required.
INSERT INTO public.schools (id, school_name, is_active)
VALUES ('00000000-0000-0000-0000-000000000000', 'Legacy School', true)
ON CONFLICT (id) DO NOTHING;

-- These are the tables containing repeatable business identifiers.
DO $$
DECLARE
    table_name_value TEXT;
    target_tables TEXT[] := ARRAY[
        'admissions',
        'classes',
        'families',
        'family_contacts',
        'staff',
        'fee_head_types',
        'transactions'
    ];
BEGIN
    FOREACH table_name_value IN ARRAY target_tables
    LOOP
        IF to_regclass(format('public.%I', table_name_value)) IS NULL THEN
            CONTINUE;
        END IF;

        IF NOT EXISTS (
            SELECT 1
            FROM information_schema.columns
            WHERE table_schema = 'public'
              AND table_name = table_name_value
              AND column_name = 'school_id'
        ) THEN
            EXECUTE format(
                'ALTER TABLE public.%I ADD COLUMN school_id UUID REFERENCES public.schools(id) ON DELETE CASCADE',
                table_name_value
            );
        END IF;

        EXECUTE format(
            'UPDATE public.%I
             SET school_id = ''00000000-0000-0000-0000-000000000000''
             WHERE school_id IS NULL',
            table_name_value
        );

        EXECUTE format(
            'ALTER TABLE public.%I ALTER COLUMN school_id SET NOT NULL',
            table_name_value
        );

        EXECUTE format(
            'CREATE INDEX IF NOT EXISTS %I ON public.%I (school_id)',
            'idx_' || table_name_value || '_school_id',
            table_name_value
        );
    END LOOP;
END $$;

-- Always fill school_id when a page omits it. Super-admin pages should still send the
-- selected school explicitly; this fallback uses the super admin's assigned school.
CREATE OR REPLACE FUNCTION public.trigger_set_school_id()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    IF NEW.school_id IS NULL THEN
        NEW.school_id := public.get_current_user_school_id();
    END IF;
    RETURN NEW;
END;
$$;

DO $$
DECLARE
    table_name_value TEXT;
    target_tables TEXT[] := ARRAY[
        'admissions',
        'classes',
        'families',
        'family_contacts',
        'staff',
        'fee_head_types',
        'transactions'
    ];
BEGIN
    FOREACH table_name_value IN ARRAY target_tables
    LOOP
        IF to_regclass(format('public.%I', table_name_value)) IS NULL THEN
            CONTINUE;
        END IF;

        EXECUTE format(
            'DROP TRIGGER IF EXISTS %I ON public.%I',
            'ensure_school_id_on_insert_' || table_name_value,
            table_name_value
        );
        EXECUTE format(
            'CREATE TRIGGER %I
             BEFORE INSERT ON public.%I
             FOR EACH ROW EXECUTE FUNCTION public.trigger_set_school_id()',
            'ensure_school_id_on_insert_' || table_name_value,
            table_name_value
        );
    END LOOP;
END $$;

-- Remove every old UNIQUE constraint that contains only the unscoped business key,
-- then add the corresponding school-scoped key. Looking up constraints by their actual
-- columns also handles databases where PostgreSQL generated a different constraint name.
DO $$
DECLARE
    target RECORD;
    old_constraint RECORD;
    new_column_list TEXT;
BEGIN
    FOR target IN
        SELECT *
        FROM (VALUES
            ('classes',        ARRAY['class_name', 'section']::TEXT[],       'classes_school_class_name_section_key', ARRAY['school_id', 'class_name', 'section']::TEXT[]),
            ('admissions',     ARRAY['student_id']::TEXT[],                  'admissions_school_student_id_key',       ARRAY['school_id', 'student_id']::TEXT[]),
            ('admissions',     ARRAY['roll_number']::TEXT[],                 'admissions_school_roll_number_key',      ARRAY['school_id', 'roll_number']::TEXT[]),
            ('families',       ARRAY['mobile_number']::TEXT[],               'families_school_mobile_number_key',      ARRAY['school_id', 'mobile_number']::TEXT[]),
            ('family_contacts',ARRAY['family_mobile', 'month_key']::TEXT[],  'family_contacts_school_mobile_month_key',ARRAY['school_id', 'family_mobile', 'month_key']::TEXT[]),
            ('staff',          ARRAY['employee_id']::TEXT[],                 'staff_school_employee_id_key',           ARRAY['school_id', 'employee_id']::TEXT[]),
            ('fee_head_types', ARRAY['name']::TEXT[],                        'fee_head_types_school_name_key',         ARRAY['school_id', 'name']::TEXT[]),
            ('transactions',   ARRAY['receipt_number']::TEXT[],              'transactions_school_receipt_number_key', ARRAY['school_id', 'receipt_number']::TEXT[])
        ) AS keys(table_name, old_columns, new_constraint_name, new_columns)
    LOOP
        IF to_regclass(format('public.%I', target.table_name)) IS NULL THEN
            CONTINUE;
        END IF;

        FOR old_constraint IN
            SELECT constraint_data.conname
            FROM pg_constraint AS constraint_data
            JOIN pg_class AS table_data ON table_data.oid = constraint_data.conrelid
            JOIN pg_namespace AS namespace_data ON namespace_data.oid = table_data.relnamespace
            WHERE namespace_data.nspname = 'public'
              AND table_data.relname = target.table_name
              AND constraint_data.contype = 'u'
              AND ARRAY(
                    SELECT attribute_data.attname::TEXT
                    FROM unnest(constraint_data.conkey) WITH ORDINALITY AS key_data(attnum, position)
                    JOIN pg_attribute AS attribute_data
                      ON attribute_data.attrelid = constraint_data.conrelid
                     AND attribute_data.attnum = key_data.attnum
                    ORDER BY key_data.position
                  ) = target.old_columns
        LOOP
            EXECUTE format(
                'ALTER TABLE public.%I DROP CONSTRAINT %I',
                target.table_name,
                old_constraint.conname
            );
        END LOOP;

        IF NOT EXISTS (
            SELECT 1
            FROM pg_constraint AS constraint_data
            JOIN pg_class AS table_data ON table_data.oid = constraint_data.conrelid
            JOIN pg_namespace AS namespace_data ON namespace_data.oid = table_data.relnamespace
            WHERE namespace_data.nspname = 'public'
              AND table_data.relname = target.table_name
              AND constraint_data.contype = 'u'
              AND ARRAY(
                    SELECT attribute_data.attname::TEXT
                    FROM unnest(constraint_data.conkey) WITH ORDINALITY AS key_data(attnum, position)
                    JOIN pg_attribute AS attribute_data
                      ON attribute_data.attrelid = constraint_data.conrelid
                     AND attribute_data.attnum = key_data.attnum
                    ORDER BY key_data.position
                  ) = target.new_columns
        ) THEN
            SELECT string_agg(format('%I', column_name), ', ')
            INTO new_column_list
            FROM unnest(target.new_columns) AS column_data(column_name);

            EXECUTE format(
                'ALTER TABLE public.%I ADD CONSTRAINT %I UNIQUE (%s)',
                target.table_name,
                target.new_constraint_name,
                new_column_list
            );
        END IF;
    END LOOP;
END $$;

-- Families and fee-head types were created by older scripts with cross-school policies.
-- They are school-level data, so replace those permissive policies with tenant isolation.
DO $$
DECLARE
    table_name_value TEXT;
    policy_data RECORD;
BEGIN
    FOREACH table_name_value IN ARRAY ARRAY['families', 'fee_head_types']
    LOOP
        IF to_regclass(format('public.%I', table_name_value)) IS NULL THEN
            CONTINUE;
        END IF;

        EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', table_name_value);

        FOR policy_data IN
            SELECT policyname
            FROM pg_policies
            WHERE schemaname = 'public'
              AND tablename = table_name_value
        LOOP
            EXECUTE format(
                'DROP POLICY IF EXISTS %I ON public.%I',
                policy_data.policyname,
                table_name_value
            );
        END LOOP;

        EXECUTE format(
            'CREATE POLICY "Tenant Isolation Policy" ON public.%I
             FOR ALL TO authenticated
             USING (
                public.is_super_admin()
                OR school_id = public.get_current_user_school_id()
             )
             WITH CHECK (
                public.is_super_admin()
                OR school_id = public.get_current_user_school_id()
             )',
            table_name_value
        );
    END LOOP;
END $$;

-- Give every existing school its own defaults. When campus support is installed, attach
-- the defaults to that school's Main Campus instead of the super admin's current campus.
DO $$
BEGIN
    IF EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'fee_head_types'
          AND column_name = 'campus_id'
    ) AND to_regclass('public.campuses') IS NOT NULL THEN
        EXECUTE $seed_with_campus$
            INSERT INTO public.fee_head_types (school_id, campus_id, name)
            SELECT school_data.id, campus_data.id, fee_type.name
            FROM public.schools AS school_data
            LEFT JOIN LATERAL (
                SELECT campus_row.id
                FROM public.campuses AS campus_row
                WHERE campus_row.school_id = school_data.id
                ORDER BY
                    CASE WHEN campus_row.campus_name = 'Main Campus' THEN 0 ELSE 1 END,
                    campus_row.created_at
                LIMIT 1
            ) AS campus_data ON true
            CROSS JOIN (VALUES
                ('Monthly Fee'), ('Exam Fee'), ('Transport Fee'), ('Book Fee'),
                ('Uniform Fee'), ('Admission Fee'), ('Late Payment Fee'), ('Other')
            ) AS fee_type(name)
            ON CONFLICT (school_id, name) DO NOTHING
        $seed_with_campus$;
    ELSE
        EXECUTE $seed_without_campus$
            INSERT INTO public.fee_head_types (school_id, name)
            SELECT school_data.id, fee_type.name
            FROM public.schools AS school_data
            CROSS JOIN (VALUES
                ('Monthly Fee'), ('Exam Fee'), ('Transport Fee'), ('Book Fee'),
                ('Uniform Fee'), ('Admission Fee'), ('Late Payment Fee'), ('Other')
            ) AS fee_type(name)
            ON CONFLICT (school_id, name) DO NOTHING
        $seed_without_campus$;
    END IF;
END $$;

-- New schools are seeded by saas_campus_users.js after their Main Campus is created.
DROP TRIGGER IF EXISTS seed_default_fee_head_types_after_school_insert ON public.schools;
DROP FUNCTION IF EXISTS public.seed_default_fee_head_types_for_school();

COMMIT;

-- Verification: every row below should show school_id as its first constrained column.
SELECT
    table_data.relname AS table_name,
    constraint_data.conname AS constraint_name,
    pg_get_constraintdef(constraint_data.oid) AS definition
FROM pg_constraint AS constraint_data
JOIN pg_class AS table_data ON table_data.oid = constraint_data.conrelid
JOIN pg_namespace AS namespace_data ON namespace_data.oid = table_data.relnamespace
WHERE namespace_data.nspname = 'public'
  AND table_data.relname IN (
      'admissions', 'classes', 'families', 'family_contacts',
      'staff', 'fee_head_types', 'transactions'
  )
  AND constraint_data.contype = 'u'
ORDER BY table_data.relname, constraint_data.conname;
