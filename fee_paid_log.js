const db = window.supabaseClient;

let allRows = [];

const feeDateInput = document.getElementById('feeDate');
const searchTextInput = document.getElementById('searchText');
const fontSizeRange = document.getElementById('fontSizeRange');
const compactnessRange = document.getElementById('compactnessRange');
const fontSizeValue = document.getElementById('fontSizeValue');
const compactnessValue = document.getElementById('compactnessValue');
const printBtn = document.getElementById('printBtn');
const printDateHeader = document.getElementById('printDateHeader');
const loadBtn = document.getElementById('loadBtn');
const paidLogBody = document.getElementById('paidLogBody');
const rowCountEl = document.getElementById('rowCount');
const totalAmountEl = document.getElementById('totalAmount');
const totalDiscountEl = document.getElementById('totalDiscount');
const collectorSummaryEl = document.getElementById('collectorSummary');

const LS_KEYS = {
    date: 'feePaidLog.date',
    fontSize: 'feePaidLog.fontSize',
    compactness: 'feePaidLog.compactness'
};

function fmtDateOnly(dateObj) {
    const y = dateObj.getFullYear();
    const m = String(dateObj.getMonth() + 1).padStart(2, '0');
    const d = String(dateObj.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
}

function applySchoolScope(query) {
    const schoolId = window.currentSchoolId || null;
    return schoolId ? query.eq('school_id', schoolId) : query;
}

function to12Hour(dateString) {
    const d = new Date(dateString);
    return d.toLocaleTimeString('en-PK', {
        hour: 'numeric',
        minute: '2-digit',
        second: '2-digit',
        hour12: true
    });
}

function toDateLabel(dateString) {
    const d = new Date(dateString);
    return d.toLocaleDateString('en-PK', {
        day: '2-digit',
        month: 'short',
        year: 'numeric'
    });
}

function toCurrencyLabel(amount) {
    return `Rs ${Math.round(Number(amount) || 0).toLocaleString()}`;
}

function cleanCollectorName(value) {
    return String(value || '').trim().replace(/\s*\([^)]*\)\s*$/, '').trim();
}

function getDiscountAppliedBy(remarks) {
    const match = String(remarks || '').match(/(?:^|\|)\s*Applied by:\s*([^|]+?)\s*$/i);
    return cleanCollectorName(match ? match[1] : '');
}

function getFilteredRows() {
    const q = (searchTextInput.value || '').trim().toLowerCase();

    return allRows.filter(r => {
        return !q || (
            String(r.rollNo).toLowerCase().includes(q) ||
            String(r.studentName).toLowerCase().includes(q) ||
            String(r.fatherName).toLowerCase().includes(q) ||
            String(r.collectedBy).toLowerCase().includes(q)
        );
    });
}

function getCollectorTotals(rows) {
    const totals = new Map();
    rows.forEach(row => {
        // Discount-only records are not cash received by an accountant.
        if (Number(row.amount || 0) <= 0) return;
        const displayName = cleanCollectorName(row.collectedBy) || 'Unknown';
        const key = displayName.toLowerCase();
        const current = totals.get(key) || { name: displayName, amount: 0, rows: 0 };
        current.amount += Number(row.amount || 0);
        current.rows += 1;
        totals.set(key, current);
    });
    return [...totals.values()].sort((a, b) => b.amount - a.amount || a.name.localeCompare(b.name));
}

function getTotalDiscount(rows) {
    return rows.reduce((sum, row) => sum + Number(row.discountAmount || 0), 0);
}

function renderAmountCell(row) {
    const paid = Number(row.amount || 0);
    const discount = Number(row.discountAmount || 0);

    if (paid <= 0 && discount > 0) {
        return `<strong class="discount-amount">Rs ${Math.round(discount).toLocaleString()}</strong>
            <span class="amount-kind discount-kind">Discount</span>`;
    }

    return `<strong>Rs ${Math.round(paid).toLocaleString()}</strong>${discount > 0
        ? `<span class="amount-kind discount-kind">Discount: Rs ${Math.round(discount).toLocaleString()}</span>`
        : ''}`;
}

function renderCollectorSummary(rows) {
    const totals = getCollectorTotals(rows);
    collectorSummaryEl.replaceChildren();

    totals.forEach(collector => {
        const card = document.createElement('div');
        card.className = 'card collector-card';
        const label = document.createElement('span');
        label.className = 'lbl';
        label.textContent = `${collector.name} (${collector.rows} payment${collector.rows === 1 ? '' : 's'})`;
        const amount = document.createElement('strong');
        amount.textContent = toCurrencyLabel(collector.amount);
        card.append(label, amount);
        collectorSummaryEl.appendChild(card);
    });
}

function updatePrintHeader() {
    const selected = feeDateInput.value;
    if (!selected) {
        printDateHeader.textContent = 'Date:  | Time:  | Total Collected: Rs 0 | Total Discount: Rs 0';
        return;
    }

    const d = new Date(`${selected}T00:00:00`);
    const dateLabel = d.toLocaleDateString('en-PK', {
        day: '2-digit',
        month: 'short',
        year: 'numeric'
    });
    const timeLabel = new Date().toLocaleTimeString('en-PK', {
        hour: 'numeric',
        minute: '2-digit',
        second: '2-digit',
        hour12: true
    });
    const filteredRows = getFilteredRows();
    const total = filteredRows.reduce((sum, row) => sum + row.amount, 0);
    const totalDiscount = getTotalDiscount(filteredRows);
    const collectorText = getCollectorTotals(filteredRows)
        .map(collector => `${collector.name}: ${toCurrencyLabel(collector.amount)}`)
        .join(' | ');
    printDateHeader.textContent = `Date: ${dateLabel} | Time: ${timeLabel} | Total Collected: ${toCurrencyLabel(total)} | Total Discount: ${toCurrencyLabel(totalDiscount)}${collectorText ? ` | ${collectorText}` : ''}`;
}

function applyLayoutControls() {
    const font = parseFloat(fontSizeRange.value || '8.5');
    const compact = parseFloat(compactnessRange.value || '80');

    const tdVertical = Math.max(2, 8 - (compact * 0.05));
    const tdHorizontal = Math.max(4, 8 - (compact * 0.03));
    const thVertical = Math.max(2.2, 9 - (compact * 0.055));
    const thHorizontal = Math.max(4, 8 - (compact * 0.03));

    const printFont = Math.max(7, font - 0.5);
    const printTdVertical = Math.max(0.9, 2.8 - (compact * 0.015));
    const printTdHorizontal = Math.max(2.4, 4 - (compact * 0.013));
    const printThVertical = Math.max(1.2, 3 - (compact * 0.016));
    const printThHorizontal = Math.max(2.4, 4 - (compact * 0.013));

    document.documentElement.style.setProperty('--table-font-size', `${font}px`);
    document.documentElement.style.setProperty('--table-td-pad', `${tdVertical.toFixed(1)}px ${tdHorizontal.toFixed(1)}px`);
    document.documentElement.style.setProperty('--table-th-pad', `${thVertical.toFixed(1)}px ${thHorizontal.toFixed(1)}px`);

    document.documentElement.style.setProperty('--print-font-size', `${printFont.toFixed(1)}px`);
    document.documentElement.style.setProperty('--print-td-pad', `${printTdVertical.toFixed(1)}px ${printTdHorizontal.toFixed(1)}px`);
    document.documentElement.style.setProperty('--print-th-pad', `${printThVertical.toFixed(1)}px ${printThHorizontal.toFixed(1)}px`);

    fontSizeValue.textContent = `${font.toFixed(1)}px`;
    compactnessValue.textContent = `${Math.round(compact)}%`;
}

document.addEventListener('DOMContentLoaded', () => {
    const today = fmtDateOnly(new Date());
    feeDateInput.value = localStorage.getItem(LS_KEYS.date) || today;
    fontSizeRange.value = localStorage.getItem(LS_KEYS.fontSize) || '8.5';
    compactnessRange.value = localStorage.getItem(LS_KEYS.compactness) || '80';
    updatePrintHeader();
    applyLayoutControls();

    const waitAuth = setInterval(() => {
        if (window.authReady && window.supabaseClient) {
            clearInterval(waitAuth);
            loadPaidFees();
        }
    }, 100);

    loadBtn.addEventListener('click', loadPaidFees);
    searchTextInput.addEventListener('input', renderRows);
    fontSizeRange.addEventListener('input', applyLayoutControls);
    compactnessRange.addEventListener('input', applyLayoutControls);
    fontSizeRange.addEventListener('change', () => localStorage.setItem(LS_KEYS.fontSize, fontSizeRange.value));
    compactnessRange.addEventListener('change', () => localStorage.setItem(LS_KEYS.compactness, compactnessRange.value));

    printBtn.addEventListener('click', () => {
        applyLayoutControls();
        updatePrintHeader();
        window.print();
    });

    feeDateInput.addEventListener('change', () => {
        localStorage.setItem(LS_KEYS.date, feeDateInput.value);
        updatePrintHeader();
        loadPaidFees();
    });
});

async function loadPaidFees() {
    const selected = feeDateInput.value;
    if (!selected) return;

    loadBtn.disabled = true;
    loadBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Loading';
    paidLogBody.innerHTML = '<tr><td colspan="9" class="empty">Loading paid fee records...</td></tr>';

    try {
        const startDate = `${selected}T00:00:00`;
        const endObj = new Date(`${selected}T00:00:00`);
        endObj.setDate(endObj.getDate() + 1);
        const endDate = `${fmtDateOnly(endObj)}T00:00:00`;

        const { data: txData, error: txErr } = await applySchoolScope(
            db.from('transactions')
                .select('student_id, roll_number, challan_id, receipt_number, payment_reference, fee_details, amount_paid, discount_amount, payment_method, remarks, collected_by, collected_by_user_id, created_at')
                .gte('created_at', startDate)
                .lt('created_at', endDate)
                .order('created_at', { ascending: false })
        );

        if (txErr) throw txErr;

        const transactions = txData || [];
        if (transactions.length === 0) {
            allRows = [];
            renderRows();
            return;
        }

        const studentIds = [...new Set(transactions.map(x => x.student_id).filter(Boolean))];
        const challanIds = [...new Set(transactions.map(x => x.challan_id).filter(Boolean))];

        let admissionsMap = new Map();
        let challansMap = new Map();
        let receiptByNumber = new Map();
        let receiptByReferenceAndStudent = new Map();

        if (studentIds.length > 0) {
            const { data: stuData, error: stuErr } = await applySchoolScope(
                db.from('admissions')
                    .select('id, full_name, father_name, applying_for_class, roll_number')
                    .in('id', studentIds)
            );
            if (stuErr) throw stuErr;
            admissionsMap = new Map((stuData || []).map(s => [s.id, s]));
        }

        if (challanIds.length > 0) {
            const { data: chData, error: chErr } = await applySchoolScope(
                db.from('challans')
                    .select('id, fee_type, fee_month')
                    .in('id', challanIds)
            );
            if (chErr) throw chErr;
            challansMap = new Map((chData || []).map(c => [c.id, c]));
        }

        if (studentIds.length > 0) {
            const { data: receiptData, error: receiptErr } = await applySchoolScope(
                db.from('receipts')
                    .select('receipt_number, student_id, payment_reference, collected_by, collected_by_user_id, created_at')
                    .in('student_id', studentIds)
                    .gte('created_at', startDate)
                    .lt('created_at', endDate)
                    .order('created_at', { ascending: false })
            );

            if (receiptErr) throw receiptErr;

            (receiptData || []).forEach(receipt => {
                const receiptNumber = String(receipt.receipt_number || '').trim();
                const reference = String(receipt.payment_reference || '').trim();
                const studentId = String(receipt.student_id || '');

                if (receiptNumber && !receiptByNumber.has(receiptNumber)) {
                    receiptByNumber.set(receiptNumber, receipt);
                }
                if (reference && studentId) {
                    const key = `${reference}::${studentId}`;
                    if (!receiptByReferenceAndStudent.has(key)) {
                        receiptByReferenceAndStudent.set(key, receipt);
                    }
                }
            });
        }

        allRows = transactions.map(tx => {
            const stu = admissionsMap.get(tx.student_id) || {};
            const ch = challansMap.get(tx.challan_id) || {};

            const txReference = String(tx.payment_reference || '').trim();
            const txStudentId = String(tx.student_id || '');
            const txReceiptNumber = String(tx.receipt_number || '').trim();
            const baseReceiptNumber = txReceiptNumber.startsWith('RCT-')
                ? txReceiptNumber.replace(/-\d+$/, '')
                : txReceiptNumber;

            const savedReceipt = txReceiptNumber.startsWith('RCT-')
                ? (receiptByNumber.get(baseReceiptNumber) || receiptByNumber.get(txReceiptNumber) || null)
                : (receiptByReferenceAndStudent.get(`${txReference}::${txStudentId}`) || receiptByNumber.get(txReceiptNumber) || null);

            const feeHead = ch.fee_type
                ? `${ch.fee_type}${ch.fee_month ? ` (${ch.fee_month})` : ''}`
                : (tx.fee_details || 'N/A');

            return {
                dateText: toDateLabel(tx.created_at),
                timeText: to12Hour(tx.created_at),
                rollNo: tx.roll_number || stu.roll_number || 'N/A',
                studentName: stu.full_name || 'N/A',
                fatherName: stu.father_name || 'N/A',
                className: stu.applying_for_class || 'N/A',
                feeHead,
                paymentType: tx.payment_method || 'N/A',
                collectedBy: cleanCollectorName(tx.collected_by) || cleanCollectorName(savedReceipt?.collected_by) || getDiscountAppliedBy(tx.remarks) || '—',
                amount: Number(tx.amount_paid || 0),
                discountAmount: Number(tx.discount_amount || 0)
            };
        });

        renderRows();
    } catch (err) {
        console.error('Paid fee log load error:', err);
        paidLogBody.innerHTML = `<tr><td colspan="9" class="empty" style="color:#dc2626;">Failed to load data: ${err.message}</td></tr>`;
        rowCountEl.textContent = '0';
        totalAmountEl.textContent = 'Rs 0';
        totalDiscountEl.textContent = 'Rs 0';
        renderCollectorSummary([]);
    } finally {
        loadBtn.disabled = false;
        loadBtn.innerHTML = '<i class="fas fa-sync"></i> Load';
    }
}

function renderRows() {
    const filtered = getFilteredRows();

    if (filtered.length === 0) {
        paidLogBody.innerHTML = '<tr><td colspan="9" class="empty">No paid fee records found for this filter.</td></tr>';
        rowCountEl.textContent = '0';
        totalAmountEl.textContent = 'Rs 0';
        totalDiscountEl.textContent = 'Rs 0';
        renderCollectorSummary([]);
        updatePrintHeader();
        return;
    }

    const total = filtered.reduce((sum, row) => sum + row.amount, 0);

    paidLogBody.innerHTML = filtered.map(row => `
        <tr>
            <td>${row.dateText}</td>
            <td>${row.timeText}</td>
            <td class="mono">${row.rollNo}</td>
            <td>${row.studentName}</td>
            <td>${row.className}</td>
            <td>${row.feeHead}</td>
            <td>${row.paymentType}</td>
            <td><strong>${row.collectedBy}</strong></td>
            <td class="amount-cell">${renderAmountCell(row)}</td>
        </tr>
    `).join('');

    rowCountEl.textContent = filtered.length.toLocaleString();
    totalAmountEl.textContent = toCurrencyLabel(total);
    totalDiscountEl.textContent = toCurrencyLabel(getTotalDiscount(filtered));
    renderCollectorSummary(filtered);
    updatePrintHeader();
}
