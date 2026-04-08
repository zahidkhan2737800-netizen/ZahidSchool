// ═══════════════════════════════════════════════════════════════════════════════
// fee_contacts.js — High-Density Interactive Follow-up Grid
// ═══════════════════════════════════════════════════════════════════════════════

let currentMonth = '';
let allStudents = [];
let monthData = {}; // keyed by student.id
let classesList = [];
let studentBalances = {}; // Cache for live balance calculations

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
    document.getElementById('btnClearFilters').addEventListener('click', () => {
        document.getElementById('classFilter').value = '';
        document.getElementById('statusFilter').value = 'All';
        document.getElementById('rollFilter').value = '';
        renderTable();
    });

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
async function loadBaseData() {
    try {
        // Fetch specific columns for speed
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
            .select('id, roll_number, full_name, applying_for_class')
            .eq('status', 'Active')
            .order('roll_number', { ascending: true });
        if (schoolId) studentsQ = studentsQ.eq('school_id', schoolId);
        const { data: students, error: sErr } = await studentsQ;

        if (sErr) throw sErr;
        allStudents = students || [];

        // Fetch classes for dropdown
        const { data: classes, error: cErr } = await supabaseClient
            .from('classes')
            .select('id, class_name, section');
            
        if (!cErr && classes) {
            classesList = classes;
            const classSelect = document.getElementById('classFilter');
            classes.forEach(c => {
                const opt = document.createElement('option');
                const str = `${c.class_name} ${c.section}`.trim();
                opt.value = str;
                opt.textContent = str;
                classSelect.appendChild(opt);
            });
        }

        // Fetch Real Unpaid Balances
        const { data: challans, error: bErr } = await supabaseClient
            .from('challans')
            .select('student_id, amount')
            .neq('status', 'Paid')
            .neq('status', 'Cancelled');
            
        studentBalances = {};
        if (challans && !bErr) {
            challans.forEach(c => {
                studentBalances[c.student_id] = (studentBalances[c.student_id] || 0) + Number(c.amount || 0);
            });
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
        const { data: contacts, error } = await supabaseClient
            .from('fee_contacts')
            .select('*')
            .eq('month_key', currentMonth);

        // Map to lookup dictionary
        monthData = {};
        if (contacts && !error) {
            contacts.forEach(c => monthData[c.student_id] = c);
        }
    } catch (err) {
        console.warn("fee_contacts table might not exist yet. Using empty state.", err);
        monthData = {};
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

    let totalBalance = 0;
    
    // Convert to rich objects with pinned state to allow sorting
    let rowsToRender = allStudents.map(student => {
        const data = monthData[student.id] || getEmptyContactState(student.id);
        return { student, data };
    });

    // 1. Filter
    rowsToRender = rowsToRender.filter(row => {
        if (classF && row.student.applying_for_class !== classF) return false;
        if (rollF && !String(row.student.roll_number).toLowerCase().includes(rollF)) return false;
        if (statusF !== 'All' && row.data.row_status !== statusF) return false;
        return true;
    });

    // 2. Sort (Pinned first, then by Roll No)
    rowsToRender.sort((a, b) => {
        if (a.data.pinned && !b.data.pinned) return -1;
        if (!a.data.pinned && b.data.pinned) return 1;
        // Keep original roll_number ordering natively
        return 0; 
    });

    // 3. Render
    rowsToRender.forEach(({ student, data }) => {
        const tr = document.createElement('tr');
        if (data.pinned) tr.classList.add('pinned');
        if (data.row_status === 'Solved') tr.classList.add('solved');

        // Fetch true balance from cached challans data
        const balance = studentBalances[student.id] || 0;
        totalBalance += balance;

        tr.innerHTML = `
            <td class="col-roll">${student.roll_number}</td>
            <td class="col-name">${student.full_name}</td>
            <td>
                <!-- Random mock attendance for display -->
                <div class="att-pill P" title="Present">P</div>
            </td>
            ${[1,2,3,4,5,6,7,8].map(idx => generateContactCell(student.id, idx, data)).join('')}
            <td class="col-balance ${balance === 0 ? 'zero' : ''}">${balance}</td>
            <td><button class="action-btn-cell cd-btn ${data.complaint ? 'active' : ''}" data-id="${student.id}" title="Complaint">C</button></td>
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
        tbody.innerHTML = '<tr><td colspan="16" style="padding: 3rem; color: #94a3b8;">No contact records match your filters.</td></tr>';
    }

    // Update Counter
    document.getElementById('totalBalanceBadge').textContent = `Rs. ${totalBalance.toLocaleString()}`;
}

// ─── Generators & Helpers ────────────────────────────────────────────────────
function getEmptyContactState(studentId) {
    return { student_id: studentId, month_key: currentMonth, pinned: false, complaint: false, row_status: 'Pending' };
}

function generateContactCell(studentId, idx, data) {
    const status = data[`c${idx}_status`] || '';
    const dateLine = data[`c${idx}_date`] ? new Date(data[`c${idx}_date`]).toLocaleDateString('en-GB', {day:'numeric', month:'short'}) : '';
    
    return `
        <td class="${idx >= 7 ? `col-c${idx}` : ''}">
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
        </td>
    `;
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
