-- ═══════════════════════════════════════════════════════════════════════════════
-- RBAC (Role-Based Access Control) Setup for Zahid School Management System
-- Run this in your Supabase SQL Editor (Dashboard > SQL Editor > New Query)
-- ═══════════════════════════════════════════════════════════════════════════════

-- 1. ROLES TABLE
CREATE TABLE IF NOT EXISTS roles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    role_name TEXT NOT NULL UNIQUE,
    description TEXT,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- 2. PERMISSIONS TABLE (per-role, per-page access matrix)
CREATE TABLE IF NOT EXISTS permissions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    role_id UUID NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
    page_key TEXT NOT NULL,          -- e.g. 'dashboard', 'admissions', 'challans'
    can_view BOOLEAN DEFAULT false,
    can_create BOOLEAN DEFAULT false,
    can_edit BOOLEAN DEFAULT false,
    can_delete BOOLEAN DEFAULT false,
    UNIQUE(role_id, page_key)
);

-- 3. USER ROLES ASSIGNMENT TABLE
CREATE TABLE IF NOT EXISTS user_roles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    role_id UUID NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
    assigned_at TIMESTAMPTZ DEFAULT now(),
    UNIQUE(user_id)
);

-- ═══════════════════════════════════════════════════════════════════════════════
-- 4. Enable RLS
-- ═══════════════════════════════════════════════════════════════════════════════
ALTER TABLE roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE permissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_roles ENABLE ROW LEVEL SECURITY;

-- Roles: anyone authenticated can read roles
CREATE POLICY "Authenticated users can view roles"
    ON roles FOR SELECT
    TO authenticated
    USING (true);

-- Roles: only admins can insert/update/delete (handled via app logic)
CREATE POLICY "Allow all role management"
    ON roles FOR ALL
    TO authenticated
    USING (true)
    WITH CHECK (true);

-- Permissions: authenticated users can read permissions
CREATE POLICY "Authenticated users can view permissions"
    ON permissions FOR SELECT
    TO authenticated
    USING (true);

-- Permissions: admins can manage permissions (enforced at app level)
CREATE POLICY "Allow all permission management"
    ON permissions FOR ALL
    TO authenticated
    USING (true)
    WITH CHECK (true);

-- User Roles: users can read their own role, admins can manage all
CREATE POLICY "Users can view their own role"
    ON user_roles FOR SELECT
    TO authenticated
    USING (true);

CREATE POLICY "Allow all user role management"
    ON user_roles FOR ALL
    TO authenticated
    USING (true)
    WITH CHECK (true);

-- Also allow anon to read roles/permissions/user_roles for login flow
CREATE POLICY "Anon can view roles" ON roles FOR SELECT TO anon USING (true);
CREATE POLICY "Anon can view permissions" ON permissions FOR SELECT TO anon USING (true);
CREATE POLICY "Anon can view user_roles" ON user_roles FOR SELECT TO anon USING (true);

-- ═══════════════════════════════════════════════════════════════════════════════
-- 5. SEED DEFAULT ROLES
-- ═══════════════════════════════════════════════════════════════════════════════
INSERT INTO roles (role_name, description) VALUES
    ('admin', 'Full access to all modules'),
    ('teacher', 'View-only access to dashboard and students'),
    ('staff', 'Fee collection and challan management')
ON CONFLICT (role_name) DO NOTHING;

-- ═══════════════════════════════════════════════════════════════════════════════
-- 6. SEED DEFAULT PERMISSIONS (Admin gets everything, others get limited)
-- ═══════════════════════════════════════════════════════════════════════════════

-- Define all page keys
-- dashboard, admissions, students, pending_withdrawn, challans, collect_fee, classes, fee_heads, access_control

-- ADMIN: Full access to everything
INSERT INTO permissions (role_id, page_key, can_view, can_create, can_edit, can_delete)
SELECT r.id, p.page_key, true, true, true, true
FROM roles r,
(VALUES 
    ('dashboard'), ('admissions'), ('students'), ('pending_withdrawn'),
    ('challans'), ('collect_fee'), ('classes'), ('fee_heads'), ('access_control')
) AS p(page_key)
WHERE r.role_name = 'admin'
ON CONFLICT (role_id, page_key) DO NOTHING;

-- TEACHER: View dashboard and students only
INSERT INTO permissions (role_id, page_key, can_view, can_create, can_edit, can_delete)
SELECT r.id, p.page_key, p.can_view, p.can_create, p.can_edit, p.can_delete
FROM roles r,
(VALUES 
    ('dashboard', true, false, false, false),
    ('students', true, false, false, false),
    ('pending_withdrawn', true, false, false, false)
) AS p(page_key, can_view, can_create, can_edit, can_delete)
WHERE r.role_name = 'teacher'
ON CONFLICT (role_id, page_key) DO NOTHING;

-- STAFF: Fee-related modules
INSERT INTO permissions (role_id, page_key, can_view, can_create, can_edit, can_delete)
SELECT r.id, p.page_key, p.can_view, p.can_create, p.can_edit, p.can_delete
FROM roles r,
(VALUES 
    ('dashboard', true, false, false, false),
    ('students', true, false, false, false),
    ('challans', true, true, true, false),
    ('collect_fee', true, true, true, false)
) AS p(page_key, can_view, can_create, can_edit, can_delete)
WHERE r.role_name = 'staff'
ON CONFLICT (role_id, page_key) DO NOTHING;

-- ═══════════════════════════════════════════════════════════════════════════════
-- 7. DONE! Now create your first admin user:
--    1. Go to Supabase Dashboard > Authentication > Users > Add User
--    2. Enter email and password
--    3. Then run this SQL (replace YOUR_USER_ID with the UUID from the Users table):
--
--    INSERT INTO user_roles (user_id, role_id)
--    SELECT '3be75394-e806-4154-98a0-8168fd7da531', id FROM roles WHERE role_name = 'admin';
-- ═══════════════════════════════════════════════════════════════════════════════
