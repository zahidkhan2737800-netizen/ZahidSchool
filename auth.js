// ═══════════════════════════════════════════════════════════════════════════════
// auth.js — Shared Authentication & RBAC Guard for Zahid School System
// Include this BEFORE any page-specific JS in every protected page
// ═══════════════════════════════════════════════════════════════════════════════

const SUPABASE_URL = 'https://dkscydwftycubvwxondi.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRrc2N5ZHdmdHljdWJ2d3hvbmRpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQyNTMxOTQsImV4cCI6MjA4OTgyOTE5NH0.U84KKtJV2Lzz_FXbnXqlstvzzTW-FWBBtJTxbGlNYIE';

// Shared Supabase client
const supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
window.supabaseClient = supabaseClient; // EXPORT FOR JS

// Helper: Ensure both DOM and Auth are fully loaded before executing callbacks
window.onAppReady = function(callback) {
    let authReady = window.authReady || false;
    let domReady = document.readyState !== 'loading';
    const check = () => { if (authReady && domReady) callback(); };
    if (!authReady) window.addEventListener('authready', () => { authReady = true; check(); });
    if (!domReady) document.addEventListener('DOMContentLoaded', () => { domReady = true; check(); });
    check();
};

// School subscription catalogue. This is separate from role permissions:
// a page must be enabled for the school AND allowed for the user's role.
const SCHOOL_ACCESS_SECTIONS = [
    { id: 'students', label: 'Students', icon: 'fas fa-user-graduate', items: [
        { href: 'index.html', label: 'Admission Form', icon: 'fas fa-file-signature', key: 'admissions' },
        { href: 'students.html', label: 'Active Students', icon: 'fas fa-users', key: 'students' },
        { href: 'Dairy.html', label: 'Diary / Tasks', icon: 'fas fa-clipboard-list', key: 'students' },
        { href: 'family.html', label: 'Family Management', icon: 'fas fa-home', key: 'family' },
        { href: 'homework.html', label: 'Homework Publisher', icon: 'fas fa-book', key: 'homework' },
        { href: 'publisher_config.html', label: 'Publisher Config', icon: 'fas fa-cog', key: 'homework' },
        { href: 'pending_withdrawn.html', label: 'Pending / Withdrawn', icon: 'fas fa-user-alt-slash', key: 'pending_withdrawn' },
        { href: 'reports.html', label: 'Report Generator', icon: 'fas fa-print', key: 'reports' }
    ]},
    { id: 'quality', label: 'Quality', icon: 'fas fa-star', items: [
        { href: 'complaint_diary.html', label: 'Complaint Diary', icon: 'fas fa-envelope-open-text', key: 'complaints' },
        { href: 'student_complaints.html', label: 'Student Complaints', icon: 'fas fa-user-check', key: 'complaints' },
        { href: 'student_complaints_report.html', label: 'Complaints Report', icon: 'fas fa-chart-pie', key: 'complaints' },
        { href: 'monitoring.html', label: 'Monitoring', icon: 'fas fa-chart-line', key: 'monitoring' },
        { href: 'syllabus_progress.html', label: 'Progress', icon: 'fas fa-list-check', key: 'classes' },
        { href: 'general_certificates.html', label: 'Certificates', icon: 'fas fa-certificate', key: 'classes' }
    ]},
    { id: 'attendance_tools', label: 'Attendance', icon: 'fas fa-calendar-check', items: [
        { href: 'attendance.html', label: 'Attendance Hub', icon: 'fas fa-calendar-check', key: 'attendance' },
        { href: 'daily_attendance.html', label: 'Daily Attendance Report', icon: 'fas fa-clipboard-list', key: 'attendance' },
        { href: 'attendance_register.html', label: 'Attendance Register', icon: 'fas fa-table', key: 'attendance' },
        { href: 'Absent_days.html', label: 'Absent Days', icon: 'fas fa-calendar-minus', key: 'attendance' },
        { href: 'Absent_Report Card.html', label: 'Absent Days Reports', icon: 'fas fa-id-card', key: 'attendance' },
        { href: 'absent_students_thermal_report.html', label: 'Absent Thermal Report', icon: 'fas fa-print', key: 'attendance', hiddenFromNavigation: true },
        { href: 'Ceritficates.html', label: 'Certificates', icon: 'fas fa-award', key: 'attendance' }
    ]},
    { id: 'fee_contact', label: 'Fee Contact', icon: 'fas fa-address-book', items: [
        { href: 'family_contacts.html', label: 'Family Fee Contact', icon: 'fas fa-phone-volume', key: 'fee_contacts' },
        { href: 'family_fee_commitments.html', label: 'Commitments', icon: 'fas fa-handshake', key: 'fee_contacts' },
        { href: 'fee_contacts.html', label: 'Student Fee Contact', icon: 'fas fa-phone-alt', key: 'fee_contacts' },
        { href: 'TeacherFee.html', label: 'Teacher Fee Follow-up', icon: 'fas fa-user-check', key: 'fee_contacts', hiddenFromNavigation: true },
        { href: 'All Fee Contact.html', label: 'All Fee Contact', icon: 'fas fa-users', key: 'fee_contacts' }
    ]},
    { id: 'fee_reports', label: 'Fee Reports', icon: 'fas fa-chart-bar', items: [
        { href: 'fee_paid_log.html', label: 'Fee Paid Log', icon: 'fas fa-list-check', key: 'collect_fee' },
        { href: 'fee_register.html', label: 'Fee Register', icon: 'fas fa-table', key: 'collect_fee' },
        { href: 'fee_type_report.html', label: 'Fee Type Report', icon: 'fas fa-file-invoice', key: 'collect_fee' },
        { href: 'head_wise_fee_report.html', label: 'Head Wise Collection', icon: 'fas fa-chart-bar', key: 'collect_fee' },
        { href: 'fee_unpaid_head_report.html', label: 'Fee Not Paid Head Wise', icon: 'fas fa-exclamation-circle', key: 'collect_fee' },
        { href: 'discount_report.html', label: 'Discount Report', icon: 'fas fa-tag', key: 'collect_fee' },
        { href: 'fee_default_report.html', label: 'Fee Default Report', icon: 'fas fa-user-slash', key: 'collect_fee' },
        { href: 'family_fee_report.html', label: 'Family Fee Balance Report', icon: 'fas fa-users-cog', key: 'collect_fee' },
        { href: 'student_fee_report.html', label: 'Student Fee Balance Report', icon: 'fas fa-user-graduate', key: 'collect_fee' },
        { href: 'student_fee_report.html?scope=all', label: 'All Students Fee Balance Report', icon: 'fas fa-users', key: 'collect_fee' }
    ]},
    { id: 'whatsapp', label: 'WhatsApp', icon: 'fab fa-whatsapp', items: [
        { href: 'wa_templates.html', label: 'WA Templates', icon: 'fab fa-whatsapp', key: 'fee_contacts' },
        { href: 'surveys.html', label: 'Surveys / Campaigns', icon: 'fas fa-poll-h', key: 'fee_contacts' }
    ]},
    { id: 'fees', label: 'Fee Management', icon: 'fas fa-money-bill-wave', items: [
        { href: 'create_challan.html', label: 'Create Challans', icon: 'fas fa-file-invoice-dollar', key: 'challans' },
        { href: 'collect_fee.html', label: 'Collect Student Fee', icon: 'fas fa-hand-holding-usd', key: 'collect_fee' },
        { href: 'collect_family_fee.html', label: 'Collect Family Fee', icon: 'fas fa-users-cog', key: 'collect_family_fee' },
        { href: 'bulk_print_family_bills.html', label: 'Bulk Print Family Bills', icon: 'fas fa-print', key: 'collect_family_fee' },
        { href: 'Family Bill.html', label: 'Family Bill', icon: 'fas fa-file-invoice', key: 'collect_family_fee', hiddenFromNavigation: true },
        { href: 'fee_heads.html', label: 'Fee Config', icon: 'fas fa-cogs', key: 'fee_heads' },
        { href: 'fee_complaint_msg.html', label: 'Fee Complaint Msg', icon: 'fas fa-comment-dots', key: 'collect_fee' }
    ]},
    { id: 'finance', label: 'Finance', icon: 'fas fa-chart-line', items: [
        { href: 'revenue.html', label: 'Revenue Management', icon: 'fas fa-arrow-down', key: 'finance' },
        { href: 'expenses.html', label: 'Expense Management', icon: 'fas fa-arrow-up', key: 'finance' },
        { href: 'monthly_profit.html', label: 'Monthly Profit', icon: 'fas fa-chart-bar', key: 'finance' },
        { href: 'daily_fee.html', label: 'Daily Fee', icon: 'fas fa-calendar-day', key: 'finance' }
    ]},
    { id: 'staff', label: 'Staff Management', icon: 'fas fa-chalkboard-teacher', items: [
        { href: 'staff_hiring.html', label: 'Staff Hiring', icon: 'fas fa-user-tie', key: 'staff_hiring' },
        { href: 'staff_attendance.html', label: 'Staff Attendance', icon: 'fas fa-user-clock', key: 'staff_attendance' },
        { href: 'staff_payroll.html', label: 'Salary Challans', icon: 'fas fa-file-invoice-dollar', key: 'staff_payroll' },
        { href: 'staff_payments.html', label: 'Pay Salaries', icon: 'fas fa-money-check-alt', key: 'staff_payments' }
    ]},
    { id: 'examination', label: 'Examination', icon: 'fas fa-file-signature', items: [
        { href: 'examination.html', label: 'Examination', icon: 'fas fa-clipboard-check', key: 'examination' },
        { href: 'slip.html', label: 'Exam Slip', icon: 'fas fa-id-card', key: 'examination' },
        { href: 'report_cards.html', label: 'Report Card', icon: 'fas fa-id-card-alt', key: 'examination' },
        { href: 'tick_report.html', label: 'Topic Mastery Report', icon: 'fas fa-check-circle', key: 'examination' },
        { href: 'Mark_Sheet.html', label: 'Mark Sheet', icon: 'fas fa-file-excel', key: 'examination' },
        { href: 'RS.html', label: 'RS', icon: 'fas fa-file-alt', key: 'examination' }
    ]},
    { id: 'inventory', label: 'Inventory', icon: 'fas fa-boxes', items: [
        { href: 'books_dashboard.html', label: 'Books Dashboard', icon: 'fas fa-chart-pie', key: 'books_dashboard' },
        { href: 'books_inventory.html', label: 'Books Inventory', icon: 'fas fa-book-open', key: 'books_inventory' },
        { href: 'book_sales_report.html', label: 'Book Sales Report', icon: 'fas fa-file-invoice-dollar', key: 'book_sales_report' }
    ]},
    { id: 'admin', label: 'Administration', icon: 'fas fa-user-shield', items: [
        { href: 'classes.html', label: 'Manage Classes', icon: 'fas fa-chalkboard', key: 'classes' },
        { href: 'picture_report.html', label: 'Picture Report', icon: 'fas fa-camera', key: 'classes' },
        { href: 'promote_students.html', label: 'Promote Students', icon: 'fas fa-level-up-alt', key: 'classes' },
        { href: 'curriculum_and_session.html', label: 'Curriculum & Session', icon: 'fas fa-book', key: 'classes' },
        { href: 'class_subjects_assignment.html', label: 'Class Subjects', icon: 'fas fa-link', key: 'classes' },
        { href: 'thermal_print_settings.html', label: 'Thermal Print Settings', icon: 'fas fa-print', key: 'collect_fee' },
        { href: 'access_control.html', label: 'Access Control', icon: 'fas fa-lock', key: 'access_control' },
        { href: 'quick_actions.html', label: 'Dashboard Shortcuts', icon: 'fas fa-cog', key: 'access_control' }
    ]},
    { id: 'saas', label: 'SAAS', icon: 'fas fa-cloud', items: [
        { href: 'saas_subscription_access.html', label: 'Subscription Access', icon: 'fas fa-layer-group', key: 'access_control', superAdminOnly: true },
        { href: 'saas_campus_users.html', label: 'Schools, Campuses & Users', icon: 'fas fa-users-cog', key: 'access_control', superAdminOnly: true }
    ]}
];

function normalizeSchoolPageHref(value) {
    let page = String(value || '').split('#')[0].split('?')[0].replace(/\\/g, '/').split('/').pop();
    try { page = decodeURIComponent(page); } catch (_) {}
    page = page.trim().toLowerCase();
    // Cloudflare Pages strips .html from URLs (e.g. /dashboard instead of /dashboard.html).
    // Normalize by appending .html if there's no extension, so checks work on both local and deployed.
    if (page && !page.includes('.')) page += '.html';
    return page;
}

window.SCHOOL_ACCESS_SECTIONS = SCHOOL_ACCESS_SECTIONS;
window.normalizeSchoolPageHref = normalizeSchoolPageHref;
window.schoolAccessConfigured = false;
window.schoolPageAccess = new Set();
window.isSchoolPageAllowed = function(href) {
    if (window.userRoleName === 'super_admin') return true;
    const pageKey = normalizeSchoolPageHref(href);
    if (!pageKey || pageKey === 'dashboard.html') return true;
    if (!window.schoolAccessConfigured) return true;
    return window.schoolPageAccess.has(pageKey);
};

// Page key mapping — maps HTML file to permission key
const PAGE_KEY_MAP = {
    'dashboard.html':           'dashboard',
    'index.html':               'admissions',
    'students.html':            'students',
    'attendance.html':          'attendance',
    'daily_attendance.html':    'attendance',
    'attendance_register.html': 'attendance',
    'absent_days.html':         'attendance',
    'absent_report card.html':  'attendance',
    'ceritficates.html':        'attendance',
    'monitoring.html':          'monitoring',
    'pending_withdrawn.html':   'pending_withdrawn',
    'create_challan.html':      'challans',
    'collect_fee.html':         'collect_fee',
    'thermal_print_settings.html': 'collect_fee',
    'fee_paid_log.html':        'collect_fee',
    'fee_register.html':        'collect_fee',
    'fee_contacts.html':        'fee_contacts',
    'family_contacts.html':     'fee_contacts',
    'family_fee_commitments.html': 'fee_contacts',
    'all fee contact.html':     'fee_contacts',
    'classes.html':             'classes',
    'syllabus_progress.html':   'classes',
    'fee_heads.html':           'fee_heads',
    'access_control.html':      'access_control',
    'family.html':              'family',
    'collect_family_fee.html':  'collect_family_fee',
    'bulk_print_family_bills.html': 'collect_family_fee',
    'homework.html':            'homework',
    'complaint_diary.html':     'complaints',
    'student_complaints.html':  'complaints',
    'reports.html':             'reports',
    'finance.html':             'finance',
    'examination.html':         'examination',
    'slip.html':                'examination',
    'curriculum_and_session.html': 'classes',
    'class_subjects_assignment.html': 'classes',
    'books_dashboard.html':     'books_dashboard',
    'books_inventory.html':     'books_inventory',
    'book_sales_report.html':   'book_sales_report',
    'staff_hiring.html':        'staff_hiring',
    'staff_attendance.html':    'staff_attendance',
    'staff_payroll.html':       'staff_payroll',
    'staff_payments.html':      'staff_payments',
    'quick_actions.html':       'access_control',
    'saas_master_console.html': 'access_control' // Super admin restricted
};

SCHOOL_ACCESS_SECTIONS.forEach(section => section.items.forEach(item => {
    const fileKey = normalizeSchoolPageHref(item.href);
    if (fileKey && !PAGE_KEY_MAP[fileKey]) PAGE_KEY_MAP[fileKey] = item.key;
}));

const SUPER_ADMIN_ONLY_PAGES = new Set(
    SCHOOL_ACCESS_SECTIONS.flatMap(section => section.items)
        .filter(item => item.superAdminOnly)
        .map(item => normalizeSchoolPageHref(item.href))
);
SUPER_ADMIN_ONLY_PAGES.add('saas_master_console.html');
SUPER_ADMIN_ONLY_PAGES.add('saas_register_school.html');

// Global auth state
let currentUser = null;
let userRole = null;
let userRoleName = '';
let userPermissions = {};  // { page_key: { can_view, can_create, can_edit, can_delete } }
window.currentCampusId = null;
window.campusFeatureReady = false;

async function loadSchoolFeatureAccess(schoolId) {
    window.schoolAccessConfigured = false;
    window.schoolPageAccess = new Set();

    if (!schoolId || window.userRoleName === 'super_admin') return;

    // Separate queries keep older installations working until the migration is run.
    const { data: schoolAccess, error: schoolError } = await supabaseClient
        .from('schools')
        .select('access_control_enabled')
        .eq('id', schoolId)
        .maybeSingle();

    if (schoolError) {
        console.info('School subscription access is not installed yet.');
        return;
    }

    window.schoolAccessConfigured = schoolAccess?.access_control_enabled === true;
    if (!window.schoolAccessConfigured) return;

    const { data: pageRows, error: pageError } = await supabaseClient
        .from('school_page_access')
        .select('page_key, is_enabled')
        .eq('school_id', schoolId);

    if (pageError) {
        // Custom access is fail-closed: only the dashboard remains available.
        console.error('School page access fetch error:', pageError);
        return;
    }

    window.schoolPageAccess = new Set(
        (pageRows || [])
            .filter(row => row.is_enabled === true)
            .map(row => normalizeSchoolPageHref(row.page_key))
    );
}

// ─── Auth Guard ────────────────────────────────────────────────────────────────
(async function authGuard() {
    const currentPage = normalizeSchoolPageHref(window.location.pathname) || 'dashboard.html';

    // Skip guard on login page
    if (currentPage === 'login.html') return;

    try {
        // 1. Check if user has active session
        const { data: { session }, error: sessionError } = await supabaseClient.auth.getSession();

        if (sessionError || !session) {
            redirectToLogin('Please log in to continue.');
            return;
        }

        currentUser = session.user;
        window.currentUser = currentUser;

        // 2. Fetch user's role and school status
        const { data: roleData, error: roleError } = await supabaseClient
            .from('user_roles')
            .select('role_id, school_id, full_name, schools(is_active, school_name), roles(id, role_name)')
            .eq('user_id', currentUser.id)
            .single();

        if (roleError || !roleData) {
            redirectToLogin('No role or school assigned. Contact administrator.');
            return;
        }

        // 3. Multi-Tenant Check: Is the school active?
        const school = roleData.schools;
        if (school && school.is_active === false) {
            redirectToLogin('Your school software access has been suspended. Please contact the administrator.');
            return;
        }
        window.currentSchoolName = school ? school.school_name : 'System';
        window.currentSchoolId = roleData.school_id || null; // ← expose for tenant isolation
        window.currentUserFullName = roleData.full_name || '';

        // Optional campus context (backward-compatible): if campus_id isn't migrated yet, keep null.
        try {
            const { data: campusRole } = await supabaseClient
                .from('user_roles')
                .select('campus_id')
                .eq('user_id', currentUser.id)
                .maybeSingle();
            window.currentCampusId = campusRole?.campus_id || null;
            window.campusFeatureReady = true;
        } catch (_) {
            window.currentCampusId = null;
            window.campusFeatureReady = false;
        }

        userRole = Array.isArray(roleData.roles) ? roleData.roles[0] : roleData.roles;
        userRoleName = String((userRole && userRole.role_name) || '').toLowerCase();
        window.userRoleName = userRoleName;

        if (SUPER_ADMIN_ONLY_PAGES.has(currentPage) && userRoleName !== 'super_admin') {
            window.location.href = 'dashboard.html?denied=1';
            return;
        }

        // Load the pages purchased by this school before checking the current URL.
        await loadSchoolFeatureAccess(roleData.school_id);

        // 3. Fetch all permissions for this role
        const { data: permsData, error: permsError } = await supabaseClient
            .from('permissions')
            .select('page_key, can_view, can_create, can_edit, can_delete')
            .eq('role_id', userRole.id);

        if (permsError) {
            console.error('Permission fetch error:', permsError);
            // Don't redirect to login for permission fetch errors on the dashboard.
            // Let the user see the dashboard with no module permissions instead of a blank screen.
            if (currentPage !== 'dashboard.html') {
                redirectToLogin('Error loading permissions.');
                return;
            }
        }

        // Build permissions map
        (permsData || []).forEach(p => {
            userPermissions[p.page_key] = {
                can_view: p.can_view,
                can_create: p.can_create,
                can_edit: p.can_edit,
                can_delete: p.can_delete
            };
        });

        // Auto-grant new module permissions to admin if missing from DB
        if (userRoleName === 'admin' || userRoleName === 'super_admin') {
            ['dashboard', 'admissions', 'classes', 'access_control', 'fee_heads', 'challans', 'students', 'collect_fee', 'monitoring', 'attendance', 'pending_withdrawn', 'fee_contacts', 'family', 'collect_family_fee', 'homework', 'complaints', 'reports', 'finance', 'examination', 'staff_hiring', 'staff_attendance', 'staff_payroll', 'staff_payments', 'books_dashboard', 'books_inventory', 'book_sales_report'].forEach(key => {
                if (!userPermissions[key]) {
                    userPermissions[key] = { can_view: true, can_create: true, can_edit: true, can_delete: true };
                }
            });
        }

        // 4. Check school subscription first, then the user's role permission.
        if (userRoleName !== 'super_admin' && !window.isSchoolPageAllowed(currentPage)) {
            window.location.href = 'dashboard.html?denied=subscription';
            return;
        }

        const pageKey = PAGE_KEY_MAP[currentPage];
        const pagePermission = userPermissions[currentPage] || userPermissions[pageKey];
        // Only restrict if the user is NOT a super admin. Super admins always bypass UI restrictions.
        // Always allow the dashboard — it's the landing page for denied redirects; blocking it
        // would cause an infinite redirect loop (screen blinking).
        if (userRoleName !== 'super_admin' && pageKey && pageKey !== 'dashboard' && (!pagePermission || !pagePermission.can_view)) {
            window.location.href = 'dashboard.html?denied=1';
            return;
        }

        // 5. Filter sidebar nav links based on permissions
        filterSidebarNav();

        // 6. Setup accordion menus to save vertical space
        setupSidebarAccordions();

        // 7. Show the page (was hidden during auth check)
        document.body.classList.add('auth-ready');

        // Signal completion globally
        window.authReady = true;
        window.dispatchEvent(new CustomEvent('authready'));

    } catch (err) {
        console.error('Auth guard error:', err);
        // On the dashboard, show the page with degraded functionality
        // instead of redirecting to login (which could cause a blank screen loop).
        const currentPageFallback = normalizeSchoolPageHref(window.location.pathname) || 'dashboard.html';
        if (currentPageFallback === 'dashboard.html' && window.currentUser) {
            console.warn('Auth guard error on dashboard — showing page with limited access.');
            window.userRoleName = window.userRoleName || '';
            document.body.classList.add('auth-ready');
            window.authReady = true;
            window.dispatchEvent(new CustomEvent('authready'));
        } else {
            redirectToLogin('Authentication error. Please try again.');
        }
    }
})();

// ─── Redirect to Login ─────────────────────────────────────────────────────────
function redirectToLogin(message) {
    const encodedMsg = encodeURIComponent(message || '');
    window.location.href = `login.html${encodedMsg ? '?msg=' + encodedMsg : ''}`;
}

// ─── Logout ────────────────────────────────────────────────────────────────────
async function logout() {
    await supabaseClient.auth.signOut();
    window.location.href = 'login.html';
}

// ─── Permission Checker ────────────────────────────────────────────────────────
window.canView = function(pageKey) {
    if (window.userRoleName === 'super_admin') return true;
    if (!pageKey) return true; // public or dashboard
    const perm = userPermissions[pageKey];
    if (!perm) return false;
    return perm.can_view === true;
};

// Prefer a page-specific permission such as "students.html". If it has not
// been configured yet, fall back to the older module permission such as "students".
window.canViewPage = function(href, legacyPageKey) {
    if (window.userRoleName === 'super_admin') return true;
    const exactPageKey = normalizeSchoolPageHref(href);
    const exactPermission = userPermissions[exactPageKey];
    if (exactPermission) return exactPermission.can_view === true;
    return window.canView(legacyPageKey || PAGE_KEY_MAP[exactPageKey]);
};

function hasPermission(pageKey, action) {
    const currentPageKey = normalizeSchoolPageHref(window.location.pathname);
    const currentLegacyKey = PAGE_KEY_MAP[currentPageKey];
    const exactPermission = userPermissions[currentPageKey];
    const perm = exactPermission && (pageKey === currentPageKey || pageKey === currentLegacyKey)
        ? exactPermission
        : userPermissions[pageKey];
    if (!perm) return false;
    return perm[action] === true;
}
window.hasPermission = hasPermission;

// ─── Filter Sidebar Nav Based on Permissions ───────────────────────────────────
function filterSidebarNav() {
    // Map nav link hrefs to page keys
    const navLinkMap = {
        'dashboard.html':           'dashboard',
        'index.html':               'admissions',
        'students.html':            'students',
        'attendance.html':          'attendance',
        'daily_attendance.html':    'attendance',
        'attendance_register.html': 'attendance',
        'monitoring.html':          'monitoring',
        'pending_withdrawn.html':   'pending_withdrawn',
        'create_challan.html':      'challans',
        'collect_fee.html':         'collect_fee',
        'thermal_print_settings.html': 'collect_fee',
        'fee_paid_log.html':        'collect_fee',
        'fee_register.html':        'collect_fee',
        'fee_contacts.html':        'fee_contacts',
        'family_contacts.html':     'fee_contacts',
        'family_fee_commitments.html': 'fee_contacts',
        'All Fee Contact.html':     'fee_contacts',
        'All%20Fee%20Contact.html': 'fee_contacts',
        'classes.html':             'classes',
        'syllabus_progress.html':   'classes',
        'fee_heads.html':           'fee_heads',
        'access_control.html':      'access_control',
        'family.html':              'family',
        'collect_family_fee.html':  'collect_family_fee',
        'bulk_print_family_bills.html': 'collect_family_fee',
        'homework.html':            'homework',
        'complaint_diary.html':     'complaints',
        'student_complaints.html':  'complaints',
        'reports.html':             'reports',
        'finance.html':             'finance',
        'books_dashboard.html':     'books_dashboard',
        'books_inventory.html':     'books_inventory',
        'book_sales_report.html':   'book_sales_report',
        'staff_hiring.html':        'staff_hiring',
        'staff_attendance.html':    'staff_attendance',
        'staff_payroll.html':       'staff_payroll',
        'staff_payments.html':      'staff_payments',
        'quick_actions.html':       'access_control'
    };

    document.querySelectorAll('.nav-link').forEach(link => {
        const href = link.getAttribute('href');
        
        // Dynamically unlock Fee Contacts globally 
        if (href && href.includes('fee_contacts.html')) {
            link.classList.remove('pending-feature');
            link.removeAttribute('title');
        }

        if (!href || href === '#') return; // skip "coming soon" links

        const pageKey = navLinkMap[href];
        if (!pageKey) return;

        // Both the school subscription and the user's role must allow the page.
        if (!window.isSchoolPageAllowed(href) || !window.canViewPage(href, pageKey)) {
            const navItem = link.closest('.nav-item');
            if (navItem) navItem.style.display = 'none';
        }
    });

    // Hide empty nav groups
    document.querySelectorAll('.nav-group').forEach(group => {
        const visibleLinks = group.querySelectorAll('.nav-item:not([style*="display: none"])');
        if (visibleLinks.length === 0) {
            group.style.display = 'none';
        }
    });
}

// ─── Setup Sidebar Accordions ────────────────────────────────────────────────
function setupSidebarAccordions() {
    const style = document.createElement('style');
    style.innerHTML = `
        .sidebar { 
            overflow-y: auto !important; 
            max-height: 100% !important;
            height: 100% !important;
            padding-bottom: 40px !important;
            padding-top: 10px !important;
        }
        /* Custom scrollbar just in case */
        .sidebar::-webkit-scrollbar { width: 4px; }
        .sidebar::-webkit-scrollbar-track { background: transparent; }
        .sidebar::-webkit-scrollbar-thumb { background: #94a3b8; border-radius: 4px; }

        /* Compress items to avoid scrolling */
        .nav-group { margin-bottom: 4px !important; }
        .nav-group-title {
            cursor: pointer;
            display: flex;
            justify-content: space-between;
            align-items: center;
            user-select: none;
            transition: color 0.2s;
            padding: 8px 12px !important;
            font-size: 0.85rem !important;
            position: relative;
        }
        .nav-link {
            padding: 6px 12px 6px 34px !important;
            font-size: 0.8rem !important;
            margin-bottom: 2px !important;
        }
        .nav-group-title i, .nav-link i { font-size: 0.9rem !important; margin-right: 8px !important; }
        .nav-group-title:hover { color: #2563eb !important; }
        .nav-group-title::after {
            content: '▼';
            font-size: 0.6rem;
            transition: transform 0.3s ease;
            color: inherit;
        }
        .nav-group.collapsed .nav-group-title::after {
            transform: rotate(-90deg);
        }
        .nav-links-list {
            overflow: hidden;
            transition: max-height 0.3s cubic-bezier(0.4, 0, 0.2, 1), opacity 0.3s ease;
        }
        .nav-group.collapsed .nav-links-list {
            max-height: 0 !important;
            opacity: 0;
            margin-bottom: 0;
        }
    `;
    document.head.appendChild(style);

    // Attach click listeners to all group titles
    document.querySelectorAll('.nav-group').forEach(group => {
        // Skip hidden groups
        if (group.style.display === 'none') return;
        
        const title = group.querySelector('.nav-group-title');
        const list = group.querySelector('.nav-links-list');
        if (!title || !list) return;

        // Ensure proper height calculation
        list.style.maxHeight = list.scrollHeight + "px";

        // Click toggle
        title.addEventListener('click', () => {
            const isCollapsing = !group.classList.contains('collapsed');
            
            // Auto-collapse all other groups
            document.querySelectorAll('.nav-group').forEach(otherGroup => {
                if (otherGroup !== group) {
                    otherGroup.classList.add('collapsed');
                    const otherList = otherGroup.querySelector('.nav-links-list');
                    if (otherList) {
                        otherList.style.maxHeight = '0px';
                        otherList.style.opacity = '0';
                    }
                }
            });

            if (isCollapsing) {
                group.classList.add('collapsed');
                list.style.maxHeight = '0px';
                list.style.opacity = '0';
            } else {
                group.classList.remove('collapsed');
                list.style.maxHeight = list.scrollHeight + "px";
                list.style.opacity = '1';
            }
        });

        // Auto-collapse groups that don't contain the active link initially
        const hasActiveLink = group.querySelector('.nav-link.active');
        if (!hasActiveLink) {
            group.classList.add('collapsed');
            list.style.maxHeight = '0px';
            list.style.opacity = '0';
        } else {
            list.style.maxHeight = list.scrollHeight + "px";
            list.style.opacity = '1';
        }
    });
}

// ─── Access Denied Check (on dashboard) ────────────────────────────────────────
(function checkAccessDenied() {
    const params = new URLSearchParams(window.location.search);
    const deniedReason = params.get('denied');
    if (deniedReason === '1' || deniedReason === 'subscription') {
        setTimeout(() => {
            const main = document.querySelector('.main-content') || document.body;
            const alert = document.createElement('div');
            alert.innerHTML = '🚫 <strong>Access Denied</strong> — You don\'t have permission to view that page.';
            alert.style.cssText = 'background:#fee2e2; color:#991b1b; padding:1rem 1.5rem; border-radius:12px; margin-bottom:1.5rem; font-weight:500; position:relative; z-index:10; animation: fadeIn 0.3s ease;';
            main.prepend(alert);
            setTimeout(() => alert.remove(), 5000);
            // Clean URL
            window.history.replaceState({}, '', window.location.pathname);
        }, 500);
    }
})();
