const db = window.supabaseClient;
const currentSchoolId = window.currentSchoolId || null;

const filterType = document.getElementById('filterType');
const monthField = document.getElementById('monthField');
const fromDateField = document.getElementById('fromDateField');
const toDateField = document.getElementById('toDateField');

const monthFilter = document.getElementById('monthFilter');
const fromDate = document.getElementById('fromDate');
const toDate = document.getElementById('toDate');

const fontSizeRange = document.getElementById('fontSizeRange');
const compactnessRange = document.getElementById('compactnessRange');
const fontSizeValue = document.getElementById('fontSizeValue');
const compactnessValue = document.getElementById('compactnessValue');
const printBtn = document.getElementById('printBtn');
const printDateHeader = document.getElementById('printDateHeader');
const loadBtn = document.getElementById('loadBtn');
const reportLogBody = document.getElementById('reportLogBody');
const rowCountEl = document.getElementById('rowCount');
const totalAmountEl = document.getElementById('totalAmount');

const LS_KEYS = {
    filterType: 'headWiseReport.filterType',
    month: 'headWiseReport.month',
    fromDate: 'headWiseReport.fromDate',
    toDate: 'headWiseReport.toDate',
    fontSize: 'headWiseReport.fontSize',
    compactness: 'headWiseReport.compactness'
};



function toCurrencyLabel(amount) {
    return `Rs ${Math.round(Number(amount) || 0).toLocaleString()}`;
}

function applyLayoutControls() {
    const font = parseFloat(fontSizeRange.value || '10');
    const compact = parseFloat(compactnessRange.value || '50');

    const tdVertical = Math.max(4, 12 - (compact * 0.08));
    const tdHorizontal = Math.max(6, 12 - (compact * 0.06));
    const thVertical = Math.max(4, 12 - (compact * 0.08));
    const thHorizontal = Math.max(6, 12 - (compact * 0.06));

    const printFont = Math.max(8, font - 1);
    const printTdVertical = Math.max(1.5, 5 - (compact * 0.035));
    const printTdHorizontal = Math.max(3, 7 - (compact * 0.04));
    const printThVertical = Math.max(1.5, 5 - (compact * 0.035));
    const printThHorizontal = Math.max(3, 7 - (compact * 0.04));

    document.documentElement.style.setProperty('--table-font-size', `${font}px`);
    document.documentElement.style.setProperty('--table-td-pad', `${tdVertical.toFixed(1)}px ${tdHorizontal.toFixed(1)}px`);
    document.documentElement.style.setProperty('--table-th-pad', `${thVertical.toFixed(1)}px ${thHorizontal.toFixed(1)}px`);

    document.documentElement.style.setProperty('--print-font-size', `${printFont.toFixed(1)}px`);
    document.documentElement.style.setProperty('--print-td-pad', `${printTdVertical.toFixed(1)}px ${printTdHorizontal.toFixed(1)}px`);
    document.documentElement.style.setProperty('--print-th-pad', `${printThVertical.toFixed(1)}px ${printThHorizontal.toFixed(1)}px`);

    fontSizeValue.textContent = `${font.toFixed(1)}px`;
    compactnessValue.textContent = `${Math.round(compact)}%`;
}

function updateUIForFilterType() {
    if (filterType.value === 'month') {
        monthField.style.display = 'block';
        fromDateField.style.display = 'none';
        toDateField.style.display = 'none';
    } else {
        monthField.style.display = 'none';
        fromDateField.style.display = 'block';
        toDateField.style.display = 'block';
    }
}

document.addEventListener('DOMContentLoaded', () => {
    // Init state
    const now = new Date();
    const currMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    const currDate = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;

    filterType.value = localStorage.getItem(LS_KEYS.filterType) || 'month';
    monthFilter.value = localStorage.getItem(LS_KEYS.month) || currMonth;
    fromDate.value = localStorage.getItem(LS_KEYS.fromDate) || currDate;
    toDate.value = localStorage.getItem(LS_KEYS.toDate) || currDate;
    fontSizeRange.value = localStorage.getItem(LS_KEYS.fontSize) || '10';
    compactnessRange.value = localStorage.getItem(LS_KEYS.compactness) || '50';

    updateUIForFilterType();
    applyLayoutControls();

    const waitAuth = setInterval(() => {
        if (window.authReady && window.supabaseClient) {
            clearInterval(waitAuth);
        }
    }, 100);

    // Event Listeners
    filterType.addEventListener('change', () => {
        localStorage.setItem(LS_KEYS.filterType, filterType.value);
        updateUIForFilterType();
    });
    monthFilter.addEventListener('change', () => localStorage.setItem(LS_KEYS.month, monthFilter.value));
    fromDate.addEventListener('change', () => localStorage.setItem(LS_KEYS.fromDate, fromDate.value));
    toDate.addEventListener('change', () => localStorage.setItem(LS_KEYS.toDate, toDate.value));

    fontSizeRange.addEventListener('input', applyLayoutControls);
    compactnessRange.addEventListener('input', applyLayoutControls);
    fontSizeRange.addEventListener('change', () => localStorage.setItem(LS_KEYS.fontSize, fontSizeRange.value));
    compactnessRange.addEventListener('change', () => localStorage.setItem(LS_KEYS.compactness, compactnessRange.value));

    loadBtn.addEventListener('click', loadReport);
    printBtn.addEventListener('click', () => {
        applyLayoutControls();
        window.print();
    });
});

async function loadReport() {
    let startIso, endIso, printTitle;

    if (filterType.value === 'month') {
        if (!monthFilter.value) return alert("Please select a month.");
        const [yy, mm] = monthFilter.value.split('-');
        const daysInMonth = new Date(parseInt(yy), parseInt(mm), 0).getDate();
        startIso = `${yy}-${mm}-01T00:00:00`;
        endIso   = `${yy}-${mm}-${String(daysInMonth).padStart(2,'0')}T23:59:59`;

        const d = new Date(parseInt(yy), parseInt(mm) - 1, 1);
        const monthName = d.toLocaleDateString('en-PK', { month: 'long', year: 'numeric' });
        printTitle = `Monthly Head Wise Collection — ${monthName}`;
    } else {
        if (!fromDate.value || !toDate.value) return alert("Please select both dates.");
        if (fromDate.value > toDate.value) return alert("From Date cannot be later than To Date.");
        startIso   = `${fromDate.value}T00:00:00`;
        endIso     = `${toDate.value}T23:59:59`;

        const fmt = v => new Date(v + 'T00:00:00').toLocaleDateString('en-PK', { day:'2-digit', month:'short', year:'numeric' });
        printTitle = `Head Wise Collection (${fmt(fromDate.value)} to ${fmt(toDate.value)})`;
    }

    loadBtn.disabled = true;
    loadBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Loading';
    reportLogBody.innerHTML = '<tr><td colspan="4" class="empty">Loading...</td></tr>';

    try {
        // ── Single query: join challans inline — no second HTTP call needed ──
        let q = db.from('transactions')
            .select('amount_paid, fee_details, challans(fee_type)')
            .gte('created_at', startIso)
            .lte('created_at', endIso);

        if (currentSchoolId) q = q.eq('school_id', currentSchoolId);

        const { data: txData, error: txErr } = await q;
        if (txErr) throw txErr;

        const transactions = txData || [];

        if (transactions.length === 0) {
            renderRows([], printTitle, 0, 0);
            return;
        }

        // ── Aggregate by fee head — pure JS, no extra network call ──
        const groups = {};
        let grandTotalCount = 0;
        let grandTotalAmount = 0;

        transactions.forEach(tx => {
            // challans is the joined object from Supabase FK relation
            let feeHead = tx.challans?.fee_type || null;

            if (!feeHead && tx.fee_details) {
                // Fallback: extract from "[Name (Roll)] Fee Type (Month)"
                const match = tx.fee_details.match(/\]\s+([^()\n]+)/);
                feeHead = match ? match[1].trim() : tx.fee_details.trim();
            }
            if (!feeHead) feeHead = 'Other / Unknown';

            if (!groups[feeHead]) {
                groups[feeHead] = { head: feeHead, count: 0, totalAmount: 0 };
            }
            const amt = Number(tx.amount_paid || 0);
            groups[feeHead].count++;
            groups[feeHead].totalAmount += amt;
            grandTotalCount++;
            grandTotalAmount += amt;
        });

        const resultsArray = Object.values(groups).sort((a, b) => b.totalAmount - a.totalAmount);
        renderRows(resultsArray, printTitle, grandTotalCount, grandTotalAmount);

    } catch (err) {
        console.error('Report load error:', err);
        reportLogBody.innerHTML = `<tr><td colspan="4" class="empty" style="color:#dc2626;">Failed to load data: ${err.message}</td></tr>`;
        rowCountEl.textContent = '0';
        totalAmountEl.textContent = 'Rs 0';
    } finally {
        loadBtn.disabled = false;
        loadBtn.innerHTML = '<i class="fas fa-sync"></i> Load Data';
    }
}

function renderRows(results, printTitle, totalCount, totalAmount) {
    if (results.length === 0) {
        reportLogBody.innerHTML = '<tr><td colspan="4" class="empty">No records found for the selected dates.</td></tr>';
        rowCountEl.textContent = '0';
        totalAmountEl.textContent = 'Rs 0';
        const timeLabel = new Date().toLocaleTimeString('en-PK', { hour: 'numeric', minute: '2-digit', hour12: true });
        printDateHeader.innerHTML = `<strong>${printTitle}</strong><br><span style="font-size:0.9em;font-weight:normal;">Printed on: ${new Date().toLocaleDateString('en-PK')} ${timeLabel} &nbsp;|&nbsp; Total: Rs 0</span>`;
        return;
    }

    let html = '';
    results.forEach((r, idx) => {
        html += `
            <tr>
                <td style="color:var(--muted);">${idx + 1}</td>
                <td><strong>${r.head}</strong></td>
                <td style="text-align: right;">${r.count.toLocaleString()}</td>
                <td style="text-align: right; color:#16a34a; font-weight:700;">Rs ${Math.round(r.totalAmount).toLocaleString()}</td>
            </tr>
        `;
    });

    // Grand total row
    html += `
        <tr class="grand-total">
            <td colspan="2"><strong>Grand Total</strong></td>
            <td style="text-align: right;"><strong>${totalCount.toLocaleString()}</strong></td>
            <td style="text-align: right;"><strong>Rs ${Math.round(totalAmount).toLocaleString()}</strong></td>
        </tr>
    `;

    reportLogBody.innerHTML = html;
    rowCountEl.textContent = totalCount.toLocaleString();
    totalAmountEl.textContent = toCurrencyLabel(totalAmount);
    
    const timeLabel = new Date().toLocaleTimeString('en-PK', { hour: 'numeric', minute: '2-digit', hour12: true });
    const printedDate = new Date().toLocaleDateString('en-PK', { day: '2-digit', month: 'short', year: 'numeric' });
    printDateHeader.innerHTML = `<strong>${printTitle}</strong><br><span style="font-size:0.85em;font-weight:normal;color:#444;">Printed: ${printedDate} at ${timeLabel} &nbsp;|&nbsp; Total Collected: ${toCurrencyLabel(totalAmount)} across ${totalCount.toLocaleString()} transaction(s)</span>`;
}
