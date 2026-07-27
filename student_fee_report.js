// ═══════════════════════════════════════════════════════════════════════════════
// student_fee_report.js  –  Student Fee Balance Report
// Data sources:
//   - admissions  : individual students (excluding family students)
//   - challans    : unpaid balances per student
//   - fee_contacts: pinned, row_status, commitment_notes for the chosen month
// ═══════════════════════════════════════════════════════════════════════════════

let currentMonth = '';
let allStudents   = [];       // [{id, roll_number, full_name, father_name, father_mobile, applying_for_class}]
let studentBalances = {};     // student_id → total unpaid Rs
let monthData       = {};     // student_id → fee_contacts row

// ── Wait for auth ─────────────────────────────────────────────────────────────
async function waitForAuth(ms = 10000) {
    const end = Date.now() + ms;
    while (Date.now() < end) {
        if (window.authReady && window.supabaseClient) return;
        await new Promise(r => setTimeout(r, 80));
    }
}

// ── Boot ──────────────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', async () => {
    await waitForAuth();

    const now = new Date();
    currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    document.getElementById('monthPicker').value = currentMonth;

    document.getElementById('monthPicker').addEventListener('change', e => {
        currentMonth = e.target.value;
        loadMonthData();
    });
    document.getElementById('classFilter').addEventListener('change', renderTable);
    document.getElementById('statusFilter').addEventListener('change', renderTable);
    document.getElementById('searchInput').addEventListener('input', renderTable);
    document.getElementById('loadBtn').addEventListener('click', loadBaseData);
    document.getElementById('printBtn').addEventListener('click', doPrint);
    document.getElementById('resetBtn').addEventListener('click', resetFilters);

    // Font size slider
    document.getElementById('fontSizeRange').addEventListener('input', function() {
        document.documentElement.style.setProperty('--tf', this.value + 'px');
        document.getElementById('fsVal').textContent = this.value + 'px';
    });

    // Compactness slider
    document.getElementById('compactnessRange').addEventListener('input', function() {
        const pct = +this.value;
        document.getElementById('cmVal').textContent = pct + '%';
        const vp = Math.round(pct * 0.12);
        const hp = Math.round(4 + pct * 0.1);
        document.documentElement.style.setProperty('--tdp', `${vp}px ${hp}px`);
        document.documentElement.style.setProperty('--thp', `${Math.round(vp * 0.8 + 2)}px ${hp}px`);
    });

    await loadBaseData();
});

// ── Load students + balances ──────────────────────────────────────────────────
async function loadBaseData() {
    setLoader(true);
    try {
        const sid = window.currentSchoolId || null;

        // 1. Fetch active students
        let q = window.supabaseClient
            .from('admissions')
            .select('id, roll_number, full_name, father_name, father_mobile, applying_for_class')
            .eq('status', 'Active')
            .order('roll_number', { ascending: true });
        if (sid) q = q.eq('school_id', sid);
        const { data: students, error: sErr } = await q;
        if (sErr) throw sErr;

        // 2. Exclude family students (mobile shared by 2+) — same logic as fee_contacts.js
        const mobileCnt = {};
        (students || []).forEach(s => {
            const mob = (s.father_mobile || '').trim();
            if (mob) mobileCnt[mob] = (mobileCnt[mob] || 0) + 1;
        });
        const familyMobiles = new Set(
            Object.entries(mobileCnt).filter(([, c]) => c >= 2).map(([m]) => m)
        );
        allStudents = (students || []).filter(s => {
            const mob = (s.father_mobile || '').trim();
            return !mob || !familyMobiles.has(mob);
        });

        // 3. Populate class dropdown
        const classSet = [...new Set(allStudents.map(s => s.applying_for_class).filter(Boolean))].sort();
        const classSelect = document.getElementById('classFilter');
        classSelect.innerHTML = '<option value="">All Classes</option>';
        classSet.forEach(cls => {
            const opt = document.createElement('option');
            opt.value = cls;
            opt.textContent = cls;
            classSelect.appendChild(opt);
        });

        // 4. Unpaid challan balances
        let bq = window.supabaseClient
            .from('challans')
            .select('student_id, amount, paid_amount')
            .in('status', ['Unpaid', 'Partially Paid']);
        if (sid) bq = bq.eq('school_id', sid);
        const { data: challans } = await bq;

        studentBalances = {};
        (challans || []).forEach(c => {
            const rem = parseFloat(c.amount || 0) - parseFloat(c.paid_amount || 0);
            studentBalances[c.student_id] = (studentBalances[c.student_id] || 0) + rem;
        });

        // 5. Load month data
        await loadMonthData();

    } catch (err) {
        console.error('Student fee report load error:', err);
        setLoader(false);
        document.getElementById('reportBody').innerHTML =
            '<tr><td colspan="8" class="empty">Error loading data. Check console.</td></tr>';
        document.getElementById('reportTable').style.display = 'table';
    }
}

// ── Load fee_contacts for selected month ──────────────────────────────────────
async function loadMonthData() {
    try {
        const { data: contacts, error } = await window.supabaseClient
            .from('fee_contacts')
            .select('student_id, month_key, pinned, complaint, row_status, commitment_notes')
            .eq('month_key', currentMonth);

        monthData = {};
        if (!error && contacts) {
            contacts.forEach(c => { monthData[c.student_id] = c; });
        }
    } catch (e) {
        console.warn('fee_contacts table may not exist yet. Using empty state.', e);
        monthData = {};
    }

    setLoader(false);
    renderTable();
}

// ── Render ────────────────────────────────────────────────────────────────────
function renderTable() {
    const classF   = document.getElementById('classFilter').value;
    const statusF  = document.getElementById('statusFilter').value;
    const searchT  = document.getElementById('searchInput').value.toLowerCase().trim();

    // Build rich rows
    let rows = allStudents.map(student => {
        const d = monthData[student.id] || { pinned: false, row_status: 'Pending', commitment_notes: '' };
        return { student, d };
    });

    // Filter
    rows = rows.filter(({ student, d }) => {
        if (classF && student.applying_for_class !== classF) return false;
        if (statusF === 'Pinned'  && !d.pinned)                   return false;
        if (statusF === 'Pending' && d.row_status !== 'Pending')   return false;
        if (statusF === 'Solved'  && d.row_status !== 'Solved')    return false;
        if (searchT) {
            const hay = [
                String(student.roll_number),
                student.full_name,
                student.father_name || '',
                student.father_mobile || '',
                d.commitment_notes || ''
            ].join(' ').toLowerCase();
            if (!hay.includes(searchT)) return false;
        }
        return true;
    });

    // Sort: pinned first → by balance desc; then unpinned → classwise → roll number asc
    rows.sort((a, b) => {
        const ap = !!a.d.pinned, bp = !!b.d.pinned;
        if (ap && !bp) return -1;
        if (!ap && bp) return 1;
        if (ap && bp) {
            return (studentBalances[b.student.id] || 0) - (studentBalances[a.student.id] || 0);
        }
        // both unpinned: group class-wise
        const classA = a.student.applying_for_class || '';
        const classB = b.student.applying_for_class || '';
        if (classA !== classB) {
            return classA.localeCompare(classB, undefined, { numeric: true, sensitivity: 'base' });
        }
        // same class: sort by roll number
        const rollA = a.student.roll_number || '';
        const rollB = b.student.roll_number || '';
        return rollA.localeCompare(rollB, undefined, { numeric: true, sensitivity: 'base' });
    });

    // Summary counts
    let totBal = 0, pendCnt = 0, pendBal = 0, solvCnt = 0, solvBal = 0, pinCnt = 0, pinBal = 0;
    rows.forEach(({ student, d }) => {
        const bal = studentBalances[student.id] || 0;
        totBal += bal;
        if (d.pinned)                  { pinCnt++;  pinBal  += bal; }
        if (d.row_status === 'Solved') { solvCnt++; solvBal += bal; }
        else                           { pendCnt++; pendBal += bal; }
    });

    document.getElementById('scTotal').textContent     = rows.length;
    document.getElementById('scClass').textContent     = classF ? classF : 'All classes';
    document.getElementById('scPending').textContent   = pendCnt;
    document.getElementById('scPendingBal').textContent= 'Rs ' + fmt(pendBal);
    document.getElementById('scSolved').textContent    = solvCnt;
    document.getElementById('scSolvedBal').textContent = 'Rs ' + fmt(solvBal);
    document.getElementById('scPinned').textContent    = pinCnt;
    document.getElementById('scPinnedBal').textContent = 'Rs ' + fmt(pinBal);
    document.getElementById('scTotalBal').textContent  = 'Rs ' + fmt(totBal);
    document.getElementById('scFiltered').textContent  =
        (statusF !== 'All' || searchT || classF) ? '(filtered view)' : '';

    const tbody = document.getElementById('reportBody');
    if (!rows.length) {
        tbody.innerHTML = '<tr><td colspan="8" class="empty">No student records match the current filters.</td></tr>';
        document.getElementById('reportTable').style.display = 'table';
        return;
    }

    let html = '';
    let lastClass = null;
    let hasPinnedHeaderBeenAdded = false;

    rows.forEach(({ student, d }) => {
        const bal      = studentBalances[student.id] || 0;
        const isPinned = !!d.pinned;
        const isSolved = d.row_status === 'Solved';
        const rowCls   = (isPinned ? 'row-pinned ' : '') + (isSolved ? 'row-solved' : '');

        // 1. Header for Pinned Students
        if (isPinned && !hasPinnedHeaderBeenAdded) {
            html += `<tr class="group-header-row pinned-group-header">
                <td colspan="8">📌 PINNED FOLLOW-UPS</td>
            </tr>`;
            hasPinnedHeaderBeenAdded = true;
        }

        // 2. Class Header for Unpinned Students
        if (!isPinned) {
            const currentClass = (student.applying_for_class || 'Unassigned').trim();
            if (currentClass !== lastClass) {
                lastClass = currentClass;
                html += `<tr class="group-header-row class-group-header">
                    <td colspan="8">🏫 Class: ${esc(currentClass)}</td>
                </tr>`;
            }
        }

        const statusLbl = isSolved
            ? '<span class="status-lbl solved">Solved</span>'
            : '<span class="status-lbl pending">Pending</span>';
        const pinLbl = isPinned ? '<span class="pin-lbl">📌 Pin</span>' : '—';

        html += `<tr class="${rowCls}">
            <td style="text-align:center;font-weight:700;">${esc(student.roll_number)}</td>
            <td><strong>${esc(student.full_name)}</strong></td>
            <td>
                <span style="font-weight:700;display:block;">${esc(student.father_name || '')}</span>
                <span style="color:#475569;">${esc(student.father_mobile || '')}</span>
            </td>
            <td>${esc(student.applying_for_class || '')}</td>
            <td class="bal-cell${bal === 0 ? ' zero' : ''}">Rs ${fmt(bal)}</td>
            <td style="text-align:center;">${statusLbl}</td>
            <td style="text-align:center;">${pinLbl}</td>
            <td class="notes-cell">${esc(d.commitment_notes || '')}</td>
        </tr>`;
    });

    tbody.innerHTML = html;

    document.getElementById('reportTable').style.display = 'table';
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function fmt(n) { return Math.round(n || 0).toLocaleString(); }
function esc(s) { return String(s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }

function setLoader(show) {
    document.getElementById('loader').style.display = show ? 'block' : 'none';
    if (show) document.getElementById('reportTable').style.display = 'none';
}

function resetFilters() {
    document.getElementById('classFilter').value      = '';
    document.getElementById('statusFilter').value     = 'All';
    document.getElementById('searchInput').value      = '';
    document.getElementById('fontSizeRange').value    = 16;
    document.getElementById('compactnessRange').value = 80;
    document.getElementById('fsVal').textContent      = '16px';
    document.getElementById('cmVal').textContent      = '80%';
    document.documentElement.style.setProperty('--tf',  '16px');
    document.documentElement.style.setProperty('--tdp', '8px 10px');
    document.documentElement.style.setProperty('--thp', '9px 10px');
    renderTable();
}

function doPrint() {
    const monthStr = document.getElementById('monthPicker').value || currentMonth;
    const status   = document.getElementById('statusFilter').value;
    const cls      = document.getElementById('classFilter').value || 'All Classes';
    const now      = new Date().toLocaleDateString('en-PK', { day:'2-digit', month:'short', year:'numeric' });
    document.getElementById('printHeader').textContent =
        `Student Fee Balance Report — Month: ${monthStr}  |  Class: ${cls}  |  Filter: ${status}  |  Printed: ${now}`;
    window.print();
}
