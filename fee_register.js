// fee_register.js — Fee Register: monthly challan status per student
// auth.js must be loaded first (provides supabaseClient, currentSchoolId)

const db = window.supabaseClient;

const MONTHS_LONG = [
    'January','February','March','April','May','June',
    'July','August','September','October','November','December'
];

// ─── Helpers ────────────────────────────────────────────────────────────────
function applySchoolScope(query) {
    const sid = window.currentSchoolId;
    return sid ? query.eq('school_id', sid) : query;
}

// "2026-04" → "April 2026"
function monthKeyToLabel(key) {
    const [y, m] = key.split('-');
    return `${MONTHS_LONG[parseInt(m, 10) - 1]} ${y}`;
}

// Build array of month labels from fromKey to toKey inclusive
function buildMonthRange(fromKey, toKey) {
    const labels = [];
    let [fy, fm] = fromKey.split('-').map(Number);
    const [ty, tm] = toKey.split('-').map(Number);
    let guard = 0;
    while ((fy < ty || (fy === ty && fm <= tm)) && guard < 24) {
        labels.push(`${MONTHS_LONG[fm - 1]} ${fy}`);
        fm++;
        if (fm > 12) { fm = 1; fy++; }
        guard++;
    }
    return labels;
}

// Current YYYY-MM
function nowMonthKey() {
    const d = new Date();
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    return `${y}-${m}`;
}

// ─── DOM refs ────────────────────────────────────────────────────────────────
const fromMonthEl  = document.getElementById('fromMonth');
const toMonthEl    = document.getElementById('toMonth');
const classFilterEl = document.getElementById('classFilter');
const searchEl     = document.getElementById('searchText');
const showFilterEl = document.getElementById('showFilter');
const loadBtn      = document.getElementById('loadBtn');
const printBtn     = document.getElementById('printBtn');
const summaryBar   = document.getElementById('summaryBar');
const tableScroll  = document.getElementById('tableScroll');
const placeholder  = document.getElementById('placeholder');
const regHead      = document.getElementById('regHead');
const regBody      = document.getElementById('regBody');

// ─── Boot ────────────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
    const checkAuth = setInterval(() => {
        if (window.authReady !== false && window.supabaseClient) {
            clearInterval(checkAuth);
            init();
        }
    }, 80);
});

async function init() {
    // Default range: 3 months back → current month
    const now     = nowMonthKey();
    const d       = new Date();
    const fromD   = new Date(d.getFullYear(), d.getMonth() - 3, 1);
    const fromKey = `${fromD.getFullYear()}-${String(fromD.getMonth() + 1).padStart(2, '0')}`;

    fromMonthEl.value = fromKey;
    toMonthEl.value   = now;

    await loadClasses();

    loadBtn.addEventListener('click', loadRegister);
    printBtn.addEventListener('click', () => window.print());
    searchEl.addEventListener('keydown', e => { if (e.key === 'Enter') loadRegister(); });
}

async function loadClasses() {
    const { data, error } = await applySchoolScope(
        db.from('admissions')
          .select('applying_for_class')
          .eq('status', 'Active')
    );
    if (error || !data) return;

    const classes = [...new Set(data.map(r => r.applying_for_class).filter(Boolean))].sort();
    classFilterEl.innerHTML = '<option value="">All Classes</option>' +
        classes.map(c => `<option value="${c}">${c}</option>`).join('');
}

// ─── Main Load ───────────────────────────────────────────────────────────────
async function loadRegister() {
    const fromKey = fromMonthEl.value;
    const toKey   = toMonthEl.value;
    if (!fromKey || !toKey || fromKey > toKey) {
        alert('Please select a valid From and To month range.');
        return;
    }

    const months      = buildMonthRange(fromKey, toKey);
    const selectedClass = classFilterEl.value.trim();
    const searchQ     = searchEl.value.trim().toLowerCase();
    const showMode    = showFilterEl.value;

    loadBtn.disabled = true;
    loadBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Loading…';

    try {
        // 1. Fetch active students
        let stuQuery = applySchoolScope(
            db.from('admissions')
              .select('id, roll_number, full_name, father_name, applying_for_class')
              .eq('status', 'Active')
              .order('roll_number', { ascending: true })
        );
        if (selectedClass) stuQuery = stuQuery.eq('applying_for_class', selectedClass);
        const { data: stuData, error: stuErr } = await stuQuery;
        if (stuErr) throw stuErr;

        let students = stuData || [];

        // Client-side name/roll search
        if (searchQ) {
            students = students.filter(s =>
                (s.full_name   || '').toLowerCase().includes(searchQ) ||
                (s.roll_number || '').toString().includes(searchQ)
            );
        }

        if (students.length === 0) {
            renderEmpty('No students found matching your filters.');
            return;
        }

        const studentIds = students.map(s => s.id);

        // 2. Fetch challans for these students in the selected months
        const { data: challanData, error: challanErr } = await applySchoolScope(
            db.from('challans')
              .select('id, student_id, fee_type, fee_month, amount, paid_amount, status')
              .in('student_id', studentIds)
              .in('fee_month', months)
              .neq('status', 'Cancelled')
        );
        if (challanErr) throw challanErr;

        const challans = challanData || [];

        // 3. Build lookup: studentId → { monthLabel → [challans] }
        const lookup = new Map();
        for (const s of students) lookup.set(s.id, {});
        for (const c of challans) {
            if (!lookup.has(c.student_id)) continue;
            const sEntry = lookup.get(c.student_id);
            if (!sEntry[c.fee_month]) sEntry[c.fee_month] = [];
            sEntry[c.fee_month].push(c);
        }

        // 4. Apply show filter
        let filtered = students;
        if (showMode === 'pending') {
            filtered = students.filter(s => {
                const entry = lookup.get(s.id);
                return months.some(m => {
                    const mChallans = entry[m] || [];
                    return mChallans.some(c => c.status !== 'Paid');
                });
            });
        } else if (showMode === 'nochallan') {
            filtered = students.filter(s => {
                const entry = lookup.get(s.id);
                return months.some(m => (entry[m] || []).length === 0);
            });
        }

        if (filtered.length === 0) {
            renderEmpty('No matching students for the selected filter.');
            return;
        }

        // 5. Compute summary stats
        let totalWithDues = 0;
        let grandRemaining = 0;
        let noChallanCells = 0;

        for (const s of filtered) {
            const entry = lookup.get(s.id);
            let studentHasDue = false;
            for (const m of months) {
                const mChallans = entry[m] || [];
                if (mChallans.length === 0) {
                    noChallanCells++;
                } else {
                    for (const c of mChallans) {
                        const bal = Number(c.amount || 0) - Number(c.paid_amount || 0);
                        if (bal > 0) {
                            grandRemaining += bal;
                            studentHasDue = true;
                        }
                    }
                }
            }
            if (studentHasDue) totalWithDues++;
        }

        // 6. Render
        renderTable(filtered, months, lookup);
        renderSummary(filtered.length, totalWithDues, grandRemaining, noChallanCells);

    } catch (e) {
        renderEmpty(`Error loading data: ${e.message}`);
        console.error(e);
    } finally {
        loadBtn.disabled = false;
        loadBtn.innerHTML = '<i class="fas fa-sync"></i> Load';
    }
}

// ─── Render Table ────────────────────────────────────────────────────────────
function renderTable(students, months, lookup) {
    placeholder.style.display  = 'none';
    tableScroll.style.display  = 'block';

    // Header
    const thMonths = months.map(m => `<th class="month-col">${m}</th>`).join('');
    regHead.innerHTML = `<tr>
        <th style="min-width:50px;">#</th>
        <th style="min-width:60px;">Roll</th>
        <th style="min-width:140px;">Student Name</th>
        <th style="min-width:110px;">Class</th>
        ${thMonths}
        <th style="min-width:110px; text-align:right;">Total Remaining</th>
    </tr>`;

    // Body
    let rowsHtml = '';
    students.forEach((s, idx) => {
        const entry = lookup.get(s.id);
        let studentTotal = 0;

        const cellsHtml = months.map(m => {
            const mChallans = entry[m] || [];
            if (mChallans.length === 0) {
                return `<td class="month-cell"><span class="badge badge-none">No Challan</span></td>`;
            }

            const totalAmt = mChallans.reduce((acc, c) => acc + Number(c.amount || 0), 0);
            const paidAmt  = mChallans.reduce((acc, c) => acc + Number(c.paid_amount || 0), 0);
            const balance  = totalAmt - paidAmt;
            studentTotal  += balance;

            // All paid
            if (balance <= 0) {
                return `<td class="month-cell"><span class="badge badge-paid">✓ Paid</span></td>`;
            }

            // Partial (some paid, some remaining)
            const anyPaid = paidAmt > 0;
            const badgeClass = anyPaid ? 'badge-partial' : 'badge-unpaid';
            const label = anyPaid
                ? `Rs ${Math.round(balance).toLocaleString()}<br><small style="font-weight:400;">partial</small>`
                : `Rs ${Math.round(balance).toLocaleString()}<br><small style="font-weight:400;">due</small>`;
            return `<td class="month-cell"><span class="badge ${badgeClass}">${label}</span></td>`;
        }).join('');

        const totalCell = studentTotal > 0
            ? `<td class="total-cell" style="color:var(--red);">Rs ${Math.round(studentTotal).toLocaleString()}</td>`
            : `<td class="total-cell" style="color:var(--ok);">✓ Clear</td>`;

        rowsHtml += `<tr>
            <td style="color:var(--muted); font-size:0.78rem;">${idx + 1}</td>
            <td><strong>${s.roll_number || '—'}</strong></td>
            <td>${s.full_name || '—'}</td>
            <td style="color:var(--muted);">${s.applying_for_class || '—'}</td>
            ${cellsHtml}
            ${totalCell}
        </tr>`;
    });

    regBody.innerHTML = rowsHtml || `<tr><td colspan="${4 + months.length + 1}" class="empty">No rows to display.</td></tr>`;
}

// ─── Render Summary ──────────────────────────────────────────────────────────
function renderSummary(total, withDues, remaining, noChallan) {
    document.getElementById('sumStudents').textContent  = total.toLocaleString();
    document.getElementById('sumWithDues').textContent  = withDues.toLocaleString();
    document.getElementById('sumTotal').textContent     = 'Rs ' + Math.round(remaining).toLocaleString();
    document.getElementById('sumNoChallan').textContent = noChallan.toLocaleString();
    summaryBar.style.display = 'flex';
}

// ─── Empty State ─────────────────────────────────────────────────────────────
function renderEmpty(msg) {
    tableScroll.style.display = 'none';
    summaryBar.style.display  = 'none';
    placeholder.style.display = 'block';
    placeholder.innerHTML = `<i class="fas fa-search"></i><p>${msg}</p>`;
}
