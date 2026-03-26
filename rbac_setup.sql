-- ═══════════════════════════════════════════════════════════════════════════════
-- COMPLETE RBAC (Role-Based Access Control) Setup for Zahid School Management System
-- Run this in your Supabase SQL Editor (Dashboard > SQL Editor > New Query)
-- ═══════════════════════════════════════════════════════════════════════════════

-- 1. Create or Update ROLES TABLE
CREATE TABLE IF NOT EXISTS roles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    role_name TEXT NOT NULL UNIQUE,
    description TEXT,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- Note: We update "staff" to "accountant" if it existed from an older version
UPDATE roles SET role_name = 'accountant' WHERE role_name = 'staff';

-- 2. Create PERMISSIONS TABLE (per-role, per-page access matrix)
CREATE TABLE IF NOT EXISTS permissions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    role_id UUID NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
    page_key TEXT NOT NULL,          
    can_view BOOLEAN DEFAULT false,
    can_create BOOLEAN DEFAULT false,
    can_edit BOOLEAN DEFAULT false,
    can_delete BOOLEAN DEFAULT false,
    UNIQUE(role_id, page_key)
);

-- 3. Create USER ROLES ASSIGNMENT TABLE
CREATE TABLE IF NOT EXISTS user_roles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    role_id UUID NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
    full_name TEXT,
    email TEXT,
    assigned_at TIMESTAMPTZ DEFAULT now(),
    UNIQUE(user_id)
);

-- ═══════════════════════════════════════════════════════════════════════════════
-- 4. Enable RLS (Security Policies)
-- ═══════════════════════════════════════════════════════════════════════════════
ALTER TABLE roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE permissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_roles ENABLE ROW LEVEL SECURITY;

-- Safety Drop Policies to recreate cleanly without errors
DROP POLICY IF EXISTS "Authenticated users can view roles" ON roles;
DROP POLICY IF EXISTS "Allow all role management" ON roles;
DROP POLICY IF EXISTS "Authenticated users can view permissions" ON permissions;
DROP POLICY IF EXISTS "Allow all permission management" ON permissions;
DROP POLICY IF EXISTS "Users can view their own role" ON user_roles;
DROP POLICY IF EXISTS "Allow all user role management" ON user_roles;
DROP POLICY IF EXISTS "Anon can view roles" ON roles;
DROP POLICY IF EXISTS "Anon can view permissions" ON permissions;
DROP POLICY IF EXISTS "Anon can view user_roles" ON user_roles;

-- Recreate Open App Policies 
CREATE POLICY "Authenticated users can view roles" ON roles FOR SELECT TO authenticated USING (true);
CREATE POLICY "Allow all role management" ON roles FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Authenticated users can view permissions" ON permissions FOR SELECT TO authenticated USING (true);
CREATE POLICY "Allow all permission management" ON permissions FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Users can view their own role" ON user_roles FOR SELECT TO authenticated USING (true);
CREATE POLICY "Allow all user role management" ON user_roles FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Anon can view roles" ON roles FOR SELECT TO anon USING (true);
CREATE POLICY "Anon can view permissions" ON permissions FOR SELECT TO anon USING (true);
CREATE POLICY "Anon can view user_roles" ON user_roles FOR SELECT TO anon USING (true);

-- ═══════════════════════════════════════════════════════════════════════════════
-- 5. SEED DEFAULT ROLES
-- ═══════════════════════════════════════════════════════════════════════════════
INSERT INTO roles (role_name, description) VALUES
    ('admin', 'Full access to all modules and configurations'),
    ('teacher', 'View-only access to dashboard and student lists'),
    ('accountant', 'Manages fee collection and challans')
ON CONFLICT (role_name) DO UPDATE SET description = EXCLUDED.description;

-- ═══════════════════════════════════════════════════════════════════════════════
-- 6. SEED DEFAULT PERMISSIONS (Matches your exact 12 modules on frontend)
-- ═══════════════════════════════════════════════════════════════════════════════

-- A) ADMIN gets absolute full access to all 22 modules
INSERT INTO permissions (role_id, page_key, can_view, can_create, can_edit, can_delete)
SELECT r.id, p.page_key, true, true, true, true
FROM roles r,
(VALUES 
    -- Student Management
    ('dashboard'), ('admissions'), ('students'), ('family'), ('attendance'),
    ('monitoring'), ('homework'), ('complaints'), ('pending_withdrawn'), ('reports'),
    -- Fee Management
    ('challans'), ('collect_fee'), ('collect_family_fee'), ('fee_contacts'), ('fee_heads'), ('finance'),
    -- Staff Management
    ('staff_hiring'), ('staff_attendance'), ('staff_payroll'), ('staff_payments'),
    -- Administration
    ('classes'), ('access_control')
) AS p(page_key)
WHERE r.role_name = 'admin'
ON CONFLICT (role_id, page_key) DO UPDATE 
SET can_view=true, can_create=true, can_edit=true, can_delete=true;

-- B) TEACHER gets view access to dashboard, students, and attendance
INSERT INTO permissions (role_id, page_key, can_view, can_create, can_edit, can_delete)
SELECT r.id, p.page_key, p.can_view, p.can_create, p.can_edit, p.can_delete
FROM roles r,
(VALUES 
    ('dashboard', true, false, false, false),
    ('students', true, false, false, false),
    ('attendance', true, false, false, false),
    ('monitoring', true, false, false, false)
) AS p(page_key, can_view, can_create, can_edit, can_delete)
WHERE r.role_name = 'teacher'
ON CONFLICT (role_id, page_key) DO NOTHING;

-- C) ACCOUNTANT gets access to Fee modules
INSERT INTO permissions (role_id, page_key, can_view, can_create, can_edit, can_delete)
SELECT r.id, p.page_key, p.can_view, p.can_create, p.can_edit, p.can_delete
FROM roles r,
(VALUES 
    ('dashboard', true, false, false, false),
    ('students', true, false, false, false),
    ('challans', true, true, true, false),
    ('collect_fee', true, true, true, false),
    ('fee_contacts', true, true, true, false)
) AS p(page_key, can_view, can_create, can_edit, can_delete)
WHERE r.role_name = 'accountant'
ON CONFLICT (role_id, page_key) DO NOTHING;

-- ═══════════════════════════════════════════════════════════════════════════════
-- RUN COMPLETE! Refresh your frontend Access Control Panel.
-- ═══════════════════════════════════════════════════════════════════════════════
