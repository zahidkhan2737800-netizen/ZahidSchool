-- Finance tenant-isolation repair
-- Run once in the Supabase SQL Editor for the production project.
-- Existing rows keep their current school_id. Rows with NULL school_id remain
-- invisible until an administrator assigns them to the correct school.

BEGIN;

DO $$
DECLARE
    table_name_value TEXT;
    policy_row RECORD;
    target_tables TEXT[] := ARRAY['expenses', 'other_revenue', 'staff_payroll'];
BEGIN
    FOREACH table_name_value IN ARRAY target_tables LOOP
        IF NOT EXISTS (
            SELECT 1 FROM information_schema.tables
            WHERE table_schema = 'public' AND table_name = table_name_value
        ) THEN
            CONTINUE;
        END IF;

        IF NOT EXISTS (
            SELECT 1 FROM information_schema.columns
            WHERE table_schema = 'public'
              AND table_name = table_name_value
              AND column_name = 'school_id'
        ) THEN
            EXECUTE format(
                'ALTER TABLE public.%I ADD COLUMN school_id UUID REFERENCES public.schools(id) ON DELETE CASCADE',
                table_name_value
            );
        END IF;

        -- Recover ownership only where the creator has one unambiguous school.
        IF EXISTS (
            SELECT 1 FROM information_schema.columns
            WHERE table_schema = 'public'
              AND table_name = table_name_value
              AND column_name = 'created_by'
        ) THEN
            EXECUTE format(
                'UPDATE public.%1$I AS target
                 SET school_id = role_row.school_id
                 FROM public.user_roles AS role_row
                 WHERE target.school_id IS NULL
                   AND target.created_by = role_row.user_id
                   AND role_row.school_id IS NOT NULL',
                table_name_value
            );
        END IF;

        EXECUTE format(
            'CREATE INDEX IF NOT EXISTS %I ON public.%I (school_id)',
            'idx_' || table_name_value || '_school_id',
            table_name_value
        );

        EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', table_name_value);

        -- PostgreSQL combines permissive policies with OR. Therefore every old
        -- finance policy must be removed before the strict tenant policy is added.
        FOR policy_row IN
            SELECT policyname
            FROM pg_policies
            WHERE schemaname = 'public' AND tablename = table_name_value
        LOOP
            EXECUTE format(
                'DROP POLICY IF EXISTS %I ON public.%I',
                policy_row.policyname,
                table_name_value
            );
        END LOOP;

        EXECUTE format(
            'CREATE POLICY %I ON public.%I
             FOR ALL TO authenticated
             USING (school_id = public.get_current_user_school_id())
             WITH CHECK (school_id = public.get_current_user_school_id())',
            'Finance tenant isolation - ' || table_name_value,
            table_name_value
        );

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

COMMIT;

-- Audit result: every row returned here should have a non-null school_id.
SELECT 'expenses' AS table_name, school_id, COUNT(*) AS rows
FROM public.expenses GROUP BY school_id
UNION ALL
SELECT 'other_revenue', school_id, COUNT(*)
FROM public.other_revenue GROUP BY school_id
UNION ALL
SELECT 'staff_payroll', school_id, COUNT(*)
FROM public.staff_payroll GROUP BY school_id
ORDER BY table_name, school_id;
