// ═══════════════════════════════════════════════════════════════════════════════
// family_contacts.js — High-Density Interactive Follow-up Grid for Families
// ═══════════════════════════════════════════════════════════════════════════════

let currentMonth = '';
let allFamilies = [];
let monthData = {}; // keyed by family_mobile
let familyBalances = {}; // Cache for live balance calculations
let studentBalancesMap = {}; // Cache for individual student balances for WA bill
let allPendingChallans = []; // Full details for bill breakdown
let waTemplates = []; // User templates for WhatsApp
let currentOpenMobile = null; // Track who is opened in modal
let recentAttendance = {}; // student_id -> { date: status }
let recentDates = []; // Last 3 calendar dates (YYYY-MM-DD)
let currentCommitmentMobile = null;
let familyCommitmentsMap = {}; // family_mobile -> pending dated commitments
let teacherFeeSelectedStudentIds = new Set(); // shared Supabase TeacherFee rows
let familyDisplayNamesMap = new Map(); // normalized mobile -> selected family name
let familyPaymentsMap = {}; // family_mobile -> receipt-level payments for selected month

const STATUS_COLORS = {
    'C': 'status-C',
    'CN': 'status-CN',
    'W': 'status-W',
    'NO': 'status-NO',
    'NN': 'status-NN'
};

function toLocalYmd(d) {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
}

function selectedMonthUtcRange(monthKey) {
    const [year, month] = String(monthKey || '').split('-').map(Number);
    const karachiOffsetMs = 5 * 60 * 60 * 1000;
    return {
        start: new Date(Date.UTC(year, month - 1, 1) - karachiOffsetMs).toISOString(),
        end: new Date(Date.UTC(year, month, 1) - karachiOffsetMs).toISOString()
    };
}

async function loadFamilyPaymentsForMonth() {
    const studentToFamily = new Map();
    allFamilies.forEach(family => {
        (family.members || []).forEach(student => {
            if (student.id) studentToFamily.set(String(student.id), String(family.mobile || '').trim());
        });
    });
    const studentIds = [...studentToFamily.keys()];
    if (!studentIds.length) return {};

    const { start, end } = selectedMonthUtcRange(currentMonth);
    const transactions = [];
    for (let index = 0; index < studentIds.length; index += 40) {
        let query = window.supabaseClient
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
        const mobile = studentToFamily.get(String(transaction.student_id));
        if (!mobile) return;
        const rawReceipt = String(transaction.receipt_number || 'PAYMENT');
        const parts = rawReceipt.split('-');
        const receiptBase = /^(FAM|RCT)$/.test(parts[0]) && parts.length >= 2
            ? parts.slice(0, 2).join('-')
            : rawReceipt;
        const key = `${mobile}|${receiptBase}`;
        if (!receiptGroups.has(key)) {
            receiptGroups.set(key, { mobile, receipt: receiptBase, amount: 0, created_at: transaction.created_at });
        }
        const group = receiptGroups.get(key);
        group.amount += Number(transaction.amount_paid || 0);
        if (new Date(transaction.created_at) > new Date(group.created_at)) group.created_at = transaction.created_at;
    });

    const result = {};
    receiptGroups.forEach(payment => {
        if (!result[payment.mobile]) result[payment.mobile] = [];
        result[payment.mobile].push(payment);
    });
    Object.values(result).forEach(payments => payments.sort((a, b) => new Date(b.created_at) - new Date(a.created_at)));
    return result;
}

function generateFamilyPaymentSummary(familyMobile) {
    const payments = familyPaymentsMap[String(familyMobile || '').trim()] || [];
    if (!payments.length) return '';
    const visible = payments.slice(0, 3);
    const chips = visible.map(payment => {
        const date = new Date(payment.created_at).toLocaleDateString('en-GB', {
            day: '2-digit', month: '2-digit', timeZone: 'Asia/Karachi'
        }).replace('/', '-');
        return `<span class="family-payment-chip" title="${escapeFamilyContactHtml(payment.receipt)}"><i class="fas fa-coins"></i> Rs ${Number(payment.amount).toLocaleString()} (${date})</span>`;
    }).join('');
    const more = payments.length > visible.length
        ? `<span class="family-payment-more">+${payments.length - visible.length} more</span>`
        : '';
    return `<div class="family-payment-summary">${chips}${more}</div>`;
}

// ─── Toast Notifications ──────────────────────────────────────────────────────
function showToast(msg, type = 'success') {
    let toastContainer = document.getElementById('toastContainer');
    if (!toastContainer) {
        toastContainer = document.createElement('div');
        toastContainer.id = 'toastContainer';
        toastContainer.style.cssText = 'position:fixed;top:20px;right:20px;z-index:5000;display:flex;flex-direction:column;gap:10px;';
        document.body.appendChild(toastContainer);
    }
    
    const toast = document.createElement('div');
    toast.style.cssText = `
        padding:12px 16px;
        border-radius:8px;
        font-weight:600;
        display:flex;
        align-items:center;
        gap:8px;
        box-shadow:0 4px 12px rgba(0,0,0,0.15);
        animation:slideIn 0.3s ease-in-out;
        ${type === 'error' ? 'background:#fee2e2;color:#991b1b;border:1px solid #fecaca;' : 'background:#dcfce7;color:#166534;border:1px solid #bbf7d0;'}
    `;
    toast.innerHTML = `<span>${type === 'error' ? '❌' : '✅'}</span><div>${msg}</div>`;
    
    toastContainer.appendChild(toast);
    
    setTimeout(() => {
        toast.style.animation = 'slideOut 0.3s ease-in-out';
        toast.addEventListener('animationend', () => toast.remove());
    }, 3000);
}

async function publishFamilyPriorityTodo(familyMobile, button) {
    const family = allFamilies.find(item => item.mobile === familyMobile);
    if (!family) {
        showToast('Family record was not found.', 'error');
        return;
    }

    const studentNames = (family.members || [])
        .map(student => {
            const name = student.full_name || student.name || '';
            if (!name) return '';
            const roll = student.roll_number || student.roll || 'N/A';
            return `${name}(${roll})`;
        })
        .filter(Boolean);
    const familyName = family.primaryName || 'Unnamed family';
    const todoText = `Family: ${familyName} | Students: ${studentNames.join(', ') || 'No students listed'}`;
    const today = karachiYmd();
    const payload = {
        text: todoText,
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
        showToast(`Priority diary task published for ${familyName}.`);
        setTimeout(() => {
            if (!button || !button.isConnected) return;
            button.disabled = false;
            button.textContent = oldText || 'Now';
        }, 1800);
    } catch (error) {
        console.error('Could not publish family priority todo:', error);
        if (button) {
            button.disabled = false;
            button.textContent = oldText || 'Now';
        }
        showToast(`Could not publish priority task: ${error.message || 'Unknown error'}`, 'error');
    }
}

function isTeacherFeeSelected(familyMobile) {
    const family = allFamilies.find(item => item.mobile === String(familyMobile || '').trim());
    if (!family?.members?.length) return false;
    return family.members.every(member => teacherFeeSelectedStudentIds.has(String(member.id)));
}

async function addFamilyToTeacherFee(familyMobile) {
    const mobile = String(familyMobile || '').trim();
    const family = allFamilies.find(item => item.mobile === mobile);
    if (!family?.members?.length) {
        showToast('No family students were found.', 'error');
        return false;
    }
    if (!window.currentSchoolId) {
        showToast('School could not be identified. Refresh and try again.', 'error');
        return false;
    }

    const newMembers = family.members.filter(member => member.id && !teacherFeeSelectedStudentIds.has(String(member.id)));
    if (!newMembers.length) {
        showToast(`All students from ${family.primaryName || mobile} are already in TeacherFee.`);
        return true;
    }
    const payload = newMembers.map(member => ({
        school_id: window.currentSchoolId,
        student_id: member.id,
        source: 'Family',
        added_by: window.currentUser?.id || null,
        updated_by: window.currentUser?.id || null
    }));
    try {
        const { error } = await window.supabaseClient
            .from('teacher_fee_rows')
            .upsert(payload, { onConflict: 'school_id,student_id', ignoreDuplicates: true });
        if (error) throw error;
        newMembers.forEach(member => teacherFeeSelectedStudentIds.add(String(member.id)));
        showToast(`${newMembers.length} students from ${family.primaryName || mobile} added to TeacherFee.`);
        return true;
    } catch (error) {
        const missingTable = error?.code === '42P01' || error?.code === 'PGRST205' || String(error?.message || '').includes('teacher_fee_rows');
        showToast(missingTable ? 'TeacherFee storage is not installed. Run teacher_fee_setup.sql in Supabase.' : `Could not add family to TeacherFee: ${error.message || 'Unknown error'}`, 'error');
        return false;
    }
}

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
    document.getElementById('statusFilter').addEventListener('change', renderTable);
    document.getElementById('searchTerm').addEventListener('input', renderTable);
    document.getElementById('btnClearFilters').addEventListener('click', () => {
        document.getElementById('statusFilter').value = 'All';
        document.getElementById('searchTerm').value = '';
        renderTable();
    });

    setupCommitmentModal();

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

// ─── Fetch Base Data (Students grouped into Families) ──────────────────────────
function karachiYmd(date = new Date()) {
    const parts = new Intl.DateTimeFormat('en-GB', {
        timeZone: 'Asia/Karachi',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit'
    }).formatToParts(date);
    const values = Object.fromEntries(parts.map(part => [part.type, part.value]));
    return `${values.year}-${values.month}-${values.day}`;
}

function addDaysToYmd(ymd, days) {
    const [year, month, day] = ymd.split('-').map(Number);
    const date = new Date(Date.UTC(year, month - 1, day));
    date.setUTCDate(date.getUTCDate() + days);
    return date.toISOString().slice(0, 10);
}

function formatCommitmentDate(ymd) {
    return new Date(`${ymd}T00:00:00Z`).toLocaleDateString('en-GB', {
        weekday: 'long',
        day: '2-digit',
        month: 'short',
        year: 'numeric',
        timeZone: 'UTC'
    });
}

function setupCommitmentModal() {
    const modal = document.getElementById('commitmentModal');
    const input = document.getElementById('commitmentDays');
    const cancel = document.getElementById('commitmentCancel');
    const save = document.getElementById('commitmentSave');
    if (!modal || !input || !cancel || !save) return;

    input.addEventListener('keydown', event => {
        if (['e', 'E', '+', '-', '.', ','].includes(event.key)) event.preventDefault();
        if (event.key === 'Enter') saveCommitment();
        if (event.key === 'Escape') closeCommitmentModal();
    });
    input.addEventListener('input', () => {
        input.value = input.value.replace(/\D/g, '');
        updateCommitmentPreview();
    });
    input.addEventListener('wheel', event => {
        event.preventDefault();
        input.blur();
    }, { passive: false });
    cancel.addEventListener('click', closeCommitmentModal);
    save.addEventListener('click', saveCommitment);
    modal.addEventListener('click', event => {
        if (event.target === modal) closeCommitmentModal();
    });
    document.addEventListener('keydown', event => {
        if (event.key === 'Escape' && modal.classList.contains('open')) closeCommitmentModal();
    });
}

function openCommitmentModal(familyMobile) {
    const family = allFamilies.find(item => item.mobile === familyMobile);
    if (!family) {
        showToast('Family record was not found.', 'error');
        return;
    }

    currentCommitmentMobile = familyMobile;
    const modal = document.getElementById('commitmentModal');
    const input = document.getElementById('commitmentDays');
    document.getElementById('commitmentFamilyName').textContent = `${family.primaryName} (${family.mobile})`;
    input.value = '';
    updateCommitmentPreview();
    modal.classList.add('open');
    modal.setAttribute('aria-hidden', 'false');
    setTimeout(() => input.focus(), 30);
}

function closeCommitmentModal() {
    const modal = document.getElementById('commitmentModal');
    if (modal) {
        modal.classList.remove('open');
        modal.setAttribute('aria-hidden', 'true');
    }
    currentCommitmentMobile = null;
}

function updateCommitmentPreview() {
    const input = document.getElementById('commitmentDays');
    const preview = document.getElementById('commitmentPreview');
    if (!input || !preview || !/^\d+$/.test(input.value)) {
        if (preview) preview.textContent = 'Enter the number of days.';
        return;
    }

    const days = Number(input.value);
    const madeOn = karachiYmd();
    const dueDate = addDaysToYmd(madeOn, days);
    preview.innerHTML = `Made on <strong>${formatCommitmentDate(madeOn)}</strong><br>Payment due <strong>${formatCommitmentDate(dueDate)}</strong>`;
}

async function saveCommitment() {
    const input = document.getElementById('commitmentDays');
    const saveButton = document.getElementById('commitmentSave');
    const rawDays = input ? input.value.trim() : '';
    if (!/^\d+$/.test(rawDays)) {
        showToast('Enter a whole number: 0, 1, 2, 3...', 'error');
        if (input) input.focus();
        return;
    }

    const days = Number(rawDays);
    if (!Number.isSafeInteger(days) || days < 0) {
        showToast('Enter a valid number of days.', 'error');
        return;
    }

    const family = allFamilies.find(item => item.mobile === currentCommitmentMobile);
    if (!family || !window.currentSchoolId) {
        showToast('Family or school information is missing.', 'error');
        return;
    }

    const madeOn = karachiYmd();
    const dueDate = addDaysToYmd(madeOn, days);
    const payload = {
        school_id: window.currentSchoolId,
        family_mobile: family.mobile,
        family_no: family.familyNo || null,
        family_name: family.primaryName,
        members: family.members.map(member => ({
            student_id: member.id,
            name: member.full_name,
            roll: member.roll_number,
            class_name: member.applying_for_class
        })),
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
        const { error } = await window.supabaseClient.from('family_fee_commitments').insert(payload);
        if (error) throw error;
        closeCommitmentModal();
        showToast(`Commitment saved for ${formatCommitmentDate(dueDate)}.`);
        await loadData();
    } catch (error) {
        console.error('Could not save family commitment:', error);
        const missingTable = error?.code === '42P01' || String(error?.message || '').includes('schema cache');
        showToast(missingTable ? 'Commitment storage is not installed. Run family_fee_commitments_setup.sql in Supabase.' : `Could not save commitment: ${error.message || 'Unknown error'}`, 'error');
    } finally {
        saveButton.disabled = false;
        saveButton.textContent = 'Save';
    }
}

async function loadBaseData() {
    try {
        let studentsQ = window.supabaseClient
            .from('admissions')
            .select('id, roll_number, full_name, father_name, father_mobile, applying_for_class, family_id_manual')
            .eq('status', 'Active')
            .order('roll_number', { ascending: true });
        let displayNamesQ = window.supabaseClient
            .from('family_display_names')
            .select('mobile_number, family_name');
        if (window.currentSchoolId) {
            studentsQ = studentsQ.eq('school_id', window.currentSchoolId);
            displayNamesQ = displayNamesQ.eq('school_id', window.currentSchoolId);
        }
        const [studentsResult, displayNamesResult] = await Promise.all([studentsQ, displayNamesQ]);
        const students = studentsResult.data;
        const sErr = studentsResult.error;

        if (sErr) throw sErr;
        familyDisplayNamesMap = new Map((displayNamesResult.data || []).map(row => [String(row.mobile_number || '').replace(/[\s-]/g, ''), row.family_name]));
        if (displayNamesResult.error) console.warn('Could not load selected family names:', displayNamesResult.error);
        
        // Group students into families (similar to collect_family_fee)
        const groups = {};
        (students || []).forEach(s => {
            const mob = String(s.father_mobile || '').replace(/[\s-]/g, '').trim();
            if(!mob) return; 
            if(!groups[mob]) groups[mob] = [];
            groups[mob].push(s);
        });

        allFamilies = [];
        Object.keys(groups).forEach(mobile => {
            const members = groups[mobile];
            // Only include as a family if 2+ active students share the same mobile
            if (members.length < 2) return;
            const names = [...new Set(members.map(m => m.father_name).filter(n => n && n.trim() !== ''))];
            const primaryName = familyDisplayNamesMap.get(mobile) || (names.length > 0 ? names[0] : 'Unknown Family');
            const familyNos = [...new Set(members.map(m => m.family_id_manual).filter(n => n && n.trim() !== ''))];
            const familyNo = familyNos.length > 0 ? familyNos[0] : '';
            
            allFamilies.push({
                mobile,
                members,
                primaryName,
                familyNo
            });
        });

        // Fetch Real Unpaid Balances - Safely batched by student IDs to avoid URI Too Long errors
        let allStudentIds = [];
        allFamilies.forEach(f => {
            if (f.members) f.members.forEach(m => allStudentIds.push(m.id));
        });

        allPendingChallans = [];
        if (allStudentIds.length > 0) {
            try {
                // Batch by 40 students to stay well within URL limits
                for (let i = 0; i < allStudentIds.length; i += 40) {
                    const batch = allStudentIds.slice(i, i + 40);
                    const { data: batchData, error: bErr } = await window.supabaseClient
                        .from('challans')
                        .select('*')
                        .in('student_id', batch)
                        .in('status', ['Unpaid', 'Partially Paid'])
                        .limit(2000); // safety limit per batch
                        
                    if (!bErr && batchData) {
                        allPendingChallans.push(...batchData);
                    }
                }
            } catch (queryErr) {
                console.warn("Challan batch fetch warning:", queryErr);
            }
        }

        // First map by student ID
        studentBalancesMap = {};
        allPendingChallans.forEach(c => {
            const rem = parseFloat(c.amount || 0) - parseFloat(c.paid_amount || 0);
            studentBalancesMap[c.student_id] = (studentBalancesMap[c.student_id] || 0) + rem;
        });

        // Aggregate student balances into family balances
        familyBalances = {};
        allFamilies.forEach(fam => {
            let famTotal = 0;
            fam.members.forEach(m => { famTotal += (studentBalancesMap[m.id] || 0); });
            familyBalances[fam.mobile] = famTotal;
        });

        // Fetch Last 3 Days Attendance
        const attToday = new Date();
        recentDates = [];
        for (let i = 2; i >= 0; i--) {
            const d = new Date(attToday);
            d.setDate(attToday.getDate() - i);
            recentDates.push(d.toISOString().slice(0, 10));
        }
        const allMemberIds = [];
        allFamilies.forEach(f => {
            if (f.members) f.members.forEach(m => allMemberIds.push(m.id));
        });
        
        recentAttendance = {};
        if (allMemberIds.length > 0) {
            try {
                for (let i = 0; i < allMemberIds.length; i += 40) {
                    const batch = allMemberIds.slice(i, i + 40);
                    const { data: attData, error: attErr } = await window.supabaseClient
                        .from('attendance')
                        .select('student_id, status, date')
                        .in('date', recentDates)
                        .in('student_id', batch);
                        
                    if (attData && !attErr) {
                        attData.forEach(a => {
                            if (!recentAttendance[a.student_id]) recentAttendance[a.student_id] = {};
                            recentAttendance[a.student_id][a.date] = a.status;
                        });
                    }
                }
            } catch (queryErr) {
                console.warn("Attendance batch fetch warning:", queryErr);
            }
        }

        // Load Templates
        await loadWaTemplates();

    } catch (err) {
        console.error("Error loading family base data:", err);
    }
}

async function loadWaTemplates() {
    try {
        const { data, error } = await window.supabaseClient.from('wa_templates').select('*').order('created_at', { ascending: true });
        if (!error && data) {
            waTemplates = data;
            
            // Refresh dropdown
            const dropdown = document.getElementById('waTemplateDropdown');
            if(dropdown) {
                dropdown.innerHTML = '';
                const lastUsed = localStorage.getItem('lastWaTemplate');
                let selectedId = null;
                
                // Determine which ID should be selected
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
                    if(t.id === selectedId) {
                        opt.selected = true;
                    }
                    dropdown.appendChild(opt);
                });
            }
            if(window.renderWaTemplatesList) window.renderWaTemplatesList();
        }
    } catch(e) { console.error("Error loading WA templates", e); }
}

// ─── Fetch Month Data ────────────────────────────────────────────────────────
async function loadData() {
    document.getElementById('loader').style.display = 'block';
    const tbody = document.getElementById('contactsBody');
    tbody.innerHTML = '';
    
    try {
        let contactsRequest = window.supabaseClient
            .from('family_contacts')
            .select('*')
            .eq('month_key', currentMonth);
        if (window.currentSchoolId) contactsRequest = contactsRequest.eq('school_id', window.currentSchoolId);

        let commitmentsRequest = window.supabaseClient
            .from('family_fee_commitments')
            .select('id, family_mobile, family_name, members, days_promised, month_key, commitment_made_on, due_date, created_by, created_at')
            .eq('month_key', currentMonth)
            .eq('status', 'Pending')
            .order('due_date', { ascending: true })
            .order('created_at', { ascending: true });
        if (window.currentSchoolId) commitmentsRequest = commitmentsRequest.eq('school_id', window.currentSchoolId);

        let teacherFeeRowsRequest = window.supabaseClient
            .from('teacher_fee_rows')
            .select('student_id');
        if (window.currentSchoolId) teacherFeeRowsRequest = teacherFeeRowsRequest.eq('school_id', window.currentSchoolId);

        const [contactsResult, commitmentsResult, teacherFeeRowsResult, paymentsResult] = await Promise.all([
            contactsRequest,
            commitmentsRequest,
            teacherFeeRowsRequest,
            loadFamilyPaymentsForMonth().catch(error => {
                console.warn('Could not load family payment summaries:', error);
                return {};
            })
        ]);
        const contacts = contactsResult.data;
        const error = contactsResult.error;

        // Map to lookup dictionary
        monthData = {};
        if (contacts && !error) {
            contacts.forEach(c => monthData[c.family_mobile] = c);
        }

        familyCommitmentsMap = {};
        if (!commitmentsResult.error) {
            (commitmentsResult.data || []).forEach(commitment => {
                const members = Array.isArray(commitment.members) ? commitment.members : [];
                if (members.length < 2) return;
                const mobile = String(commitment.family_mobile || '').trim();
                if (!mobile) return;
                if (!familyCommitmentsMap[mobile]) familyCommitmentsMap[mobile] = [];
                familyCommitmentsMap[mobile].push(commitment);
            });
        } else {
            console.warn('Could not load family commitments:', commitmentsResult.error);
        }

        teacherFeeSelectedStudentIds = new Set((teacherFeeRowsResult.data || []).map(row => String(row.student_id)));
        if (teacherFeeRowsResult.error) console.warn('Could not load TeacherFee selections:', teacherFeeRowsResult.error);
        familyPaymentsMap = paymentsResult || {};
    } catch (err) {
        console.warn("family_contacts table might not exist yet. Using empty state.", err);
        monthData = {};
        familyCommitmentsMap = {};
        teacherFeeSelectedStudentIds = new Set();
        familyPaymentsMap = {};
    }

    document.getElementById('loader').style.display = 'none';
    renderTable();
}

// ─── Render Table ────────────────────────────────────────────────────────────
function renderTable() {
    const tbody = document.getElementById('contactsBody');
    tbody.innerHTML = '';

    const statusF = document.getElementById('statusFilter').value;
    const searchT = document.getElementById('searchTerm').value.toLowerCase().trim();

    let totalBalance = 0;
    let pendingCount = 0;
    let solvedCount = 0;
    let totalStudentsVisible = 0;
    let pendingBalance = 0;
    let solvedBalance = 0;
    
    // Convert to rich objects with pinned state to allow sorting
    let rowsToRender = allFamilies.map(fam => {
        const data = monthData[fam.mobile] || getEmptyContactState(fam.mobile);
        return { fam, data };
    });

    // 1. Filter
    rowsToRender = rowsToRender.filter(row => {
        if (searchT) {
            const matchesMob = row.fam.mobile.toLowerCase().includes(searchT);
            const matchesName = row.fam.primaryName.toLowerCase().includes(searchT);
            const matchesNo = row.fam.familyNo && String(row.fam.familyNo).toLowerCase().includes(searchT);
            const matchesNotes = (row.data.commitment_notes || '').toLowerCase().includes(searchT);
            if (!matchesMob && !matchesName && !matchesNo && !matchesNotes) return false;
        }
        if (statusF !== 'All' && row.data.row_status !== statusF) return false;
        return true;
    });

    // 2. Sort: pinned first (by balance desc), then unpinned (by family number asc)
    rowsToRender.sort((a, b) => {
        const aPinned = !!(a.data.pinned);
        const bPinned = !!(b.data.pinned);

        // Pinned always above unpinned
        if (aPinned && !bPinned) return -1;
        if (!aPinned && bPinned) return 1;

        // Both pinned: sort by balance descending
        if (aPinned && bPinned) {
            return (familyBalances[b.fam.mobile] || 0) - (familyBalances[a.fam.mobile] || 0);
        }

        // Both unpinned: sort by family number ascending
        const aNoRaw = (a.fam.familyNo || '').toString().trim();
        const bNoRaw = (b.fam.familyNo || '').toString().trim();
        const aNo = Number.parseInt(aNoRaw, 10);
        const bNo = Number.parseInt(bNoRaw, 10);
        const aIsNum = Number.isFinite(aNo);
        const bIsNum = Number.isFinite(bNo);

        if (aIsNum && bIsNum && aNo !== bNo) return aNo - bNo;
        if (aIsNum && !bIsNum) return -1;
        if (!aIsNum && bIsNum) return 1;

        const noCmp = aNoRaw.localeCompare(bNoRaw, undefined, { numeric: true, sensitivity: 'base' });
        if (noCmp !== 0) return noCmp;

        return a.fam.primaryName.localeCompare(b.fam.primaryName, undefined, { sensitivity: 'base' });
    });

    // 3. Render
    rowsToRender.forEach(({ fam, data }) => {
        const balance = familyBalances[fam.mobile] || 0;
        totalBalance += balance;
        totalStudentsVisible += (fam.members || []).length;

        if (data.row_status === 'Solved') {
            solvedCount++;
            solvedBalance += balance;
        } else {
            pendingCount++;
            pendingBalance += balance;
        }

        const tr = document.createElement('tr');
        if (data.pinned) tr.classList.add('pinned');
        if (data.row_status === 'Solved') tr.classList.add('solved');

        // Fetch true balance from cached family balances

        // Build member list with inline attendance pills
        const dayLabels = ['D3', 'D2', 'D1'];
        const membersHtml = fam.members.map(m => {
            const studentAtt = recentAttendance[m.id] || {};
            const pills = recentDates.map((dateStr, i) => {
                const st = studentAtt[dateStr];
                const lbl = dayLabels[i];
                if (!st) return `<div class="att-pill" style="width:18px;height:18px;font-size:0.5rem;" title="${dateStr}">-</div>`;
                if (st === 'Present') return `<div class="att-pill P" style="width:18px;height:18px;font-size:0.5rem;" title="Present ${dateStr}">${lbl}</div>`;
                if (st === 'Absent')  return `<div class="att-pill A" style="width:18px;height:18px;font-size:0.5rem;" title="Absent ${dateStr}">${lbl}</div>`;
                if (st === 'Holiday') return `<div class="att-pill H" style="width:18px;height:18px;font-size:0.5rem;" title="Holiday ${dateStr}">H</div>`;
                if (st === 'Leave')   return `<div class="att-pill L" style="width:18px;height:18px;font-size:0.5rem;" title="Leave ${dateStr}">${lbl}</div>`;
                return `<div class="att-pill" style="width:18px;height:18px;font-size:0.5rem;" title="${dateStr}">-</div>`;
            }).reverse().join('');
            return `<div style="display:flex;align-items:center;gap:4px;padding:2px 0;">• <span style="font-size:0.85rem;color:#475569;flex:1;">${m.full_name} <b>(${m.roll_number})</b></span><div style="display:flex;gap:2px;">${pills}</div></div>`;
        }).join('');
        const paymentSummaryHtml = generateFamilyPaymentSummary(fam.mobile);

        tr.innerHTML = `
            <td class="col-roll">${fam.familyNo || '—'}</td>
            <td class="col-name" style="padding-left:0.5rem; vertical-align: top;">
                <strong style="color:#0f172a; font-size:1.05rem;">${fam.primaryName}</strong><br>
                <small style="color:#64748b;font-weight:600;">${fam.mobile}</small>
                ${paymentSummaryHtml}
                <div style="margin-top: 6px; border-top: 1px dashed #cbd5e1; padding-top: 4px;">
                    ${membersHtml}
                </div>
            </td>
            ${[1,2,3,4,5,6,7,8].map(idx => generateContactCell(fam.mobile, idx, data)).join('')}
            <td class="col-balance ${balance === 0 ? 'zero' : ''}">${balance.toLocaleString()}</td>
            <td><button class="action-btn-cell" data-mobile="${fam.mobile}" title="Send Voice Message / Open Chat" onclick="openAudioChat('${fam.mobile}')">🎙️</button></td>
            <td><button class="action-btn-cell wa-btn" data-mobile="${fam.mobile}" title="Send WhatsApp Bill" onclick="openWaModal('${fam.mobile}')"><i class="fab fa-whatsapp" style="color:#25D366; font-size:1.3rem;"></i></button></td>
            <td><button class="action-btn-cell cd-btn ${data.complaint ? 'active' : ''}" data-id="${fam.mobile}" title="Complaint">C</button></td>
            <td><button class="action-btn-cell co-btn" data-id="${fam.mobile}" title="Save payment commitment">Co</button></td>
            <td><button class="action-btn-cell now-btn" data-id="${fam.mobile}" title="Publish family as a red priority diary task">Now</button></td>
            <td><button class="action-btn-cell teacher-btn ${isTeacherFeeSelected(fam.mobile) ? 'active' : ''}" data-id="${fam.mobile}" title="Add every family student as a separate TeacherFee row">T</button></td>
            <td><button class="action-btn-cell pin-btn ${data.pinned ? 'active' : ''}" data-id="${fam.mobile}" title="Pin to top">📌</button></td>
            <td><input type="text" class="commit-input" value="${data.commitment_notes || ''}" placeholder="Add notes..." data-id="${fam.mobile}"></td>
            <td>
                <select class="row-status-select ${data.row_status}" data-id="${fam.mobile}">
                    <option value="Pending" ${data.row_status === 'Pending' ? 'selected' : ''}>Pending</option>
                    <option value="Solved" ${data.row_status === 'Solved' ? 'selected' : ''}>Solved</option>
                </select>
            </td>
        `;

        // Attach Cell Events
        attachCellEvents(tr, fam.mobile);
        tbody.appendChild(tr);
    });

    if (rowsToRender.length === 0) {
        tbody.innerHTML = '<tr><td colspan="20" style="padding: 3rem; color: #94a3b8;">No family records match your filters.</td></tr>';
    }

    // Update Counter
    document.getElementById('totalBalanceBadge').textContent = `Rs. ${totalBalance.toLocaleString()}`;

    const totalEl = document.getElementById('cardTotalFamilies');
    const pendingEl = document.getElementById('cardPendingFamilies');
    const solvedEl = document.getElementById('cardSolvedFamilies');
    const studentsEl = document.getElementById('cardTotalStudents');
    const totalBalEl = document.getElementById('cardTotalFamiliesBalance');
    const pendingBalEl = document.getElementById('cardPendingBalance');
    const solvedBalEl = document.getElementById('cardSolvedBalance');

    const allFamiliesStudents = allFamilies.reduce((s, f) => s + (f.members || []).length, 0);
    if (totalEl) totalEl.textContent = allFamilies.length.toLocaleString();
    if (pendingEl) pendingEl.textContent = pendingCount.toLocaleString();
    if (solvedEl) solvedEl.textContent = solvedCount.toLocaleString();
    if (studentsEl) studentsEl.textContent = allFamiliesStudents.toLocaleString();
    if (totalBalEl) totalBalEl.textContent = `Rs ${totalBalance.toLocaleString()}`;
    if (pendingBalEl) pendingBalEl.textContent = `Rs ${pendingBalance.toLocaleString()}`;
    if (solvedBalEl) solvedBalEl.textContent = `Rs ${solvedBalance.toLocaleString()}`;
}

// ─── Generators & Helpers ────────────────────────────────────────────────────
function getEmptyContactState(familyMobile) {
    return {
        school_id: window.currentSchoolId || null,
        family_mobile: familyMobile,
        month_key: currentMonth,
        pinned: false,
        complaint: false,
        row_status: 'Pending'
    };
}

function generateContactCell(familyMobile, idx, data) {
    const status = data[`c${idx}_status`] || '';
    const dateLine = data[`c${idx}_date`] ? new Date(data[`c${idx}_date`]).toLocaleDateString('en-GB', {day:'numeric', month:'short'}) : '';
    const hasCommitment = (familyCommitmentsMap[String(familyMobile || '').trim()] || []).length > 0;
    const commitmentStrip = idx === 1 ? generateFamilyCommitmentStrip(familyMobile) : '';
    
    return `
        <td class="${idx >= 7 ? `col-c${idx}` : ''} ${idx === 1 ? 'commitment-anchor-cell' : ''} ${hasCommitment && idx <= 6 ? 'commitment-space-cell' : ''}">
            <div class="contact-cell">
                <select class="c-select" data-id="${familyMobile}" data-idx="${idx}">
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

function generateFamilyCommitmentStrip(familyMobile) {
    const commitments = familyCommitmentsMap[String(familyMobile || '').trim()] || [];
    if (!commitments.length) return '';

    const today = karachiYmd();
    const commitmentsByDate = groupCommitmentsByDueDate(commitments);
    const visible = commitmentsByDate.slice(0, 5);
    const chips = visible.map(dateGroup => {
        const commitment = dateGroup.entries[0];
        const daysRemaining = ymdDayDifference(today, commitment.due_date);
        const state = daysRemaining < 0 ? 'expired' : (daysRemaining === 0 ? 'today' : 'future');
        const label = daysRemaining < 0 ? `E${Math.abs(daysRemaining)}` : (daysRemaining === 0 ? 'T' : String(daysRemaining));
        const timing = daysRemaining < 0
            ? `Expired ${Math.abs(daysRemaining)} day${Math.abs(daysRemaining) === 1 ? '' : 's'} ago`
            : (daysRemaining === 0 ? 'Due today' : `Due in ${daysRemaining} day${daysRemaining === 1 ? '' : 's'}`);
        const entryText = dateGroup.entries.length === 1 ? '1 commitment' : `${dateGroup.entries.length} commitments`;
        const title = `${timing} | Due ${formatCommitmentDate(commitment.due_date)} | ${entryText} — click to view all entries`;
        return `<a class="commitment-day-chip ${state}" href="family_fee_commitments.html?date=${encodeURIComponent(commitment.due_date)}" target="_blank" title="${escapeFamilyContactHtml(title)}">${label}${dateGroup.entries.length > 1 ? `<sup>${dateGroup.entries.length}</sup>` : ''}</a>`;
    }).join('');
    const extra = commitmentsByDate.length > visible.length
        ? `<a class="commitment-day-chip more" href="family_fee_commitments.html?date=${encodeURIComponent(commitmentsByDate[visible.length].dueDate)}" target="_blank" title="${commitmentsByDate.length - visible.length} more commitment dates">+${commitmentsByDate.length - visible.length}</a>`
        : '';

    return `<div class="family-commitment-strip" title="Pending fee commitments">
        <span class="commitment-strip-label"><i class="fas fa-handshake"></i> Commit</span>
        <span class="commitment-strip-chips">${chips}${extra}</span>
    </div>`;
}

function groupCommitmentsByDueDate(commitments) {
    const groups = new Map();
    commitments.forEach(commitment => {
        const dueDate = commitment.due_date || '';
        if (!groups.has(dueDate)) groups.set(dueDate, []);
        groups.get(dueDate).push(commitment);
    });
    return [...groups.entries()].map(([dueDate, entries]) => ({ dueDate, entries }));
}

function ymdDayDifference(fromYmd, toYmd) {
    const [fromYear, fromMonth, fromDay] = String(fromYmd).split('-').map(Number);
    const [toYear, toMonth, toDay] = String(toYmd).split('-').map(Number);
    const fromUtc = Date.UTC(fromYear, fromMonth - 1, fromDay);
    const toUtc = Date.UTC(toYear, toMonth - 1, toDay);
    return Math.round((toUtc - fromUtc) / 86400000);
}

function escapeFamilyContactHtml(value) {
    return String(value ?? '').replace(/[&<>'"]/g, char => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;'
    }[char]));
}

function attachCellEvents(tr, familyMobile) {
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

            await saveContactState(familyMobile, updateField);
        });
    });

    // Complaint Button
    const cdBtn = tr.querySelector('.cd-btn');
    if (cdBtn) {
        cdBtn.addEventListener('click', async () => {
            const isActive = cdBtn.classList.toggle('active');
            await saveContactState(familyMobile, { complaint: isActive });

            // Auto-log to Complaint Diary if turned ON
            if (isActive) {
                try {
                    // Fetch configured fee complaint message
                    let complaintText = "Student has pending fee dues. Please contact parents."; // Fallback
                    const { data: tData } = await window.supabaseClient
                        .from('wa_templates')
                        .select('message_text')
                        .eq('title', 'FEE_COMPLAINT_AUTO_MSG')
                        .limit(1)
                        .single();
                    if (tData && tData.message_text) {
                        complaintText = tData.message_text;
                    }

                    const fam = allFamilies.find(f => f.mobile === familyMobile);
                    if (!fam || !fam.members) return;

                    // Log for each student in the family
                    for (const s of fam.members) {
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

                        const { data: existing } = await window.supabaseClient
                            .from('complaints')
                            .select('id')
                            .eq('roll', s.roll_number)
                            .eq('date', obj.date)
                            .eq('category', 'Fee')
                            .limit(1);

                        if (!existing || existing.length === 0) {
                            await window.supabaseClient.from('complaints').insert(obj);
                            console.log("Auto-logged family fee complaint for roll:", s.roll_number);
                        }
                    }
                } catch (err) {
                    console.error("Failed to auto-log family complaints:", err);
                }
            }
        });
    }

    // Dated fee commitment button
    const commitmentButton = tr.querySelector('.co-btn');
    if (commitmentButton) {
        commitmentButton.addEventListener('click', () => openCommitmentModal(familyMobile));
    }

    // Publish a red priority Diary/Dashboard task for this family.
    const nowButton = tr.querySelector('.now-btn');
    if (nowButton) {
        nowButton.addEventListener('click', () => publishFamilyPriorityTodo(familyMobile, nowButton));
    }

    // Add this family to the printable TeacherFee list and open the report.
    const teacherButton = tr.querySelector('.teacher-btn');
    if (teacherButton) {
        teacherButton.addEventListener('click', async () => {
            teacherButton.disabled = true;
            const saved = await addFamilyToTeacherFee(familyMobile);
            teacherButton.disabled = false;
            if (saved) teacherButton.classList.add('active');
        });
    }

    // Pin Button
    const pinBtn = tr.querySelector('.pin-btn');
    if (pinBtn) {
        pinBtn.addEventListener('click', async () => {
            const isActive = pinBtn.classList.toggle('active');
            await saveContactState(familyMobile, { pinned: isActive });
            renderTable(); // Re-sort immediately
        });
    }

    // Commit Input
    const commitIn = tr.querySelector('.commit-input');
    if (commitIn) {
        commitIn.addEventListener('blur', async (e) => {
            await saveContactState(familyMobile, { commitment_notes: e.target.value });
        });
    }

    // Row Status
    const rowStatusSel = tr.querySelector('.row-status-select');
    if (rowStatusSel) {
        rowStatusSel.addEventListener('change', async (e) => {
            const val = e.target.value;
            rowStatusSel.className = `row-status-select ${val}`;
            await saveContactState(familyMobile, { row_status: val });
            renderTable(); // Might filter it out!
        });
    }
}

// ─── WhatsApp Bill Modal ──────────────────────────────────────────────────────
window.openAudioChat = function(mobile) {
    // Validate mobile number
    if (!mobile || String(mobile).trim().length === 0) {
        showToast("No mobile number provided", 'error');
        return;
    }
    
    // Process phone number - remove all non-numeric characters
    let phone = String(mobile).trim().replace(/[^0-9+]/g, '');
    
    // Remove leading + if present
    if (phone.startsWith('+')) {
        phone = phone.substring(1);
    }
    
    // Validate phone number length
    if (phone.length < 10 || phone.length > 15) {
        showToast("Invalid phone number format. Expected 10-15 digits.", 'error');
        return;
    }
    
    // Convert Pakistan phone numbers: 0XXXXXXXXXX -> 92XXXXXXXXX
    if (phone.startsWith('0') && phone.length === 11) {
        phone = '92' + phone.substring(1);
    }
    
    // Ensure country code is present
    if (!phone.startsWith('92') && !phone.startsWith('1') && phone.length === 10) {
        phone = '92' + phone; // Assume Pakistan
    }
    
    try {
        const waUrl = `https://wa.me/${phone}`;
        const newWindow = window.open(waUrl, '_blank');
        
        if (!newWindow) {
            showToast("Failed to open WhatsApp. Your browser may have blocked the popup.", 'error');
            return;
        }
        
        showToast("WhatsApp opened successfully!");
    } catch (error) {
        console.error('Error opening WhatsApp:', error);
        showToast("Error opening WhatsApp. Please try again.", 'error');
    }
};

window.openWaModal = function(mobile) {
    currentOpenMobile = mobile;
    applySelectedWaTemplate();
    document.getElementById('waModal').style.display = 'flex';
};

window.applySelectedWaTemplate = async function() {
    if(!currentOpenMobile) return;
    const mobile = currentOpenMobile;
    const fam = allFamilies.find(f => f.mobile === mobile);
    if (!fam) return;

    // ── Fresh-fetch challans for THIS family so the WA message is never stale ──
    const studentIds = fam.members.map(m => m.id);
    try {
        const { data: freshChallans, error: fErr } = await window.supabaseClient
            .from('challans')
            .select('*')
            .in('student_id', studentIds)
            .in('status', ['Unpaid', 'Partially Paid']);

        if (!fErr && freshChallans) {
            // Remove old entries for these students from the global cache
            allPendingChallans = allPendingChallans.filter(c => !studentIds.includes(c.student_id));
            // Add fresh entries
            allPendingChallans = allPendingChallans.concat(freshChallans);

            // Update per-student and family balance caches so the table column stays in sync
            let famBalance = 0;
            studentIds.forEach(sid => {
                const stuTotal = freshChallans
                    .filter(c => c.student_id === sid)
                    .reduce((sum, c) => sum + Math.max(0, parseFloat(c.amount || 0) - parseFloat(c.paid_amount || 0)), 0);
                studentBalancesMap[sid] = stuTotal;
                famBalance += stuTotal;
            });
            familyBalances[fam.mobile] = famBalance;

            // Live-update the balance cell in the table row if visible
            const balanceCells = document.querySelectorAll('td.col-balance');
            const row = [...document.querySelectorAll('tr')].find(tr => tr.innerHTML && tr.innerHTML.includes(fam.mobile));
            if (row) {
                const balCell = row.querySelector('.col-balance');
                if (balCell) {
                    balCell.textContent = famBalance.toLocaleString();
                    balCell.classList.toggle('zero', famBalance === 0);
                }
            }
        }
    } catch(e) {
        console.warn('Could not refresh challans for WA message, using cached data:', e.message);
    }

    let templateText = "";
    const dropdown = document.getElementById('waTemplateDropdown');
    
    if (dropdown && dropdown.value) {
        const t = waTemplates.find(x => x.id === dropdown.value);
        if(t) {
            templateText = t.message_text;
            localStorage.setItem('lastWaTemplate', t.id); // Remember choice
        }
    }

    // Hardcoded fallback if nothing in DB
    if (!templateText) {
        templateText = "Zahid School System\nDear {{FATHER_NAME}},\n\n{{BILL_DETAILS}}\nTotal: Rs {{GRAND_TOTAL}}";
    }

    const todayDate = new Date().toLocaleDateString('en-GB', {day: 'numeric', month: 'short', year: 'numeric'});
    let famTotal = 0;
    
    // Generate Highly Detailed Bill lines purely tabular looking
    let billDetailsLines = [];
    fam.members.forEach(m => {
        const stuChallans = allPendingChallans.filter(c => c.student_id === m.id);
        
        let hasUnpaid = false;
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
                
                // Align column by padding standard spaces (will align perfectly inside monospace block)
                let spaces = 28 - desc.length;
                if(spaces < 3) spaces = 3;
                desc += ' '.repeat(spaces) + rem.toLocaleString();
                
                stuLines.push(desc);
                famTotal += rem;
                hasUnpaid = true;
            }
        });

        if (hasUnpaid) {
            billDetailsLines.push(`*${m.full_name.trim()}*`);
            billDetailsLines.push('```\n' + stuLines.join('\n') + '\n```');
            billDetailsLines.push(''); // spacing between students
        }
    });
    
    let parsed = templateText.replace(/{{TODAY_DATE}}/g, todayDate)
                             .replace(/{{FATHER_NAME}}/g, fam.primaryName)
                             .replace(/{{GRAND_TOTAL}}/g, famTotal);
    
    if(famTotal === 0) {
        parsed = "All dues are clear! Thank you for your continued support.";
    } else {
        parsed = parsed.replace(/{{BILL_DETAILS}}/g, billDetailsLines.join('\n').trim());
    }

    document.getElementById('waMessageText').value = parsed;
    
    // Wire send button safely
    const btnSend = document.getElementById('btnSendWa');
    btnSend.onclick = function() {
        const text = document.getElementById('waMessageText').value;
        
        // Validate message text
        if(!text || text.trim().length === 0) {
            showToast("Please enter a message", 'error');
            return;
        }
        
        // Validate mobile number exists
        if(!mobile || String(mobile).trim().length === 0) {
            showToast("No mobile number provided", 'error');
            return;
        }
        
        // Process phone number - remove all non-numeric characters
        let phone = String(mobile).trim().replace(/[^0-9+]/g, '');
        
        // Remove leading + if present
        if (phone.startsWith('+')) {
            phone = phone.substring(1);
        }
        
        // Validate phone number length
        if (phone.length < 10 || phone.length > 15) {
            showToast("Invalid phone number format. Expected 10-15 digits.", 'error');
            return;
        }
        
        // Convert Pakistan phone numbers: 0XXXXXXXXXX -> 92XXXXXXXXX
        if (phone.startsWith('0') && phone.length === 11) {
            phone = '92' + phone.substring(1);
        }
        
        // Ensure country code is present
        if (!phone.startsWith('92') && !phone.startsWith('1') && phone.length === 10) {
            phone = '92' + phone; // Assume Pakistan
        }
        
        try {
            // Build WhatsApp URL
            const waUrl = `https://wa.me/${phone}?text=${encodeURIComponent(text)}`;
            
            // Validate URL length (WhatsApp has limits)
            if (waUrl.length > 2048) {
                showToast("Message is too long. Please reduce the length.", 'error');
                return;
            }
            
            // Open WhatsApp with error handling
            const newWindow = window.open(waUrl, '_blank');
            
            // Check if window was successfully opened
            if (!newWindow) {
                showToast("Failed to open WhatsApp. Your browser may have blocked the popup.", 'error');
                return;
            }
            
            showToast("WhatsApp opened successfully!");
            closeWaModal();
        } catch (error) {
            console.error('Error opening WhatsApp:', error);
            showToast("Error opening WhatsApp. Please try again.", 'error');
        }
    };
};

window.closeWaModal = function() {
    document.getElementById('waModal').style.display = 'none';
};

// ─── Database Sync ───────────────────────────────────────────────────────────
async function saveContactState(familyMobile, fieldsToUpdate) {
    // 1. Locally update state for fast UI
    if (!monthData[familyMobile]) monthData[familyMobile] = getEmptyContactState(familyMobile);
    Object.assign(monthData[familyMobile], fieldsToUpdate);

    // 2. Perform DB Upsert
    const payload = Object.assign({}, monthData[familyMobile], {
        school_id: window.currentSchoolId || monthData[familyMobile].school_id || null
    });

    if (!payload.school_id) {
        console.error('Save failed: school could not be identified.');
        return;
    }

    try {
        const { error } = await window.supabaseClient
            .from('family_contacts')
            .upsert(payload, { onConflict: 'school_id,family_mobile,month_key' });
        
        if (error) {
            console.error("Upsert failed:", error);
        }
    } catch (err) {
        console.error("Save error:", err);
    }
}
