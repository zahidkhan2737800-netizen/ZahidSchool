-- ============================================================
-- FIX: Todos / Diary Tasks — Shared Visibility Across All Users
-- ============================================================
-- Problem: When one user (e.g. admin) pins a diary note to the
-- dashboard using the emoji button, other users of the same school
-- cannot see it on their dashboard.  This happens because the
-- RLS policy on the todos table is either missing, blocks
-- cross-user reads, or is tied to auth.uid().
--
-- Solution: Allow any authenticated user who belongs to the same
-- school_id to SELECT, INSERT, UPDATE, and DELETE todos for their
-- school.  The school_id is looked up via the user_roles table.
--
-- Run this in Supabase > SQL Editor > New Query > Run.
-- ============================================================

-- Step 1: Make sure RLS is enabled on todos
ALTER TABLE todos ENABLE ROW LEVEL SECURITY;

-- Step 2: Drop any old conflicting policies on todos
DROP POLICY IF EXISTS "Allow own todos"           ON todos;
DROP POLICY IF EXISTS "Allow user todos"          ON todos;
DROP POLICY IF EXISTS "todos_select_own"          ON todos;
DROP POLICY IF EXISTS "todos_insert_own"          ON todos;
DROP POLICY IF EXISTS "todos_update_own"          ON todos;
DROP POLICY IF EXISTS "todos_delete_own"          ON todos;
DROP POLICY IF EXISTS "Allow school todos select"  ON todos;
DROP POLICY IF EXISTS "Allow school todos insert"  ON todos;
DROP POLICY IF EXISTS "Allow school todos update"  ON todos;
DROP POLICY IF EXISTS "Allow school todos delete"  ON todos;
DROP POLICY IF EXISTS "todos_school_select"       ON todos;
DROP POLICY IF EXISTS "todos_school_insert"       ON todos;
DROP POLICY IF EXISTS "todos_school_update"       ON todos;
DROP POLICY IF EXISTS "todos_school_delete"       ON todos;
DROP POLICY IF EXISTS "Allow anon todos"          ON todos;
DROP POLICY IF EXISTS "Allow public todos"         ON todos;

-- Step 3: Create school-wide shared policies
-- Any authenticated user whose school_id matches the row can read ALL todos for that school.
CREATE POLICY "todos_school_select"
  ON todos FOR SELECT
  TO authenticated
  USING (
    school_id IN (
      SELECT school_id FROM user_roles WHERE user_id = auth.uid()
    )
  );

-- Any authenticated user can insert todos for their own school
CREATE POLICY "todos_school_insert"
  ON todos FOR INSERT
  TO authenticated
  WITH CHECK (
    school_id IN (
      SELECT school_id FROM user_roles WHERE user_id = auth.uid()
    )
  );

-- Any authenticated user can update todos for their school
-- (This allows toggling dashboard_pinned, status, etc. across users)
CREATE POLICY "todos_school_update"
  ON todos FOR UPDATE
  TO authenticated
  USING (
    school_id IN (
      SELECT school_id FROM user_roles WHERE user_id = auth.uid()
    )
  )
  WITH CHECK (
    school_id IN (
      SELECT school_id FROM user_roles WHERE user_id = auth.uid()
    )
  );

-- Any authenticated user can soft-delete todos for their school
CREATE POLICY "todos_school_delete"
  ON todos FOR DELETE
  TO authenticated
  USING (
    school_id IN (
      SELECT school_id FROM user_roles WHERE user_id = auth.uid()
    )
  );

-- ============================================================
-- Verification: After running, test by:
-- 1. User A pins a diary task with the emoji button in Dairy/Tasks
-- 2. Log in as User B (same school, different user)
-- 3. Open dashboard: the pinned task should now appear
-- ============================================================
