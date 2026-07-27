// ═══════════════════════════════════════════════════════════════════════════════
// family_fee_report.js  –  Family Fee Balance Report
// Data sources:
//   - admissions     : family members (grouped by father_mobile)
//   - challans       : unpaid balances per student → aggregated per family
//   - family_contacts: pinned, row_status, commitment_notes for the chosen month
// ═══════════════════════════════════════════════════════════════════════════════

let currentMonth = '';
let allFamilies   = [];       // [{mobile, primaryName, familyNo, members}]
let familyBalances = {};      // mobile → total unpaid Rs
let monthData      = {};      // mobile → family_contacts row

// ── Wait for auth ────────────────────────────────────────────────────────────
async function waitForAuth(ms = 10000) {
    const end = Date.now() + ms;
    while (Date.now() < end) {
        if (window.authReady && window.supabaseClient) return;
        await new Promise(r => setTimeout(r, 80));
    }
}

// ── Boot ─────────────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', async () => {
    await waitForAuth();

    // Set current month
    const now = new Date();
    currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    document.getElementById('monthPicker').value = currentMonth;

    // Filters
    document.getElementById('monthPicker').addEventListener('change', e => {
        currentMonth = e.target.value;
        loadMonthData();
    });
    document.getElementById('statusFilter').addEventListener('change', renderTable);
    document.getElementById('searchInput').addEventListener('input', renderTable);
    document.getElementById('loadBtn').addEventListener('click', () => { loadBaseData(); });
    document.getElementById('printBtn').addEventListener('click', doPrint);
    document.getElementById('resetBtn').addEventListener('click', resetFilters);

    // Font size slider
    const fsRange = document.getElementById('fontSizeRange');
    fsRange.addEventListener('input', () => {
        const v = fsRange.value;
        document.documentElement.style.setProperty('--tf', v + 'px');
        document.getElementById('fsVal').textContent = v + 'px';
    });

    // Compactness slider → controls row padding
    const cmRange = document.getElementById('compactnessRange');
    cmRange.addEventListener('input', () => {
        const pct = cmRange.value;
        document.getElementById('cmVal').textContent = pct + '%';
        // pct=0 → dense; pct=100 → comfortable
        const vPad = Math.round(pct * 0.12);   // 0–12 px vertical
        const hPad = Math.round(4 + pct * 0.1); // 4–14 px horizontal
        document.documentElement.style.setProperty('--tdp', `${vPad}px ${hPad}px`);
        document.documentElement.style.setProperty('--thp', `${Math.round(vPad * 0.8 + 2)}px ${hPad}px`);
    });

    await loadBaseData();
});

// ── Load families + balances ──────────────────────────────────────────────────
async function loadBaseData() {
    setLoader(true);

    try {
        const sid = window.currentSchoolId || null;

        // 1. Fetch active students
        let q = window.supabaseClient
            .from('admissions')
            .select('id, roll_number, full_name, father_name, father_mobile, applying_for_class, family_id_manual')
            .eq('status', 'Active')
            .order('roll_number', { ascending: true });
        if (sid) q = q.eq('school_id', sid);
        const { data: students, error: sErr } = await q;
        if (sErr) throw sErr;

        // 2. Group into families (2+ students sharing a mobile)
        const groups = {};
        (students || []).forEach(s => {
            const mob = (s.father_mobile || '').trim();
            if (!mob) return;
            if (!groups[mob]) groups[mob] = [];
            groups[mob].push(s);
        });

        allFamilies = [];
        Object.keys(groups).forEach(mobile => {
            const members = groups[mobile];
            if (members.length < 2) return; // family = 2+
            const names    = [...new Set(members.map(m => m.father_name).filter(n => n && n.trim()))];
            const famNos   = [...new Set(members.map(m => m.family_id_manual).filter(n => n && n.trim()))];
            allFamilies.push({
                mobile,
                primaryName: names[0] || 'Unknown',
                familyNo:    famNos[0] || '',
                members
            });
        });

        // 3. Unpaid challan balances
        let bq = window.supabaseClient
            .from('challans')
            .select('student_id, amount, paid_amount')
            .in('status', ['Unpaid', 'Partially Paid']);
        if (sid) bq = bq.eq('school_id', sid);
        const { data: challans } = await bq;

        const studentBal = {};
        (challans || []).forEach(c => {
            const rem = parseFloat(c.amount || 0) - parseFloat(c.paid_amount || 0);
            studentBal[c.student_id] = (studentBal[c.student_id] || 0) + rem;
        });

        familyBalances = {};
        allFamilies.forEach(fam => {
            familyBalances[fam.mobile] = fam.members.reduce((s, m) => s + (studentBal[m.id] || 0), 0);
        });

        // 4. Load month contact data
        await loadMonthData();

    } catch (err) {
        console.error('Family fee report load error:', err);
        setLoader(false);
        document.getElementById('reportBody').innerHTML =
            '<tr><td colspan="7" class="empty">Error loading data. Check console.</td></tr>';
        document.getElementById('reportTable').style.display = 'table';
    }
}

// ── Load family_contacts for selected month ───────────────────────────────────
async function loadMonthData() {
    try {
        const { data: contacts, error } = await window.supabaseClient
            .from('family_contacts')
            .select('family_mobile, month_key, pinned, complaint, row_status, commitment_notes')
            .eq('month_key', currentMonth);

        monthData = {};
        if (!error && contacts) {
            contacts.forEach(c => { monthData[c.family_mobile] = c; });
        }
    } catch (e) {
        console.warn('family_contacts table may not exist yet. Using empty state.', e);
        monthData = {};
    }

    setLoader(false);
    renderTable();
}

// ── Render ────────────────────────────────────────────────────────────────────
function renderTable() {
    const statusF = document.getElementById('statusFilter').value;
    const searchT = document.getElementById('searchInput').value.toLowerCase().trim();

    // Build rich rows
    let rows = allFamilies.map(fam => {
        const d = monthData[fam.mobile] || { pinned: false, row_status: 'Pending', commitment_notes: '' };
        return { fam, d };
    });

    // Filter
    rows = rows.filter(({ fam, d }) => {
        if (statusF === 'Pinned'   && !d.pinned)            return false;
        if (statusF === 'Pending'  && d.row_status !== 'Pending') return false;
        if (statusF === 'Solved'   && d.row_status !== 'Solved')  return false;
        if (statusF === 'All') { /* no filter */ }
        if (searchT) {
            const haystack = [
                fam.mobile,
                fam.primaryName,
                String(fam.familyNo),
                d.commitment_notes || ''
            ].join(' ').toLowerCase();
            if (!haystack.includes(searchT)) return false;
        }
        return true;
    });

    // Sort: pinned first → by balance desc; then unpinned → family # asc
    rows.sort((a, b) => {
        const ap = !!a.d.pinned, bp = !!b.d.pinned;
        if (ap && !bp) return -1;
        if (!ap && bp) return 1;
        if (ap && bp) return (familyBalances[b.fam.mobile] || 0) - (familyBalances[a.fam.mobile] || 0);
        // both unpinned: sort by familyNo numeric then alpha
        const aNo = parseInt(a.fam.familyNo, 10), bNo = parseInt(b.fam.familyNo, 10);
        const aIsN = isFinite(aNo), bIsN = isFinite(bNo);
        if (aIsN && bIsN && aNo !== bNo) return aNo - bNo;
        if (aIsN && !bIsN) return -1;
        if (!aIsN && bIsN) return 1;
        return a.fam.primaryName.localeCompare(b.fam.primaryName, undefined, { sensitivity: 'base' });
    });

    // Summary counts
    let totBal = 0, pendCnt = 0, pendBal = 0, solvCnt = 0, solvBal = 0, pinCnt = 0, pinBal = 0;
    let allStudents = 0;
    rows.forEach(({ fam, d }) => {
        const bal = familyBalances[fam.mobile] || 0;
        totBal += bal;
        allStudents += fam.members.length;
        if (d.pinned)                { pinCnt++;  pinBal  += bal; }
        if (d.row_status === 'Solved') { solvCnt++; solvBal += bal; }
        else                           { pendCnt++; pendBal += bal; }
    });

    // Update summary cards
    document.getElementById('scTotal').textContent     = rows.length;
    document.getElementById('scStudents').textContent  = allStudents + ' students';
    document.getElementById('scPending').textContent   = pendCnt;
    document.getElementById('scPendingBal').textContent= 'Rs ' + fmt(pendBal);
    document.getElementById('scSolved').textContent    = solvCnt;
    document.getElementById('scSolvedBal').textContent = 'Rs ' + fmt(solvBal);
    document.getElementById('scPinned').textContent    = pinCnt;
    document.getElementById('scPinnedBal').textContent = 'Rs ' + fmt(pinBal);
    document.getElementById('scTotalBal').textContent  = 'Rs ' + fmt(totBal);
    document.getElementById('scFiltered').textContent  =
        statusF !== 'All' || searchT ? `(filtered view)` : '';

    // Build tbody
    const tbody = document.getElementById('reportBody');
    if (!rows.length) {
        tbody.innerHTML = '<tr><td colspan="7" class="empty">No family records match the current filters.</td></tr>';
        document.getElementById('reportTable').style.display = 'table';
        return;
    }

    tbody.innerHTML = rows.map(({ fam, d }) => {
        const bal     = familyBalances[fam.mobile] || 0;
        const isPinned = !!d.pinned;
        const isSolved = d.row_status === 'Solved';
        const rowCls   = (isPinned ? 'row-pinned ' : '') + (isSolved ? 'row-solved' : '');

        const membersHtml = fam.members.map(m =>
            `<span class="member-row">• <b>${m.roll_number}</b> ${esc(m.full_name)} <span style="color:#64748b; font-weight:600;">(${m.applying_for_class || ''})</span></span>`
        ).join('');

        const statusLbl = isSolved
            ? '<span class="status-lbl solved">Solved</span>'
            : '<span class="status-lbl pending">Pending</span>';
        const pinLbl = isPinned ? '<span class="pin-lbl">📌 Pin</span>' : '—';

        return `<tr class="${rowCls}">
            <td style="text-align:center;font-weight:700;">${esc(fam.familyNo) || '—'}</td>
            <td>
                <strong>${esc(fam.primaryName)}</strong>
            </td>
            <td>
                <span style="font-weight:700;display:block;margin-bottom:3px;">${esc(fam.mobile)}</span>
                ${membersHtml}
            </td>
            <td class="bal-cell${bal === 0 ? ' zero' : ''}">Rs ${fmt(bal)}</td>
            <td style="text-align:center;">${statusLbl}</td>
            <td style="text-align:center;">${pinLbl}</td>
            <td class="notes-cell">${esc(d.commitment_notes || '')}</td>
        </tr>`;
    }).join('');

    document.getElementById('reportTable').style.display = 'table';
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function fmt(n) {
    return Math.round(n || 0).toLocaleString();
}

function esc(str) {
    return String(str || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function setLoader(show) {
    document.getElementById('loader').style.display = show ? 'block' : 'none';
    if (show) document.getElementById('reportTable').style.display = 'none';
}

function resetFilters() {
    document.getElementById('statusFilter').value = 'All';
    document.getElementById('searchInput').value  = '';
    document.getElementById('fontSizeRange').value = 16;
    document.getElementById('compactnessRange').value = 80;
    document.getElementById('fsVal').textContent  = '16px';
    document.getElementById('cmVal').textContent  = '80%';
    document.documentElement.style.setProperty('--tf',  '16px');
    document.documentElement.style.setProperty('--tdp', '8px 10px');
    document.documentElement.style.setProperty('--thp', '9px 10px');
    renderTable();
}

function doPrint() {
    const monthStr = document.getElementById('monthPicker').value || currentMonth;
    const status   = document.getElementById('statusFilter').value;
    const now      = new Date().toLocaleDateString('en-PK', { day:'2-digit', month:'short', year:'numeric' });
    document.getElementById('printHeader').textContent =
        `Family Fee Balance Report — Month: ${monthStr}  |  Filter: ${status}  |  Printed: ${now}`;
    window.print();
}
