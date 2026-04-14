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

function toLocalYmd(d) {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
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

        // Fetch Real Unpaid Balances fully detailed for WhatsApp bills
        const { data: challans, error: bErr } = await supabaseClient
            .from('challans')
            .select('*')
            .neq('status', 'Paid')
            .neq('status', 'Cancelled');
            
        allPendingChallans = challans || [];
        studentBalances = {};
        if (challans && !bErr) {
            challans.forEach(c => {
                studentBalances[c.student_id] = (studentBalances[c.student_id] || 0) + Number(c.amount || 0) - Number(c.paid_amount || 0);
            });
        }
        
        await loadWaTemplates();

        // Fetch Last 3 Days Attendance
        const attToday = new Date();
        recentDates = [];
        for (let i = 2; i >= 0; i--) {
            const d = new Date(attToday);
            d.setDate(attToday.getDate() - i);
            recentDates.push(toLocalYmd(d));
        }
        let attQ = supabaseClient
            .from('attendance')
            .select('student_id, status, date')
            .in('date', recentDates);
        if (schoolId) attQ = attQ.eq('school_id', schoolId);
        const { data: attData, error: attErr } = await attQ;

        recentAttendance = {};
        if (attData && !attErr) {
            attData.forEach(a => {
                if (!recentAttendance[a.student_id]) recentAttendance[a.student_id] = {};
                recentAttendance[a.student_id][a.date] = normalizeAttendanceStatus(a.status);
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

        tr.innerHTML = `
            <td class="col-roll">${student.roll_number}</td>
            <td class="col-name"><span style="font-size:0.95rem;font-weight:600;display:block;line-height:1.3;">${student.full_name}</span><small style="color:#64748b;font-size:0.78rem;">${student.father_mobile||''}</small></td>
            <td>${attHtml}</td>
            ${[1,2,3,4,5,6,7,8].map(idx => generateContactCell(student.id, idx, data)).join('')}
            <td class="col-balance ${balance === 0 ? 'zero' : ''}">${balance.toLocaleString()}</td>
            <td><button class="action-btn-cell" data-student="${student.id}" title="Send Voice Message" onclick="openAudioChat('${student.id}')">🎙️</button></td>
            <td><button class="action-btn-cell wa-btn" data-student="${student.id}" title="Send WhatsApp Bill" onclick="openWaModal('${student.id}')"><i class="fab fa-whatsapp" style="color:#25D366; font-size:1.3rem;"></i></button></td>
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
    const totalEl = document.getElementById('cardTotalStudents');
    const pendingEl = document.getElementById('cardPendingStudents');
    const solvedEl = document.getElementById('cardSolvedStudents');
    if (totalEl) totalEl.textContent = allStudents.length.toLocaleString();
    if (pendingEl) pendingEl.textContent = pendingCount.toLocaleString();
    if (solvedEl) solvedEl.textContent = solvedCount.toLocaleString();
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


