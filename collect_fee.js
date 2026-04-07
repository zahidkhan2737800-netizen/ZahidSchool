// Supabase client is now provided by auth.js (supabaseClient)
const db = supabaseClient;
const currentSchoolId = window.currentSchoolId || null;
const applySchoolScope = (query) => currentSchoolId ? query.eq('school_id', currentSchoolId) : query;

// ─── State ────────────────────────────────────────────────────────────────────
let allStudents   = [];   // full admissions cache
let activeStudent = null; // currently opened student object
let pendingDues   = [];   // challans for active student
let selectedIds   = new Set();
let grandTotal    = 0;
let receiptCache  = [];   // saved receipts for current student (for reprint)

// ─── DOM Refs ─────────────────────────────────────────────────────────────────
const filterName   = document.getElementById('filterName');
const filterRoll   = document.getElementById('filterRoll');
const filterFather = document.getElementById('filterFather');
const searchStatus = document.getElementById('searchStatus');

const studentListSection = document.getElementById('studentListSection');
const studentList        = document.getElementById('studentList');
const resultCount        = document.getElementById('resultCount');
const workspace          = document.getElementById('workspace');

// Workspace DOM
const wsAvatar      = document.getElementById('wsAvatar');
const wsName        = document.getElementById('wsName');
const wsRoll        = document.getElementById('wsRoll');
const wsClass       = document.getElementById('wsClass');
const wsFather      = document.getElementById('wsFather');
const wsContact     = document.getElementById('wsContact');
const wsStatusBadge = document.getElementById('wsStatusBadge');
const btnPartial    = document.getElementById('btnPartial');
const btnPayAll     = document.getElementById('btnPayAll');
const btnToggleHistory = document.getElementById('btnToggleHistory');
const historyPanel  = document.getElementById('historyPanel');

const historyBody  = document.getElementById('historyBody');
const challansList = document.getElementById('challansList');

const inputFine     = document.getElementById('inputFine');
const inputDiscount = document.getElementById('inputDiscount');
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
const checkoutAlert = document.getElementById('checkoutAlert');

// ─── Boot ─────────────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', async () => {
    await loadStudents();

    // Wire filters — debounced
    let debTimer;
    [filterName, filterRoll, filterFather].forEach(el => {
        el.addEventListener('input', () => {
            clearTimeout(debTimer);
            debTimer = setTimeout(renderStudentList, 250);
        });
    });

    inputMethod.addEventListener('change', () => {
        refGroup.style.display = inputMethod.value !== 'Cash' ? 'block' : 'none';
    });

    [inputFine, inputDiscount, inputPaying].forEach(el => el.addEventListener('input', recalcCart));

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
    if (roll) { filterRoll.value = roll; renderStudentList(); }
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
        searchStatus.textContent = `✅ ${allStudents.length} students loaded. Use the filters above to search.`;
        studentListSection.style.display = 'block';
        renderStudentList();
    } catch (e) {
        searchStatus.textContent = '❌ Failed to load students: ' + e.message;
    }
}

// ─── Filter & render student cards ───────────────────────────────────────────
function renderStudentList() {
    const n = filterName.value.trim().toLowerCase();
    const r = filterRoll.value.trim().toLowerCase();
    const f = filterFather.value.trim().toLowerCase();

    const filtered = allStudents.filter(s => {
        const nameMatch   = !n || (s.full_name   || '').toLowerCase().includes(n);
        const rollMatch   = !r || String(s.roll_number || '').toLowerCase().includes(r);
        const fatherMatch = !f || (s.father_name || '').toLowerCase().includes(f);
        return nameMatch && rollMatch && fatherMatch;
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
    recalcCart();

    workspace.style.display = 'block';
    workspace.scrollIntoView({ behavior: 'smooth', block: 'start' });

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

        historyBody.innerHTML = data.map((r, idx) => `
            <tr>
                <td>${new Date(r.created_at).toLocaleDateString()}</td>
                <td style="font-family:monospace; font-weight:600; font-size:0.82rem;">${r.receipt_number}</td>
                <td style="color:#16a34a; font-weight:700;">Rs ${Number(r.total_paid).toLocaleString()}</td>
                <td style="color:${r.remaining > 0 ? '#ef4444' : '#16a34a'}; font-weight:700;">Rs ${Number(r.remaining).toLocaleString()}</td>
                <td>${r.payment_method}</td>
                <td style="color:#94a3b8; font-size:0.82rem;">${r.remarks || '—'}</td>
                <td><button class="print-row-btn" onclick="reprintFromHistory(receiptCache[${idx}])">🖨️</button></td>
            </tr>
        `).join('');
    } catch (e) {
        historyBody.innerHTML = `<tr><td colspan="7" style="color:red; text-align:center;">Error loading history: ${e.message}</td></tr>`;
    }
}

// ─── Reprint a Saved Receipt ──────────────────────────────────────────────────
function reprintFromHistory(receipt) {
    document.getElementById('rctNo').textContent        = receipt.receipt_number;
    document.getElementById('rctDate').textContent      = new Date(receipt.created_at).toLocaleString();
    document.getElementById('rctName').textContent      = receipt.student_name;
    document.getElementById('rctRoll').textContent      = receipt.roll_number;
    document.getElementById('rctFather').textContent    = receipt.father_name || 'N/A';
    document.getElementById('rctClass').textContent     = receipt.class_name;
    document.getElementById('rctTotal').textContent     = Number(receipt.total_paid).toLocaleString();
    document.getElementById('rctRemaining').textContent = Number(receipt.remaining).toLocaleString();
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

        if (pendingDues.length === 0) {
            btnPayAll.style.display = 'none';
            btnPartial.style.display = 'none';
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
        renderDues();
    } catch (e) {
        challansList.innerHTML = `<p style="color:red;">Error loading dues: ${e.message}</p>`;
    }
}

function renderDues() {
    challansList.innerHTML = '';
    const today = new Date();

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
                school_id:         currentSchoolId
            });

            wallet -= debit;
        }

        await Promise.all(updateOps);
        const { error: txErr } = await db.from('transactions').insert(txRecords);
        if (txErr) throw txErr;

        // ── Save receipt to receipts table for future reprinting ──
        const remaining = Math.max(0, grandTotal - paying);
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
            school_id:         currentSchoolId
        };
        const { error: rctErr } = await db.from('receipts').insert([receiptRecord]);
        if (rctErr) console.warn('Receipt save warning:', rctErr.message); // non-fatal

        // Print receipt
        printReceipt(baseReceipt, txRecords, paying, remaining);

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
function printReceipt(receiptId, txRecords, totalPaid, remaining) {
    document.getElementById('rctNo').textContent       = receiptId;
    document.getElementById('rctDate').textContent     = new Date().toLocaleString();
    document.getElementById('rctName').textContent     = activeStudent.full_name;
    document.getElementById('rctRoll').textContent     = activeStudent.roll_number;
    document.getElementById('rctFather').textContent   = activeStudent.father_name || 'N/A';
    document.getElementById('rctClass').textContent    = activeStudent.applying_for_class;
    document.getElementById('rctTotal').textContent    = totalPaid.toLocaleString();
    document.getElementById('rctRemaining').textContent = remaining.toLocaleString();
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

// ─── Alert Helper ─────────────────────────────────────────────────────────────
function showAlert(msg, isError) {
    checkoutAlert.textContent = msg;
    checkoutAlert.style.background = isError ? '#fee2e2' : '#d1fae5';
    checkoutAlert.style.color      = isError ? '#991b1b' : '#065f46';
    checkoutAlert.style.display    = 'block';
    setTimeout(() => checkoutAlert.style.display = 'none', 5000);
}
