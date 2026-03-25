// Supabase client and auth logic are already loaded via auth.js
// Wait for authReady flag to be sure auth completes before we render 

var NAV_CATEGORIES = [
  {
    id: 'students', label: 'Students', icon: 'fas fa-user-graduate',
    items: [
      { href: 'dashboard.html', label: 'Dashboard', icon: 'fas fa-chart-line', key: 'dashboard' },
      { href: 'index.html', label: 'Admission Form', icon: 'fas fa-file-signature', key: 'admissions' },
      { href: 'students.html', label: 'Active Students', icon: 'fas fa-users', key: 'students' },
      { href: 'family.html', label: 'Family Management', icon: 'fas fa-home', key: 'students' },
      { href: 'attendance.html', label: 'Attendance', icon: 'fas fa-calendar-check', key: 'attendance' },
      { href: 'monitoring.html', label: 'Monitoring', icon: 'fas fa-chart-pie', key: 'monitoring' },
      { href: 'homework.html', label: 'Homework Publisher', icon: 'fas fa-book', key: 'students' },
      { href: 'complaint_diary.html', label: 'Complaint Diary', icon: 'fas fa-envelope-open-text', key: 'students' },
      { href: 'pending_withdrawn.html', label: 'Pending / Withdrawn', icon: 'fas fa-user-alt-slash', key: 'pending_withdrawn' },
    ]
  },
  {
    id: 'fees', label: 'Fee Management', icon: 'fas fa-money-bill-wave',
    items: [
      { href: 'create_challan.html', label: 'Create Challans', icon: 'fas fa-file-invoice-dollar', key: 'challans' },
      { href: 'collect_fee.html', label: 'Collect Student Fee', icon: 'fas fa-hand-holding-usd', key: 'collect_fee' },
      { href: 'collect_family_fee.html', label: 'Collect Family Fee', icon: 'fas fa-users-cog', key: 'collect_fee' },
      { href: 'fee_contacts.html', label: 'Fee Contacts', icon: 'fas fa-phone-alt', key: 'collect_fee' },
      { href: 'fee_heads.html', label: 'Fee Config', icon: 'fas fa-cogs', key: 'fee_heads' },
    ]
  },
  {
    id: 'admin', label: 'Administration', icon: 'fas fa-user-shield',
    items: [
      { href: 'classes.html', label: 'Manage Classes', icon: 'fas fa-chalkboard', key: 'classes' },
      { href: 'access_control.html', label: 'Access Control', icon: 'fas fa-lock', key: 'access_control' },
    ]
  }
];

var QUICK_ACCESS = [
  { href: 'index.html', label: 'New Admission', icon: 'fas fa-user-plus', key: 'admissions' },
  { href: 'create_challan.html', label: 'Generate Challans', icon: 'fas fa-receipt', key: 'challans' },
  { href: 'monitoring.html', label: 'Monitoring', icon: 'fas fa-chart-line', key: 'monitoring' },
  { href: 'collect_fee.html', label: 'Collect Fee', icon: 'fas fa-hand-holding-usd', key: 'collect_fee' },
  { href: 'students.html', label: 'Search Student', icon: 'fas fa-search', key: 'students' }
];

document.addEventListener('DOMContentLoaded', () => {
    // Wait for auth.js to finish setting up window.currentUser and window.userPermissions
    const checkAuth = setInterval(() => {
        if (window.authReady && window.currentUser) {
            clearInterval(checkAuth);
            bootDashboard();
        }
    }, 100);
});

async function bootDashboard() {
    // Top Right Details
    document.getElementById('userName').textContent = window.currentUser.email || 'Admin User';
    document.getElementById('userRole').textContent = (window.userRoleName || 'Staff').toUpperCase();
    document.getElementById('welcomeMsg').textContent = 'Welcome, ' + (window.currentUser.email || 'Admin').split('@')[0] + '!';

    var avatar = document.getElementById('userAvatar');
    avatar.textContent = (window.currentUser.email || 'A').substring(0, 1).toUpperCase();
    
    // Role styling adapter
    if (window.userRoleName === 'admin') avatar.style.background = '#2563eb';
    else if (window.userRoleName === 'teacher') avatar.style.background = '#16a34a';
    else avatar.style.background = '#d97706';
    avatar.style.color = 'white';

    // Welcome Date
    var days = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
    var months = ['January','February','March','April','May','June','July','August','September','October','November','December'];
    var now = new Date();
    document.getElementById('welcomeDate').textContent = days[now.getDay()] + ', ' + months[now.getMonth()] + ' ' + now.getDate() + ', ' + now.getFullYear();

    buildSidebar();
    buildQuickLinks();
    loadStats();
}

function buildSidebar() {
    var nav = document.getElementById('sidebarNav');
    var html = '';

    NAV_CATEGORIES.forEach(function (cat) {
        var visibleItems = cat.items.filter(function (item) {
            return window.canView(item.key);
        });
        if (visibleItems.length === 0) return; // Skip category if empty

        html += '<div class="nav-category">'
            + '<button class="nav-cat-btn" data-cat="' + cat.id + '">'
            + '<i class="cat-icon ' + cat.icon + '"></i> ' + cat.label
            + '<i class="cat-arrow fas fa-chevron-right"></i>'
            + '</button>'
            + '<div class="nav-items" id="cat-' + cat.id + '">';

        visibleItems.forEach(function (item) {
            let activeClass = item.href === 'dashboard.html' ? ' active' : ''; // Dashboard specific
            html += '<a href="' + item.href + '" class="nav-item' + activeClass + '"><i class="' + item.icon + '"></i> ' + item.label + '</a>';
        });

        html += '</div></div>';
    });

    nav.innerHTML = html;

    // Expand Students category automatically by default
    const studentsCatBtn = nav.querySelector('[data-cat="students"]');
    const studentsCatItems = nav.querySelector('#cat-students');
    if (studentsCatBtn && studentsCatItems) {
        studentsCatBtn.classList.add('open');
        studentsCatItems.classList.add('open');
    }

    nav.querySelectorAll('.nav-cat-btn').forEach(function (btn) {
        btn.addEventListener('click', function () {
            var catId = btn.dataset.cat;
            var items = document.getElementById('cat-' + catId);
            var isOpen = items.classList.contains('open');

            // Optionally auto-close others (accordion style)
            nav.querySelectorAll('.nav-items').forEach(function (el) { el.classList.remove('open'); });
            nav.querySelectorAll('.nav-cat-btn').forEach(function (el) { el.classList.remove('open'); });

            if (!isOpen) {
                items.classList.add('open');
                btn.classList.add('open');
            }
        });
    });
}

function buildQuickLinks() {
    var container = document.getElementById('quickLinks');
    var html = '';
    QUICK_ACCESS.forEach(function (item) {
        if (!window.canView(item.key)) return;
        html += '<a href="' + item.href + '" class="quick-link"><i class="' + item.icon + '"></i><span>' + item.label + '</span></a>';
    });
    container.innerHTML = html;
}

async function loadStats() {
    try {
        const now = new Date();
        const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
        const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 1).toISOString();

        // Run all 4 queries in parallel — server-side filtering
        const [activeRes, withdrawnRes, feesRes, challansRes] = await Promise.all([
            // 1. Count of active students only
            window.supabaseClient
                .from('admissions')
                .select('*', { count: 'exact', head: true })
                .eq('status', 'Active'),

            // 2. Count withdrawn THIS month
            window.supabaseClient
                .from('admissions')
                .select('*', { count: 'exact', head: true })
                .eq('status', 'Withdrawn')
                .gte('updated_at', monthStart)
                .lt('updated_at', monthEnd),

            // 3. Only this month's receipts (small dataset for summing)
            window.supabaseClient
                .from('receipts')
                .select('amount_paid')
                .gte('created_at', monthStart)
                .lt('created_at', monthEnd),

            // 4. Count challans this month
            window.supabaseClient
                .from('challans')
                .select('*', { count: 'exact', head: true })
                .gte('created_at', monthStart)
                .lt('created_at', monthEnd)
        ]);

        const activeCount = activeRes.count || 0;
        const withdrawnCount = withdrawnRes.count || 0;
        const challansCount = challansRes.count || 0;
        const totalFees = (feesRes.data || []).reduce((sum, r) => sum + (Number(r.amount_paid) || 0), 0);

        // Show values instantly
        document.getElementById('statActiveStudents').textContent = activeCount.toLocaleString();
        document.getElementById('statWithdrawn').textContent = withdrawnCount.toLocaleString();
        document.getElementById('statFeesCollected').textContent = 'Rs ' + totalFees.toLocaleString();
        document.getElementById('statChallans').textContent = challansCount.toLocaleString();

    } catch (e) {
        console.error("Failed to load dashboard stats", e);
    }
}

// Global Event Listeners for UI
document.getElementById('logoutBtn').addEventListener('click', async function () {
    if (window.supabaseClient) await window.supabaseClient.auth.signOut();
    window.location.href = 'login.html';
});

document.getElementById('menuToggle').addEventListener('click', function () {
    document.getElementById('sidebar').classList.toggle('open');
    document.getElementById('overlayBg').classList.toggle('show');
});

document.getElementById('overlayBg').addEventListener('click', function () {
    document.getElementById('sidebar').classList.remove('open');
    document.getElementById('overlayBg').classList.remove('show');
});
