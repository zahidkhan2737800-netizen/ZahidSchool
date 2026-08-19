// Supabase client and auth logic are already loaded via auth.js
// Wait for authReady flag to be sure auth completes before we render 

var NAV_CATEGORIES_LEGACY = [
  {
    id: 'students', label: 'Students', icon: 'fas fa-user-graduate',
    items: [
      { href: 'index.html', label: 'Admission Form', icon: 'fas fa-file-signature', key: 'admissions' },
      { href: 'students.html', label: 'Active Students', icon: 'fas fa-users', key: 'students' },
      { href: 'Dairy.html', label: 'Diary / Tasks', icon: 'fas fa-clipboard-list', key: 'students' },
      { href: 'family.html', label: 'Family Management', icon: 'fas fa-home', key: 'family' },
      { href: 'homework.html', label: 'Homework Publisher', icon: 'fas fa-book', key: 'homework' },
      { href: 'publisher_config.html', label: 'Publisher Config', icon: 'fas fa-cog', key: 'homework' },

      { href: 'pending_withdrawn.html', label: 'Pending / Withdrawn', icon: 'fas fa-user-alt-slash', key: 'pending_withdrawn' },
      { href: 'reports.html', label: 'Report Generator', icon: 'fas fa-print', key: 'reports' },
    ]
  },
  {
    id: 'quality', label: 'Quality', icon: 'fas fa-star',
    items: [
      { href: 'complaint_diary.html', label: 'Complaint Diary', icon: 'fas fa-envelope-open-text', key: 'complaints' },
      { href: 'student_complaints.html', label: 'Student Complaints', icon: 'fas fa-user-check', key: 'complaints' },
      { href: 'student_complaints_report.html', label: 'Complaints Report', icon: 'fas fa-chart-pie', key: 'complaints' },
      { href: 'monitoring.html', label: 'Monitoring', icon: 'fas fa-chart-line', key: 'monitoring' },
      { href: 'syllabus_progress.html', label: 'Progress', icon: 'fas fa-list-check', key: 'classes' },
      { href: 'general_certificates.html', label: 'Certificates', icon: 'fas fa-certificate', key: 'classes' }
    ]
  },
    {
        id: 'attendance_tools', label: 'Attendance', icon: 'fas fa-calendar-check',
        items: [
            { href: 'attendance.html', label: 'Attendance Hub', icon: 'fas fa-calendar-check', key: 'attendance' },
            { href: 'daily_attendance.html', label: 'Daily Attendance Report', icon: 'fas fa-clipboard-list', key: 'attendance' },
            { href: 'daily_class_absent.html', label: 'Daily Class Absent', icon: 'fas fa-receipt', key: 'attendance' },
            { href: 'attendance_register.html', label: 'Attendance Register', icon: 'fas fa-table', key: 'attendance' },
            { href: 'Absent_days.html', label: 'Absent Days', icon: 'fas fa-calendar-minus', key: 'attendance' },
            { href: 'absent_range_report.html', label: 'Absent Days Range', icon: 'fas fa-calendar-alt', key: 'attendance' },
            { href: 'Absent_Report Card.html', label: 'Absent Days Reports', icon: 'fas fa-id-card', key: 'attendance' },
            { href: 'Ceritficates.html', label: 'Ceritficates', icon: 'fas fa-award', key: 'attendance' }
        ]
    },
  {
    id: 'fee_contact', label: 'Fee Contact', icon: 'fas fa-address-book',
    items: [
      { href: 'family_contacts.html', label: 'Family Fee Contact', icon: 'fas fa-phone-volume', key: 'fee_contacts' },
      { href: 'family_fee_commitments.html', label: 'Commitments', icon: 'fas fa-handshake', key: 'fee_contacts' },
      { href: 'fee_contacts.html', label: 'Student Fee Contact', icon: 'fas fa-phone-alt', key: 'fee_contacts' },
      { href: 'All Fee Contact.html', label: 'All Fee Contact', icon: 'fas fa-users', key: 'fee_contacts' },
    ]
  },
  {
    id: 'fee_reports', label: 'Fee Reports', icon: 'fas fa-chart-bar',
    items: [
      { href: 'fee_paid_log.html', label: 'Fee Paid Log', icon: 'fas fa-list-check', key: 'collect_fee' },
      { href: 'monthly_fee_report.html', label: 'Monthly Fee', icon: 'fas fa-coins', key: 'collect_fee' },
      { href: 'fee_register.html', label: 'Fee Register', icon: 'fas fa-table', key: 'collect_fee' },
      { href: 'fee_type_report.html', label: 'Fee Type Report', icon: 'fas fa-file-invoice', key: 'collect_fee' },
      { href: 'head_wise_fee_report.html', label: 'Head Wise Collection', icon: 'fas fa-chart-bar', key: 'collect_fee' },
      { href: 'fee_unpaid_head_report.html', label: 'Fee Not Paid Head Wise', icon: 'fas fa-exclamation-circle', key: 'collect_fee' },
      { href: 'discount_report.html', label: 'Discount Report', icon: 'fas fa-tag', key: 'collect_fee' },
      { href: 'fee_default_report.html', label: 'Fee Default Report', icon: 'fas fa-user-slash', key: 'collect_fee' },
      { href: 'family_fee_report.html', label: 'Family Fee Balance Report', icon: 'fas fa-users-cog', key: 'collect_fee' },
      { href: 'student_fee_report.html', label: 'Student Fee Balance Report', icon: 'fas fa-user-graduate', key: 'collect_fee' },
      { href: 'student_fee_report.html?scope=all', label: 'All Students Fee Balance Report', icon: 'fas fa-users', key: 'collect_fee' },
    ]
  },
    {
        id: 'whatsapp', label: 'WhatsApp', icon: 'fab fa-whatsapp',
        items: [
            { href: 'wa_templates.html', label: 'WA Templates', icon: 'fab fa-whatsapp', key: 'fee_contacts' },
            { href: 'surveys.html', label: 'Surveys / Campaigns', icon: 'fas fa-poll-h', key: 'fee_contacts' },
        ]
    },
  {
    id: 'fees', label: 'Fee Management', icon: 'fas fa-money-bill-wave',
    items: [
      { href: 'create_challan.html', label: 'Create Challans', icon: 'fas fa-file-invoice-dollar', key: 'challans' },
      { href: 'collect_fee.html', label: 'Collect Student Fee', icon: 'fas fa-hand-holding-usd', key: 'collect_fee' },
      { href: 'collect_family_fee.html', label: 'Collect Family Fee', icon: 'fas fa-users-cog', key: 'collect_family_fee' },
      { href: 'bulk_print_family_bills.html', label: 'Bulk Print Family Bills', icon: 'fas fa-print', key: 'collect_family_fee' },
      { href: 'TeacherFee.html', label: 'Teacher Fee Follow-up', icon: 'fas fa-user-check', key: 'fee_contacts' },
      { href: 'fee_heads.html', label: 'Fee Config', icon: 'fas fa-cogs', key: 'fee_heads' },
      { href: 'fee_complaint_msg.html', label: 'Fee Complaint Msg', icon: 'fas fa-comment-dots', key: 'collect_fee' }
    ]
  },
  {
    id: 'finance', label: 'Finance', icon: 'fas fa-chart-line',
    items: [
      { href: 'revenue.html', label: 'Revenue Management', icon: 'fas fa-arrow-down', key: 'finance' },
      { href: 'expenses.html', label: 'Expense Management', icon: 'fas fa-arrow-up', key: 'finance' },
      { href: 'monthly_profit.html', label: 'Monthly Profit', icon: 'fas fa-chart-bar', key: 'finance' },
      { href: 'daily_fee.html', label: 'Daily Fee', icon: 'fas fa-calendar-day', key: 'finance' }
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
        id: 'examination', label: 'Examination', icon: 'fas fa-file-signature',
        items: [
            { href: 'examination.html', label: 'Examination', icon: 'fas fa-clipboard-check', key: 'examination' },
            { href: 'slip.html', label: 'Exam Slip', icon: 'fas fa-id-card', key: 'examination' },
            { href: 'report_cards.html', label: 'Report Card', icon: 'fas fa-id-card-alt', key: 'examination' },
            { href: 'tick_report.html', label: 'Topic Mastery Report', icon: 'fas fa-check-circle', key: 'examination' },
            { href: 'Mark_Sheet.html', label: 'Mark Sheet', icon: 'fas fa-file-excel', key: 'examination' },
            { href: 'RS.html', label: 'RS', icon: 'fas fa-file-alt', key: 'examination' }
        ]
    },
    {
        id: 'inventory', label: 'Inventory', icon: 'fas fa-boxes',
        items: [
            { href: 'books_dashboard.html', label: 'Books Dashboard', icon: 'fas fa-chart-pie', key: 'books_dashboard' },
            { href: 'books_inventory.html', label: 'Books Inventory', icon: 'fas fa-book-open', key: 'books_inventory' },
            { href: 'book_sales_report.html', label: 'Book Sales Report', icon: 'fas fa-file-invoice-dollar', key: 'book_sales_report' }
        ]
    },
  {
    id: 'admin', label: 'Administration', icon: 'fas fa-user-shield',
    items: [
      { href: 'classes.html', label: 'Manage Classes', icon: 'fas fa-chalkboard', key: 'classes' },
      { href: 'picture_report.html', label: 'Picture Report', icon: 'fas fa-camera', key: 'classes' },
      { href: 'promote_students.html', label: 'Promote Students', icon: 'fas fa-level-up-alt', key: 'classes' },
      { href: 'curriculum_and_session.html', label: 'Curriculum & Session', icon: 'fas fa-book', key: 'classes' },
      { href: 'class_subjects_assignment.html', label: 'Class Subjects', icon: 'fas fa-link', key: 'classes' },
      { href: 'thermal_print_settings.html', label: 'Thermal Print Settings', icon: 'fas fa-print', key: 'collect_fee' },
      { href: 'receipt_footer_settings.html', label: 'Receipt Footer', icon: 'fas fa-receipt', key: 'collect_fee' },
      { href: 'access_control.html', label: 'Access Control', icon: 'fas fa-lock', key: 'access_control' },
      { href: 'saas_master_console.html', label: 'SaaS Master Console', icon: 'fas fa-crown', key: 'access_control', superAdminOnly: true },
      { href: 'quick_actions.html', label: 'Dashboard Shortcuts', icon: 'fas fa-cog', key: 'access_control' },
      { href: 'alarm_system.html', label: 'Alarm Schedule', icon: 'fas fa-bell', key: 'access_control' }
    ]
  }
];

// auth.js owns the subscription catalogue; keep the legacy list only as a safe fallback.
var NAV_CATEGORIES = window.SCHOOL_ACCESS_SECTIONS || NAV_CATEGORIES_LEGACY;

var QUICK_ACCESS = [
  { href: 'index.html', label: 'New Admission', icon: 'fas fa-user-plus', key: 'admissions' },
  { href: 'create_challan.html', label: 'Generate Challans', icon: 'fas fa-receipt', key: 'challans' },
  { href: 'monitoring.html', label: 'Monitoring', icon: 'fas fa-chart-line', key: 'monitoring' },
  { href: 'collect_fee.html', label: 'Collect Fee', icon: 'fas fa-hand-holding-usd', key: 'collect_fee' },
    { href: 'pending_withdrawn.html', label: 'Pending / Withdrawn', icon: 'fas fa-user-alt-slash', key: 'pending_withdrawn' },
  { href: 'students.html', label: 'Search Student', icon: 'fas fa-search', key: 'students' }
];

window.onAppReady(() => {
    // Wait for auth.js to finish setting up window.currentUser and window.userPermissions
    const checkAuth = setInterval(() => {
        if (window.authReady && window.currentUser) {
            clearInterval(checkAuth);
            bootDashboard();
        }
    }, 100);
});

async function bootDashboard() {
    document.getElementById('welcomeMsg').textContent = 'Welcome, ' + (window.currentUser.email || 'Admin').split('@')[0] + '!';

    var days = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
    var months = ['January','February','March','April','May','June','July','August','September','October','November','December'];
    var now = karachiNow();
    document.getElementById('welcomeDate').textContent = days[now.dayOfWeek] + ', ' + months[now.month] + ' ' + now.day + ', ' + now.year;

    buildSidebar();
    loadDashboardDiaryTasks();
    loadStats();
    loadMonthlyFeeBalance();
    loadRecentAdmissions();
    loadCashFlowStats();
    loadStaffTodayStats();
    buildQuickLinks();
}

async function loadDashboardDiaryTasks() {
    const host = document.getElementById('dashboardDiaryNotes');
    if (!host) return;

    try {
        let q = window.supabaseClient
            .from('todos')
            .select('id, text, date, status, category, pinned, deleted, created_at')
            .eq('dashboard_pinned', true)
            .eq('deleted', false)
            .eq('status', 'Pending');
        if (window.currentSchoolId) q = q.eq('school_id', window.currentSchoolId);
        const { data, error } = await q;
        if (error) throw error;

        const rows = (data || [])
            .sort((a, b) => {
                const priorityDifference = Number(b.pinned === true) - Number(a.pinned === true);
                if (priorityDifference) return priorityDifference;
                return new Date(b.created_at || 0) - new Date(a.created_at || 0);
            });

        if (!rows.length) {
            host.innerHTML = '<div class="diary-note-empty">No pinned diary tasks yet. Use the 🗒 button in Dairy / Tasks.</div>';
            return;
        }

        host.innerHTML = rows.map((t, i) => {
            const txt = String(t.text || '').replace(/</g, '&lt;').replace(/>/g, '&gt;');
            const isPriority = t.pinned === true;
            return `<div class="diary-note${isPriority ? ' priority' : ''}">
                ${isPriority ? '<div class="diary-note-head"><span><i class="fas fa-circle-exclamation"></i> Priority</span></div>' : ''}
                <div class="diary-note-text">${txt}</div>
                <div class="diary-note-actions">
                  <button class="diary-note-btn" onclick="markDashboardDiaryDone('${t.id}')">Mark Done</button>
                </div>
            </div>`;
        }).join('');
    } catch (e) {
        console.error('Failed to load pinned diary tasks', e);
        host.innerHTML = '<div class="diary-note-empty">Could not load pinned diary tasks.</div>';
    }
}

async function markDashboardDiaryDone(todoId) {
    try {
        let uq = window.supabaseClient
            .from('todos')
            .update({ status: 'Done', completed_at: new Date().toISOString(), dashboard_pinned: false })
            .eq('id', todoId);
        if (window.currentSchoolId) uq = uq.eq('school_id', window.currentSchoolId);
        const { error } = await uq;
        if (error) throw error;

        await loadDashboardDiaryTasks();
    } catch (e) {
        console.error('Failed to mark dashboard diary task done', e);
        alert('Failed to mark task done: ' + (e.message || e));
    }
}

window.markDashboardDiaryDone = markDashboardDiaryDone;

// ─── Cash Flow Overview ────────────────────────────────────────────────────────
async function loadCashFlowStats() {
    try {
        const kn = karachiNow();
        const fmtDate = (y, m, d) => `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
        
        const firstDay = fmtDate(kn.year, kn.month + 1, 1);
        const lastDayObj = new Date(kn.year, kn.month + 1, 0); // use local Date just for days-in-month calc
        const lastDay  = fmtDate(kn.year, kn.month + 1, lastDayObj.getDate());
        const today = karachiToday();
        const tomorrowObj = new Date(kn.year, kn.month, kn.day + 1);
        const tomorrow = fmtDate(tomorrowObj.getFullYear(), tomorrowObj.getMonth() + 1, tomorrowObj.getDate());
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

        // 1B. Discount given this month (sum of discount_amount from transactions)
        let discMonthQ = window.supabaseClient
            .from('transactions')
            .select('discount_amount')
            .gt('discount_amount', 0)
            .gte('created_at', firstDay + 'T00:00:00')
            .lte('created_at', lastDay + 'T23:59:59');
        if (schoolId) discMonthQ = discMonthQ.eq('school_id', schoolId);
        const { data: discMonthData } = await discMonthQ;
        const totalDiscountMonth = (discMonthData || []).reduce((s, r) => s + Number(r.discount_amount || 0), 0);

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

        // 5. Monthly Fee Default: unpaid challan balances for students withdrawn this month
        //    Step A — get IDs of students withdrawn this month
        let withdrawnQ = window.supabaseClient
            .from('admissions')
            .select('id')
            .eq('status', 'Withdrawn')
            .gte('updated_at', firstDay + 'T00:00:00')
            .lte('updated_at', lastDay + 'T23:59:59');
        if (schoolId) withdrawnQ = withdrawnQ.eq('school_id', schoolId);
        const { data: withdrawnStudents } = await withdrawnQ;

        let feeDefaultAmount = 0;
        if (withdrawnStudents && withdrawnStudents.length > 0) {
            const withdrawnIds = withdrawnStudents.map(s => s.id);
            //    Step B — get all unpaid/partially-paid challans for those students
            let defaultQ = window.supabaseClient
                .from('challans')
                .select('amount, paid_amount')
                .in('student_id', withdrawnIds)
                .in('status', ['Unpaid', 'Partially Paid']);
            if (schoolId) defaultQ = defaultQ.eq('school_id', schoolId);
            const { data: defaultChallans } = await defaultQ;
            feeDefaultAmount = (defaultChallans || []).reduce((s, c) =>
                s + Math.max(0, (Number(c.amount) || 0) - (Number(c.paid_amount) || 0)), 0);
        }

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
        if (el('statDiscountMonth')) el('statDiscountMonth').textContent = fmt(totalDiscountMonth);
        if (el('statFeeDefault'))    el('statFeeDefault').textContent    = fmt(feeDefaultAmount);

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
        const today = karachiToday();
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
    var flyout = document.getElementById('sidebarFlyout');
    var visibleCategories = NAV_CATEGORIES.map(function (cat) {
        return {
            category: cat,
            items: cat.items.filter(function (item) {
                if (item.hiddenFromNavigation) return false;
                if (item.superAdminOnly && window.userRoleName !== 'super_admin') return false;
                return window.isSchoolPageAllowed(item.href) && window.canViewPage(item.href, item.key);
            })
        };
    }).filter(function (entry) { return entry.items.length > 0; });

    var html = '<div class="sidebar-nav-heading"><span>Navigation</span></div>';

    visibleCategories.forEach(function (entry) {
        var cat = entry.category;

        html += '<div class="nav-category" data-category="' + cat.id + '">'
            + '<button class="nav-cat-btn" data-cat="' + cat.id + '" aria-expanded="false" aria-controls="sidebarFlyout">'
            + '<i class="cat-icon ' + cat.icon + '"></i>'
            + '<span class="cat-label">' + cat.label + '</span>'
            + '<i class="cat-arrow fas fa-chevron-right"></i>'
            + '</button></div>';
    });

    nav.innerHTML = html;

    function closeFlyout() {
        flyout.classList.remove('open');
        flyout.setAttribute('aria-hidden', 'true');
        flyout.removeAttribute('data-category');
        flyout.innerHTML = '';
        nav.querySelectorAll('.nav-cat-btn').forEach(function (button) {
            button.classList.remove('open');
            button.setAttribute('aria-expanded', 'false');
        });
    }

    function openFlyout(entry, btn) {
        var cat = entry.category;
        if (flyout.classList.contains('open') && flyout.dataset.category === cat.id) {
            closeFlyout();
            return;
        }

        nav.querySelectorAll('.nav-cat-btn').forEach(function (button) {
            button.classList.remove('open');
            button.setAttribute('aria-expanded', 'false');
        });

        var links = entry.items.map(function (item) {
            var target = item.href === 'dashboard.html' ? '' : ' target="_blank"';
            return '<a href="' + item.href + '"' + target + ' rel="noopener noreferrer" class="flyout-item">'
                + '<i class="' + item.icon + '"></i><span>' + item.label + '</span></a>';
        }).join('');

        flyout.dataset.category = cat.id;
        flyout.innerHTML = '<div class="flyout-head">'
            + '<div class="flyout-title"><i class="' + cat.icon + '"></i><span>' + cat.label + '</span></div>'
            + '<button type="button" class="flyout-close" aria-label="Close menu"><i class="fas fa-times"></i></button>'
            + '</div><div class="flyout-items">' + links + '</div>';
        flyout.classList.add('open');
        flyout.setAttribute('aria-hidden', 'false');
        btn.classList.add('open');
        btn.setAttribute('aria-expanded', 'true');

        if (window.innerWidth > 900) {
            var rect = btn.getBoundingClientRect();
            var top = Math.max(12, Math.min(rect.top - 6, window.innerHeight - flyout.offsetHeight - 12));
            flyout.style.top = top + 'px';
        } else {
            flyout.style.top = '64px';
        }

        flyout.querySelector('.flyout-close').addEventListener('click', closeFlyout);
        flyout.querySelectorAll('.flyout-item').forEach(function (link) {
            link.addEventListener('click', closeFlyout);
        });
    }

    nav.querySelectorAll('.nav-cat-btn').forEach(function (btn) {
        btn.addEventListener('click', function () {
            var entry = visibleCategories.find(function (candidate) {
                return candidate.category.id === btn.dataset.cat;
            });
            if (entry) openFlyout(entry, btn);
        });
    });

    document.addEventListener('click', function (event) {
        if (!flyout.classList.contains('open')) return;
        if (!flyout.contains(event.target) && !nav.contains(event.target)) closeFlyout();
    });
    document.addEventListener('keydown', function (event) {
        if (event.key === 'Escape') closeFlyout();
    });
    window.addEventListener('resize', closeFlyout);
}

function buildQuickLinks() {
    const container = document.getElementById('quickActionsContainer');
    if (!container) return;

    let savedActions = [];
    try {
        const userId = window.currentUser ? window.currentUser.id : 'default';
        const saved = localStorage.getItem('quickActions_' + userId);
        if (saved) savedActions = JSON.parse(saved);
    } catch(e) {
        console.error('Failed to parse saved quick actions', e);
    }

    if (!savedActions || savedActions.length === 0) {
        // Default quick actions
        savedActions = [
            { href: 'index.html', label: 'New Admission', icon: 'fas fa-user-plus' },
            { href: 'collect_fee.html', label: 'Collect Fee', icon: 'fas fa-hand-holding-usd' },
            { href: 'Dairy.html', label: 'Diary / Tasks', icon: 'fas fa-clipboard-list' }
        ];
    }

    let html = '';
    const colorClasses = ['qa-blue', 'qa-purple', 'qa-green', 'qa-amber', 'qa-rose'];
    savedActions.forEach((action, index) => {
        const color = colorClasses[index % colorClasses.length];
        html += `<a href="${action.href}" class="quick-action-card ${color}" title="${action.label}" target="_blank" rel="noopener noreferrer">
                   <div class="qa-icon"><i class="${action.icon}"></i></div>
                   <div class="qa-label">${action.label}</div>
                 </a>`;
    });
    container.innerHTML = html;
}


async function loadStats() {
    try {
        const kn = karachiNow();
        const fmtDate = (y, m, d) => `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;

        const monthStart = `${fmtDate(kn.year, kn.month + 1, 1)}T00:00:00`;
        const monthEndObj = new Date(kn.year, kn.month + 1, 1);
        const monthEnd   = `${fmtDate(monthEndObj.getFullYear(), monthEndObj.getMonth() + 1, 1)}T00:00:00`;
        
        const todayStart = `${karachiToday()}T00:00:00`;
        const tomorrowObj = new Date(kn.year, kn.month, kn.day + 1);
        const todayEnd   = `${fmtDate(tomorrowObj.getFullYear(), tomorrowObj.getMonth() + 1, tomorrowObj.getDate())}T00:00:00`;
        const todayStr   = karachiToday();
        const sid        = window.currentSchoolId; // tenant isolation

        // Helper: add school_id filter only when available
        const sc = (q) => sid ? q.eq('school_id', sid) : q;

        // First, get active student IDs so we can filter attendance to active students only
        // This ensures dashboard counts match the attendance page (which only shows active students)
        const activeStudentsRes = await sc(window.supabaseClient.from('admissions')
            .select('id')
            .in('status', ['Active', 'active']));
        const activeStudentIds = new Set((activeStudentsRes.data || []).map(s => s.id));

        const [activeRes, withdrawnRes, feesRes, challansRes, unpaidChallansRes, dailyFeesRes, balanceRes, attendanceRes, admittedRes, dailyDiscountRes, commitmentsTodayRes] = await Promise.all([
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
                .select('student_id, amount, paid_amount')
                .in('status', ['Unpaid', 'Partially Paid'])),
            // Fetch student_id + status so we can filter to active students only
            sc(window.supabaseClient.from('attendance')
                .select('student_id, status')
                .eq('date', todayStr)),
            sc(window.supabaseClient.from('admissions')
                .select('*', { count: 'exact', head: true })
                .gte('admission_date', monthStart.slice(0,10))
                .lt('admission_date', monthEnd.slice(0,10))),
            // Discount given today (sum of discount_amount from transactions)
            sc(window.supabaseClient.from('transactions')
                .select('discount_amount')
                .gt('discount_amount', 0)
                .gte('created_at', todayStart).lt('created_at', todayEnd)),
            // Pending family promises due today
            sc(window.supabaseClient.from('family_fee_commitments')
                .select('*', { count: 'exact', head: true })
                .eq('due_date', todayStr)
                .eq('status', 'Pending'))
        ]);

        const activeCount    = activeRes.count || 0;
        const withdrawnCount = withdrawnRes.count || 0;
        const challansCount  = challansRes.count || 0;
        const unpaidCount    = unpaidChallansRes.count || 0;
        const totalFees      = (feesRes.data || []).reduce((s, r) => s + (Number(r.amount_paid) || 0), 0);
        const dailyFees      = (dailyFeesRes.data || []).reduce((s, r) => s + (Number(r.amount_paid) || 0), 0);
        // Outstanding fees on the dashboard apply only to currently active students.
        // Historical challans for withdrawn, pending, or passed-out students are excluded.
        const totalBalance   = (balanceRes.data || [])
            .filter(challan => activeStudentIds.has(challan.student_id))
            .reduce((sum, challan) => sum + Math.max(0,
                (Number(challan.amount) || 0) - (Number(challan.paid_amount) || 0)
            ), 0);
        const dailyDiscount  = (dailyDiscountRes.data || []).reduce((s, r) => s + (Number(r.discount_amount) || 0), 0);

        // Filter attendance to active students only, count Late as Present (consistent with attendance page)
        const attendanceData = (attendanceRes.data || []).filter(r => activeStudentIds.has(r.student_id));
        const presentCount   = attendanceData.filter(r => r.status === 'Present' || r.status === 'Late').length;
        const absentCount    = attendanceData.filter(r => r.status === 'Absent').length;
        const admittedCount  = admittedRes.count || 0;
        const commitmentsTodayCount = commitmentsTodayRes.error ? 0 : (commitmentsTodayRes.count || 0);

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
        const commitmentsTodayEl = document.getElementById('statCommitmentsToday');
        const commitmentsTodayCard = document.getElementById('commitmentsTodayCard');
        const commitmentsTodayLabel = document.getElementById('statCommitmentsLabel');
        if (commitmentsTodayEl) commitmentsTodayEl.textContent = commitmentsTodayRes.error ? '0' : commitmentsTodayCount.toLocaleString();
        if (commitmentsTodayCard) {
            commitmentsTodayCard.classList.remove('is-loading', 'is-clear', 'has-commitments');
            commitmentsTodayCard.classList.add(commitmentsTodayCount > 0 ? 'has-commitments' : 'is-clear');
        }
        if (commitmentsTodayLabel) {
            commitmentsTodayLabel.textContent = commitmentsTodayCount > 0 ? 'Commitments Today' : 'No Commitments Today';
        }
        // Discount today
        const discTodayEl = document.getElementById('statDiscountToday');
        if (discTodayEl) discTodayEl.textContent = dailyDiscount > 0 ? fmt(dailyDiscount) : 'Rs 0';

    } catch (e) {
        console.error('Failed to load dashboard stats', e);
    }
}

async function loadMonthlyFeeBalance() {
    const tbody = document.getElementById('monthlyFeeBody');
    try {
        const monthNames = ['January','February','March','April','May','June','July','August','September','October','November','December'];
        const kn = karachiNow();
        const months = [];
        for (let i = 5; i >= 0; i--) {
            const d = new Date(kn.year, kn.month - i, 1);
            months.push(`${monthNames[d.getMonth()]} ${d.getFullYear()}`);
        }

        // Fetch challans for each month separately to avoid Supabase's default
        // 1000-row limit which silently truncates results when total challans
        // across all 6 months exceed 1000.
        const schoolId = window.currentSchoolId;
        const grouped = {};
        months.forEach(m => grouped[m] = { count: 0, billed: 0, collected: 0 });

        let hasAnyData = false;

        await Promise.all(months.map(async (month) => {
            let q = window.supabaseClient
                .from('challans')
                .select('amount, paid_amount')
                .eq('fee_month', month);
            if (schoolId) q = q.eq('school_id', schoolId);

            // Paginate in chunks of 1000 to handle months with many challans
            let allRows = [];
            let from = 0;
            const pageSize = 1000;
            while (true) {
                const { data: page, error } = await q.range(from, from + pageSize - 1);
                if (error) throw error;
                if (!page || page.length === 0) break;
                allRows = allRows.concat(page);
                if (page.length < pageSize) break;
                from += pageSize;
            }

            if (allRows.length > 0) hasAnyData = true;
            grouped[month].count = allRows.length;
            allRows.forEach(c => {
                grouped[month].billed    += Number(c.amount) || 0;
                grouped[month].collected += Number(c.paid_amount) || 0;
            });
        }));

        if (!hasAnyData) {
            tbody.innerHTML = `<tr><td colspan="6" style="text-align:center; color:#94a3b8; padding:1.5rem;">No challan data for the last 6 months.</td></tr>`;
            return;
        }

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
    const confirmed = window.confirm('Are you sure you want to sign out?');
    if (!confirmed) return;

    const button = document.getElementById('logoutBtn');
    button.disabled = true;
    try {
        if (window.supabaseClient) await window.supabaseClient.auth.signOut();
        window.location.href = 'login.html';
    } catch (error) {
        console.error('Sign out failed:', error);
        alert('Could not sign out. Please try again.');
        button.disabled = false;
    }
});

async function loadRecentAdmissions() {
    const tbody = document.getElementById('recentAdmissionsBody');
    try {
        const schoolId = window.currentSchoolId;
        let q = window.supabaseClient
            .from('admissions')
            .select('roll_number, full_name, father_name, applying_for_class, admission_date')
            .eq('status', 'Active')
            .not('admission_date', 'is', null)
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
