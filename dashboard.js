// Supabase client and auth logic are already loaded via auth.js
// Wait for authReady flag to be sure auth completes before we render 

var NAV_CATEGORIES = [
  {
    id: 'students', label: 'Students', icon: 'fas fa-user-graduate',
    items: [
      { href: 'dashboard.html', label: 'Dashboard', icon: 'fas fa-chart-line', key: 'dashboard' },
      { href: 'index.html', label: 'Admission Form', icon: 'fas fa-file-signature', key: 'admissions' },
      { href: 'students.html', label: 'Active Students', icon: 'fas fa-users', key: 'students' },
      { href: 'family.html', label: 'Family Management', icon: 'fas fa-home', key: 'family' },
      { href: 'attendance.html', label: 'Attendance', icon: 'fas fa-calendar-check', key: 'attendance' },
      { href: 'monitoring.html', label: 'Monitoring', icon: 'fas fa-chart-pie', key: 'monitoring' },
      { href: 'homework.html', label: 'Homework Publisher', icon: 'fas fa-book', key: 'homework' },
      { href: 'complaint_diary.html', label: 'Complaint Diary', icon: 'fas fa-envelope-open-text', key: 'complaints' },
      { href: 'pending_withdrawn.html', label: 'Pending / Withdrawn', icon: 'fas fa-user-alt-slash', key: 'pending_withdrawn' },
      { href: 'reports.html', label: 'Report Generator', icon: 'fas fa-print', key: 'reports' },
    ]
  },
  {
    id: 'fee_tools', label: 'Fee Tools', icon: 'fas fa-bolt',
    items: [
      { href: 'fee_paid_log.html', label: 'Open Paid Fee Log', icon: 'fas fa-list-check', key: 'collect_fee' },
      { href: 'fee_register.html', label: 'Fee Register', icon: 'fas fa-table', key: 'collect_fee' },
      { href: 'family_contacts.html', label: 'Open Family Fee Contacts', icon: 'fas fa-phone-volume', key: 'fee_contacts' },
    ]
  },
  {
    id: 'fees', label: 'Fee Management', icon: 'fas fa-money-bill-wave',
    items: [
      { href: 'create_challan.html', label: 'Create Challans', icon: 'fas fa-file-invoice-dollar', key: 'challans' },
      { href: 'collect_fee.html', label: 'Collect Student Fee', icon: 'fas fa-hand-holding-usd', key: 'collect_fee' },
      { href: 'collect_family_fee.html', label: 'Collect Family Fee', icon: 'fas fa-users-cog', key: 'collect_family_fee' },
      { href: 'fee_contacts.html', label: 'Fee Contacts', icon: 'fas fa-phone-alt', key: 'fee_contacts' },
      { href: 'fee_heads.html', label: 'Fee Config', icon: 'fas fa-cogs', key: 'fee_heads' },
      { href: 'finance.html', label: 'Finance & Cash Flow', icon: 'fas fa-chart-pie', key: 'finance' }
    ]
  },
  {
    id: 'staff', label: 'Staff Management', icon: 'fas fa-chalkboard-teacher',
    items: [
      { href: 'staff_hiring.html', label: 'Staff Hiring', icon: 'fas fa-user-tie', key: 'staff_hiring' },
      { href: 'staff_attendance.html', label: 'Staff Attendance', icon: 'fas fa-user-clock', key: 'staff_attendance' },
      { href: 'staff_payroll.html', label: 'Salary Challans', icon: 'fas fa-file-invoice-dollar', key: 'staff_payroll' },
      { href: 'staff_payments.html', label: 'Pay Salaries', icon: 'fas fa-money-check-alt', key: 'staff_payments' }
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
    document.getElementById('userName').textContent = window.currentUser.email || 'Admin User';
    document.getElementById('userRole').textContent = (window.userRoleName || 'Staff').toUpperCase();
    document.getElementById('welcomeMsg').textContent = 'Welcome, ' + (window.currentUser.email || 'Admin').split('@')[0] + '!';

    var avatar = document.getElementById('userAvatar');
    avatar.textContent = (window.currentUser.email || 'A').substring(0, 1).toUpperCase();
    if (window.userRoleName === 'admin') avatar.style.background = '#2563eb';
    else if (window.userRoleName === 'teacher') avatar.style.background = '#16a34a';
    else avatar.style.background = '#d97706';
    avatar.style.color = 'white';

    var days = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
    var months = ['January','February','March','April','May','June','July','August','September','October','November','December'];
    var now = new Date();
    document.getElementById('welcomeDate').textContent = days[now.getDay()] + ', ' + months[now.getMonth()] + ' ' + now.getDate() + ', ' + now.getFullYear();

    buildSidebar();
    loadStats();
    loadMonthlyFeeBalance();
    loadRecentAdmissions();
    loadCashFlowStats();
    loadStaffTodayStats();
}

// ─── Cash Flow Overview ────────────────────────────────────────────────────────
async function loadCashFlowStats() {
    try {
        const now = new Date();
        const fmtDate = (d) => {
            const y = d.getFullYear();
            const m = String(d.getMonth() + 1).padStart(2, '0');
            const day = String(d.getDate()).padStart(2, '0');
            return `${y}-${m}-${day}`;
        };
        const firstDay = fmtDate(new Date(now.getFullYear(), now.getMonth(), 1));
        const lastDay  = fmtDate(new Date(now.getFullYear(), now.getMonth() + 1, 0));
        const today = fmtDate(now);
        const tomorrow = fmtDate(new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1));
        const schoolId = window.currentSchoolId;

        const fmt = n => 'Rs ' + Math.round(n || 0).toLocaleString();

        // 1. Student Fee Revenue this month (scoped to school)
        let feeQ = window.supabaseClient
            .from('transactions')
            .select('amount_paid')
            .gte('created_at', firstDay + 'T00:00:00')
            .lte('created_at', lastDay + 'T23:59:59');
        if (schoolId) feeQ = feeQ.eq('school_id', schoolId);
        const { data: feeData } = await feeQ;
        const feeRevenue = (feeData || []).reduce((s, r) => s + Number(r.amount_paid || 0), 0);

        // 1A. Student Fee Revenue today (scoped to school)
        let todayFeeQ = window.supabaseClient
            .from('transactions')
            .select('amount_paid')
            .gte('created_at', today + 'T00:00:00')
            .lt('created_at', tomorrow + 'T00:00:00');
        if (schoolId) todayFeeQ = todayFeeQ.eq('school_id', schoolId);
        const { data: todayFeeData } = await todayFeeQ;
        const todayFeeRevenue = (todayFeeData || []).reduce((s, r) => s + Number(r.amount_paid || 0), 0);

        // 2. Other Revenue this month (scoped to school)
        let revQ = window.supabaseClient
            .from('other_revenue')
            .select('amount')
            .gte('revenue_date', firstDay)
            .lte('revenue_date', lastDay);
        if (schoolId) revQ = revQ.eq('school_id', schoolId);
        const { data: revData } = await revQ;
        const otherRevenue = (revData || []).reduce((s, r) => s + Number(r.amount || 0), 0);

        // 2A. Other Revenue today (scoped to school)
        let todayRevQ = window.supabaseClient
            .from('other_revenue')
            .select('amount')
            .eq('revenue_date', today);
        if (schoolId) todayRevQ = todayRevQ.eq('school_id', schoolId);
        const { data: todayRevData } = await todayRevQ;
        const todayOtherRevenue = (todayRevData || []).reduce((s, r) => s + Number(r.amount || 0), 0);

        // 3. Expenses this month (scoped to school)
        let expQ = window.supabaseClient
            .from('expenses')
            .select('amount, category')
            .gte('expense_date', firstDay)
            .lte('expense_date', lastDay);
        if (schoolId) expQ = expQ.eq('school_id', schoolId);
        const { data: expData } = await expQ;
        const totalExpenses = (expData || []).reduce((s, r) => s + Number(r.amount || 0), 0);
        const salariesPaid = (expData || [])
            .filter(r => r.category === 'Salaries')
            .reduce((s, r) => s + Number(r.amount || 0), 0);

        // 3A. Expenses today (scoped to school)
        let todayExpQ = window.supabaseClient
            .from('expenses')
            .select('amount')
            .eq('expense_date', today);
        if (schoolId) todayExpQ = todayExpQ.eq('school_id', schoolId);
        const { data: todayExpData } = await todayExpQ;
        const todayExpenses = (todayExpData || []).reduce((s, r) => s + Number(r.amount || 0), 0);

        // 4. Unpaid salary challans (scoped to school)
        let unpaidQ = window.supabaseClient
            .from('staff_payroll')
            .select('id')
            .eq('status', 'Unpaid');
        if (schoolId) unpaidQ = unpaidQ.eq('school_id', schoolId);
        const { data: unpaidData } = await unpaidQ;

        const todayRevenue = todayFeeRevenue + todayOtherRevenue;
        const totalRevenue = feeRevenue + otherRevenue;
        const netProfit = totalRevenue - totalExpenses;

        // Write to UI
        const el = id => document.getElementById(id);
        if (el('statTodayRevenue')) el('statTodayRevenue').textContent = fmt(todayRevenue);
        if (el('statTodayExpenses')) el('statTodayExpenses').textContent = fmt(todayExpenses);
        if (el('statTotalRevenue')) el('statTotalRevenue').textContent = fmt(totalRevenue);
        if (el('statTotalExpenses')) el('statTotalExpenses').textContent = fmt(totalExpenses);
        if (el('statSalariesPaid')) el('statSalariesPaid').textContent = fmt(salariesPaid);
        if (el('statUnpaidSalaries')) el('statUnpaidSalaries').textContent = (unpaidData || []).length;

        const profitEl = el('statNetProfit');
        const profitIconEl = el('profitIcon');
        if (profitEl) {
            profitEl.textContent = fmt(Math.abs(netProfit));
            if (netProfit >= 0) {
                profitEl.style.color = '#16a34a';
                if (profitIconEl) { profitIconEl.style.background = 'rgba(22,163,74,0.1)'; profitIconEl.style.color = '#16a34a'; profitIconEl.innerHTML = '<i class="fas fa-arrow-trend-up"></i>'; }
                if (el('profitLabel')) el('profitLabel').textContent = '📈 Net Profit';
            } else {
                profitEl.style.color = '#dc2626';
                if (profitIconEl) { profitIconEl.style.background = 'rgba(220,38,38,0.1)'; profitIconEl.style.color = '#dc2626'; profitIconEl.innerHTML = '<i class="fas fa-arrow-trend-down"></i>'; }
                if (el('profitLabel')) el('profitLabel').textContent = '📉 Net Loss';
            }
        }

    } catch(e) {
        console.error('Cash flow stats error:', e);
    }
}

// ─── Staff Today Stats ─────────────────────────────────────────────────────────
async function loadStaffTodayStats() {
    try {
        const now = new Date();
        const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
        const schoolId = window.currentSchoolId;

        // Total active staff (scoped to school)
        let staffQ = window.supabaseClient.from('staff').select('id').eq('status', 'Active');
        if (schoolId) staffQ = staffQ.eq('school_id', schoolId);
        const { data: staffData } = await staffQ;
        const totalStaff = (staffData || []).length;

        // Today's staff attendance (scoped to school)
        let attQ = window.supabaseClient.from('staff_attendance').select('status').eq('date', today);
        if (schoolId) attQ = attQ.eq('school_id', schoolId);
        const { data: attData } = await attQ;

        const counts = { Present: 0, Absent: 0, Leave: 0 };
        (attData || []).forEach(r => { if (counts[r.status] !== undefined) counts[r.status]++; });

        const el = id => document.getElementById(id);
        if (el('statTotalStaff'))    el('statTotalStaff').textContent    = totalStaff;
        if (el('statStaffPresent'))  el('statStaffPresent').textContent  = counts.Present;
        if (el('statStaffAbsent'))   el('statStaffAbsent').textContent   = counts.Absent;
        if (el('statStaffLeave'))    el('statStaffLeave').textContent    = counts.Leave;

    } catch(e) {
        console.error('Staff stats error:', e);
    }
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

function buildQuickLinks() {}


async function loadStats() {
    try {
        const now = new Date();
        const fmtDate = (d) => {
            const y = d.getFullYear();
            const m = String(d.getMonth() + 1).padStart(2, '0');
            const day = String(d.getDate()).padStart(2, '0');
            return `${y}-${m}-${day}`;
        };

        const monthStartDate = new Date(now.getFullYear(), now.getMonth(), 1);
        const monthEndDate   = new Date(now.getFullYear(), now.getMonth() + 1, 1);
        const todayDate      = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        const tomorrowDate   = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);

        const monthStart = `${fmtDate(monthStartDate)}T00:00:00`;
        const monthEnd   = `${fmtDate(monthEndDate)}T00:00:00`;
        const todayStart = `${fmtDate(todayDate)}T00:00:00`;
        const todayEnd   = `${fmtDate(tomorrowDate)}T00:00:00`;
        const todayStr   = fmtDate(todayDate);
        const sid        = window.currentSchoolId; // tenant isolation

        // Helper: add school_id filter only when available
        const sc = (q) => sid ? q.eq('school_id', sid) : q;

        const [activeRes, withdrawnRes, feesRes, challansRes, unpaidChallansRes, dailyFeesRes, balanceRes, attendanceRes, admittedRes] = await Promise.all([
            sc(window.supabaseClient.from('admissions')
                .select('*', { count: 'exact', head: true }).eq('status', 'Active')),
            sc(window.supabaseClient.from('admissions')
                .select('*', { count: 'exact', head: true })
                .eq('status', 'Withdrawn')
                .gte('updated_at', monthStart).lt('updated_at', monthEnd)),
            sc(window.supabaseClient.from('transactions')
                .select('amount_paid')
                .gte('created_at', monthStart).lt('created_at', monthEnd)),
            sc(window.supabaseClient.from('challans')
                .select('*', { count: 'exact', head: true })
                .gte('created_at', monthStart).lt('created_at', monthEnd)),
            sc(window.supabaseClient.from('challans')
                .select('*', { count: 'exact', head: true })
                .eq('status', 'Unpaid')),
            sc(window.supabaseClient.from('transactions')
                .select('amount_paid')
                .gte('created_at', todayStart).lt('created_at', todayEnd)),
            sc(window.supabaseClient.from('challans')
                .select('amount, paid_amount')
                .in('status', ['Unpaid', 'Partially Paid'])),
            sc(window.supabaseClient.from('attendance')
                .select('status')
                .eq('date', todayStr)),
            sc(window.supabaseClient.from('admissions')
                .select('*', { count: 'exact', head: true })
                .gte('admission_date', fmtDate(monthStartDate))
                .lt('admission_date', fmtDate(monthEndDate)))
        ]);

        const activeCount    = activeRes.count || 0;
        const withdrawnCount = withdrawnRes.count || 0;
        const challansCount  = challansRes.count || 0;
        const unpaidCount    = unpaidChallansRes.count || 0;
        const totalFees      = (feesRes.data || []).reduce((s, r) => s + (Number(r.amount_paid) || 0), 0);
        const dailyFees      = (dailyFeesRes.data || []).reduce((s, r) => s + (Number(r.amount_paid) || 0), 0);
        const totalBalance   = (balanceRes.data || []).reduce((s, r) => s + ((Number(r.amount) || 0) - (Number(r.paid_amount) || 0)), 0);

        const attendanceData = attendanceRes.data || [];
        const presentCount   = attendanceData.filter(r => r.status === 'Present').length;
        const absentCount    = attendanceData.filter(r => r.status === 'Absent').length;
        const admittedCount  = admittedRes.count || 0;

        const fmt = (n) => 'Rs ' + Math.round(n).toLocaleString();

        document.getElementById('statActiveStudents').textContent = activeCount.toLocaleString();
        document.getElementById('statWithdrawn').textContent      = withdrawnCount.toLocaleString();
        document.getElementById('statFeesCollected').textContent  = fmt(totalFees);
        document.getElementById('statChallans').textContent       = challansCount.toLocaleString();
        document.getElementById('statUnpaidChallans').textContent = unpaidCount.toLocaleString();
        document.getElementById('statDailyFee').textContent       = fmt(dailyFees);
        document.getElementById('statTotalBalance').textContent   = fmt(totalBalance);
        document.getElementById('statPresent').textContent        = presentCount.toLocaleString();
        document.getElementById('statAbsent').textContent         = absentCount.toLocaleString();
        document.getElementById('statAdmittedMonth').textContent  = admittedCount.toLocaleString();

    } catch (e) {
        console.error('Failed to load dashboard stats', e);
    }
}

async function loadMonthlyFeeBalance() {
    const tbody = document.getElementById('monthlyFeeBody');
    try {
        const monthNames = ['January','February','March','April','May','June','July','August','September','October','November','December'];
        const now = new Date();
        const months = [];
        for (let i = 5; i >= 0; i--) {
            const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
            months.push(`${monthNames[d.getMonth()]} ${d.getFullYear()}`);
        }

        // Fetch challans scoped to this school
        const schoolId = window.currentSchoolId;
        let q = window.supabaseClient
            .from('challans')
            .select('fee_month, amount, paid_amount, status')
            .in('fee_month', months);
        if (schoolId) q = q.eq('school_id', schoolId);
        const { data, error } = await q;

        if (error) throw error;

        if (!data || data.length === 0) {
            tbody.innerHTML = `<tr><td colspan="6" style="text-align:center; color:#94a3b8; padding:1.5rem;">No challan data for the last 6 months.</td></tr>`;
            return;
        }

        // Group by fee_month
        const grouped = {};
        months.forEach(m => grouped[m] = { count: 0, billed: 0, collected: 0 });

        data.forEach(c => {
            if (!grouped[c.fee_month]) return;
            grouped[c.fee_month].count++;
            grouped[c.fee_month].billed    += Number(c.amount) || 0;
            grouped[c.fee_month].collected += Number(c.paid_amount) || 0;
        });

        const rows = months.map(month => {
            const g = grouped[month];
            const remaining = g.billed - g.collected;
            const pct = g.billed > 0 ? Math.round((g.collected / g.billed) * 100) : 0;

            let badge, remClass;
            if (g.billed === 0)     { badge = ''; remClass = ''; }
            else if (remaining <= 0){ badge = '<span class="month-badge cleared">Cleared</span>'; remClass = 'clear'; }
            else if (pct >= 50)     { badge = '<span class="month-badge partial">Partial</span>'; remClass = ''; }
            else                    { badge = '<span class="month-badge overdue">Overdue</span>'; remClass = ''; }

            const fmt = n => n > 0 ? 'Rs ' + Math.round(n).toLocaleString() : '—';

            return `<tr>
                <td><strong>${month}</strong></td>
                <td>${g.count || '—'}</td>
                <td>${fmt(g.billed)}</td>
                <td style="color:#16a34a; font-weight:600;">${fmt(g.collected)}</td>
                <td class="col-remaining ${remClass}">${remaining > 0 ? 'Rs ' + Math.round(remaining).toLocaleString() : '✓ 0'}</td>
                <td>${badge}</td>
            </tr>`;
        }).join('');

        tbody.innerHTML = rows;
    } catch(e) {
        tbody.innerHTML = `<tr><td colspan="6" style="color:red;">Error loading monthly data: ${e.message}</td></tr>`;
    }
}

// Global Event Listeners for UI
document.getElementById('logoutBtn').addEventListener('click', async function () {
    if (window.supabaseClient) await window.supabaseClient.auth.signOut();
    window.location.href = 'login.html';
});

async function loadRecentAdmissions() {
    const tbody = document.getElementById('recentAdmissionsBody');
    try {
        const schoolId = window.currentSchoolId;
        let q = window.supabaseClient
            .from('admissions')
            .select('roll_number, full_name, father_name, applying_for_class, admission_date')
            .eq('status', 'Active')
            .order('admission_date', { ascending: false })
            .limit(6);
        if (schoolId) q = q.eq('school_id', schoolId);
        const { data, error } = await q;

        if (error) throw error;

        if (!data || data.length === 0) {
            tbody.innerHTML = `<tr><td colspan="5" style="text-align:center; color:#94a3b8; padding:1.5rem;">No recent admissions found.</td></tr>`;
            return;
        }

        const monthNames = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
        tbody.innerHTML = data.map((s, i) => {
            const d = s.admission_date ? new Date(s.admission_date) : null;
            const dateStr = d ? `${d.getDate()} ${monthNames[d.getMonth()]} ${d.getFullYear()}` : '—';
            const rowBg = i === 0 ? 'background:#f0fdf4;' : '';
            return `<tr style="${rowBg}">
                <td><strong>${s.roll_number || '—'}</strong></td>
                <td>${s.full_name || '—'}</td>
                <td>${s.father_name || '—'}</td>
                <td>${s.applying_for_class || '—'}</td>
                <td>${dateStr}</td>
            </tr>`;
        }).join('');
    } catch(e) {
        tbody.innerHTML = `<tr><td colspan="5" style="color:red;">Error: ${e.message}</td></tr>`;
    }
}

document.getElementById('menuToggle').addEventListener('click', function () {
    document.getElementById('sidebar').classList.toggle('open');
    document.getElementById('overlayBg').classList.toggle('show');
});

document.getElementById('overlayBg').addEventListener('click', function () {
    document.getElementById('sidebar').classList.remove('open');
    document.getElementById('overlayBg').classList.remove('show');
});
