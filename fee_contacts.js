// ═══════════════════════════════════════════════════════════════════════════════
// fee_contacts.js — High-Density Interactive Follow-up Grid
// ═══════════════════════════════════════════════════════════════════════════════

let currentMonth = '';
let allStudents = [];
let monthData = {}; // keyed by student.id
let classesList = [];
let studentBalances = {}; // Cache for live balance calculations
let recentAttendance = {}; // Cache for last 3 days attendance (student_id -> { date: status })
let recentDates = []; // Last 3 calendar dates (YYYY-MM-DD)
let allPendingChallans = [];
let waTemplates = [];
let currentOpenStudentId = null;
let currentCommitmentStudentId = null;
let studentCommitmentsMap = {}; // student_id -> pending shared commitments
let teacherFeeSelectedStudentIds = new Set(); // shared Supabase TeacherFee rows
let studentPaymentsMap = {}; // student_id -> receipt-level payments for selected month

function toLocalYmd(d) {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
}

function selectedStudentMonthUtcRange(monthKey) {
    const [year, month] = String(monthKey || '').split('-').map(Number);
    const karachiOffsetMs = 5 * 60 * 60 * 1000;
    return {
        start: new Date(Date.UTC(year, month - 1, 1) - karachiOffsetMs).toISOString(),
        end: new Date(Date.UTC(year, month, 1) - karachiOffsetMs).toISOString()
    };
}

async function loadStudentPaymentsForMonth() {
    const studentIds = allStudents.map(student => student.id).filter(Boolean);
    if (!studentIds.length) return {};
    const { start, end } = selectedStudentMonthUtcRange(currentMonth);
    const transactions = [];

    for (let index = 0; index < studentIds.length; index += 40) {
        let query = supabaseClient
            .from('transactions')
            .select('student_id, receipt_number, amount_paid, created_at')
            .in('student_id', studentIds.slice(index, index + 40))
            .gt('amount_paid', 0)
            .gte('created_at', start)
            .lt('created_at', end)
            .limit(2000);
        if (window.currentSchoolId) query = query.eq('school_id', window.currentSchoolId);
        const { data, error } = await query;
        if (error) throw error;
        if (data) transactions.push(...data);
    }

    const receiptGroups = new Map();
    transactions.forEach(transaction => {
        const studentId = String(transaction.student_id || '');
        if (!studentId) return;
        const rawReceipt = String(transaction.receipt_number || 'PAYMENT');
        const parts = rawReceipt.split('-');
        const receiptBase = /^(FAM|RCT)$/.test(parts[0]) && parts.length >= 2
            ? parts.slice(0, 2).join('-')
            : rawReceipt;
        const key = `${studentId}|${receiptBase}`;
        if (!receiptGroups.has(key)) {
            receiptGroups.set(key, { studentId, receipt: receiptBase, amount: 0, created_at: transaction.created_at });
        }
        const group = receiptGroups.get(key);
        group.amount += Number(transaction.amount_paid || 0);
        if (new Date(transaction.created_at) > new Date(group.created_at)) group.created_at = transaction.created_at;
    });

    const result = {};
    receiptGroups.forEach(payment => {
        if (!result[payment.studentId]) result[payment.studentId] = [];
        result[payment.studentId].push(payment);
    });
    Object.values(result).forEach(payments => payments.sort((a, b) => new Date(b.created_at) - new Date(a.created_at)));
    return result;
}

function generateStudentPaymentSummary(studentId) {
    const payments = studentPaymentsMap[String(studentId)] || [];
    if (!payments.length) return '';
    const visible = payments.slice(0, 3);
    const chips = visible.map(payment => {
        const date = new Date(payment.created_at).toLocaleDateString('en-GB', {
            day: '2-digit', month: '2-digit', timeZone: 'Asia/Karachi'
        }).replace('/', '-');
        return `<span class="student-payment-chip" title="${escapeStudentCommitmentHtml(payment.receipt)}"><i class="fas fa-coins"></i> Rs ${Number(payment.amount).toLocaleString()} (${date})</span>`;
    }).join('');
    const more = payments.length > visible.length
        ? `<span class="student-payment-more">+${payments.length - visible.length} more</span>`
        : '';
    return `<div class="student-payment-summary">${chips}${more}</div>`;
}

function normalizeAttendanceStatus(raw) {
    const s = String(raw || '').trim().toLowerCase();
    if (s === 'present') return 'Present';
    if (s === 'absent') return 'Absent';
    if (s === 'leave') return 'Leave';
    if (s === 'holiday') return 'Holiday';
    if (s === 'late') return 'Late';
    return '';
}

const STATUS_COLORS = {
    'C': 'status-C',
    'CN': 'status-CN',
    'W': 'status-W',
    'NO': 'status-NO',
    'NN': 'status-NN'
};

document.addEventListener('DOMContentLoaded', async () => {
    await waitForAuthContext();

    // 1. Initialize Month Picker
    const today = new Date();
    currentMonth = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}`;
    document.getElementById('monthPicker').value = currentMonth;

    // 2. Table Column Toggles
    document.getElementById('toggleC7').addEventListener('change', e => {
        document.getElementById('contactsTable').classList.toggle('show-c7', e.target.checked);
    });
    document.getElementById('toggleC8').addEventListener('change', e => {
        document.getElementById('contactsTable').classList.toggle('show-c8', e.target.checked);
    });

    // 3. Month Navigation
    document.getElementById('btnPrevMonth').addEventListener('click', () => changeMonth(-1));
    document.getElementById('btnNextMonth').addEventListener('click', () => changeMonth(1));
    document.getElementById('monthPicker').addEventListener('change', e => {
        currentMonth = e.target.value;
        loadData();
    });

    // 4. Filters
    document.getElementById('classFilter').addEventListener('change', renderTable);
    document.getElementById('statusFilter').addEventListener('change', renderTable);
    document.getElementById('rollFilter').addEventListener('input', renderTable);
    document.getElementById('commentsFilter').addEventListener('input', renderTable);
    document.getElementById('btnClearFilters').addEventListener('click', () => {
        document.getElementById('classFilter').value = '';
        document.getElementById('statusFilter').value = 'All';
        document.getElementById('rollFilter').value = '';
        document.getElementById('commentsFilter').value = '';
        renderTable();
    });

    setupStudentCommitmentModal();

    // Initial Load
    await loadBaseData();
    await loadData();

});

async function waitForAuthContext(timeoutMs = 10000) {
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
        if (window.authReady === true && window.supabaseClient) return;
        await new Promise(r => setTimeout(r, 80));
    }
}

function changeMonth(offset) {
    if (!currentMonth) return;
    const [year, month] = currentMonth.split('-').map(Number);
    let d = new Date(year, month - 1 + offset, 1);
    currentMonth = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    document.getElementById('monthPicker').value = currentMonth;
    loadData();
}

// ─── Fetch Base Data (Students & Classes) ────────────────────────────────────
function studentCommitmentToday(date = new Date()) {
    const parts = new Intl.DateTimeFormat('en-GB', {
        timeZone: 'Asia/Karachi', year: 'numeric', month: '2-digit', day: '2-digit'
    }).formatToParts(date);
    const values = Object.fromEntries(parts.map(part => [part.type, part.value]));
    return `${values.year}-${values.month}-${values.day}`;
}

function addStudentCommitmentDays(ymd, days) {
    const [year, month, day] = ymd.split('-').map(Number);
    const date = new Date(Date.UTC(year, month - 1, day));
    date.setUTCDate(date.getUTCDate() + days);
    return date.toISOString().slice(0, 10);
}

function formatStudentCommitmentDate(ymd) {
    return new Date(`${ymd}T00:00:00Z`).toLocaleDateString('en-GB', {
        weekday: 'long', day: '2-digit', month: 'short', year: 'numeric', timeZone: 'UTC'
    });
}

function setupStudentCommitmentModal() {
    const modal = document.getElementById('studentCommitmentModal');
    const input = document.getElementById('studentCommitmentDays');
    const cancel = document.getElementById('studentCommitmentCancel');
    const save = document.getElementById('studentCommitmentSave');
    if (!modal || !input || !cancel || !save) return;

    input.addEventListener('keydown', event => {
        if (['e', 'E', '+', '-', '.', ','].includes(event.key)) event.preventDefault();
        if (event.key === 'Enter') saveStudentCommitment();
        if (event.key === 'Escape') closeStudentCommitmentModal();
    });
    input.addEventListener('input', () => {
        input.value = input.value.replace(/\D/g, '');
        updateStudentCommitmentPreview();
    });
    input.addEventListener('wheel', event => {
        event.preventDefault();
        input.blur();
    }, { passive: false });
    cancel.addEventListener('click', closeStudentCommitmentModal);
    save.addEventListener('click', saveStudentCommitment);
    modal.addEventListener('click', event => {
        if (event.target === modal) closeStudentCommitmentModal();
    });
    document.addEventListener('keydown', event => {
        if (event.key === 'Escape' && modal.classList.contains('open')) closeStudentCommitmentModal();
    });
}

function openStudentCommitmentModal(studentId) {
    const student = allStudents.find(item => item.id === studentId);
    if (!student) {
        showStudentCommitmentToast('Student record was not found.', true);
        return;
    }
    currentCommitmentStudentId = studentId;
    const modal = document.getElementById('studentCommitmentModal');
    const input = document.getElementById('studentCommitmentDays');
    document.getElementById('studentCommitmentName').textContent = `${student.full_name} (Roll ${student.roll_number}) · ${student.father_name || 'Parent'}`;
    input.value = '';
    updateStudentCommitmentPreview();
    modal.classList.add('open');
    modal.setAttribute('aria-hidden', 'false');
    setTimeout(() => input.focus(), 30);
}

function closeStudentCommitmentModal() {
    const modal = document.getElementById('studentCommitmentModal');
    if (modal) {
        modal.classList.remove('open');
        modal.setAttribute('aria-hidden', 'true');
    }
    currentCommitmentStudentId = null;
}

function updateStudentCommitmentPreview() {
    const input = document.getElementById('studentCommitmentDays');
    const preview = document.getElementById('studentCommitmentPreview');
    if (!input || !preview || !/^\d+$/.test(input.value)) {
        if (preview) preview.textContent = 'Enter the number of days.';
        return;
    }
    const madeOn = studentCommitmentToday();
    const dueDate = addStudentCommitmentDays(madeOn, Number(input.value));
    preview.innerHTML = `Made on <strong>${formatStudentCommitmentDate(madeOn)}</strong><br>Payment due <strong>${formatStudentCommitmentDate(dueDate)}</strong>`;
}

async function saveStudentCommitment() {
    const input = document.getElementById('studentCommitmentDays');
    const saveButton = document.getElementById('studentCommitmentSave');
    const rawDays = input ? input.value.trim() : '';
    if (!/^\d+$/.test(rawDays)) {
        showStudentCommitmentToast('Enter a whole number: 0, 1, 2, 3...', true);
        if (input) input.focus();
        return;
    }

    const days = Number(rawDays);
    const student = allStudents.find(item => item.id === currentCommitmentStudentId);
    if (!student || !Number.isSafeInteger(days) || days < 0 || !window.currentSchoolId) {
        showStudentCommitmentToast('Student, school, or number of days is invalid.', true);
        return;
    }

    const madeOn = studentCommitmentToday();
    const dueDate = addStudentCommitmentDays(madeOn, days);
    const payload = {
        school_id: window.currentSchoolId,
        family_mobile: String(student.father_mobile || '').trim(),
        family_no: String(student.roll_number || ''),
        family_name: student.father_name || student.full_name,
        members: [{
            student_id: student.id,
            name: student.full_name,
            father_name: student.father_name || '',
            roll: student.roll_number,
            class_name: student.applying_for_class
        }],
        days_promised: days,
        month_key: currentMonth,
        commitment_made_on: madeOn,
        due_date: dueDate,
        created_by_user_id: window.currentUser?.id || null,
        created_by: window.currentUserFullName || window.currentUser?.email || 'Unknown User',
        status: 'Pending'
    };

    saveButton.disabled = true;
    saveButton.textContent = 'Saving...';
    try {
        const { error } = await supabaseClient.from('family_fee_commitments').insert(payload);
        if (error) throw error;
        closeStudentCommitmentModal();
        showStudentCommitmentToast(`Commitment saved for ${formatStudentCommitmentDate(dueDate)}.`);
        await loadData();
    } catch (error) {
        console.error('Could not save student commitment:', error);
        showStudentCommitmentToast(`Could not save commitment: ${error.message || 'Unknown error'}`, true);
    } finally {
        saveButton.disabled = false;
        saveButton.textContent = 'Save';
    }
}

function showStudentCommitmentToast(message, isError = false) {
    let toast = document.getElementById('studentCommitmentToast');
    if (!toast) {
        toast = document.createElement('div');
        toast.id = 'studentCommitmentToast';
        toast.style.cssText = 'position:fixed;top:18px;right:18px;z-index:5000;max-width:380px;padding:11px 14px;border-radius:10px;font-weight:700;box-shadow:0 8px 25px rgba(15,23,42,.16);';
        document.body.appendChild(toast);
    }
    toast.textContent = message;
    toast.style.background = isError ? '#fee2e2' : '#dcfce7';
    toast.style.color = isError ? '#991b1b' : '#166534';
    toast.style.border = `1px solid ${isError ? '#fecaca' : '#bbf7d0'}`;
    toast.style.display = 'block';
    clearTimeout(showStudentCommitmentToast.timer);
    showStudentCommitmentToast.timer = setTimeout(() => { toast.style.display = 'none'; }, 3200);
}

async function publishStudentPriorityTodo(studentId, button) {
    const student = allStudents.find(item => item.id === studentId);
    if (!student) {
        showStudentCommitmentToast('Student record was not found.', true);
        return;
    }

    const roll = student.roll_number || 'N/A';
    const father = student.father_name || 'N/A';
    const className = student.applying_for_class || 'N/A';
    const today = studentCommitmentToday();
    const payload = {
        text: `Student: ${student.full_name}(${roll}) | Father: ${father} | Class: ${className}`,
        date: today,
        date_ts: new Date(`${today}T00:00:00+05:00`).toISOString(),
        status: 'Pending',
        category: 'S',
        pinned: true,
        dashboard_pinned: true,
        deleted: false
    };
    if (window.currentSchoolId) payload.school_id = window.currentSchoolId;

    const oldText = button ? button.textContent : '';
    if (button) {
        button.disabled = true;
        button.textContent = '...';
    }

    try {
        const { error } = await window.supabaseClient.from('todos').insert(payload);
        if (error) throw error;
        if (button) button.textContent = 'Done';
        showStudentCommitmentToast(`Priority diary task published for ${student.full_name}.`);
        setTimeout(() => {
            if (!button || !button.isConnected) return;
            button.disabled = false;
            button.textContent = oldText || 'Now';
        }, 1800);
    } catch (error) {
        console.error('Could not publish student priority todo:', error);
        if (button) {
            button.disabled = false;
            button.textContent = oldText || 'Now';
        }
        showStudentCommitmentToast(`Could not publish priority task: ${error.message || 'Unknown error'}`, true);
    }
}

function isTeacherFeeStudentSelected(studentId) {
    return teacherFeeSelectedStudentIds.has(String(studentId));
}

async function addStudentToTeacherFee(studentId) {
    const id = String(studentId || '');
    const student = allStudents.find(item => String(item.id) === id);
    if (!student) {
        showStudentCommitmentToast('Student record was not found.', true);
        return false;
    }
    if (teacherFeeSelectedStudentIds.has(id)) {
        showStudentCommitmentToast(`${student.full_name} is already in TeacherFee.`);
        return true;
    }
    if (!window.currentSchoolId) {
        showStudentCommitmentToast('School could not be identified. Refresh and try again.', true);
        return false;
    }
    try {
        const { error } = await window.supabaseClient.from('teacher_fee_rows').upsert({
            school_id: window.currentSchoolId,
            student_id: student.id,
            source: 'Student',
            added_by: window.currentUser?.id || null,
            updated_by: window.currentUser?.id || null
        }, { onConflict: 'school_id,student_id', ignoreDuplicates: true });
        if (error) throw error;
        teacherFeeSelectedStudentIds.add(id);
        showStudentCommitmentToast(`${student.full_name} added to TeacherFee.`);
        return true;
    } catch (error) {
        const missingTable = error?.code === '42P01' || error?.code === 'PGRST205' || String(error?.message || '').includes('teacher_fee_rows');
        showStudentCommitmentToast(missingTable ? 'TeacherFee storage is not installed. Run teacher_fee_setup.sql in Supabase.' : `Could not add student to TeacherFee: ${error.message || 'Unknown error'}`, true);
        return false;
    }
}

async function loadBaseData() {
    try {
        // Fetch specific columns for speed.
        let schoolId = window.currentSchoolId;
        if ((schoolId === null || schoolId === undefined) && window.currentUser?.id) {
            const { data: roleData } = await supabaseClient
                .from('user_roles')
                .select('school_id')
                .eq('user_id', window.currentUser.id)
                .single();
            schoolId = roleData?.school_id ?? null;
            window.currentSchoolId = schoolId;
        }
        let studentsQ = supabaseClient
            .from('admissions')
            .select('id, roll_number, full_name, applying_for_class, father_name, father_mobile')
            .eq('status', 'Active')
            .order('roll_number', { ascending: true });
        if (schoolId) studentsQ = studentsQ.eq('school_id', schoolId);
        const { data: students, error: sErr } = await studentsQ;

        if (sErr) throw sErr;

        // Exclude students who belong to a family (father_mobile shared by 2+ active students).
        // Those students are managed in family_contacts, so they should not appear here.
        const mobileCount = {};
        (students || []).forEach(s => {
            const mob = (s.father_mobile || '').trim();
            if (mob) mobileCount[mob] = (mobileCount[mob] || 0) + 1;
        });
        const familyMobiles = new Set(
            Object.entries(mobileCount).filter(([, cnt]) => cnt >= 2).map(([mob]) => mob)
        );

        allStudents = (students || []).filter(s => {
            const mob = (s.father_mobile || '').trim();
            return !mob || !familyMobiles.has(mob);
        });

        // Fetch classes for dropdown
        const { data: classes, error: cErr } = await supabaseClient
            .from('classes')
            .select('id, class_name, section');
            
        if (!cErr && classes) {
            classesList = classes;
            const classSelect = document.getElementById('classFilter');
            classSelect.innerHTML = '<option value="">All Classes</option>';
            classes.forEach(c => {
                const opt = document.createElement('option');
                const str = `${c.class_name} ${c.section}`.trim();
                opt.value = str;
                opt.textContent = str;
                classSelect.appendChild(opt);
            });
        }

        // Fetch Real Unpaid Balances - batched by student IDs to avoid URI Too Long errors
        const allStudentIds = allStudents.map(s => s.id);
        allPendingChallans = [];
        studentBalances = {};
        if (allStudentIds.length > 0) {
            try {
                for (let i = 0; i < allStudentIds.length; i += 40) {
                    const batch = allStudentIds.slice(i, i + 40);
                    const { data: batchData, error: bErr } = await supabaseClient
                        .from('challans')
                        .select('*')
                        .in('student_id', batch)
                        .in('status', ['Unpaid', 'Partially Paid'])
                        .limit(2000);
                    if (!bErr && batchData) {
                        allPendingChallans.push(...batchData);
                    }
                }
            } catch (queryErr) {
                console.warn("Challan batch fetch warning:", queryErr);
            }
            allPendingChallans.forEach(c => {
                studentBalances[c.student_id] = (studentBalances[c.student_id] || 0) + Number(c.amount || 0) - Number(c.paid_amount || 0);
            });
        }
        
        await loadWaTemplates();

        // Fetch Last 3 Days Attendance - batched by student IDs
        const attToday = new Date();
        recentDates = [];
        for (let i = 2; i >= 0; i--) {
            const d = new Date(attToday);
            d.setDate(attToday.getDate() - i);
            recentDates.push(toLocalYmd(d));
        }

        recentAttendance = {};
        if (allStudentIds.length > 0) {
            try {
                for (let i = 0; i < allStudentIds.length; i += 40) {
                    const batch = allStudentIds.slice(i, i + 40);
                    const { data: attData, error: attErr } = await supabaseClient
                        .from('attendance')
                        .select('student_id, status, date')
                        .in('date', recentDates)
                        .in('student_id', batch);
                    if (attData && !attErr) {
                        attData.forEach(a => {
                            if (!recentAttendance[a.student_id]) recentAttendance[a.student_id] = {};
                            recentAttendance[a.student_id][a.date] = normalizeAttendanceStatus(a.status);
                        });
                    }
                }
            } catch (queryErr) {
                console.warn("Attendance batch fetch warning:", queryErr);
            }
        }

    } catch (err) {
        console.error("Error loading base data:", err);
    }
}

// ─── Fetch Month Data ────────────────────────────────────────────────────────
async function loadData() {
    document.getElementById('loader').style.display = 'block';
    const tbody = document.getElementById('contactsBody');
    tbody.innerHTML = '';
    
    // We attempt to fetch from the DB. If the table 'fee_contacts' doesn't exist yet, 
    // it will error, and we fallback to an empty in-memory state until SQL is run.
    try {
        const contactsRequest = supabaseClient
            .from('fee_contacts')
            .select('*')
            .eq('month_key', currentMonth);

        let commitmentsRequest = supabaseClient
            .from('family_fee_commitments')
            .select('id, members, days_promised, month_key, commitment_made_on, due_date, created_by, created_at')
            .eq('month_key', currentMonth)
            .eq('status', 'Pending')
            .order('due_date', { ascending: true })
            .order('created_at', { ascending: true });
        if (window.currentSchoolId) commitmentsRequest = commitmentsRequest.eq('school_id', window.currentSchoolId);

        let teacherFeeRowsRequest = supabaseClient
            .from('teacher_fee_rows')
            .select('student_id');
        if (window.currentSchoolId) teacherFeeRowsRequest = teacherFeeRowsRequest.eq('school_id', window.currentSchoolId);

        const [contactsResult, commitmentsResult, teacherFeeRowsResult, paymentsResult] = await Promise.all([
            contactsRequest,
            commitmentsRequest,
            teacherFeeRowsRequest,
            loadStudentPaymentsForMonth().catch(error => {
                console.warn('Could not load student payment summaries:', error);
                return {};
            })
        ]);
        const contacts = contactsResult.data;
        const error = contactsResult.error;

        // Map to lookup dictionary
        monthData = {};
        if (contacts && !error) {
            contacts.forEach(c => monthData[c.student_id] = c);
        }

        studentCommitmentsMap = {};
        if (!commitmentsResult.error) {
            (commitmentsResult.data || []).forEach(commitment => {
                const members = Array.isArray(commitment.members) ? commitment.members : [];
                if (members.length !== 1 || !members[0].student_id) return;
                const studentId = members[0].student_id;
                if (!studentCommitmentsMap[studentId]) studentCommitmentsMap[studentId] = [];
                studentCommitmentsMap[studentId].push(commitment);
            });
        } else {
            console.warn('Could not load student commitments:', commitmentsResult.error);
        }

        teacherFeeSelectedStudentIds = new Set((teacherFeeRowsResult.data || []).map(row => String(row.student_id)));
        if (teacherFeeRowsResult.error) console.warn('Could not load TeacherFee selections:', teacherFeeRowsResult.error);
        studentPaymentsMap = paymentsResult || {};
    } catch (err) {
        console.warn("fee_contacts table might not exist yet. Using empty state.", err);
        monthData = {};
        studentCommitmentsMap = {};
        teacherFeeSelectedStudentIds = new Set();
        studentPaymentsMap = {};
    }

    document.getElementById('loader').style.display = 'none';
    renderTable();
}

// ─── Render Table ────────────────────────────────────────────────────────────
function renderTable() {
    const tbody = document.getElementById('contactsBody');
    tbody.innerHTML = '';

    const classF = document.getElementById('classFilter').value;
    const statusF = document.getElementById('statusFilter').value;
    const rollF = document.getElementById('rollFilter').value.toLowerCase().trim();
    const commentsF = document.getElementById('commentsFilter').value.toLowerCase().trim();

    let totalBalance = 0;
    let pendingCount = 0;
    let solvedCount = 0;
    
    // Convert to rich objects with pinned state to allow sorting
    let rowsToRender = allStudents.map(student => {
        const data = monthData[student.id] || getEmptyContactState(student.id);
        return { student, data };
    });

    // 1. Filter
    rowsToRender = rowsToRender.filter(row => {
        if (classF && row.student.applying_for_class !== classF) return false;
        if (rollF) {
            const nameMatch = row.student.full_name.toLowerCase().includes(rollF);
            const rollMatch = String(row.student.roll_number).toLowerCase().includes(rollF);
            if (!nameMatch && !rollMatch) return false;
        }
        if (statusF !== 'All' && row.data.row_status !== statusF) return false;
        if (commentsF && !(row.data.commitment_notes || '').toLowerCase().includes(commentsF)) return false;
        return true;
    });

    // 2. Sort: pinned first (by balance desc), then unpinned (by roll number asc)
    rowsToRender.sort((a, b) => {
        const aPinned = !!(a.data.pinned);
        const bPinned = !!(b.data.pinned);

        if (aPinned && !bPinned) return -1;
        if (!aPinned && bPinned) return 1;

        // Both pinned: sort by balance descending
        if (aPinned && bPinned) {
            return (studentBalances[b.student.id] || 0) - (studentBalances[a.student.id] || 0);
        }

        // Both unpinned: keep original roll_number order
        return 0;
    });

    // 3. Render
    rowsToRender.forEach(({ student, data }) => {
        if (data.row_status === 'Solved') solvedCount++;
        else pendingCount++;

        const tr = document.createElement('tr');
        if (data.pinned) tr.classList.add('pinned');
        if (data.row_status === 'Solved') tr.classList.add('solved');

        // Fetch true balance from cached challans data
        const balance = studentBalances[student.id] || 0;
        totalBalance += balance;

        // Build last-3-days attendance pills (2-days-ago, yesterday, today)
        const studentAtt = recentAttendance[student.id] || {};
        const dayLabels = ['D3', 'D2', 'D1'];
        const pills = recentDates.map((dateStr, i) => {
            const st = studentAtt[dateStr];
            const lbl = dayLabels[i];
            if (!st) return `<div class="att-pill" style="background:#e2e8f0;color:#94a3b8;font-size:0.62rem;padding:1px 4px;" title="${dateStr}">-</div>`;
            if (st === 'Present') return `<div class="att-pill P" style="font-size:0.62rem;padding:1px 4px;" title="Present ${dateStr}">${lbl}</div>`;
            if (st === 'Absent') return `<div class="att-pill" style="background:#fee2e2;color:#b91c1c;font-weight:bold;font-size:0.62rem;padding:1px 4px;" title="Absent ${dateStr}">${lbl}</div>`;
            if (st === 'Leave') return `<div class="att-pill" style="background:#fef9c3;color:#a16207;font-weight:bold;font-size:0.62rem;padding:1px 4px;" title="Leave ${dateStr}">${lbl}</div>`;
            if (st === 'Holiday') return `<div class="att-pill H" title="Holiday ${dateStr}">H</div>`;
            return `<div class="att-pill" style="background:#e2e8f0;color:#94a3b8;font-size:0.62rem;padding:1px 4px;" title="${dateStr}">-</div>`;
        }).reverse().join('');
        const attHtml = `<div style="display:flex;flex-direction:column;gap:2px;align-items:center;">${pills}</div>`;
        const paymentSummaryHtml = generateStudentPaymentSummary(student.id);

        tr.innerHTML = `
            <td class="col-roll">${student.roll_number}</td>
                <td class="col-name">
                    <span style="font-size:0.95rem;font-weight:600;display:block;line-height:1.3;">${student.full_name}</span>
                    <small style="color:#475569;font-size:0.78rem;display:block;line-height:1.3;">Father: ${student.father_name || '—'}</small>
                    <small style="color:#64748b;font-size:0.78rem;display:block;line-height:1.3;">${student.father_mobile || ''}</small>
                    ${paymentSummaryHtml}
                </td>
            <td>${attHtml}</td>
            ${[1,2,3,4,5,6,7,8].map(idx => generateContactCell(student.id, idx, data)).join('')}
            <td class="col-balance ${balance === 0 ? 'zero' : ''}">${balance.toLocaleString()}</td>
            <td><button class="action-btn-cell" data-student="${student.id}" title="Send Voice Message" onclick="openAudioChat('${student.id}')">🎙️</button></td>
            <td><button class="action-btn-cell wa-btn" data-student="${student.id}" title="Send WhatsApp Bill" onclick="openWaModal('${student.id}')"><i class="fab fa-whatsapp" style="color:#25D366; font-size:1.3rem;"></i></button></td>
            <td><button class="action-btn-cell cd-btn ${data.complaint ? 'active' : ''}" data-id="${student.id}" title="Complaint">C</button></td>
            <td><button class="action-btn-cell co-btn" data-id="${student.id}" title="Save payment commitment">Co</button></td>
            <td><button class="action-btn-cell now-btn" data-id="${student.id}" title="Publish student as a red priority diary task">Now</button></td>
            <td><button class="action-btn-cell teacher-btn ${isTeacherFeeStudentSelected(student.id) ? 'active' : ''}" data-id="${student.id}" title="Add student to TeacherFee list">T</button></td>
            <td><button class="action-btn-cell pin-btn ${data.pinned ? 'active' : ''}" data-id="${student.id}" title="Pin to top">📌</button></td>
            <td><input type="text" class="commit-input" value="${data.commitment_notes || ''}" placeholder="Add notes..." data-id="${student.id}"></td>
            <td>
                <select class="row-status-select ${data.row_status}" data-id="${student.id}">
                    <option value="Pending" ${data.row_status === 'Pending' ? 'selected' : ''}>Pending</option>
                    <option value="Solved" ${data.row_status === 'Solved' ? 'selected' : ''}>Solved</option>
                </select>
            </td>
        `;

        // Attach Cell Events
        attachCellEvents(tr, student.id);
        tbody.appendChild(tr);
    });

    if (rowsToRender.length === 0) {
        tbody.innerHTML = '<tr><td colspan="21" style="padding: 3rem; color: #94a3b8;">No contact records match your filters.</td></tr>';
    }

    // Update Counter
    document.getElementById('totalBalanceBadge').textContent = `Rs. ${totalBalance.toLocaleString()}`;
    const totalEl = document.getElementById('cardTotalStudents');
    const pendingEl = document.getElementById('cardPendingStudents');
    const solvedEl = document.getElementById('cardSolvedStudents');
    const commitmentsEl = document.getElementById('cardStudentCommitments');
    if (totalEl) totalEl.textContent = allStudents.length.toLocaleString();
    if (pendingEl) pendingEl.textContent = pendingCount.toLocaleString();
    if (solvedEl) solvedEl.textContent = solvedCount.toLocaleString();
    if (commitmentsEl) commitmentsEl.textContent = Object.values(studentCommitmentsMap).reduce((sum, rows) => sum + rows.length, 0).toLocaleString();
}

// ─── Generators & Helpers ────────────────────────────────────────────────────
function getEmptyContactState(studentId) {
    return { student_id: studentId, month_key: currentMonth, pinned: false, complaint: false, row_status: 'Pending' };
}

function generateContactCell(studentId, idx, data) {
    const status = data[`c${idx}_status`] || '';
    const dateLine = data[`c${idx}_date`] ? new Date(data[`c${idx}_date`]).toLocaleDateString('en-GB', {day:'numeric', month:'short'}) : '';
    const hasCommitment = (studentCommitmentsMap[studentId] || []).length > 0;
    const commitmentStrip = idx === 1 ? generateStudentCommitmentStrip(studentId) : '';
    
    return `
        <td class="${idx >= 7 ? `col-c${idx}` : ''} ${idx === 1 ? 'student-commitment-anchor' : ''} ${hasCommitment && idx <= 6 ? 'student-commitment-space' : ''}">
            <div class="contact-cell">
                <select class="c-select" data-id="${studentId}" data-idx="${idx}">
                    <option value=""></option>
                    <option value="C" ${status === 'C' ? 'selected' : ''}>C</option>
                    <option value="CN" ${status === 'CN' ? 'selected' : ''}>CN</option>
                    <option value="W" ${status === 'W' ? 'selected' : ''}>W</option>
                    <option value="NO" ${status === 'NO' ? 'selected' : ''}>NO</option>
                    <option value="NN" ${status === 'NN' ? 'selected' : ''}>NN</option>
                </select>
                <button class="c-btn ${STATUS_COLORS[status] || ''}" title="Status Indicator"></button>
                <span class="c-date ${!dateLine ? 'hidden' : ''}">${dateLine || '---'}</span>
            </div>
            ${commitmentStrip}
        </td>
    `;
}

function generateStudentCommitmentStrip(studentId) {
    const commitments = studentCommitmentsMap[studentId] || [];
    if (!commitments.length) return '';
    const today = studentCommitmentToday();
    const commitmentsByDate = groupStudentCommitmentsByDueDate(commitments);
    const visible = commitmentsByDate.slice(0, 5);
    const chips = visible.map(dateGroup => {
        const commitment = dateGroup.entries[0];
        const daysRemaining = studentCommitmentDayDifference(today, commitment.due_date);
        const state = daysRemaining < 0 ? 'expired' : (daysRemaining === 0 ? 'today' : 'future');
        const label = daysRemaining < 0 ? `E${Math.abs(daysRemaining)}` : (daysRemaining === 0 ? 'T' : String(daysRemaining));
        const timing = daysRemaining < 0
            ? `Expired ${Math.abs(daysRemaining)} day${Math.abs(daysRemaining) === 1 ? '' : 's'} ago`
            : (daysRemaining === 0 ? 'Due today' : `Due in ${daysRemaining} day${daysRemaining === 1 ? '' : 's'}`);
        const entryText = dateGroup.entries.length === 1 ? '1 commitment' : `${dateGroup.entries.length} commitments`;
        const title = `${timing} | Due ${formatStudentCommitmentDate(commitment.due_date)} | ${entryText} — click to view all entries`;
        return `<a class="student-commitment-chip ${state}" href="family_fee_commitments.html?date=${encodeURIComponent(commitment.due_date)}" target="_blank" title="${escapeStudentCommitmentHtml(title)}">${label}${dateGroup.entries.length > 1 ? `<sup>${dateGroup.entries.length}</sup>` : ''}</a>`;
    }).join('');
    const extra = commitmentsByDate.length > visible.length
        ? `<a class="student-commitment-chip more" href="family_fee_commitments.html?date=${encodeURIComponent(commitmentsByDate[visible.length].dueDate)}" target="_blank" title="${commitmentsByDate.length - visible.length} more commitment dates">+${commitmentsByDate.length - visible.length}</a>`
        : '';
    return `<div class="student-commitment-strip" title="Pending fee commitments">
        <span class="student-commitment-label"><i class="fas fa-handshake"></i> Commit</span>
        <span class="student-commitment-chips">${chips}${extra}</span>
    </div>`;
}

function groupStudentCommitmentsByDueDate(commitments) {
    const groups = new Map();
    commitments.forEach(commitment => {
        const dueDate = commitment.due_date || '';
        if (!groups.has(dueDate)) groups.set(dueDate, []);
        groups.get(dueDate).push(commitment);
    });
    return [...groups.entries()].map(([dueDate, entries]) => ({ dueDate, entries }));
}

function studentCommitmentDayDifference(fromYmd, toYmd) {
    const [fromYear, fromMonth, fromDay] = String(fromYmd).split('-').map(Number);
    const [toYear, toMonth, toDay] = String(toYmd).split('-').map(Number);
    return Math.round((Date.UTC(toYear, toMonth - 1, toDay) - Date.UTC(fromYear, fromMonth - 1, fromDay)) / 86400000);
}

function escapeStudentCommitmentHtml(value) {
    return String(value ?? '').replace(/[&<>'"]/g, char => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;'
    }[char]));
}

function attachCellEvents(tr, studentId) {
    // Status Selects
    tr.querySelectorAll('.c-select').forEach(sel => {
        sel.addEventListener('change', async (e) => {
            const val = e.target.value;
            const idx = e.target.dataset.idx;
            const btn = e.target.nextElementSibling;
            const dateSpan = btn.nextElementSibling;
            
            // Visual shift
            btn.className = `c-btn ${STATUS_COLORS[val] || ''}`;
            const now = new Date();
            dateSpan.textContent = val ? now.toLocaleDateString('en-GB', {day:'numeric', month:'short'}) : '---';
            dateSpan.classList.toggle('hidden', !val);

            // DB Update Map
            const updateField = {};
            updateField[`c${idx}_status`] = val;
            updateField[`c${idx}_date`] = val ? now.toISOString() : null;

            await saveContactState(studentId, updateField);
        });
    });

    // Complaint Button
    const cdBtn = tr.querySelector('.cd-btn');
    if (cdBtn) {
        cdBtn.addEventListener('click', async () => {
            const isActive = cdBtn.classList.toggle('active');
            await saveContactState(studentId, { complaint: isActive });

            // Auto-log to Complaint Diary if turned ON
            if (isActive) {
                try {
                    // Fetch configured fee complaint message
                    let complaintText = "Student has pending fee dues. Please contact parents."; // Fallback
                    const { data: tData } = await supabaseClient
                        .from('wa_templates')
                        .select('message_text')
                        .eq('title', 'FEE_COMPLAINT_AUTO_MSG')
                        .limit(1)
                        .single();
                    if (tData && tData.message_text) {
                        complaintText = tData.message_text;
                    }

                    const s = allStudents.find(x => x.id === studentId);
                    if (!s) return;

                    // Build complaint payload
                    const obj = {
                        name: s.full_name,
                        roll: s.roll_number,
                        class_name: s.applying_for_class,
                        date: toLocalYmd(new Date()),
                        category: 'Fee',
                        status: 'Pending',
                        contact_status: 'Whatsapp',
                        complaint: complaintText,
                        updated_at: new Date().toISOString()
                    };
                    
                    if (window.currentSchoolId) obj.school_id = window.currentSchoolId;
                    if (window.campusFeatureReady && window.currentCampusId) obj.campus_id = window.currentCampusId;

                    // Check for duplicate on the same day to avoid spam
                    const { data: existing } = await supabaseClient
                        .from('complaints')
                        .select('id')
                        .eq('roll', s.roll_number)
                        .eq('date', obj.date)
                        .eq('category', 'Fee')
                        .limit(1);

                    if (!existing || existing.length === 0) {
                        const { error: insErr } = await supabaseClient.from('complaints').insert(obj);
                        if (insErr) console.error("Error logging auto complaint:", insErr);
                        else console.log("Auto-logged fee complaint for roll:", s.roll_number);
                    } else {
                        console.log("Complaint already exists today for this roll.");
                    }
                } catch (err) {
                    console.error("Failed to auto-log complaint:", err);
                }
            }
        });
    }

    // Dated fee commitment button
    const commitmentButton = tr.querySelector('.co-btn');
    if (commitmentButton) {
        commitmentButton.addEventListener('click', () => openStudentCommitmentModal(studentId));
    }

    // Publish a red priority Diary/Dashboard task for this student.
    const nowButton = tr.querySelector('.now-btn');
    if (nowButton) {
        nowButton.addEventListener('click', () => publishStudentPriorityTodo(studentId, nowButton));
    }

    // Add this individual student to the shared printable TeacherFee list.
    const teacherButton = tr.querySelector('.teacher-btn');
    if (teacherButton) {
        teacherButton.addEventListener('click', async () => {
            teacherButton.disabled = true;
            const saved = await addStudentToTeacherFee(studentId);
            teacherButton.disabled = false;
            if (saved) teacherButton.classList.add('active');
        });
    }

    // Pin Button
    const pinBtn = tr.querySelector('.pin-btn');
    if (pinBtn) {
        pinBtn.addEventListener('click', async () => {
            const isActive = pinBtn.classList.toggle('active');
            await saveContactState(studentId, { pinned: isActive });
            renderTable(); // Re-sort immediately
        });
    }

    // Commit Input
    const commitIn = tr.querySelector('.commit-input');
    if (commitIn) {
        commitIn.addEventListener('blur', async (e) => {
            await saveContactState(studentId, { commitment_notes: e.target.value });
        });
    }

    // Row Status
    const rowStatusSel = tr.querySelector('.row-status-select');
    if (rowStatusSel) {
        rowStatusSel.addEventListener('change', async (e) => {
            const val = e.target.value;
            rowStatusSel.className = `row-status-select ${val}`;
            await saveContactState(studentId, { row_status: val });
            renderTable(); // Might filter it out!
        });
    }
}

async function loadWaTemplates() {
    try {
        const { data, error } = await supabaseClient.from('wa_templates').select('*').order('created_at', { ascending: true });
        if (!error && data) {
            waTemplates = data;
            const dropdown = document.getElementById('waTemplateDropdown');
            if(dropdown) {
                dropdown.innerHTML = '';
                const lastUsed = localStorage.getItem('lastWaTemplate');
                let selectedId = null;
                
                if (lastUsed && waTemplates.find(t => t.id === lastUsed)) {
                    selectedId = lastUsed;
                } else if (waTemplates.find(t => t.is_default)) {
                    selectedId = waTemplates.find(t => t.is_default).id;
                } else if (waTemplates.length > 0) {
                    selectedId = waTemplates[0].id;
                }

                waTemplates.forEach(t => {
                    const opt = document.createElement('option');
                    opt.value = t.id;
                    opt.textContent = t.title;
                    if(t.id === selectedId) opt.selected = true;
                    dropdown.appendChild(opt);
                });
            }
        }
    } catch(e) { console.error("Error loading WA templates", e); }
}

window.openAudioChat = function(studentId) {
    const s = allStudents.find(x => x.id === studentId);
    if(!s || !s.father_mobile) return alert("No valid mobile number for this student.");
    let phone = String(s.father_mobile).replace(/[^0-9]/g, '');
    if (phone.startsWith('0') && phone.length === 11) phone = '92' + phone.substring(1);
    window.open(`https://wa.me/${phone}`, '_blank');
};

window.openWaModal = function(studentId) {
    currentOpenStudentId = studentId;
    applySelectedWaTemplate();
    document.getElementById('waModal').style.display = 'flex';
};

window.applySelectedWaTemplate = function() {
    if(!currentOpenStudentId) return;
    const s = allStudents.find(x => x.id === currentOpenStudentId);
    if (!s) return;

    let templateText = "";
    const dropdown = document.getElementById('waTemplateDropdown');
    
    if (dropdown && dropdown.value) {
        const t = waTemplates.find(x => x.id === dropdown.value);
        if(t) {
            templateText = t.message_text;
            localStorage.setItem('lastWaTemplate', t.id);
        }
    }

    if (!templateText) {
        templateText = "Zahid School System\nDear {{FATHER_NAME}},\n\n{{BILL_DETAILS}}\nTotal: Rs {{GRAND_TOTAL}}";
    }

    const todayDate = new Date().toLocaleDateString('en-GB', {day: 'numeric', month: 'short', year: 'numeric'});
    let stuTotal = 0;
    
    // Detailed bill block for ONE student
    let billDetailsLines = [];
    const stuChallans = allPendingChallans.filter(c => c.student_id === s.id);
    let stuLines = [];

    stuChallans.forEach(c => {
        const rem = parseFloat(c.amount || 0) - parseFloat(c.paid_amount || 0);
        if(rem > 0) {
            let desc = "";
            if(c.fee_month && c.fee_month !== 'N/A') {
                const cleanMonth = c.fee_month.replace(/\s*\d{4}\s*/g, '').trim();
                if(cleanMonth) desc += `${cleanMonth} `;
            }
            desc += c.fee_type;
            
            let spaces = 28 - desc.length;
            if(spaces < 3) spaces = 3;
            desc += ' '.repeat(spaces) + rem.toLocaleString();
            
            stuLines.push(desc);
            stuTotal += rem;
        }
    });

    if (stuLines.length > 0) {
        billDetailsLines.push(`*${s.full_name.trim()}*`);
        billDetailsLines.push('```\n' + stuLines.join('\n') + '\n```');
    }
    
    let parsed = templateText.replace(/{{TODAY_DATE}}/g, todayDate)
                             .replace(/{{FATHER_NAME}}/g, s.father_name || 'Father')
                             .replace(/{{GRAND_TOTAL}}/g, stuTotal.toLocaleString());
    
    if(stuTotal === 0) {
        parsed = "All dues are clear! Thank you for your continued support.";
    } else {
        parsed = parsed.replace(/{{BILL_DETAILS}}/g, billDetailsLines.join('\n').trim());
    }

    document.getElementById('waMessageText').value = parsed;
    
    const btnSend = document.getElementById('btnSendWa');
    btnSend.onclick = function() {
        const text = document.getElementById('waMessageText').value;
        if(!s.father_mobile) {
            alert("This student has no mobile number registered.");
            closeWaModal();
            return;
        }
        let phone = String(s.father_mobile).replace(/[^0-9]/g, '');
        if (phone.startsWith('0') && phone.length === 11) {
            phone = '92' + phone.substring(1);
        }
        window.open(`https://wa.me/${phone}?text=${encodeURIComponent(text)}`, '_blank');
        closeWaModal();
    };
};

window.closeWaModal = function() {
    document.getElementById('waModal').style.display = 'none';
};

// ─── Database Sync ───────────────────────────────────────────────────────────
async function saveContactState(studentId, fieldsToUpdate) {
    // 1. Locally update state for fast UI
    if (!monthData[studentId]) monthData[studentId] = getEmptyContactState(studentId);
    Object.assign(monthData[studentId], fieldsToUpdate);

    // 2. Perform DB Upsert
    const payload = Object.assign({}, monthData[studentId]);

    try {
        const { error } = await supabaseClient
            .from('fee_contacts')
            .upsert(payload, { onConflict: 'student_id, month_key' });
        
        if (error) {
            console.error("Upsert failed:", error);
            // It's likely the table doesn't exist yet! Silently ignore for testing UI.
        }
    } catch (err) {
        console.error("Save error:", err);
    }
}
