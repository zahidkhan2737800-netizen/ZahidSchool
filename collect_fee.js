// Supabase client is now provided by auth.js (supabaseClient)
const db = supabaseClient;
const getCurrentSchoolId = () => window.currentSchoolId || null;
const applySchoolScope = (query) => getCurrentSchoolId() ? query.eq('school_id', getCurrentSchoolId()) : query;

async function waitForFeeAuth(timeoutMs = 10000) {
    const started = Date.now();
    while (Date.now() - started < timeoutMs) {
        if (window.authReady === true && window.supabaseClient) return;
        await new Promise(resolve => setTimeout(resolve, 80));
    }
}

// ─── State ────────────────────────────────────────────────────────────────────
let allStudents   = [];   // full admissions cache
let activeStudent = null; // currently opened student object
let pendingDues   = [];   // challans for active student
let selectedIds   = new Set();
let grandTotal    = 0;
let receiptCache  = [];   // saved receipts for current student (for reprint)

function cleanCollectorName(value) {
    return String(value || '').trim().replace(/\s*\([^)]*\)\s*$/, '').trim();
}

// ─── DOM Refs ─────────────────────────────────────────────────────────────────
const studentSearch = document.getElementById('studentSearch');
const searchStatus = document.getElementById('searchStatus');

const studentListSection = document.getElementById('studentListSection');
const studentList        = document.getElementById('studentList');
const resultCount        = document.getElementById('resultCount');
const workspace          = document.getElementById('workspace');
const btnCloseWorkspace  = document.getElementById('btnCloseWorkspace');

// Workspace DOM
const wsAvatar      = document.getElementById('wsAvatar');
const wsName        = document.getElementById('wsName');
const wsRoll        = document.getElementById('wsRoll');
const wsClass       = document.getElementById('wsClass');
const wsFather      = document.getElementById('wsFather');
const wsContact     = document.getElementById('wsContact');
const wsTotalFee    = document.getElementById('wsTotalFee');
const wsStatusBadge = document.getElementById('wsStatusBadge');
const btnPartial    = document.getElementById('btnPartial');
const btnPayAll     = document.getElementById('btnPayAll');
const btnToggleHistory = document.getElementById('btnToggleHistory');
const historyPanel  = document.getElementById('historyPanel');

const historyBody  = document.getElementById('historyBody');
const challansList = document.getElementById('challansList');

const inputFine     = document.getElementById('inputFine');
const inputDiscount = document.getElementById('inputDiscount');
const btnApplyDiscount = document.getElementById('btnApplyDiscount');
const inputPaying   = document.getElementById('inputPaying');
const inputMethod   = document.getElementById('inputMethod');
const inputRef      = document.getElementById('inputRef');
const refGroup      = document.getElementById('refGroup');
const inputRemarks  = document.getElementById('inputRemarks');
const sumSubtotal   = document.getElementById('sumSubtotal');
const sumGrandTotal = document.getElementById('sumGrandTotal');
const sumRemaining  = document.getElementById('sumRemaining');
const btnSubmit     = document.getElementById('btnSubmit');
const btnReprint    = document.getElementById('btnReprint');
const btnBill       = document.getElementById('btnBill');
const checkoutAlert = document.getElementById('checkoutAlert');
const workspaceDialog = document.querySelector('.workspace-dialog');

function applyThermalSettings(moduleName) {
    const printArea = document.getElementById('printArea');
    if (!printArea) return;

    const defaults = {
        pageMarginMm: 3,
        printPadTopMm: 4,
        printPadRightMm: 3,
        printPadBottomMm: 4,
        printPadLeftMm: 3,
        maxWidthPx: 320,
        baseFontPx: 14,
        lineHeight: 1.45,
        receiptPadY: 10,
        receiptPadX: 8,
        schoolFontPx: 20,
        phoneFontPx: 12,
        dateFontPx: 11,
        rowFontPx: 14,
        feeRowFontPx: 14,
        totalFontPx: 16,
        remainFontPx: 14,
        footerFontPx: 11
    };

    let settings = { ...defaults };
    try {
        const raw = localStorage.getItem('thermal_print_settings_v1');
        const parsed = raw ? JSON.parse(raw) : {};
        if (parsed && parsed[moduleName] && typeof parsed[moduleName] === 'object') {
            settings = { ...settings, ...parsed[moduleName] };
        }
    } catch (_) {
        settings = { ...defaults };
    }

    const root = document.documentElement;
    root.style.setProperty('--tp-page-margin', `${settings.pageMarginMm}mm`);
    root.style.setProperty('--tp-print-pad-top', `${settings.printPadTopMm}mm`);
    root.style.setProperty('--tp-print-pad-right', `${settings.printPadRightMm}mm`);
    root.style.setProperty('--tp-print-pad-bottom', `${settings.printPadBottomMm}mm`);
    root.style.setProperty('--tp-print-pad-left', `${settings.printPadLeftMm}mm`);
    root.style.setProperty('--tp-max-width', `${settings.maxWidthPx}px`);
    root.style.setProperty('--tp-font-size', `${settings.baseFontPx}px`);
    root.style.setProperty('--tp-line-height', String(settings.lineHeight));
    root.style.setProperty('--tp-receipt-pad-y', `${settings.receiptPadY}px`);
    root.style.setProperty('--tp-receipt-pad-x', `${settings.receiptPadX}px`);
    root.style.setProperty('--tp-school-font', `${settings.schoolFontPx}px`);
    root.style.setProperty('--tp-phone-font', `${settings.phoneFontPx}px`);
    root.style.setProperty('--tp-date-font', `${settings.dateFontPx}px`);
    root.style.setProperty('--tp-row-font', `${settings.rowFontPx}px`);
    root.style.setProperty('--tp-fee-row-font', `${settings.feeRowFontPx}px`);
    root.style.setProperty('--tp-total-font', `${settings.totalFontPx}px`);
    root.style.setProperty('--tp-remain-font', `${settings.remainFontPx}px`);
    root.style.setProperty('--tp-footer-font', `${settings.footerFontPx}px`);
}

function closeWorkspace() {
    workspace.classList.remove('is-open', 'workspace-pop');
    workspace.setAttribute('aria-hidden', 'true');
    document.body.classList.remove('workspace-open');
}

// ─── Boot ─────────────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', async () => {
    await waitForFeeAuth();
    await loadStudents();

    if (btnCloseWorkspace) {
        btnCloseWorkspace.addEventListener('click', closeWorkspace);
    }

    workspace.addEventListener('click', (e) => {
        if (e.target === workspace) closeWorkspace();
    });

    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && workspace.classList.contains('is-open')) {
            closeWorkspace();
        }
    });

    // Wire filters — debounced
    let debTimer;
    studentSearch.addEventListener('input', () => {
        clearTimeout(debTimer);
        debTimer = setTimeout(renderStudentList, 250);
    });

    inputMethod.addEventListener('change', () => {
        refGroup.style.display = inputMethod.value !== 'Cash' ? 'block' : 'none';
    });

    [inputFine, inputDiscount, inputPaying].forEach(el => {
        el.addEventListener('input', recalcCart);
        // Keep wheel scrolling available without letting a focused number input
        // silently increase or decrease its value.
        el.addEventListener('wheel', () => {
            if (document.activeElement === el) el.blur();
        }, { passive: true });

        // Do not start middle-button auto-scroll from an amount field.
        el.addEventListener('mousedown', event => {
            if (event.button === 1) event.preventDefault();
        });
    });

    btnApplyDiscount.addEventListener('click', applyDiscountToSelectedChallans);

    btnToggleHistory.addEventListener('click', () => {
        if(historyPanel.style.display === 'none') {
            historyPanel.style.display = 'block';
            btnToggleHistory.textContent = '📜 Hide History';
        } else {
            historyPanel.style.display = 'none';
            btnToggleHistory.textContent = '📜 History';
        }
    });

    btnReprint.addEventListener('click', () => {
        if (receiptCache.length === 0) return;
        reprintFromHistory(receiptCache[0]); // Reprint the most recent receipt
    });
    
    btnBill.addEventListener('click', printBill);

    btnPayAll.addEventListener('click', () => {
        if (pendingDues.length === 0) return;
        
        // Auto-select all pending dues
        pendingDues.forEach(c => selectedIds.add(c.id));
        document.querySelectorAll('.challan-item input[type="checkbox"]').forEach(cb => {
            cb.checked = true;
            cb.closest('.challan-item').classList.add('selected');
        });
        
        recalcCart();
        
        // Grab mathematically secure total and autofill payment
        inputPaying.value = grandTotal;
        recalcCart(); // Recalc remaining explicitly

        // Draw attention to checkout
        inputPaying.style.transition = 'background 0.3s';
        inputPaying.style.background = '#d1fae5';
        setTimeout(() => inputPaying.style.background = 'white', 600);
        
        const checkoutPanel = document.getElementById('checkoutPanel');
        if (checkoutPanel) checkoutPanel.scrollIntoView({ behavior: 'smooth', block: 'center' });
    });

    btnPartial.addEventListener('click', () => {
        if (pendingDues.length === 0) return;
        
        // Auto-select all pending dues
        pendingDues.forEach(c => selectedIds.add(c.id));
        document.querySelectorAll('.challan-item input[type="checkbox"]').forEach(cb => {
            cb.checked = true;
            cb.closest('.challan-item').classList.add('selected');
        });
        
        // Recalculate explicitly
        recalcCart();
        
        // CLEAR input to require manual partial entry
        inputPaying.value = '';
        recalcCart(); 

        // Draw attention to checkout
        inputPaying.style.transition = 'background 0.3s';
        inputPaying.style.background = '#fef3c7'; // yellow flash
        setTimeout(() => inputPaying.style.background = 'white', 800);
        
        const checkoutPanel = document.getElementById('checkoutPanel');
        if (checkoutPanel) checkoutPanel.scrollIntoView({ behavior: 'smooth', block: 'center' });
        inputPaying.focus(); // Drop the cursor straight into the box automatically!
    });

    btnSubmit.addEventListener('click', submitPayment);

    // Pre-fill from URL param (when coming from create_challan)
    const roll = new URLSearchParams(location.search).get('roll');
    if (roll) { studentSearch.value = roll; renderStudentList(); }
});

// ─── Load all active students once ───────────────────────────────────────────
async function loadStudents() {
    searchStatus.textContent = '⏳ Loading student database...';
    try {
        const { data, error } = await applySchoolScope(db
            .from('admissions')
            .select('id, roll_number, full_name, father_name, father_mobile, applying_for_class, status')
            .order('roll_number'));
        if (error) throw error;
        allStudents = data || [];
        searchStatus.textContent = `✅ ${allStudents.length} students loaded. Use the search box above to find students.`;
        studentListSection.style.display = 'block';
        renderStudentList();
    } catch (e) {
        searchStatus.textContent = '❌ Failed to load students: ' + e.message;
    }
}

// ─── Filter & render student cards ───────────────────────────────────────────
function renderStudentList() {
    const query = studentSearch.value.trim().toLowerCase();

    const filtered = allStudents.filter(s => {
        if (!query) return true;

        const nameMatch = (s.full_name || '').toLowerCase().includes(query);
        const fatherMatch = (s.father_name || '').toLowerCase().includes(query);
        const rollMatch = String(s.roll_number || '').trim().toLowerCase() === query;

        return rollMatch || nameMatch || fatherMatch;
    });

    resultCount.textContent = filtered.length;
    studentList.innerHTML = '';

    if (filtered.length === 0) {
        studentList.innerHTML = '<p style="color:#94a3b8; text-align:center; padding:1rem;">No students match your search.</p>';
        return;
    }

    filtered.forEach(s => {
        const isActive = activeStudent && activeStudent.id === s.id;
        const statusClass = s.status === 'Active' ? 'badge-active' : s.status === 'Pending' ? 'badge-pending' : 'badge-withdrawn';
        const card = document.createElement('div');
        card.className = 'student-card' + (isActive ? ' active-card' : '');
        card.innerHTML = `
            <div class="stu-avatar">${(s.full_name || '?').charAt(0).toUpperCase()}</div>
            <div class="stu-info">
                <strong>${s.full_name}</strong>
                <span>Roll: ${s.roll_number} &nbsp;|&nbsp; Class: ${s.applying_for_class} &nbsp;|&nbsp; Father: ${s.father_name || 'N/A'}</span>
            </div>
            <span class="stu-badge ${statusClass}">${(s.status || 'N/A').toUpperCase()}</span>
            <button class="open-btn ${isActive ? 'active-open' : ''}" data-id="${s.id}">
                ${isActive ? '✔ Opened' : 'Open'}
            </button>
        `;
        card.querySelector('.open-btn').addEventListener('click', () => openStudent(s));
        studentList.appendChild(card);
    });
}

// ─── Open Student Workspace ───────────────────────────────────────────────────
async function openStudent(student) {
    activeStudent = student;
    selectedIds.clear();
    receiptCache = [];

    // Update profile strip
    wsAvatar.textContent = student.full_name.charAt(0).toUpperCase();
    wsName.textContent   = student.full_name;
    wsRoll.textContent   = student.roll_number;
    wsClass.textContent  = student.applying_for_class;
    wsFather.textContent = student.father_name  || 'N/A';
    wsContact.textContent= student.father_mobile || 'N/A';
    wsTotalFee.textContent = 'Rs 0';

    const statusClass = student.status === 'Active' ? 'badge-active' : student.status === 'Pending' ? 'badge-pending' : 'badge-withdrawn';
    wsStatusBadge.className = `stu-badge ${statusClass}`;
    wsStatusBadge.textContent = (student.status || 'N/A').toUpperCase();

    // Reset checkout
    inputFine.value = '0';
    inputDiscount.value = '0';
    inputPaying.value = '';
    historyPanel.style.display = 'none';
    btnToggleHistory.textContent = '📜 History';
    btnReprint.style.display = 'none';
    btnBill.style.display = 'none';
    recalcCart();

    workspace.classList.remove('workspace-pop');
    if (workspaceDialog) {
        void workspaceDialog.offsetWidth;
    }
    workspace.classList.add('is-open');
    workspace.classList.add('workspace-pop');
    workspace.setAttribute('aria-hidden', 'false');
    document.body.classList.add('workspace-open');
    setTimeout(() => workspace.classList.remove('workspace-pop'), 550);

    // Re-render cards to show active state
    renderStudentList();

    // Fetch data
    await Promise.all([
        loadHistory(student.id),
        loadDues(student.id)
    ]);
}

// ─── Load Payment History (from receipts table) ───────────────────────────────
async function loadHistory(uuid) {
    historyBody.innerHTML = '<tr><td colspan="7" style="text-align:center; color:#94a3b8;">Loading...</td></tr>';
    try {
        const { data, error } = await applySchoolScope(db
            .from('receipts')
            .select('*')
            .eq('student_id', uuid)
            .order('created_at', { ascending: false }));
        if (error) throw error;

        receiptCache = data || [];

        if (receiptCache.length > 0) {
            btnReprint.style.display = 'inline-block';
        }

        if (!data || data.length === 0) {
            historyBody.innerHTML = '<tr><td colspan="7" style="text-align:center; color:#b0b8c1;">No payment receipts found.</td></tr>';
            return;
        }

        historyBody.innerHTML = data.map((r, idx) => {
            const dateStr = new Date(r.created_at).toLocaleDateString('en-PK', { timeZone: 'Asia/Karachi' });
            return `
            <tr>
                <td>
                    ${dateStr}
                    <button onclick="window.printDaySummaryForReceipt(${idx})" style="margin-left:5px; font-size:0.75rem; background:#f8fafc; border:1px solid #cbd5e1; border-radius:4px; padding:2px 4px; cursor:pointer; color:#334155;" title="Print this collector's combined summary for this day">📅</button>
                </td>
                <td style="font-family:monospace; font-weight:600; font-size:0.82rem;">${r.receipt_number}</td>
                <td style="color:#16a34a; font-weight:700;">Rs ${Number(r.total_paid).toLocaleString()}</td>
                <td style="color:${r.remaining > 0 ? '#ef4444' : '#16a34a'}; font-weight:700;">Rs ${Number(r.remaining).toLocaleString()}</td>
                <td>${r.payment_method}</td>
                <td style="color:#94a3b8; font-size:0.82rem;">${r.remarks || '—'}</td>
                <td><button class="print-row-btn" onclick="reprintFromHistory(receiptCache[${idx}])">🖨️</button></td>
            </tr>
            `;
        }).join('');
    } catch (e) {
        historyBody.innerHTML = `<tr><td colspan="7" style="color:red; text-align:center;">Error loading history: ${e.message}</td></tr>`;
    }
}

// ─── Reprint a Saved Receipt ──────────────────────────────────────────────────
function reprintFromHistory(receipt) {
    applyThermalSettings('collect_fee');
    document.getElementById('rctNo').textContent        = receipt.receipt_number;
    document.getElementById('rctDate').textContent      = new Date(receipt.created_at).toLocaleString('en-PK', { timeZone: 'Asia/Karachi' });
    const collectorName = cleanCollectorName(receipt.collected_by);
    document.getElementById('rctUser').textContent     = collectorName ? `User: ${collectorName}` : '';
    document.getElementById('rctName').textContent      = receipt.student_name;
    document.getElementById('rctRoll').textContent      = receipt.roll_number;
    document.getElementById('rctFather').textContent    = receipt.father_name || 'N/A';
    document.getElementById('rctClass').textContent     = receipt.class_name;
    document.getElementById('rctTotal').textContent     = Number(receipt.total_paid).toLocaleString();
    document.getElementById('rctRemaining').textContent = Number(receipt.remaining).toLocaleString();
    
    // Ensure visibility
    document.getElementById('rowReceiptNo').style.display = 'flex';
    document.getElementById('rowTotalPaid').style.display = 'flex';
    document.getElementById('rctFooter').textContent = 'Thank you! — Zahid School System';
    
    // Method, Ref, Remarks removed from receipt layout

    const lines = Array.isArray(receipt.fee_lines) ? receipt.fee_lines : [];
    document.getElementById('rctBody').innerHTML = lines.map(line => `
        <div class="th-fee-row">
            <span class="th-fee-desc">${line.desc}</span>
            <span class="th-fee-amt">Rs ${Number(line.amount).toLocaleString()}</span>
        </div>
    `).join('');

    // Delay so browser fully renders receipt DOM before print dialog opens
    setTimeout(() => window.print(), 350);
}

// ─── Print Daily Combined Summary ─────────────────────────────────────────────
window.printDaySummaryForReceipt = function(receiptIndex) {
    const sourceReceipt = receiptCache[receiptIndex];
    if (!sourceReceipt) return;

    const dateStr = new Date(sourceReceipt.created_at).toLocaleDateString('en-PK', { timeZone: 'Asia/Karachi' });
    window.printDaySummary(dateStr, sourceReceipt.collected_by || '');
};

window.printDaySummary = function(dateStr, collectorKey = '') {
    if (!receiptCache || receiptCache.length === 0) return;

    const dayReceipts = receiptCache.filter(r =>
        new Date(r.created_at).toLocaleDateString('en-PK', { timeZone: 'Asia/Karachi' }) === dateStr &&
        String(r.collected_by || '').trim() === String(collectorKey || '').trim()
    );
    if (dayReceipts.length === 0) return;
    
    const sorted = [...dayReceipts].sort((a,b) => new Date(a.created_at) - new Date(b.created_at));
    
    let combinedTotal = 0;
    let allLines = [];
    
    sorted.forEach(r => {
        combinedTotal += parseFloat(r.total_paid || 0);
        allLines.push(...(Array.isArray(r.fee_lines) ? r.fee_lines : []));
    });
    
    let studentRemaining = 0;
    if (typeof pendingDues !== 'undefined' && Array.isArray(pendingDues)) {
        pendingDues.forEach(c => {
            studentRemaining += parseFloat(c.amount) - parseFloat(c.paid_amount || 0);
        });
    } else {
        studentRemaining = sorted[sorted.length - 1].remaining;
    }

    const firstReceipt = sorted[0];

    applyThermalSettings('collect_fee');
    document.getElementById('rctNo').textContent        = `DAY-${dateStr.replace(/\//g, '')}`;
    document.getElementById('rctDate').textContent      = `${dateStr} (Combined Summary)`;
    const collectorName = cleanCollectorName(firstReceipt.collected_by);
    document.getElementById('rctUser').textContent     = collectorName ? `User: ${collectorName}` : '';
    document.getElementById('rctName').textContent      = firstReceipt.student_name;
    document.getElementById('rctRoll').textContent      = firstReceipt.roll_number;
    document.getElementById('rctFather').textContent    = firstReceipt.father_name || 'N/A';
    document.getElementById('rctClass').textContent     = firstReceipt.class_name;
    document.getElementById('rctTotal').textContent     = Number(combinedTotal).toLocaleString();
    document.getElementById('rctRemaining').textContent = Number(studentRemaining).toLocaleString();

    document.getElementById('rowReceiptNo').style.display = 'flex';
    document.getElementById('rowTotalPaid').style.display = 'flex';
    document.getElementById('rctFooter').textContent = 'Thank you! — Zahid School System';

    document.getElementById('rctBody').innerHTML = allLines.map(line => `
        <div class="th-fee-row">
            <span class="th-fee-desc">${line.desc}</span>
            <span class="th-fee-amt">Rs ${Number(line.amount).toLocaleString()}</span>
        </div>
    `).join('');

    setTimeout(() => window.print(), 350);
};

// ─── Load Pending Dues ────────────────────────────────────────────────────────
async function loadDues(uuid) {
    challansList.innerHTML = '<p style="color:#94a3b8;">Loading pending dues...</p>';
    selectedIds.clear();
    try {
        const { data, error } = await applySchoolScope(db
            .from('challans')
            .select('*')
            .eq('student_id', uuid)
            .in('status', ['Unpaid', 'Partially Paid'])
            .order('due_date', { ascending: true }));
        if (error) throw error;

        pendingDues = data || [];
        const totalFeeDue = pendingDues.reduce((sum, c) => {
            const amount = parseFloat(c.amount || 0);
            const paid = parseFloat(c.paid_amount || 0);
            return sum + Math.max(0, amount - paid);
        }, 0);
        wsTotalFee.textContent = `Rs ${totalFeeDue.toLocaleString()}`;

        if (pendingDues.length === 0) {
            btnPayAll.style.display = 'none';
            btnPartial.style.display = 'none';
            btnBill.style.display = 'none';
            challansList.innerHTML = `
                <div style="text-align:center; padding:2rem; background:#f0fdf4; border-radius:12px;">
                    <span style="font-size:2.5rem;">🎉</span>
                    <p style="color:#16a34a; font-weight:700; margin:0.5rem 0 0 0;">No Pending Dues!</p>
                    <small style="color:#64748b;">This student has no outstanding challans.</small>
                </div>`;
            recalcCart();
            return;
        }

        btnPayAll.style.display = 'block';
        btnPartial.style.display = 'block';
        btnBill.style.display = 'inline-block';
        renderDues();
    } catch (e) {
        challansList.innerHTML = `<p style="color:red;">Error loading dues: ${e.message}</p>`;
    }
}

function renderDues() {
    challansList.innerHTML = '';
    const kn = karachiNow();
    const today = new Date(kn.year, kn.month, kn.day);

    pendingDues.forEach(c => {
        const rem = parseFloat(c.amount) - parseFloat(c.paid_amount || 0);
        const isLate = new Date(c.due_date) < today;
        const desc = c.fee_month && c.fee_month !== 'N/A'
            ? `${c.fee_type} <span style="color:#64748b;">(${c.fee_month})</span>`
            : c.fee_type;

        const div = document.createElement('div');
        div.className = 'challan-item';
        div.innerHTML = `
            <input type="checkbox" id="chk_${c.id}">
            <div class="col-head">${c.fee_type} ${isLate ? '<span class="late-badge">LATE</span>' : ''}</div>
            <div class="col-month">${c.fee_month !== 'N/A' ? c.fee_month : '—'}</div>
            <div class="col-paid">Rs ${c.paid_amount || 0}</div>
            <div class="col-rem">Rs ${rem}</div>
        `;

        const toggleSelect = () => {
            const cb = div.querySelector('input');
            cb.checked ? selectedIds.add(c.id) : selectedIds.delete(c.id);
            div.classList.toggle('selected', cb.checked);
            recalcCart();
        };

        div.addEventListener('click', e => {
            if (e.target.type !== 'checkbox') {
                const cb = div.querySelector('input');
                cb.checked = !cb.checked;
            }
            toggleSelect();
        });
        div.querySelector('input').addEventListener('click', e => {
            e.stopPropagation();
            toggleSelect();
        });

        challansList.appendChild(div);
    });
}

// ─── Cart Recalculation ───────────────────────────────────────────────────────
function recalcCart() {
    if (selectedIds.size === 0) {
        sumSubtotal.textContent = 'Rs 0';
        sumGrandTotal.textContent = 'Rs 0';
        sumRemaining.textContent = 'Rs 0';
        btnSubmit.disabled = true;
        btnApplyDiscount.disabled = true;
        grandTotal = 0;
        return;
    }

    let subtotal = 0;
    selectedIds.forEach(id => {
        const c = pendingDues.find(x => x.id === id);
        if (c) subtotal += parseFloat(c.amount) - parseFloat(c.paid_amount || 0);
    });

    const fine     = parseFloat(inputFine.value)     || 0;
    const discount = parseFloat(inputDiscount.value) || 0;
    grandTotal = Math.max(0, subtotal + fine - discount);

    sumSubtotal.textContent   = `Rs ${subtotal}`;
    sumGrandTotal.textContent = `Rs ${grandTotal}`;

    const paying = parseFloat(inputPaying.value) || 0;
    sumRemaining.textContent  = `Rs ${Math.max(0, grandTotal - paying)}`;

    // Build Live Allocation Preview
    const previewDiv = document.getElementById('allocationPreview');
    if (paying > 0 && selectedIds.size > 0) {
        let wallet = paying;
        let html = '<div style="background:#f8fafc; padding:0.8rem; border-radius:8px; border:1px solid #e2e8f0; margin-bottom:1rem; box-shadow: inset 0 2px 4px rgba(0,0,0,0.02);">';
        html += '<strong style="display:block; margin-bottom:0.6rem; color:#1e293b;"><span style="color:var(--success);">✨ Cash Waterfall Prediction:</span></strong>';
        
        let firstEntry = true;
        let allocatedCount = 0;
        
        for (const cid of selectedIds) {
            if (wallet <= 0) break;
            const c = pendingDues.find(x => x.id === cid);
            const rem = parseFloat(c.amount) - parseFloat(c.paid_amount || 0);

            let appliedFine = firstEntry ? fine : 0;
            let appliedDisc = firstEntry ? discount : 0;
            firstEntry = false;

            const adjusted   = Math.max(0, rem + appliedFine - appliedDisc);
            const debit      = Math.min(wallet, adjusted);
            
            if (debit > 0) {
                let desc = c.fee_type;
                if (c.fee_month && c.fee_month !== 'N/A') desc += ` (${c.fee_month})`;
                html += `<div style="display:flex; justify-content:space-between; margin-bottom:0.3rem;">
                            <span>➔ ${desc}</span>
                            <strong style="color:var(--success);">Rs ${debit} <span style="font-size:0.7rem; font-weight:normal; color:#64748b;">(Allocated)</span></strong>
                         </div>`;
                wallet -= debit;
                allocatedCount++;
            }
        }
        
        if (wallet > 0) {
             html += `<div style="display:flex; justify-content:space-between; margin-top:0.6rem; border-top:1px dashed #cbd5e1; padding-top:0.5rem;">
                        <span style="color:var(--error); font-weight:600;">⚠️ Excess Cash Remaining:</span>
                        <strong style="color:var(--error);">Rs ${wallet}</strong>
                     </div>`;
        }
        html += '</div>';
        previewDiv.innerHTML = allocatedCount > 0 || wallet > 0 ? html : '';
    } else {
        previewDiv.innerHTML = '';
    }

    btnSubmit.disabled = paying <= 0;
    btnApplyDiscount.disabled = discount <= 0;
}

// ─── Direct Discount Submission ──────────────────────────────────────────────
async function applyDiscountToSelectedChallans() {
    if (!activeStudent || selectedIds.size === 0) {
        return showAlert('Select at least one fee month before applying a discount.', true);
    }

    const discountAmt = Math.round((parseFloat(inputDiscount.value) || 0) * 100) / 100;
    if (discountAmt <= 0) {
        return showAlert('Please enter a valid discount amount.', true);
    }

    const collectorName = cleanCollectorName(window.currentUserFullName) || 'Unknown User';
    const enteredRemark = inputRemarks.value.trim();
    const discountRemarks = `${enteredRemark || 'Direct discount applied'} | Applied by: ${collectorName}`;

    const selectedChallans = pendingDues.filter(challan => selectedIds.has(challan.id));
    const selectedOutstanding = Math.round(selectedChallans.reduce((total, challan) => {
        return total + Math.max(0, parseFloat(challan.amount || 0) - parseFloat(challan.paid_amount || 0));
    }, 0) * 100) / 100;

    if (discountAmt > selectedOutstanding) {
        return showAlert(`Discount cannot exceed the selected balance of Rs ${selectedOutstanding}.`, true);
    }

    btnApplyDiscount.innerHTML = 'Applying...';
    btnApplyDiscount.disabled = true;

    try {
        let remainingDiscount = discountAmt;
        const discountLogs = [];
        const discountReference = 'DISC-' + Date.now().toString().slice(-7);

        for (const challan of selectedChallans) {
            if (remainingDiscount <= 0) break;

            const oldPaidAmount = parseFloat(challan.paid_amount || 0);
            const outstanding = Math.max(0, parseFloat(challan.amount || 0) - oldPaidAmount);
            const appliedDiscount = Math.round(Math.min(remainingDiscount, outstanding) * 100) / 100;
            if (appliedDiscount <= 0) continue;

            const newPaidAmount = Math.round((oldPaidAmount + appliedDiscount) * 100) / 100;
            const newStatus = newPaidAmount >= parseFloat(challan.amount || 0) ? 'Paid' : 'Partially Paid';
            const { error: updateError } = await db
                .from('challans')
                .update({ paid_amount: newPaidAmount, status: newStatus })
                .eq('id', challan.id);

            if (updateError) {
                throw new Error(`Could not update ${challan.fee_month || challan.fee_type}: ${updateError.message}`);
            }

            let feeDetails = challan.fee_type;
            if (challan.fee_month && challan.fee_month !== 'N/A') {
                feeDetails += ` (${challan.fee_month})`;
            }

            discountLogs.push({
                receipt_number:    discountReference + '-' + (discountLogs.length + 1),
                student_id:        activeStudent.id,
                roll_number:       activeStudent.roll_number,
                challan_id:        challan.id,
                fee_details:       feeDetails,
                amount_paid:       0,
                fine_amount:       0,
                discount_amount:   appliedDiscount,
                payment_method:    'Discount',
                payment_reference: discountReference,
                remarks:           discountRemarks,
                school_id:         getCurrentSchoolId(),
                collected_by:      collectorName,
                collected_by_user_id: window.currentUser?.id || null
            });

            remainingDiscount = Math.round((remainingDiscount - appliedDiscount) * 100) / 100;
        }

        if (remainingDiscount > 0 || discountLogs.length === 0) {
            throw new Error('The discount could not be fully allocated to the selected fee months.');
        }

        const { error: logError } = await db.from('transactions').insert(discountLogs);
        if (logError) throw new Error('Discount was applied, but its transaction log could not be saved: ' + logError.message);

        inputDiscount.value = '0';
        selectedIds.clear();
        showAlert(`Discount of Rs ${discountAmt} applied successfully without a payment.`, false);
        await loadDues(activeStudent.id);
    } catch (e) {
        console.error(e);
        showAlert('Failed: ' + e.message, true);
    } finally {
        btnApplyDiscount.innerHTML = 'Apply';
        recalcCart();
    }
}

// ─── Payment Submission ───────────────────────────────────────────────────────
async function submitPayment() {
    if (!activeStudent || selectedIds.size === 0) return;

    const paying   = parseFloat(inputPaying.value) || 0;
    const fine     = parseFloat(inputFine.value)   || 0;
    const discount = parseFloat(inputDiscount.value)|| 0;
    const method   = inputMethod.value;
    const ref      = inputRef.value.trim();
    const remarks  = inputRemarks.value.trim();
    const collectorName = cleanCollectorName(window.currentUserFullName);

    if (paying <= 0) return alert('Enter a valid amount.');
    if (paying > grandTotal) return alert(`Cannot exceed Grand Total of Rs ${grandTotal}.`);

    btnSubmit.innerHTML  = '⏳ Processing...';
    btnSubmit.disabled   = true;

    try {
        let wallet = paying;
        const txRecords     = [];
        const updateOps     = [];
        const baseReceipt   = 'RCT-' + Date.now().toString().slice(-7);
        let firstEntry      = true;

        for (const cid of selectedIds) {
            if (wallet <= 0) break;
            const c   = pendingDues.find(x => x.id === cid);
            const rem = parseFloat(c.amount) - parseFloat(c.paid_amount || 0);

            let appliedFine = firstEntry ? fine : 0;
            let appliedDisc = firstEntry ? discount : 0;
            firstEntry = false;

            const adjusted   = Math.max(0, rem + appliedFine - appliedDisc);
            const debit      = Math.min(wallet, adjusted);
            if (debit <= 0) continue;

            const newPaid   = parseFloat(c.paid_amount || 0) + debit;
            const newStatus = newPaid >= parseFloat(c.amount) ? 'Paid' : 'Partially Paid';

            updateOps.push(
                db.from('challans').update({ paid_amount: newPaid, status: newStatus, payment_method: method }).eq('id', c.id)
            );

            let desc = c.fee_type;
            if (c.fee_month && c.fee_month !== 'N/A') desc += ` (${c.fee_month})`;

            txRecords.push({
                receipt_number:    baseReceipt + '-' + (txRecords.length + 1),
                student_id:        activeStudent.id,
                roll_number:       activeStudent.roll_number,
                challan_id:        c.id,
                fee_details:       desc,
                amount_paid:       debit,
                fine_amount:       appliedFine,
                discount_amount:   appliedDisc,
                payment_method:    method,
                payment_reference: ref || null,
                remarks:           remarks || null,
                school_id:         getCurrentSchoolId(),
                collected_by:      collectorName || null,
                collected_by_user_id: window.currentUser?.id || null
            });

            wallet -= debit;
        }

        const updateResults = await Promise.all(updateOps);
        const updateErrors = updateResults.filter(r => r.error).map(r => r.error.message);
        if (updateErrors.length > 0) {
            throw new Error("Challan update failed: " + updateErrors.join('; '));
        }
        const { error: txErr } = await db.from('transactions').insert(txRecords);
        if (txErr) throw txErr;

        // ── Save receipt to receipts table for future reprinting ──
        // Calculate overall remaining balance for the student
        const totalFeeDueBeforePayment = pendingDues.reduce((sum, c) => {
            const amount = parseFloat(c.amount || 0);
            const paid = parseFloat(c.paid_amount || 0);
            return sum + Math.max(0, amount - paid);
        }, 0);
        const remaining = Math.max(0, totalFeeDueBeforePayment + fine - discount - paying);

        const feeLines  = txRecords.map(tx => ({ desc: tx.fee_details, amount: tx.amount_paid }));
        const receiptRecord = {
            receipt_number:    baseReceipt,
            student_id:        activeStudent.id,
            student_name:      activeStudent.full_name,
            roll_number:       activeStudent.roll_number,
            father_name:       activeStudent.father_name || null,
            class_name:        activeStudent.applying_for_class,
            fee_lines:         feeLines,
            total_paid:        paying,
            remaining:         remaining,
            payment_method:    method,
            payment_reference: ref || null,
            remarks:           remarks || null,
            school_id:         getCurrentSchoolId(),
            collected_by:      collectorName || null,
            collected_by_user_id: window.currentUser?.id || null
        };
        const { error: rctErr } = await db.from('receipts').insert([receiptRecord]);
        if (rctErr) console.warn('Receipt save warning:', rctErr.message); // non-fatal

        // Print receipt
        printReceipt(baseReceipt, txRecords, paying, remaining, collectorName);

        // Reset & Refresh
        inputFine.value    = '0';
        inputDiscount.value= '0';
        inputPaying.value  = '';
        inputRef.value     = '';
        inputRemarks.value = '';
        selectedIds.clear();

        showAlert('✅ Payment authorized and receipt sent to printer!', false);

        await Promise.all([loadHistory(activeStudent.id), loadDues(activeStudent.id)]);

    } catch (e) {
        console.error(e);
        showAlert('❌ Failed: ' + e.message, true);
    } finally {
        btnSubmit.innerHTML = 'Authorize Payment & Print Receipt';
        recalcCart();
    }
}

// ─── Receipt Print ────────────────────────────────────────────────────────────
function printReceipt(receiptId, txRecords, totalPaid, remaining, collectorName) {
    applyThermalSettings('collect_fee');
    document.getElementById('rctNo').textContent       = receiptId;
    document.getElementById('rctDate').textContent     = `${karachiFormatDate()} ${karachiFormatTime()}`;
    document.getElementById('rctUser').textContent     = collectorName ? `User: ${collectorName}` : '';
    document.getElementById('rctName').textContent     = activeStudent.full_name;
    document.getElementById('rctRoll').textContent     = activeStudent.roll_number;
    document.getElementById('rctFather').textContent   = activeStudent.father_name || 'N/A';
    document.getElementById('rctClass').textContent    = activeStudent.applying_for_class;
    document.getElementById('rctTotal').textContent    = totalPaid.toLocaleString();
    document.getElementById('rctRemaining').textContent = remaining.toLocaleString();
    
    // Ensure visibility
    document.getElementById('rowReceiptNo').style.display = 'flex';
    document.getElementById('rowTotalPaid').style.display = 'flex';
    document.getElementById('rctFooter').textContent = 'Thank you! — Zahid School System';
    // Method, Ref, Remarks removed from receipt layout

    // Build itemised fee lines for thermal receipt
    const rctBody = document.getElementById('rctBody');
    rctBody.innerHTML = txRecords.map(tx => {
        // Format: "Monthly Fee   March 2026"  on left, "Rs 2,500" on right
        const desc = tx.fee_details; // e.g. "Monthly Fee (March 2026)"
        const amt  = Number(tx.amount_paid).toLocaleString();
        return `<div class="th-fee-row">
                    <span class="th-fee-desc">${desc}</span>
                    <span class="th-fee-amt">Rs ${amt}</span>
                </div>`;
    }).join('');

    // Delay so browser fully renders receipt DOM before print dialog opens
    setTimeout(() => window.print(), 350);
}

// ─── Print Bill ───────────────────────────────────────────────────────────────
function printBill() {
    if (!activeStudent || pendingDues.length === 0) return;

    let totalRemaining = 0;
    let totalPreviouslyPaid = 0;

    const txRecords = pendingDues.map(c => {
        const rem = parseFloat(c.amount) - parseFloat(c.paid_amount || 0);
        totalRemaining += rem;
        totalPreviouslyPaid += parseFloat(c.paid_amount || 0);
        
        let desc = c.fee_type;
        if (c.fee_month && c.fee_month !== 'N/A') desc += ` (${c.fee_month})`;
        
        const displayName = activeStudent.full_name.split(' ')[0];
        desc = `[${displayName} (${activeStudent.roll_number})] ${desc}`;

        return {
           fee_details: desc,
           amount_paid: rem
        };
    });

    applyThermalSettings('collect_fee');
    document.getElementById('rctNo').textContent       = 'BILL-' + Date.now().toString().slice(-4);
    document.getElementById('rctDate').textContent     = `${karachiFormatDate()} ${karachiFormatTime()}`;
    const userName = cleanCollectorName(window.currentUserFullName);
    document.getElementById('rctUser').textContent     = userName ? `User: ${userName}` : '';
    document.getElementById('rctName').textContent     = activeStudent.full_name;
    document.getElementById('rctRoll').textContent     = activeStudent.roll_number;
    document.getElementById('rctFather').textContent   = activeStudent.father_name || 'N/A';
    document.getElementById('rctClass').textContent    = activeStudent.applying_for_class;
    
    // Hide details for Bill
    document.getElementById('rowReceiptNo').style.display = 'none';
    document.getElementById('rowTotalPaid').style.display = 'none';
    
    document.getElementById('lblRemaining').textContent = "Remaining";
    document.getElementById('rctRemaining').textContent = totalRemaining.toLocaleString();

    document.getElementById('rctFooter').textContent = 'No Payment Received in This Bill';

    const rctBody = document.getElementById('rctBody');
    rctBody.innerHTML = txRecords.map(tx => {
        const desc = tx.fee_details; 
        const amt  = Number(tx.amount_paid).toLocaleString();
        return `<div class="th-fee-row">
                    <span class="th-fee-desc">${desc}</span>
                    <span class="th-fee-amt">Rs ${amt}</span>
                </div>`;
    }).join('');

    setTimeout(() => window.print(), 350);
}

// ─── Alert Helper ─────────────────────────────────────────────────────────────
function showAlert(msg, isError) {
    checkoutAlert.textContent = msg;
    checkoutAlert.style.background = isError ? '#fee2e2' : '#d1fae5';
    checkoutAlert.style.color      = isError ? '#991b1b' : '#065f46';
    checkoutAlert.style.display    = 'block';
    setTimeout(() => checkoutAlert.style.display = 'none', 5000);
}
