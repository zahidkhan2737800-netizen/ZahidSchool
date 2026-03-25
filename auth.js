// ═══════════════════════════════════════════════════════════════════════════════
// auth.js — Shared Authentication & RBAC Guard for Zahid School System
// Include this BEFORE any page-specific JS in every protected page
// ═══════════════════════════════════════════════════════════════════════════════

const SUPABASE_URL = 'https://dkscydwftycubvwxondi.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRrc2N5ZHdmdHljdWJ2d3hvbmRpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQyNTMxOTQsImV4cCI6MjA4OTgyOTE5NH0.U84KKtJV2Lzz_FXbnXqlstvzzTW-FWBBtJTxbGlNYIE';

// Shared Supabase client
const supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
window.supabaseClient = supabaseClient; // EXPORT FOR JS

// Page key mapping — maps HTML file to permission key
const PAGE_KEY_MAP = {
    'dashboard.html':           'dashboard',
    'index.html':               'admissions',
    'students.html':            'students',
    'pending_withdrawn.html':   'pending_withdrawn',
    'create_challan.html':      'challans',
    'collect_fee.html':         'collect_fee',
    'fee_contacts.html':        'collect_fee', // Maps to the same permission object
    'classes.html':             'classes',
    'fee_heads.html':           'fee_heads',
    'access_control.html':      'access_control',
    'attendance.html':          'attendance',
    'monitoring.html':          'monitoring',
    'family.html':              'students',
    'collect_family_fee.html':  'collect_fee',
    'homework.html':            'students',
    'complaint_diary.html':     'students'
};

// Global auth state
let currentUser = null;
let userRole = null;
let userRoleName = '';
let userPermissions = {};  // { page_key: { can_view, can_create, can_edit, can_delete } }

// ─── Auth Guard ────────────────────────────────────────────────────────────────
(async function authGuard() {
    const currentPage = window.location.pathname.split('/').pop() || 'dashboard.html';

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

        // 2. Fetch user's role
        const { data: roleData, error: roleError } = await supabaseClient
            .from('user_roles')
            .select('role_id, roles(id, role_name)')
            .eq('user_id', currentUser.id)
            .single();

        if (roleError || !roleData) {
            redirectToLogin('No role assigned. Contact administrator.');
            return;
        }

        userRole = Array.isArray(roleData.roles) ? roleData.roles[0] : roleData.roles;
        userRoleName = userRole.role_name;
        window.userRoleName = userRoleName;

        // 3. Fetch all permissions for this role
        const { data: permsData, error: permsError } = await supabaseClient
            .from('permissions')
            .select('page_key, can_view, can_create, can_edit, can_delete')
            .eq('role_id', userRole.id);

        if (permsError) {
            console.error('Permission fetch error:', permsError);
            redirectToLogin('Error loading permissions.');
            return;
        }

        // Build permissions map
        permsData.forEach(p => {
            userPermissions[p.page_key] = {
                can_view: p.can_view,
                can_create: p.can_create,
                can_edit: p.can_edit,
                can_delete: p.can_delete
            };
        });

        // Auto-grant new module permissions to admin if missing from DB
        if (userRoleName === 'admin') {
            ['monitoring', 'attendance'].forEach(key => {
                if (!userPermissions[key]) {
                    userPermissions[key] = { can_view: true, can_create: true, can_edit: true, can_delete: true };
                }
            });
        }

        // 4. Check if user has VIEW access to current page
        const pageKey = PAGE_KEY_MAP[currentPage];
        if (pageKey && (!userPermissions[pageKey] || !userPermissions[pageKey].can_view)) {
            window.location.href = 'dashboard.html?denied=1';
            return;
        }

        // 5. Inject user profile into sidebar
        injectUserProfile();

        // 6. Filter sidebar nav links based on permissions
        filterSidebarNav();

        // 7. Setup accordion menus to save vertical space
        setupSidebarAccordions();

        // 8. Show the page (was hidden during auth check)
        document.body.classList.add('auth-ready');

        // Signal completion globally
        window.authReady = true;

    } catch (err) {
        console.error('Auth guard error:', err);
        redirectToLogin('Authentication error. Please try again.');
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
    if (!pageKey) return true; // public or dashboard
    const perm = userPermissions[pageKey];
    if (!perm) return false;
    return perm.can_view === true;
};

function hasPermission(pageKey, action) {
    const perm = userPermissions[pageKey];
    if (!perm) return false;
    return perm[action] === true;
}

// ─── Inject User Profile into Sidebar ──────────────────────────────────────────
function injectUserProfile() {
    if (document.getElementById('userAvatar')) return; // Skip if new dashboard layout handles it natively
    
    const sidebar = document.querySelector('.sidebar');
    if (!sidebar) return;

    // Remove existing profile if re-injected
    const existing = sidebar.querySelector('.user-profile-section');
    if (existing) existing.remove();

    const roleBadgeColor = {
        'admin': '#2563eb',
        'teacher': '#16a34a',
        'staff': '#d97706'
    };

    const profileSection = document.createElement('div');
    profileSection.className = 'user-profile-section';
    profileSection.innerHTML = `
        <div style="
            padding: 1.2rem 1.5rem;
            border-top: 1px solid rgba(0,0,0,0.05);
            display: flex;
            align-items: center;
            gap: 0.8rem;
        ">
            <div style="
                width: 38px;
                height: 38px;
                border-radius: 50%;
                background: linear-gradient(135deg, ${roleBadgeColor[userRoleName] || '#64748b'}, #1e293b);
                color: white;
                display: flex;
                align-items: center;
                justify-content: center;
                font-weight: 700;
                font-size: 0.9rem;
                flex-shrink: 0;
            ">${(currentUser.email || '?').charAt(0).toUpperCase()}</div>
            <div style="flex:1; min-width:0;">
                <div style="font-weight:600; font-size:0.85rem; color:#0f172a; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">
                    ${currentUser.email}
                </div>
                <span style="
                    display:inline-block;
                    background: ${roleBadgeColor[userRoleName] || '#64748b'};
                    color: white;
                    font-size: 0.65rem;
                    padding: 0.15rem 0.5rem;
                    border-radius: 12px;
                    font-weight: 700;
                    text-transform: uppercase;
                    letter-spacing: 0.05em;
                ">${userRoleName}</span>
            </div>
            <button onclick="logout()" title="Logout" style="
                background: none;
                border: none;
                cursor: pointer;
                font-size: 1.2rem;
                padding: 0.3rem;
                border-radius: 8px;
                transition: background 0.2s;
                flex-shrink: 0;
            " onmouseover="this.style.background='#fee2e2'" onmouseout="this.style.background='none'">🚪</button>
        </div>
    `;

    sidebar.appendChild(profileSection);
}

// ─── Filter Sidebar Nav Based on Permissions ───────────────────────────────────
function filterSidebarNav() {
    // Map nav link hrefs to page keys
    const navLinkMap = {
        'dashboard.html':           'dashboard',
        'index.html':               'admissions',
        'students.html':            'students',
        'pending_withdrawn.html':   'pending_withdrawn',
        'create_challan.html':      'challans',
        'collect_fee.html':         'collect_fee',
        'fee_contacts.html':        'collect_fee',
        'classes.html':             'classes',
        'fee_heads.html':           'fee_heads',
        'access_control.html':      'access_control',
        'attendance.html':          'attendance',
        'monitoring.html':          'monitoring',
        'family.html':              'students',
        'collect_family_fee.html':  'collect_fee',
        'homework.html':            'students',
        'complaint_diary.html':     'students'
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

        // If user doesn't have view permission, hide the nav item
        if (!userPermissions[pageKey] || !userPermissions[pageKey].can_view) {
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
    // Inject CSS for accordions securely overriding existing
    const style = document.createElement('style');
    style.innerHTML = `
        .sidebar { overflow-y: auto; }
        .nav-group-title {
            cursor: pointer;
            display: flex;
            justify-content: space-between;
            align-items: center;
            user-select: none;
            transition: color 0.2s;
            padding-right: 0.5rem;
            position: relative;
        }
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
            const isCollapsed = group.classList.toggle('collapsed');
            if (isCollapsed) {
                list.style.maxHeight = '0px';
                list.style.opacity = '0';
            } else {
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
    if (params.get('denied') === '1') {
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
