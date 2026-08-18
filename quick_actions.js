// quick_actions.js

// Copied from dashboard.js to keep settings page independent
var NAV_CATEGORIES = [
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
      { href: 'access_control.html', label: 'Access Control', icon: 'fas fa-lock', key: 'access_control' }
    ]
  }
];

const MAX_SELECTION = 10;
let selectedActions = [];
let userId = 'default';

window.onAppReady(() => {
    // Wait for auth to be ready to get correct user ID for saving preferences
    const checkAuth = setInterval(() => {
        if (window.authReady && window.currentUser) {
            clearInterval(checkAuth);
            userId = window.currentUser.id;
            initQuickActions();
        }
    }, 100);
});

function initQuickActions() {
    // Load existing selection
    try {
        const saved = localStorage.getItem('quickActions_' + userId);
        if (saved) {
            selectedActions = JSON.parse(saved);
        } else {
            // Default setup
            selectedActions = [
                { href: 'index.html', label: 'New Admission', icon: 'fas fa-user-plus' },
                { href: 'collect_fee.html', label: 'Collect Fee', icon: 'fas fa-hand-holding-usd' },
                { href: 'Dairy.html', label: 'Diary / Tasks', icon: 'fas fa-clipboard-list' }
            ];
        }
    } catch(e) {
        console.error('Error loading saved actions:', e);
    }
    
    renderCategories();
}

function renderCategories() {
    const container = document.getElementById('qaContainer');
    let html = '';

    NAV_CATEGORIES.forEach(cat => {
        // Only show items user has permission to view
        const visibleItems = cat.items.filter(item => window.isSchoolPageAllowed(item.href) && window.canViewPage(item.href, item.key));
        if (visibleItems.length === 0) return;

        html += `<div class="qa-category">
            <div class="qa-category-title"><i class="${cat.icon}"></i> ${cat.label}</div>
            <div class="qa-grid">`;

        visibleItems.forEach(item => {
            const isSelected = selectedActions.some(a => a.href === item.href);
            html += `<div class="qa-item ${isSelected ? 'selected' : ''}" data-href="${item.href}" data-label="${item.label}" data-icon="${item.icon}" onclick="toggleSelection(this)">
                <div class="qa-item-icon"><i class="${item.icon}"></i></div>
                <div class="qa-item-label">${item.label}</div>
                <div class="qa-checkbox"></div>
            </div>`;
        });

        html += `</div></div>`;
    });

    container.innerHTML = html;
    updateSelectionCount();
}

function updateSelectionCount() {
    const counter = document.getElementById('qaSelectionCount');
    if (counter) counter.textContent = `${selectedActions.length} of ${MAX_SELECTION} selected`;
}

function toggleSelection(element) {
    const href = element.getAttribute('data-href');
    const label = element.getAttribute('data-label');
    const icon = element.getAttribute('data-icon');

    const index = selectedActions.findIndex(a => a.href === href);
    const limitMsg = document.getElementById('qaLimitMsg');

    if (index > -1) {
        // Deselect
        selectedActions.splice(index, 1);
        element.classList.remove('selected');
        limitMsg.style.display = 'none';
        updateSelectionCount();
    } else {
        // Select
        if (selectedActions.length >= MAX_SELECTION) {
            limitMsg.style.display = 'block';
            setTimeout(() => limitMsg.style.display = 'none', 3000);
            return;
        }
        selectedActions.push({ href, label, icon });
        element.classList.add('selected');
        updateSelectionCount();
    }
}

function saveQuickActions() {
    try {
        localStorage.setItem('quickActions_' + userId, JSON.stringify(selectedActions));
        // Provide visual feedback
        const btn = document.querySelector('.btn-save');
        const originalText = btn.innerHTML;
        btn.innerHTML = '<i class="fas fa-check"></i> Saved!';
        btn.style.background = '#16a34a';
        
        setTimeout(() => {
            window.location.href = 'dashboard.html';
        }, 500);
    } catch(e) {
        alert('Failed to save settings: ' + e.message);
    }
}
