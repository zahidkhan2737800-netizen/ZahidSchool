// Fee Default Report — Monthly unpaid fee from withdrawn students
// Mirrors fee_paid_log.js: font/compactness sliders, localStorage persistence, same print pattern

const MONTHS = [
    'January','February','March','April','May',
    'June','July','August','September','October','November','December'
];

const LS_KEYS = {
    fromMonth:    'feeDefault.fromMonth',
    fromYear:     'feeDefault.fromYear',
    toMonth:      'feeDefault.toMonth',
    toYear:       'feeDefault.toYear',
    fontSize:     'feeDefault.fontSize',
    compactness:  'feeDefault.compactness'
};

const fontSizeRange      = document.getElementById('fontSizeRange');
const compactnessRange   = document.getElementById('compactnessRange');
const fontSizeValue      = document.getElementById('fontSizeValue');
const compactnessValue   = document.getElementById('compactnessValue');
const loadBtn            = document.getElementById('loadBtn');
const printBtn           = document.getElementById('printBtn');
const defaultBody        = document.getElementById('defaultBody');
const printDateHeader    = document.getElementById('printDateHeader');
const summaryBar         = document.getElementById('summaryBar');

// ── Layout controls (mirrors fee_paid_log.js exactly) ──────────────────────────
function applyLayoutControls() {
    const font    = parseFloat(fontSizeRange.value   || '8.5');
    const compact = parseFloat(compactnessRange.value || '80');

    const tdVertical    = Math.max(2,   8  - (compact * 0.05));
    const tdHorizontal  = Math.max(4,   8  - (compact * 0.03));
    const thVertical    = Math.max(2.2, 9  - (compact * 0.055));
    const thHorizontal  = Math.max(4,   8  - (compact * 0.03));

    const printFont          = Math.max(7,   font - 0.5);
    const printTdVertical    = Math.max(0.9, 2.8 - (compact * 0.015));
    const printTdHorizontal  = Math.max(2.4, 4   - (compact * 0.013));
    const printThVertical    = Math.max(1.2, 3   - (compact * 0.016));
    const printThHorizontal  = Math.max(2.4, 4   - (compact * 0.013));

    document.documentElement.style.setProperty('--table-font-size', `${font}px`);
    document.documentElement.style.setProperty('--table-td-pad', `${tdVertical.toFixed(1)}px ${tdHorizontal.toFixed(1)}px`);
    document.documentElement.style.setProperty('--table-th-pad', `${thVertical.toFixed(1)}px ${thHorizontal.toFixed(1)}px`);
    document.documentElement.style.setProperty('--print-font-size', `${printFont.toFixed(1)}px`);
    document.documentElement.style.setProperty('--print-td-pad', `${printTdVertical.toFixed(1)}px ${printTdHorizontal.toFixed(1)}px`);
    document.documentElement.style.setProperty('--print-th-pad', `${printThVertical.toFixed(1)}px ${printThHorizontal.toFixed(1)}px`);

    fontSizeValue.textContent    = `${font.toFixed(1)}px`;
    compactnessValue.textContent = `${Math.round(compact)}%`;
}

// ── Populate month/year selects ────────────────────────────────────────────────
function populateSelects() {
    const now      = new Date();
    const curYear  = now.getFullYear();
    const curMonth = now.getMonth(); // 0-indexed

    const fromMonthEl = document.getElementById('fromMonth');
    const toMonthEl   = document.getElementById('toMonth');
    const fromYearEl  = document.getElementById('fromYear');
    const toYearEl    = document.getElementById('toYear');

    MONTHS.forEach((name, i) => {
        fromMonthEl.add(new Option(name, i));
        toMonthEl.add(new Option(name, i));
    });

    for (let y = curYear; y >= curYear - 5; y--) {
        fromYearEl.add(new Option(y, y));
        toYearEl.add(new Option(y, y));
    }

    // Restore from localStorage or default to current month
    fromMonthEl.value = localStorage.getItem(LS_KEYS.fromMonth) ?? curMonth;
    fromYearEl.value  = localStorage.getItem(LS_KEYS.fromYear)  ?? curYear;
    toMonthEl.value   = localStorage.getItem(LS_KEYS.toMonth)   ?? curMonth;
    toYearEl.value    = localStorage.getItem(LS_KEYS.toYear)    ?? curYear;
}

// ── Save filter state ──────────────────────────────────────────────────────────
function saveFilters() {
    localStorage.setItem(LS_KEYS.fromMonth, document.getElementById('fromMonth').value);
    localStorage.setItem(LS_KEYS.fromYear,  document.getElementById('fromYear').value);
    localStorage.setItem(LS_KEYS.toMonth,   document.getElementById('toMonth').value);
    localStorage.setItem(LS_KEYS.toYear,    document.getElementById('toYear').value);
}

// ── Build list of months in range ─────────────────────────────────────────────
function buildMonthRange(fromM, fromY, toM, toY) {
    const result = [];
    let y = fromY, m = fromM;
    const endKey = toY * 12 + toM;
    while (y * 12 + m <= endKey) {
        result.push({ month: m, year: y, label: `${MONTHS[m]} ${y}` });
        m++;
        if (m > 11) { m = 0; y++; }
    }
    return result;
}

// ── Currency formatter ─────────────────────────────────────────────────────────
const fmt = n => 'Rs ' + Math.round(n || 0).toLocaleString();

// ── Update print header ────────────────────────────────────────────────────────
function updatePrintHeader(rows) {
    if (!rows || !rows.length) {
        printDateHeader.textContent = '';
        return;
    }
    const now = new Date();
    const timeLabel = now.toLocaleTimeString('en-PK', { hour: 'numeric', minute: '2-digit', hour12: true });
    const dateLabel = now.toLocaleDateString('en-PK', { day: '2-digit', month: 'short', year: 'numeric' });
    const grandDefault = rows.reduce((s, r) => s + r.feeDefault, 0);
    printDateHeader.textContent =
        `Fee Default Report  |  ${rows[0].label} – ${rows[rows.length - 1].label}  |  Total Default: ${fmt(grandDefault)}  |  Printed: ${dateLabel} ${timeLabel}`;
}

// ── Main load ─────────────────────────────────────────────────────────────────
async function loadReport() {
    const fromM = parseInt(document.getElementById('fromMonth').value, 10);
    const fromY = parseInt(document.getElementById('fromYear').value,  10);
    const toM   = parseInt(document.getElementById('toMonth').value,   10);
    const toY   = parseInt(document.getElementById('toYear').value,    10);

    if (fromY * 12 + fromM > toY * 12 + toM) {
        alert('⚠️ "From" month cannot be after "To" month.');
        return;
    }

    saveFilters();

    loadBtn.disabled = true;
    loadBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Loading';
    defaultBody.innerHTML = '<tr><td colspan="4" class="empty"><i class="fas fa-spinner fa-spin"></i> Loading fee defaults…</td></tr>';
    summaryBar.style.display = 'none';

    const schoolId = window.currentSchoolId || null;
    const sc = q => schoolId ? q.eq('school_id', schoolId) : q;
    const months = buildMonthRange(fromM, fromY, toM, toY);
    const rows   = [];

    try {
        for (const { month, year, label } of months) {
            const firstDay   = `${year}-${String(month + 1).padStart(2, '0')}-01`;
            const lastDayObj = new Date(year, month + 1, 0);
            const lastDay    = `${year}-${String(month + 1).padStart(2, '0')}-${String(lastDayObj.getDate()).padStart(2, '0')}`;

            // Step A — withdrawn students this month
            const { data: withdrawnStudents, error: wErr } = await sc(
                window.supabaseClient
                    .from('admissions')
                    .select('id')
                    .eq('status', 'Withdrawn')
                    .gte('updated_at', firstDay + 'T00:00:00')
                    .lte('updated_at', lastDay  + 'T23:59:59')
            );
            if (wErr) throw wErr;

            const withdrawnCount = (withdrawnStudents || []).length;
            let feeDefault = 0;

            if (withdrawnCount > 0) {
                const ids = withdrawnStudents.map(s => s.id);

                // Step B — all outstanding challans for those students
                const { data: challans, error: cErr } = await sc(
                    window.supabaseClient
                        .from('challans')
                        .select('amount, paid_amount')
                        .in('student_id', ids)
                        .in('status', ['Unpaid', 'Partially Paid'])
                );
                if (cErr) throw cErr;

                (challans || []).forEach(c => {
                    const amt  = Number(c.amount)      || 0;
                    const paid = Number(c.paid_amount) || 0;
                    feeDefault += Math.max(0, amt - paid);
                });
            }

            rows.push({ label, withdrawnCount, feeDefault });
        }

        renderTable(rows);

    } catch (e) {
        console.error('Fee Default Report error:', e);
        defaultBody.innerHTML = `<tr><td colspan="6" class="empty" style="color:#dc2626;">Error loading data: ${e.message}</td></tr>`;
    } finally {
        loadBtn.disabled = false;
        loadBtn.innerHTML = '<i class="fas fa-sync"></i> Load';
    }
}

// ── Render table ───────────────────────────────────────────────────────────────
function renderTable(rows) {
    if (!rows.length) {
        defaultBody.innerHTML = '<tr><td colspan="6" class="empty">No months in selected range.</td></tr>';
        summaryBar.style.display = 'none';
        updatePrintHeader(null);
        return;
    }

    const totalWithdrawn = rows.reduce((s, r) => s + r.withdrawnCount, 0);
    const grandDefault   = rows.reduce((s, r) => s + r.feeDefault,     0);

    // Summary
    document.getElementById('sumMonths').textContent    = rows.length;
    document.getElementById('sumWithdrawn').textContent = totalWithdrawn;
    document.getElementById('sumDefault').textContent   = fmt(grandDefault);
    summaryBar.style.display = 'flex';

    // Table rows
    let html = '';
    rows.forEach((r, i) => {
        const defClass = r.feeDefault > 0 ? 'amount-default' : 'amount-zero';
        html += `
        <tr>
            <td>${i + 1}</td>
            <td><strong>${r.label}</strong></td>
            <td class="withdrawn-cnt">${r.withdrawnCount > 0 ? r.withdrawnCount : '—'}</td>
            <td class="right ${defClass}"><strong>${fmt(r.feeDefault)}</strong></td>
        </tr>`;
    });

    // Grand total
    html += `
    <tr class="row-total">
        <td colspan="2"><strong>TOTAL (${rows.length} month${rows.length > 1 ? 's' : ''})</strong></td>
        <td class="withdrawn-cnt"><strong>${totalWithdrawn}</strong></td>
        <td class="right amount-default"><strong>${fmt(grandDefault)}</strong></td>
    </tr>`;

    defaultBody.innerHTML = html;
    updatePrintHeader(rows);
}

// ── Boot ───────────────────────────────────────────────────────────────────────
window.onAppReady(() => {
    populateSelects();

    // Restore slider values from localStorage
    fontSizeRange.value    = localStorage.getItem(LS_KEYS.fontSize)    || '8.5';
    compactnessRange.value = localStorage.getItem(LS_KEYS.compactness) || '80';
    applyLayoutControls();

    // Wait for auth
    const waitAuth = setInterval(() => {
        if (window.authReady && window.supabaseClient) {
            clearInterval(waitAuth);
        }
    }, 100);

    // Button events
    loadBtn.addEventListener('click', loadReport);

    printBtn.addEventListener('click', () => {
        applyLayoutControls();
        window.print();
    });

    // Slider events (live preview + localStorage save)
    fontSizeRange.addEventListener('input',   applyLayoutControls);
    compactnessRange.addEventListener('input', applyLayoutControls);
    fontSizeRange.addEventListener('change',   () => localStorage.setItem(LS_KEYS.fontSize,    fontSizeRange.value));
    compactnessRange.addEventListener('change', () => localStorage.setItem(LS_KEYS.compactness, compactnessRange.value));
});
