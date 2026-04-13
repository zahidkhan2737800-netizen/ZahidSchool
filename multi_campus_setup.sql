-- =========================================================================================
-- MULTI-CAMPUS SETUP (BACKWARD-COMPATIBLE)
-- =========================================================================================
-- Goal:
-- 1) Add first-class campus support under each school.
-- 2) Keep super_admin cross-tenant access.
-- 3) Keep school-wide users (campus_id NULL in user_roles) seeing all campuses of their school.
-- 4) Restrict campus-assigned users to their own campus.
--
-- Safe rollout:
-- - Run this after your school-level multi-tenant setup is already active.
-- - This script is idempotent where practical.
-- =========================================================================================

BEGIN;

-- -----------------------------------------------------------------------------------------
-- 1) CAMPUSES MASTER TABLE
-- -----------------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.campuses (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    school_id UUID NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
    campus_name TEXT NOT NULL,
    campus_code TEXT,
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (school_id, campus_name)
);

CREATE INDEX IF NOT EXISTS idx_campuses_school_id ON public.campuses(school_id);

-- -----------------------------------------------------------------------------------------
-- 2) USER-ROLE CAMPUS ASSIGNMENT (NULL = SCHOOL-WIDE ACCESS)
-- -----------------------------------------------------------------------------------------
ALTER TABLE public.user_roles
ADD COLUMN IF NOT EXISTS campus_id UUID REFERENCES public.campuses(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_user_roles_campus_id ON public.user_roles(campus_id);

-- -----------------------------------------------------------------------------------------
-- 3) SEED CAMPUSES FROM LEGACY ADMISSIONS.campus TEXT
-- -----------------------------------------------------------------------------------------
-- Create campus rows from non-empty admissions.campus values
INSERT INTO public.campuses (school_id, campus_name)
SELECT DISTINCT
    a.school_id,
    BTRIM(a.campus) AS campus_name
FROM public.admissions a
WHERE a.school_id IS NOT NULL
  AND a.campus IS NOT NULL
  AND BTRIM(a.campus) <> ''
ON CONFLICT (school_id, campus_name) DO NOTHING;

-- Ensure each school has at least one default campus
INSERT INTO public.campuses (school_id, campus_name)
SELECT s.id, 'Main Campus'
FROM public.schools s
WHERE NOT EXISTS (
    SELECT 1 FROM public.campuses c WHERE c.school_id = s.id
)
ON CONFLICT (school_id, campus_name) DO NOTHING;

-- -----------------------------------------------------------------------------------------
-- 4) ADD campus_id TO OPERATIONAL TABLES (IF MISSING)
-- -----------------------------------------------------------------------------------------
DO $$
DECLARE
    t TEXT;
    target_tables TEXT[] := ARRAY[
        'admissions',
        'classes',
        'attendance',
        'challans',
        'receipts',
        'transactions',
        'expenses',
        'other_revenue',
        'fee_heads',
        'fee_head_types',
        'family_contacts',
        'fee_contacts',
        'wa_templates',
        'complaints',
        'monitoring_students',
        'monitoring_subjects',
        'monitoring_topics',
        'monitoring_scores',
        'staff',
        'staff_attendance',
        'staff_payroll',
        'permissions'
    ];
BEGIN
    FOREACH t IN ARRAY target_tables
    LOOP
        IF EXISTS (
            SELECT 1
            FROM information_schema.tables
            WHERE table_schema = 'public' AND table_name = t
        ) THEN
            IF NOT EXISTS (
                SELECT 1
                FROM information_schema.columns
                WHERE table_schema = 'public' AND table_name = t AND column_name = 'campus_id'
            ) THEN
                EXECUTE format(
                    'ALTER TABLE public.%I ADD COLUMN campus_id UUID REFERENCES public.campuses(id) ON DELETE SET NULL;',
                    t
                );
            END IF;

            EXECUTE format(
                'CREATE INDEX IF NOT EXISTS idx_%I_campus_id ON public.%I(campus_id);',
                t, t
            );
        END IF;
    END LOOP;
END $$;

-- -----------------------------------------------------------------------------------------
-- 5) BACKFILL campus_id ON ADMISSIONS USING legacy campus text
-- -----------------------------------------------------------------------------------------
UPDATE public.admissions a
SET campus_id = c.id
FROM public.campuses c
WHERE a.campus_id IS NULL
  AND a.school_id = c.school_id
  AND a.campus IS NOT NULL
  AND BTRIM(a.campus) <> ''
  AND BTRIM(a.campus) = c.campus_name;

-- fallback to school's Main Campus if still NULL
UPDATE public.admissions a
SET campus_id = c.id
FROM public.campuses c
WHERE a.campus_id IS NULL
  AND a.school_id = c.school_id
  AND c.campus_name = 'Main Campus';

-- -----------------------------------------------------------------------------------------
-- 6) BACKFILL campus_id ON OTHER TABLES
-- -----------------------------------------------------------------------------------------
-- 6A) student_id -> admissions.id mapping
DO $$
DECLARE
    t TEXT;
    via_student_id TEXT[] := ARRAY['attendance','challans','receipts','transactions','absent_days'];
BEGIN
    FOREACH t IN ARRAY via_student_id
    LOOP
        IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name=t)
           AND EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name=t AND column_name='student_id')
           AND EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name=t AND column_name='campus_id')
        THEN
            EXECUTE format(
                'UPDATE public.%I x
                 SET campus_id = a.campus_id
                 FROM public.admissions a
                 WHERE x.campus_id IS NULL
                   AND x.student_id = a.id
                   AND x.school_id = a.school_id;',
                t
            );
        END IF;
    END LOOP;
END $$;

-- 6B) roll / roll_number -> admissions.roll_number mapping
DO $$
DECLARE
    t TEXT;
    col_name TEXT;
    via_roll TEXT[] := ARRAY['complaints','monitoring_students','absent_days'];
BEGIN
    FOREACH t IN ARRAY via_roll
    LOOP
        IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name=t)
           AND EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name=t AND column_name='campus_id')
        THEN
            IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name=t AND column_name='roll_number') THEN
                col_name := 'roll_number';
            ELSIF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name=t AND column_name='roll') THEN
                col_name := 'roll';
            ELSE
                col_name := NULL;
            END IF;

            IF col_name IS NOT NULL THEN
                EXECUTE format(
                    'UPDATE public.%I x
                     SET campus_id = a.campus_id
                     FROM public.admissions a
                     WHERE x.campus_id IS NULL
                       AND x.school_id = a.school_id
                       AND NULLIF(BTRIM(x.%I::text), '''') = NULLIF(BTRIM(a.roll_number::text), '''');',
                    t, col_name
                );
            END IF;
        END IF;
    END LOOP;
END $$;

-- 6C) class-linked tables -> classes.campus_id
DO $$
DECLARE
    t TEXT;
    via_class_id TEXT[] := ARRAY['fee_heads','monitoring_subjects'];
BEGIN
    FOREACH t IN ARRAY via_class_id
    LOOP
        IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name=t)
           AND EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name=t AND column_name='class_id')
           AND EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name=t AND column_name='campus_id')
        THEN
            EXECUTE format(
                'UPDATE public.%I x
                 SET campus_id = cls.campus_id
                 FROM public.classes cls
                 WHERE x.campus_id IS NULL
                   AND x.class_id = cls.id
                   AND x.school_id = cls.school_id;',
                t
            );
        END IF;
    END LOOP;
END $$;

-- 6D) subject-linked tables -> monitoring_subjects.campus_id
DO $$
DECLARE
    t TEXT;
    via_subject_id TEXT[] := ARRAY['monitoring_topics','monitoring_scores'];
BEGIN
    FOREACH t IN ARRAY via_subject_id
    LOOP
        IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name=t)
           AND EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name=t AND column_name='subject_id')
           AND EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name=t AND column_name='campus_id')
        THEN
            EXECUTE format(
                'UPDATE public.%I x
                 SET campus_id = s.campus_id
                 FROM public.monitoring_subjects s
                 WHERE x.campus_id IS NULL
                   AND x.subject_id = s.id
                   AND x.school_id = s.school_id;',
                t
            );
        END IF;
    END LOOP;
END $$;

-- 6E) fallback: if school_id exists and campus_id still null, set school Main Campus
DO $$
DECLARE
    t TEXT;
BEGIN
    FOR t IN
        SELECT table_name
        FROM information_schema.columns
        WHERE table_schema='public' AND column_name='campus_id'
    LOOP
        IF EXISTS (
            SELECT 1 FROM information_schema.columns
            WHERE table_schema='public' AND table_name=t AND column_name='school_id'
        ) THEN
            EXECUTE format(
                'UPDATE public.%I x
                 SET campus_id = c.id
                 FROM public.campuses c
                 WHERE x.campus_id IS NULL
                   AND x.school_id = c.school_id
                   AND c.campus_name = ''Main Campus'';',
                t
            );
        END IF;
    END LOOP;
END $$;

-- -----------------------------------------------------------------------------------------
-- 7) CAMPUS CONTEXT FUNCTIONS
-- -----------------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_current_user_campus_id()
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_campus_id UUID;
BEGIN
    SELECT campus_id
    INTO v_campus_id
    FROM public.user_roles
    WHERE user_id = auth.uid()
    LIMIT 1;

    RETURN v_campus_id;
END;
$$;

-- True when current user is school-wide (no campus assignment)
CREATE OR REPLACE FUNCTION public.is_school_wide_user()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
AS $$
    SELECT public.get_current_user_campus_id() IS NULL
$$;

-- -----------------------------------------------------------------------------------------
-- 8) TRIGGER: AUTO-SET school_id and campus_id ON INSERT
-- -----------------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.trigger_set_tenant_scope()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
    v_school UUID;
    v_campus UUID;
BEGIN
    IF NEW.school_id IS NULL THEN
        NEW.school_id := public.get_current_user_school_id();
    END IF;

    IF NEW.campus_id IS NULL THEN
        v_campus := public.get_current_user_campus_id();

        IF v_campus IS NOT NULL THEN
            NEW.campus_id := v_campus;
        ELSIF NEW.school_id IS NOT NULL THEN
            SELECT id INTO v_campus
            FROM public.campuses
            WHERE school_id = NEW.school_id AND campus_name = 'Main Campus'
            LIMIT 1;
            NEW.campus_id := v_campus;
        END IF;
    END IF;

    RETURN NEW;
END;
$$;

DO $$
DECLARE
    t TEXT;
    target_tables TEXT[] := ARRAY[
        'admissions','classes','attendance','challans','receipts','transactions','expenses','other_revenue',
        'fee_heads','fee_head_types','family_contacts','fee_contacts','wa_templates','complaints',
        'monitoring_students','monitoring_subjects','monitoring_topics','monitoring_scores',
        'staff','staff_attendance','staff_payroll','permissions'
    ];
BEGIN
    FOREACH t IN ARRAY target_tables
    LOOP
        IF EXISTS (
            SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name=t
        ) AND EXISTS (
            SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name=t AND column_name='campus_id'
        ) THEN
            EXECUTE format('DROP TRIGGER IF EXISTS ensure_tenant_scope_on_insert_%I ON public.%I;', t, t);
            EXECUTE format(
                'CREATE TRIGGER ensure_tenant_scope_on_insert_%I
                 BEFORE INSERT ON public.%I
                 FOR EACH ROW EXECUTE FUNCTION public.trigger_set_tenant_scope();',
                t, t
            );
        END IF;
    END LOOP;
END $$;

-- -----------------------------------------------------------------------------------------
-- 9) RLS: CAMPUS-AWARE ISOLATION
-- -----------------------------------------------------------------------------------------
-- Rule:
-- super_admin: all
-- school-wide user (campus_id null): all rows in own school
-- campus user: only rows in own school + own campus
DO $$
DECLARE
    t TEXT;
BEGIN
    FOR t IN
        SELECT c.table_name
        FROM information_schema.columns c
        WHERE c.table_schema='public'
          AND c.column_name='campus_id'
          AND EXISTS (
              SELECT 1 FROM information_schema.columns c2
              WHERE c2.table_schema='public' AND c2.table_name=c.table_name AND c2.column_name='school_id'
          )
    LOOP
        EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY;', t);

        -- remove legacy permissive or old tenant policies
        EXECUTE format('DROP POLICY IF EXISTS "Tenant Isolation Policy" ON public.%I;', t);
        EXECUTE format('DROP POLICY IF EXISTS "Tenant Campus Isolation Policy" ON public.%I;', t);
        EXECUTE format('DROP POLICY IF EXISTS "Allow all for anon" ON public.%I;', t);
        EXECUTE format('DROP POLICY IF EXISTS "Enable all access" ON public.%I;', t);
        EXECUTE format('DROP POLICY IF EXISTS "Authenticated users can manage fee head types" ON public.%I;', t);

        EXECUTE format(
            'CREATE POLICY "Tenant Campus Isolation Policy" ON public.%I
             FOR ALL TO authenticated
             USING (
                public.is_super_admin() OR
                (
                    school_id = public.get_current_user_school_id() AND
                    (
                        public.get_current_user_campus_id() IS NULL OR
                        campus_id = public.get_current_user_campus_id()
                    )
                )
             )
             WITH CHECK (
                public.is_super_admin() OR
                (
                    school_id = public.get_current_user_school_id() AND
                    (
                        public.get_current_user_campus_id() IS NULL OR
                        campus_id = public.get_current_user_campus_id()
                    )
                )
             );',
            t
        );
    END LOOP;
END $$;

-- campuses table policy
ALTER TABLE public.campuses ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Campuses Isolation" ON public.campuses;
CREATE POLICY "Campuses Isolation"
ON public.campuses
FOR ALL TO authenticated
USING (
    public.is_super_admin() OR
    school_id = public.get_current_user_school_id()
)
WITH CHECK (
    public.is_super_admin() OR
    school_id = public.get_current_user_school_id()
);

-- user_roles policy remains school-level (campus assignment is managed by admin/super_admin)
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Anon can view user_roles" ON public.user_roles;
DROP POLICY IF EXISTS "SaaS User Management Isolation" ON public.user_roles;
CREATE POLICY "SaaS User Management Isolation"
ON public.user_roles
FOR ALL TO authenticated
USING (
    public.is_super_admin() OR
    school_id = public.get_current_user_school_id() OR
    user_id = auth.uid()
)
WITH CHECK (
    public.is_super_admin() OR
    school_id = public.get_current_user_school_id() OR
    user_id = auth.uid() OR
    school_id IS NULL
);

COMMIT;

-- =========================================================================================
-- QUICK VERIFICATION QUERIES
-- =========================================================================================
-- 1) SELECT table_name FROM information_schema.columns WHERE table_schema='public' AND column_name='campus_id' ORDER BY table_name;
-- 2) SELECT tablename, policyname FROM pg_policies WHERE schemaname='public' AND policyname ILIKE '%Campus%';
-- 3) SELECT school_id, campus_name, is_active FROM public.campuses ORDER BY school_id, campus_name;
