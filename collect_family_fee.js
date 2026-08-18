// Supabase client is provided by auth.js (supabaseClient)
const db = supabaseClient;
const getCurrentSchoolId = () => window.currentSchoolId || null;
const applySchoolScope = (query) => getCurrentSchoolId() ? query.eq('school_id', getCurrentSchoolId()) : query;

async function waitForFamilyFeeAuth(timeoutMs = 10000) {
    const started = Date.now();
    while (Date.now() - started < timeoutMs) {
        if (window.authReady === true && window.supabaseClient) return;
        await new Promise(resolve => setTimeout(resolve, 80));
    }
}

// ─── State ────────────────────────────────────────────────────────────────────
let allStudents   = [];   // full admissions cache
let familiesData  = [];   // grouped by mobile
let activeFamily  = null; // currently opened family object
let pendingDues   = [];   // challans for all active family members
let selectedIds   = new Set();
let grandTotal    = 0;
let receiptCache  = [];   // saved receipts for current family (for reprint)
let familyDisplayNamesMap = new Map(); // normalized mobile -> selected family name

function cleanCollectorName(value) {
    return String(value || '').trim().replace(/\s*\([^)]*\)\s*$/, '').trim();
}

// ─── DOM Refs ─────────────────────────────────────────────────────────────────
const familySearch      = document.getElementById('familySearch');
const searchStatus      = document.getElementById('searchStatus');

const familyListSection = document.getElementById('familyListSection');
const familyList        = document.getElementById('familyList');
const resultCount       = document.getElementById('resultCount');
const workspace         = document.getElementById('workspace');

// Workspace DOM
const wsAvatar        = document.getElementById('wsAvatar');
const wsName          = document.getElementById('wsName');
const wsContact       = document.getElementById('wsContact');
const wsMembersCount  = document.getElementById('wsMembersCount');
const wsMembersList   = document.getElementById('wsMembersList');
const btnPartial      = document.getElementById('btnPartial');
const btnPayAll       = document.getElementById('btnPayAll');
const challansList    = document.getElementById('challansList');

const btnToggleHistory= document.getElementById('btnToggleHistory');
const historyPanel    = document.getElementById('historyPanel');
const historyBody     = document.getElementById('historyBody');

const btnToggleDiscount = document.getElementById('btnToggleDiscount');
const discountPanel     = document.getElementById('discountPanel');
const discountBody      = document.getElementById('discountBody');

const inputFine       = document.getElementById('inputFine');
const inputDiscount   = document.getElementById('inputDiscount');
const btnApplyDiscount = document.getElementById('btnApplyDiscount');
const inputPaying     = document.getElementById('inputPaying');
const inputMethod     = document.getElementById('inputMethod');
const inputRef        = document.getElementById('inputRef');
const refGroup        = document.getElementById('refGroup');
const inputRemarks    = document.getElementById('inputRemarks');
const sumSubtotal     = document.getElementById('sumSubtotal');
const sumGrandTotal   = document.getElementById('sumGrandTotal');
const sumRemaining    = document.getElementById('sumRemaining');
const btnSubmit       = document.getElementById('btnSubmit');
const btnReprint      = document.getElementById('btnReprint');
const btnBill         = document.getElementById('btnBill');
const checkoutAlert   = document.getElementById('checkoutAlert');
const inputPaymentDate = document.getElementById('inputPaymentDate');
const chkBackdate     = document.getElementById('chkBackdate');

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

window.onAppReady(async () => {
    await waitForFamilyFeeAuth();
    await loadFamiliesData();

    // Close workspace on button / backdrop / Escape
    const btnClose = document.getElementById('btnCloseWorkspace');
    if (btnClose) btnClose.addEventListener('click', closeWorkspace);

    if(workspace) {
        workspace.addEventListener('click', (e) => {
            if (e.target === workspace) closeWorkspace();
        });
    }

    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && workspace && workspace.classList.contains('is-open')) closeWorkspace();
    });

    // Wire single search input — debounced
    let debTimer;
    if (familySearch) {
        familySearch.addEventListener('input', () => {
            clearTimeout(debTimer);
            debTimer = setTimeout(renderFamilyList, 250);
        });
    }

    if(inputMethod) {
        inputMethod.addEventListener('change', () => {
            if(refGroup) refGroup.style.display = inputMethod.value !== 'Cash' ? 'block' : 'none';
        });
    }

    // ── Payment Date: default to today, lock unless "Use old date" is checked ──
    function setTodayDate() {
        if (!inputPaymentDate) return;
        const todayStr = window.karachiToday ? window.karachiToday() : new Date().toISOString().split('T')[0];
        inputPaymentDate.value = todayStr;
        inputPaymentDate.max = todayStr;
        inputPaymentDate.disabled = true;
    }
    setTodayDate();

    // Show backdate toggle ONLY if user has can_edit permission (admin/super_admin always do)
    const backdateLabel = document.getElementById('backdateToggleLabel');
    const canBackdate = window.userRoleName === 'admin' || window.userRoleName === 'super_admin' || (window.hasPermission && window.hasPermission('allow_backdate_payment.html', 'can_view'));
    if (canBackdate && backdateLabel) {
        backdateLabel.style.display = 'flex';
    }

    if (chkBackdate) {
        chkBackdate.addEventListener('change', () => {
            if (chkBackdate.checked) {
                inputPaymentDate.disabled = false;
                inputPaymentDate.style.borderColor = '#f59e0b';
                inputPaymentDate.style.background = '#fffbeb';
                inputPaymentDate.focus();
            } else {
                setTodayDate();
                inputPaymentDate.style.borderColor = '#e2e8f0';
                inputPaymentDate.style.background = 'white';
            }
        });
    }

    [inputFine, inputDiscount, inputPaying].forEach(el => {
        if (!el) return;

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

    if(btnToggleHistory) {
        btnToggleHistory.addEventListener('click', () => {
            if(historyPanel.style.display === 'none') {
                historyPanel.style.display = 'block';
                btnToggleHistory.textContent = '📜 Hide History';
            } else {
                historyPanel.style.display = 'none';
                btnToggleHistory.textContent = '📜 History';
            }
        });
    }

    if(btnToggleDiscount) {
        btnToggleDiscount.addEventListener('click', () => {
            if(discountPanel.style.display === 'none') {
                discountPanel.style.display = 'block';
                btnToggleDiscount.textContent = '💰 Hide Discounts';
            } else {
                discountPanel.style.display = 'none';
                btnToggleDiscount.textContent = '💰 Discounts';
            }
        });
    }

    if(btnReprint) {
        btnReprint.addEventListener('click', () => {
            if (receiptCache.length === 0) return;
            reprintFromHistory(receiptCache[0]);
        });
    }
    
    if (btnBill) btnBill.addEventListener('click', printBill);

    if (btnApplyDiscount) {
        btnApplyDiscount.addEventListener('click', applyDiscountToChallans);
    }

    if(btnPayAll) btnPayAll.addEventListener('click', () => {
        if (pendingDues.length === 0) return;
        pendingDues.forEach(c => selectedIds.add(c.id));
        document.querySelectorAll('.challan-item input[type="checkbox"]').forEach(cb => {
            cb.checked = true;
            cb.closest('.challan-item').classList.add('selected');
        });
        recalcCart();
        if(inputPaying) inputPaying.value = grandTotal;
        recalcCart();
        if(inputPaying) inputPaying.style.transition = 'background 0.3s';
        if(inputPaying) inputPaying.style.background = '#d1fae5';
        setTimeout(() => { if(inputPaying) inputPaying.style.background = 'white'; }, 600);
        const checkoutPanel = document.getElementById('checkoutPanel');
        if (checkoutPanel) checkoutPanel.scrollIntoView({ behavior: 'smooth', block: 'center' });
    });

    if(btnPartial) btnPartial.addEventListener('click', () => {
        if (pendingDues.length === 0) return;
        pendingDues.forEach(c => selectedIds.add(c.id));
        document.querySelectorAll('.challan-item input[type="checkbox"]').forEach(cb => {
            cb.checked = true;
            cb.closest('.challan-item').classList.add('selected');
        });
        recalcCart();
        if(inputPaying) inputPaying.value = '';
        recalcCart();
        if(inputPaying) inputPaying.style.transition = 'background 0.3s';
        if(inputPaying) inputPaying.style.background = '#fef3c7';
        setTimeout(() => { if(inputPaying) inputPaying.style.background = 'white'; }, 800);
        const checkoutPanel = document.getElementById('checkoutPanel');
        if (checkoutPanel) checkoutPanel.scrollIntoView({ behavior: 'smooth', block: 'center' });
        if(inputPaying) inputPaying.focus();
    });

    if(btnSubmit) btnSubmit.addEventListener('click', submitPayment);
});

// ─── Close Workspace (global so onclick attribute works) ──────────────────────────
window.closeWorkspace = function() {
    if(workspace) workspace.classList.remove('is-open');
    document.body.classList.remove('workspace-open');
    renderFamilyList();
};

// ─── Load all active students and group into families ─────────────────────────
async function loadFamiliesData() {
    if(searchStatus) searchStatus.textContent = '⏳ Loading database...';
    try {
        let studentsQuery = db
            .from('admissions')
            .select('id, roll_number, full_name, father_name, father_mobile, applying_for_class, status, family_id_manual')
            .eq('status', 'Active')
            .order('roll_number');
        let displayNamesQuery = db
            .from('family_display_names')
            .select('mobile_number, family_name, family_status');
        if (getCurrentSchoolId()) {
            studentsQuery = studentsQuery.eq('school_id', getCurrentSchoolId());
            displayNamesQuery = displayNamesQuery.eq('school_id', getCurrentSchoolId());
        }
        const [studentsResult, displayNamesResult] = await Promise.all([studentsQuery, displayNamesQuery]);
        if (studentsResult.error) throw studentsResult.error;
        allStudents = studentsResult.data || [];
        familyDisplayNamesMap = new Map((displayNamesResult.data || []).map(row => [String(row.mobile_number || '').replace(/[\s-]/g, ''), { name: row.family_name, status: row.family_status || '' }]));
        if (displayNamesResult.error) console.warn('Could not load selected family names:', displayNamesResult.error);
        
        processFamilies(allStudents);

        if(searchStatus) searchStatus.textContent = `✅ ${familiesData.length} valid families loaded. Add multiple students under the same Mobile # in Family Management to use this feature.`;
        if(familyListSection) familyListSection.style.display = 'block';
        renderFamilyList();
    } catch (e) {
        if(searchStatus) searchStatus.textContent = '❌ Failed to load students: ' + e.message;
    }
}

function processFamilies(students) {
    const groups = {};
    students.forEach(s => {
        const mob = String(s.father_mobile || '').replace(/[\s-]/g, '').trim();
        if(!mob) return; 
        if(!groups[mob]) groups[mob] = [];
        groups[mob].push(s);
    });

    familiesData = [];
    Object.keys(groups).forEach(mobile => {
        const members = groups[mobile];
        if (members.length < 2) return;
        const names = [...new Set(members.map(m => m.father_name).filter(n => n && n.trim() !== ''))];
        const displayData = familyDisplayNamesMap.get(mobile) || { name: '', status: '' };
        const primaryName = displayData.name || (names.length > 0 ? names[0] : 'Unknown Family');
        const familyNos = [...new Set(members.map(m => m.family_id_manual).filter(n => n && n.trim() !== ''))];
        const familyNo = familyNos.length > 0 ? familyNos[0] : '';
        
        familiesData.push({
            mobile,
            members,
            primaryName,
            familyNo,
            familyStatus: displayData.status,
            firstStudentId: members[0].id // Use the first student as the anchor for the receipt linking
        });
    });
}

// ─── Filter & render family cards ───────────────────────────────────────────
function renderFamilyList() {
    const q = familySearch ? familySearch.value.trim().toLowerCase() : '';

    const filtered = familiesData.filter(fam => {
        if (!q) return true;
        return (
            fam.primaryName.toLowerCase().includes(q) ||
            fam.mobile.toLowerCase().includes(q) ||
            (fam.familyNo || '').toLowerCase().includes(q)
        );
    });

    if(resultCount) resultCount.textContent = filtered.length;
    if(familyList) familyList.innerHTML = '';

    if (filtered.length === 0) {
        if(familyList) familyList.innerHTML = '<p style="color:#94a3b8; text-align:center; padding:1rem;">No families match your search.</p>';
        return;
    }

    filtered.forEach(fam => {
        const isActive = activeFamily && activeFamily.mobile === fam.mobile;
        const card = document.createElement('div');
        card.className = 'student-card' + (isActive ? ' active-card' : '');
        card.innerHTML = `
            <div class="stu-avatar">${fam.primaryName.charAt(0).toUpperCase()}</div>
            <div class="stu-info">
                <strong>${fam.primaryName}${fam.familyStatus ? ` <span style="display:inline-block;background:${fam.familyStatus==='A'?'#16a34a':fam.familyStatus==='B'?'#f59e0b':fam.familyStatus==='C'?'#ef4444':'#6b7280'};color:#fff;padding:1px 6px;border-radius:4px;font-size:0.7rem;font-weight:700;vertical-align:middle;">${fam.familyStatus}</span>` : ''} ${fam.familyNo ? `(#${fam.familyNo})` : ''}</strong>
                <span>Mobile: ${fam.mobile} &nbsp;|&nbsp; ${fam.members.length} Student(s)</span>
            </div>
            <button class="open-btn ${isActive ? 'active-open' : ''}" data-mobile="${fam.mobile}">
                ${isActive ? '✔ Opened' : 'Open Family'}
            </button>
        `;
        const btn = card.querySelector('.open-btn');
        if(btn) btn.addEventListener('click', () => openFamily(fam));
        if(familyList) familyList.appendChild(card);
    });
}

// ─── Open Family Workspace ────────────────────────────────────────────────────
async function openFamily(fam) {
    activeFamily = fam;
    selectedIds.clear();
    receiptCache = [];

    if(wsAvatar) wsAvatar.textContent  = fam.primaryName.charAt(0).toUpperCase();
    if(wsName) wsName.innerHTML = fam.primaryName + (fam.familyStatus ? ` <span style="display:inline-block;background:${fam.familyStatus==='A'?'#16a34a':fam.familyStatus==='B'?'#f59e0b':fam.familyStatus==='C'?'#ef4444':'#6b7280'};color:#fff;padding:2px 8px;border-radius:5px;font-size:0.75rem;font-weight:700;vertical-align:middle;">${fam.familyStatus}</span>` : '');
    if(wsContact) wsContact.textContent = fam.mobile;
    const wsFamilyNoEl = document.getElementById('wsFamilyNo');
    if(wsFamilyNoEl) wsFamilyNoEl.textContent = fam.familyNo || 'N/A';

    // Clear member chips — will repopulate after dues load
    if(wsMembersList) wsMembersList.innerHTML = fam.members.map(m =>
        `<span class="member-chip">${m.full_name.split(' ')[0]} <span class="chip-due">…</span></span>`
    ).join('');

    // Show total fee as loading
    const wsTotalFeeEl = document.getElementById('wsTotalFee');
    if(wsTotalFeeEl) wsTotalFeeEl.textContent = 'Loading…';

    // Reset checkout
    if(inputFine) inputFine.value = '0';
    if(inputDiscount) inputDiscount.value = '0';
    if(inputPaying) inputPaying.value = '';
    if(btnReprint) btnReprint.style.display = 'none';
    // Reset date picker to today
    if(chkBackdate) { chkBackdate.checked = false; }
    if(inputPaymentDate) { inputPaymentDate.disabled = true; inputPaymentDate.style.borderColor = '#e2e8f0'; inputPaymentDate.style.background = 'white'; }
    const nowReset = new Date();
    if(inputPaymentDate) inputPaymentDate.value = `${nowReset.getFullYear()}-${String(nowReset.getMonth()+1).padStart(2,'0')}-${String(nowReset.getDate()).padStart(2,'0')}`;
    
    if(historyPanel) historyPanel.style.display = 'none';
    if(btnToggleHistory) btnToggleHistory.textContent = '📜 History';
    if(btnBill) btnBill.style.display = 'none';
    if(discountPanel) discountPanel.style.display = 'none';
    if(btnToggleDiscount) { btnToggleDiscount.textContent = '💰 Discounts'; btnToggleDiscount.style.display = 'inline-block'; }

    recalcCart();

    // Open as popup modal (class-based — allows close button to work)
    if(workspace) {
        workspace.style.display = ''; // clear any leftover inline style
        workspace.classList.remove('workspace-pop');
        void workspace.offsetWidth; // force reflow for animation restart
        workspace.classList.add('is-open');
        workspace.classList.add('workspace-pop');
        document.body.classList.add('workspace-open');
        workspace.scrollTo(0, 0);
        setTimeout(() => { if(workspace) workspace.classList.remove('workspace-pop'); }, 550);
    }

    renderFamilyList();

    // Fetch multi-student data
    await Promise.all([
        loadHistory(fam.members),
        loadFamilyDues(fam.members),
        loadDiscountHistory(fam.members)
    ]);
}

// ─── Load Payment History (from receipts table grouping by FAM base) ──────────
async function loadHistory(famMembers) {
    if (!famMembers || famMembers.length === 0) return;
    const studentIds = famMembers.map(m => m.id);
    
    if(historyBody) historyBody.innerHTML = '<tr><td colspan="7" style="text-align:center; color:#94a3b8;">Loading history...</td></tr>';
    
    try {
        const { data, error } = await db
            .from('receipts')
            .select('*')
            .in('student_id', studentIds)
            .order('created_at', { ascending: false });
            
        if (error) throw error;
        
        const grouped = {};
        (data || []).forEach(r => {
             let base = String(r.receipt_number);
             const parts = base.split('-');
             if (base.startsWith('FAM-') && parts.length >= 2) {
                 base = parts.slice(0, 2).join('-'); // e.g. FAM-1234567
             }
             
             if (!grouped[base]) {
                 grouped[base] = {
                     receipt_number: base,
                     created_at: r.created_at,
                     total_paid: 0,
                     remaining: 0,
                     payment_method: r.payment_method,
                     payment_reference: r.payment_reference,
                     remarks: r.remarks,
                     collected_by: r.collected_by || '',
                     fee_lines: []
                 };
             }
             grouped[base].total_paid += parseFloat(r.total_paid || 0);
             // For single receipts, the remaining is accurate per receipt.
             // For grouped FAM receipts, remaining is cumulative if we add them, but actually 
             // in Family payments, remaining is stored independently per student. Adding them up gives the correct family total remaining at that moment!
             grouped[base].remaining += parseFloat(r.remaining || 0);
             
             // Ensure RCT- receipts have the student name prepended so they match FAM- format when reprinted
             const rLines = Array.isArray(r.fee_lines) ? r.fee_lines.map(line => {
                 let desc = line.desc;
                 if (base.startsWith('RCT-') && !desc.startsWith('[')) {
                     const firstName = (r.student_name || 'Unknown').split(' ')[0];
                     desc = `[${firstName} (${r.roll_number || '?'})] ${desc}`;
                 }
                 return { ...line, desc };
             }) : [];
             
             grouped[base].fee_lines.push(...rLines);
        });

        // Convert the object map back to an array sorted by date descending
        const historyArray = Object.values(grouped).sort((a,b) => new Date(b.created_at) - new Date(a.created_at));
        receiptCache = historyArray;

        if (receiptCache.length > 0) {
            if(btnReprint) btnReprint.style.display = 'inline-block';
        } else {
            if(btnReprint) btnReprint.style.display = 'none';
        }

        if (!historyBody) return;
        
        if (historyArray.length === 0) {
            historyBody.innerHTML = '<tr><td colspan="7" style="text-align:center; color:#b0b8c1;">No family payment receipts found.</td></tr>';
            return;
        }

        const combinedDatesShown = new Set();
        historyBody.innerHTML = historyArray.map((r, idx) => {
            const dateStr = new Date(r.created_at).toLocaleDateString('en-PK', { timeZone: 'Asia/Karachi' });
            const dayCollectorKeys = new Set(historyArray
                .filter(item => new Date(item.created_at).toLocaleDateString('en-PK', { timeZone: 'Asia/Karachi' }) === dateStr)
                .map(item => cleanCollectorName(item.collected_by).toLowerCase() || 'unknown'));
            const showCombinedUsers = dayCollectorKeys.size > 1 && !combinedDatesShown.has(dateStr);
            if (showCombinedUsers) combinedDatesShown.add(dateStr);
            const combinedUsersButton = showCombinedUsers
                ? `<button onclick="window.printCombinedUsersDaySummaryForReceipt(${idx})" style="margin-left:5px;font-size:0.72rem;background:#ede9fe;border:1px solid #8b5cf6;border-radius:4px;padding:3px 6px;cursor:pointer;color:#5b21b6;font-weight:800;white-space:nowrap;" title="Combine every user's payments for this family and day">👥 Combined</button>`
                : '';
            return `
            <tr>
                <td>
                    ${dateStr}
                    <button onclick="window.printDaySummaryForReceipt(${idx})" style="margin-left:5px; font-size:0.75rem; background:#f8fafc; border:1px solid #cbd5e1; border-radius:4px; padding:2px 4px; cursor:pointer; color:#334155;" title="Print this collector's combined summary for this day">📅</button>
                    ${combinedUsersButton}
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
        console.warn('History load error:', e.message);
        if (historyBody) historyBody.innerHTML = `<tr><td colspan="7" style="color:red; text-align:center;">Error: ${e.message}</td></tr>`;
    }
}

// ─── Reprint a Saved Receipt ──────────────────────────────────────────────────
// This uses the dynamically grouped Family receipt object
function reprintFromHistory(receipt) {
    applyThermalSettings('collect_family_fee');
    document.getElementById('rctNo').textContent        = receipt.receipt_number;
    document.getElementById('rctDate').textContent      = new Date(receipt.created_at).toLocaleString('en-PK', { timeZone: 'Asia/Karachi' });
    const collectorName = cleanCollectorName(receipt.collected_by);
    document.getElementById('rctUser').textContent     = collectorName ? `User: ${collectorName}` : '';
    document.getElementById('rctName').textContent      = `${activeFamily.primaryName}`;
    const rctFamNode = document.getElementById('rctFamilyNo');
    if(rctFamNode) rctFamNode.textContent = activeFamily.familyNo || 'N/A';
    document.getElementById('rctTotal').textContent     = Number(receipt.total_paid).toLocaleString();
    
    // Always show current global remaining from live pendingDues
    let liveRemaining = 0;
    if (typeof pendingDues !== 'undefined' && Array.isArray(pendingDues) && pendingDues.length > 0) {
        pendingDues.forEach(c => {
            liveRemaining += Math.max(0, parseFloat(c.amount) - parseFloat(c.paid_amount || 0));
        });
    } else {
        liveRemaining = Number(receipt.remaining || 0);
    }
    document.getElementById('rctRemaining').textContent = Number(liveRemaining).toLocaleString();

    // Ensure visibility
    const rowReceiptNo = document.getElementById('rowReceiptNo');
    if(rowReceiptNo) rowReceiptNo.style.display = 'flex';
    const rowTotalPaid = document.getElementById('rowTotalPaid');
    if(rowTotalPaid) rowTotalPaid.style.display = 'flex';
    const rctFooter = document.getElementById('rctFooter');
    if(rctFooter) rctFooter.textContent = 'Thank you! — Zahid School System';

    const lines = Array.isArray(receipt.fee_lines) ? receipt.fee_lines : [];
    
    document.getElementById('rctBody').innerHTML = lines.map(line => `
        <div class="th-fee-row">
            <span class="th-fee-desc">${line.desc}</span>
            <span class="th-fee-amt">Rs ${Number(line.amount).toLocaleString()}</span>
        </div>
    `).join('');

    setTimeout(() => window.print(), 350);
}

// ─── Print Daily Combined Summary ─────────────────────────────────────────────
window.printDaySummaryForReceipt = function(receiptIndex) {
    const sourceReceipt = receiptCache[receiptIndex];
    if (!sourceReceipt) return;

    const dateStr = new Date(sourceReceipt.created_at).toLocaleDateString('en-PK', { timeZone: 'Asia/Karachi' });
    window.printDaySummary(dateStr, sourceReceipt.collected_by || '');
};

window.printCombinedUsersDaySummaryForReceipt = function(receiptIndex) {
    const sourceReceipt = receiptCache[receiptIndex];
    if (!sourceReceipt) return;

    const dateStr = new Date(sourceReceipt.created_at).toLocaleDateString('en-PK', { timeZone: 'Asia/Karachi' });
    window.printDaySummary(dateStr, '', true);
};

window.printDaySummary = function(dateStr, collectorKey = '', combineAllUsers = false) {
    if (!receiptCache || receiptCache.length === 0) return;

    const dayReceipts = receiptCache.filter(r =>
        new Date(r.created_at).toLocaleDateString('en-PK', { timeZone: 'Asia/Karachi' }) === dateStr &&
        (combineAllUsers || String(r.collected_by || '').trim() === String(collectorKey || '').trim())
    );
    if (dayReceipts.length === 0) return;
    
    const sorted = [...dayReceipts].sort((a,b) => new Date(a.created_at) - new Date(b.created_at));
    
    let combinedTotal = 0;
    let allLines = [];
    
    sorted.forEach(r => {
        combinedTotal += parseFloat(r.total_paid || 0);
        allLines.push(...(Array.isArray(r.fee_lines) ? r.fee_lines : []));
    });
    
    // Calculate remaining from live pendingDues — total across ALL family
    // members' dues, not from the last receipt's snapshot.
    let familyRemaining = 0;
    if (typeof pendingDues !== 'undefined' && Array.isArray(pendingDues)) {
        pendingDues.forEach(c => {
            familyRemaining += Math.max(0, parseFloat(c.amount) - parseFloat(c.paid_amount || 0));
        });
    } else {
        familyRemaining = Number(sorted[sorted.length - 1].remaining || 0);
    }

    applyThermalSettings('collect_family_fee');
    document.getElementById('rctNo').textContent        = `DAY-${dateStr.replace(/\//g, '')}`;
    document.getElementById('rctDate').textContent      = `${dateStr} (Combined Summary)`;
    const collectorName = combineAllUsers ? 'Combined' : cleanCollectorName(sorted[0]?.collected_by);
    document.getElementById('rctUser').textContent     = collectorName ? `User: ${collectorName}` : '';
    document.getElementById('rctName').textContent      = `${activeFamily.primaryName}`;
    const rctFamNode = document.getElementById('rctFamilyNo');
    if(rctFamNode) rctFamNode.textContent = activeFamily.familyNo || 'N/A';
    document.getElementById('rctTotal').textContent     = Number(combinedTotal).toLocaleString();
    document.getElementById('rctRemaining').textContent = Number(familyRemaining).toLocaleString();

    const rowReceiptNo = document.getElementById('rowReceiptNo');
    if(rowReceiptNo) rowReceiptNo.style.display = 'flex';
    const rowTotalPaid = document.getElementById('rowTotalPaid');
    if(rowTotalPaid) rowTotalPaid.style.display = 'flex';
    
    // Hide Fine & Discount for Day Summary
    const rowFine = document.getElementById('rowFine');
    if(rowFine) rowFine.style.display = 'none';
    const rowDiscount = document.getElementById('rowDiscount');
    if(rowDiscount) rowDiscount.style.display = 'none';
    const dividerBeforeTotals = document.getElementById('dividerBeforeTotals');
    if(dividerBeforeTotals) dividerBeforeTotals.style.display = 'none';
    
    const rctFooter = document.getElementById('rctFooter');
    if(rctFooter) rctFooter.textContent = 'Thank you! — Zahid School System';

    document.getElementById('rctBody').innerHTML = allLines.map(line => `
        <div class="th-fee-row">
            <span class="th-fee-desc">${line.desc}</span>
            <span class="th-fee-amt">Rs ${Number(line.amount).toLocaleString()}</span>
        </div>
    `).join('');

    setTimeout(() => window.print(), 350);
};

// ─── Load Pending Dues for ALL members ────────────────────────────────────────
async function loadFamilyDues(members) {
    if(challansList) challansList.innerHTML = '<p style="color:#94a3b8;">Loading family pending dues...</p>';
    selectedIds.clear();
    pendingDues = [];
    
    if (members.length === 0) return;

    const studentIds = members.map(m => m.id);
    
    try {
        const { data, error } = await db
            .from('challans')
            .select('*')
            .in('student_id', studentIds)
            .in('status', ['Unpaid', 'Partially Paid'])
            .order('due_date', { ascending: true });
            
        if (error) throw error;

        // Fetch concession/discount totals per challan from transactions
        const challanIds = (data || []).map(ch => ch.id);
        let discountMap = {};
        if (challanIds.length > 0) {
            try {
                const { data: discData, error: discErr } = await db
                    .from('transactions')
                    .select('challan_id, discount_amount')
                    .in('challan_id', challanIds)
                    .gt('discount_amount', 0);
                if (!discErr && discData) {
                    discData.forEach(row => {
                        discountMap[row.challan_id] = (discountMap[row.challan_id] || 0) + parseFloat(row.discount_amount || 0);
                    });
                }
            } catch (discFetchErr) {
                console.warn('Could not fetch concession data:', discFetchErr);
            }
        }

        // Map student names onto challans for display
        pendingDues = (data || []).map(ch => {
            const stu = members.find(m => m.id === ch.student_id);
            return {
                ...ch,
                _studentName: stu ? stu.full_name : 'Unknown',
                _studentRoll: stu ? stu.roll_number : '-',
                _concessionGiven: discountMap[ch.id] || 0
            };
        });

        if (pendingDues.length === 0) {
            if(btnPayAll) btnPayAll.style.display = 'none';
            if(btnPartial) btnPartial.style.display = 'none';
            if(btnBill) btnBill.style.display = 'none';
            if(challansList) challansList.innerHTML = `
                <div style="text-align:center; padding:2rem; background:#f0fdf4; border-radius:12px;">
                    <span style="font-size:2.5rem;">🎉</span>
                    <p style="color:#16a34a; font-weight:700; margin:0.5rem 0 0 0;">Zero Balance!</p>
                    <small style="color:#64748b;">This family has no outstanding challans.</small>
                </div>`;
            recalcCart();
            updateFamilyBalanceSummary();
            return;
        }

        if(btnPayAll) btnPayAll.style.display = 'block';
        if(btnPartial) btnPartial.style.display = 'block';
        if(btnBill) btnBill.style.display = 'inline-block';
        renderDues();
        updateFamilyBalanceSummary();
    } catch (e) {
        if(challansList) challansList.innerHTML = `<p style="color:red;">Error loading dues: ${e.message}</p>`;
    }
}

// ─── Update family balance badge and per-member chips ─────────────────────────
function updateFamilyBalanceSummary() {
    const wsTotalFeeEl = document.getElementById('wsTotalFee');
    
    // Calculate total family due
    let familyTotal = 0;
    pendingDues.forEach(c => {
        familyTotal += Math.max(0, parseFloat(c.amount) - parseFloat(c.paid_amount || 0));
    });
    familyTotal = Math.round(familyTotal * 100) / 100;
    
    if(wsTotalFeeEl) wsTotalFeeEl.textContent = `Rs ${familyTotal.toLocaleString()}`;

    // Build per-member chip breakdown
    if(wsMembersList && activeFamily) {
        const memberTotals = {};
        activeFamily.members.forEach(m => { memberTotals[m.id] = 0; });
        pendingDues.forEach(c => {
            const rem = Math.max(0, parseFloat(c.amount) - parseFloat(c.paid_amount || 0));
            if (memberTotals[c.student_id] !== undefined) {
                memberTotals[c.student_id] += rem;
            }
        });
        
        wsMembersList.innerHTML = activeFamily.members.map(m => {
            const due = Math.round((memberTotals[m.id] || 0) * 100) / 100;
            const color = due > 0 ? '#dc2626' : '#16a34a';
            return `<span class="member-chip">${m.full_name.split(' ')[0]} <span class="chip-due" style="color:${color};">Rs ${due.toLocaleString()}</span></span>`;
        }).join('');
    }
}

function renderDues() {
    if(challansList) challansList.innerHTML = '';
    const today = new Date();

    pendingDues.forEach(c => {
        const rem = parseFloat(c.amount) - parseFloat(c.paid_amount || 0);
        const isLate = new Date(c.due_date) < today;
        const desc = c.fee_month && c.fee_month !== 'N/A'
            ? `${c.fee_type} <span style="color:#64748b;">(${c.fee_month})</span>`
            : c.fee_type;
        const concession = c._concessionGiven || 0;

        const div = document.createElement('div');
        div.className = 'challan-item';
        div.innerHTML = `
            <input type="checkbox" id="chk_${c.id}">
            <div class="col-student">${c._studentName}</div>
            <div class="col-head">${c.fee_type} ${isLate ? '<span class="late-badge">LATE</span>' : ''}</div>
            <div class="col-month">${c.fee_month !== 'N/A' ? c.fee_month : '—'}</div>
            <div class="col-paid">Rs ${c.paid_amount || 0}</div>
            <div style="flex:1.2;font-weight:700;color:${concession > 0 ? '#7c3aed' : '#94a3b8'};font-size:0.9rem;">${concession > 0 ? 'Rs ' + concession.toLocaleString() : '—'}</div>
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

        if(challansList) challansList.appendChild(div);
    });
}

// ─── Cart Recalculation ───────────────────────────────────────────────────────
function recalcCart() {
    if (selectedIds.size === 0) {
        if(sumSubtotal) sumSubtotal.textContent = 'Rs 0';
        if(sumGrandTotal) sumGrandTotal.textContent = 'Rs 0';
        if(sumRemaining) sumRemaining.textContent = 'Rs 0';
        if(btnSubmit) btnSubmit.disabled = true;
        grandTotal = 0;
        return;
    }

    let subtotal = 0;
    selectedIds.forEach(id => {
        const c = pendingDues.find(x => x.id === id);
        if (c) subtotal += parseFloat(c.amount) - parseFloat(c.paid_amount || 0);
    });
    subtotal = Math.round(subtotal * 100) / 100;

    const fine     = Math.round((parseFloat(inputFine?.value)     || 0) * 100) / 100;
    const discount = Math.round((parseFloat(inputDiscount?.value) || 0) * 100) / 100;
    grandTotal = Math.round(Math.max(0, subtotal + fine - discount) * 100) / 100;

    if(sumSubtotal) sumSubtotal.textContent   = `Rs ${subtotal}`;
    if(sumGrandTotal) sumGrandTotal.textContent = `Rs ${grandTotal}`;

    const paying = Math.round((parseFloat(inputPaying?.value) || 0) * 100) / 100;
    if(sumRemaining) sumRemaining.textContent  = `Rs ${Math.round(Math.max(0, grandTotal - paying) * 100) / 100}`;

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
                let desc = `[${c._studentName.split(' ')[0]}] ${c.fee_type}`;
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
        if(previewDiv) previewDiv.innerHTML = allocatedCount > 0 || wallet > 0 ? html : '';
    } else {
        if(previewDiv) previewDiv.innerHTML = '';
    }

    if(btnSubmit) btnSubmit.disabled = paying <= 0;
}

// ─── Payment Submission ───────────────────────────────────────────────────────
async function submitPayment() {
    if (!activeFamily || selectedIds.size === 0) return;

    const paying   = parseFloat(inputPaying?.value) || 0;
    const fine     = parseFloat(inputFine?.value)   || 0;
    const discount = parseFloat(inputDiscount?.value)|| 0;
    const method   = inputMethod?.value || 'Cash';
    const refRaw   = inputRef?.value?.trim() || '';
    // Use raw input if available, else blank.
    const remarks  = inputRemarks?.value?.trim() || '';
    const collectorName = cleanCollectorName(window.currentUserFullName);

    // Build the payment timestamp from the selected date
    const selectedDate = inputPaymentDate?.value || '';
    let paymentTimestamp = null;
    let paymentDateOnly = null;
    if (selectedDate) {
        const parts = selectedDate.split('-');
        const dt = new Date(parseInt(parts[0]), parseInt(parts[1]) - 1, parseInt(parts[2]), 12, 0, 0);
        paymentTimestamp = dt.toISOString();
        paymentDateOnly = selectedDate;
    }

    if (paying <= 0) return alert('Enter a valid amount.');
    if (paying > grandTotal) return alert(`Cannot exceed Grand Total of Rs ${grandTotal}.`);

    btnSubmit.innerHTML  = '⏳ Processing Bulk Payment...';
    btnSubmit.disabled   = true;

    try {
        let wallet = Math.round(paying * 100) / 100;
        const txRecords     = [];
        const updateOps     = [];
        const receiptRemainingByStudent = {};
        
        // This is the family base receipt (e.g. FAM-1234567)
        const baseReceipt   = 'FAM-' + Date.now().toString().slice(-7);
        const refCombo      = refRaw ? `${baseReceipt} | ${refRaw}` : baseReceipt;

        let firstEntry      = true;

        for (const cid of selectedIds) {
            if (wallet <= 0) break;
            const c   = pendingDues.find(x => x.id === cid);
            const rem = Math.round((parseFloat(c.amount) - parseFloat(c.paid_amount || 0)) * 100) / 100;

            let appliedFine = firstEntry ? Math.round(fine * 100) / 100 : 0;
            let appliedDisc = firstEntry ? Math.round(discount * 100) / 100 : 0;
            firstEntry = false;

            const adjusted   = Math.round(Math.max(0, rem + appliedFine - appliedDisc) * 100) / 100;
            const debit      = Math.round(Math.min(wallet, adjusted) * 100) / 100;
            if (debit <= 0) continue;

            const newPaid   = Math.round((parseFloat(c.paid_amount || 0) + debit) * 100) / 100;
            const newStatus = newPaid >= parseFloat(c.amount) ? 'Paid' : 'Partially Paid';

            updateOps.push(
                db.from('challans').update({ paid_amount: newPaid, status: newStatus, payment_method: method }).eq('id', c.id)
            );

            let desc = `[${c._studentName.split(' ')[0]} (${c._studentRoll})] ${c.fee_type}`;
            if (c.fee_month && c.fee_month !== 'N/A') desc += ` (${c.fee_month})`;

            txRecords.push({
                receipt_number:    baseReceipt + '-' + (txRecords.length + 1), // Only used in transactions table
                student_id:        c.student_id,
                roll_number:       c._studentRoll,
                challan_id:        c.id,
                fee_details:       desc,
                amount_paid:       debit,
                fine_amount:       appliedFine,
                discount_amount:   appliedDisc,
                payment_method:    method,
                payment_reference: refCombo,
                remarks:           remarks || null,
                school_id:         getCurrentSchoolId(),
                collected_by:      collectorName || null,
                collected_by_user_id: window.currentUser?.id || null,
                ...(paymentTimestamp ? { created_at: paymentTimestamp } : {}),
                ...(paymentDateOnly ? { payment_date: paymentDateOnly } : {})
            });

            // Freeze only the balance of challans included on this receipt. Other
            // months and unrelated dues must not affect its printed Remaining value.
            const remainingForThisChallan = Math.round(Math.max(0, adjusted - debit) * 100) / 100;
            receiptRemainingByStudent[c.student_id] = Math.round(
                ((receiptRemainingByStudent[c.student_id] || 0) + remainingForThisChallan) * 100
            ) / 100;

            wallet = Math.round((wallet - debit) * 100) / 100;
        }

        // Parallel update challans
        const updateResults = await Promise.all(updateOps);
        const updateErrors = updateResults.filter(r => r.error).map(r => r.error.message);
        if (updateErrors.length > 0) {
            throw new Error("Challan update failed: " + updateErrors.join('; '));
        }
        
        // Insert identical individual line records to transactions
        const { error: txErr } = await db.from('transactions').insert(txRecords);
        if (txErr) throw txErr;

        // Group allocated payments into individual `receipts` records 
        // THIS MAKES HISTORY SYNC PERFECTLY BETWEEN SINGLE/FAMILY UI.
        const studentGroups = {};
        txRecords.forEach(tx => {
            if (!studentGroups[tx.student_id]) {
                const stu = activeFamily.members.find(m => m.id === tx.student_id);
                studentGroups[tx.student_id] = {
                    student_id: tx.student_id,
                    student_name: stu.full_name,
                    roll_number: stu.roll_number,
                    class_name: stu.applying_for_class,
                    father_name: stu.father_name,
                    lines: [],
                    total: 0
                };
            }
            studentGroups[tx.student_id].lines.push({ desc: tx.fee_details, amount: tx.amount_paid });
            studentGroups[tx.student_id].total += tx.amount_paid;
        });

        // Calculate total remaining per student across ALL their pending dues,
        // not just the selected challans. pendingDues.paid_amount is not yet
        // updated in memory, so subtract each student's paid portion manually.
        const paidNowByStudent = {};
        txRecords.forEach(tx => {
            paidNowByStudent[tx.student_id] = (paidNowByStudent[tx.student_id] || 0) + tx.amount_paid;
        });
        const totalRemainingByStudent = {};
        for (const c of pendingDues) {
            const challanRemaining = Math.max(0, parseFloat(c.amount) - parseFloat(c.paid_amount || 0));
            totalRemainingByStudent[c.student_id] = (totalRemainingByStudent[c.student_id] || 0) + challanRemaining;
        }
        // Subtract what was just paid now
        for (const sid of Object.keys(paidNowByStudent)) {
            totalRemainingByStudent[sid] = Math.round(
                Math.max(0, (totalRemainingByStudent[sid] || 0) - paidNowByStudent[sid]) * 100
            ) / 100;
        }

        const receiptsToInsert = [];
        let rIndex = 1;
        
        Object.values(studentGroups).forEach(grp => {
            receiptsToInsert.push({
                receipt_number:    baseReceipt + '-' + rIndex,
                student_id:        grp.student_id,
                student_name:      grp.student_name,
                roll_number:       grp.roll_number,
                father_name:       grp.father_name,
                class_name:        grp.class_name,
                fee_lines:         grp.lines,
                total_paid:        grp.total,
                remaining:         totalRemainingByStudent[grp.student_id] || 0,
                payment_method:    method,
                payment_reference: refCombo,
                remarks:           remarks || 'Paid via Family Group',
                collected_by:      collectorName || null,
                school_id:         getCurrentSchoolId(),
                collected_by_user_id: window.currentUser?.id || null,
                ...(paymentTimestamp ? { created_at: paymentTimestamp } : {})
            });
            rIndex++;
        });

        // ── Save multiple atomic receipts to receipts table ──
        const { error: rctErr } = await db.from('receipts').insert(receiptsToInsert);
        if (rctErr) console.warn('Receipt save warning:', rctErr.message);

        // Total family remaining across ALL dues
        const totalFamilyRemaining = Object.values(totalRemainingByStudent)
            .reduce((sum, amount) => sum + Number(amount || 0), 0);

        // Print combined physical receipt using UI grouping logic
        printReceipt(baseReceipt, txRecords, paying, totalFamilyRemaining, fine, discount, collectorName, paymentTimestamp);

        // Reset & Refresh
        if(inputFine) inputFine.value    = '0';
        if(inputDiscount) inputDiscount.value= '0';
        if(inputPaying) inputPaying.value  = '';
        inputRef.value     = '';
        inputRemarks.value = '';
        selectedIds.clear();
        recalcCart(); // Clear the waterfall text

        showAlert('✅ Family Payment authorized and grouped records inserted successfully!', false);

        await Promise.all([loadHistory(activeFamily.members), loadFamilyDues(activeFamily.members)]);

    } catch (e) {
        console.error(e);
        showAlert('❌ Failed: ' + e.message, true);
    } finally {
        btnSubmit.innerHTML = 'Authorize Family Payment & Print Receipt';
        recalcCart();
    }
}

// ─── Receipt Print ────────────────────────────────────────────────────────────
function printReceipt(receiptId, txRecords, totalPaid, remaining, fine = 0, discount = 0, collectorName = '', customDate = null) {
    applyThermalSettings('collect_family_fee');
    document.getElementById('rctNo').textContent       = receiptId;
    const printDate = customDate ? new Date(customDate) : new Date();
    document.getElementById('rctDate').textContent     = printDate.toLocaleString('en-PK', { timeZone: 'Asia/Karachi' });
    document.getElementById('rctUser').textContent     = collectorName ? `User: ${collectorName}` : '';
    document.getElementById('rctName').textContent     = `${activeFamily.primaryName}`;
    
    const rctFamNode = document.getElementById('rctFamilyNo');
    if(rctFamNode) rctFamNode.textContent = activeFamily.familyNo || 'N/A';
    
    document.getElementById('rctTotal').textContent    = totalPaid.toLocaleString();
    document.getElementById('rctRemaining').textContent = remaining.toLocaleString();

    // Display Fine if present
    const rowFine = document.getElementById('rowFine');
    const rctFine = document.getElementById('rctFine');
    if (fine > 0) {
        rctFine.textContent = fine.toLocaleString();
        rowFine.style.display = 'flex';
    } else {
        rowFine.style.display = 'none';
    }

    // Display Discount if present
    const rowDiscount = document.getElementById('rowDiscount');
    const rctDiscount = document.getElementById('rctDiscount');
    if (discount > 0) {
        rctDiscount.textContent = discount.toLocaleString();
        rowDiscount.style.display = 'flex';
    } else {
        rowDiscount.style.display = 'none';
    }

    // Show/hide divider before totals
    const dividerBeforeTotals = document.getElementById('dividerBeforeTotals');
    if (fine > 0 || discount > 0) {
        dividerBeforeTotals.style.display = 'block';
    } else {
        dividerBeforeTotals.style.display = 'none';
    }

    // Ensure visibility
    const rowReceiptNo = document.getElementById('rowReceiptNo');
    if(rowReceiptNo) rowReceiptNo.style.display = 'flex';
    const rowTotalPaid = document.getElementById('rowTotalPaid');
    if(rowTotalPaid) rowTotalPaid.style.display = 'flex';
    const rctFooter = document.getElementById('rctFooter');
    if(rctFooter) rctFooter.textContent = 'Thank you! — Zahid School System';

    const rctBody = document.getElementById('rctBody');
    rctBody.innerHTML = txRecords.map(tx => {
        return `<div class="th-fee-row">
                    <span class="th-fee-desc">${tx.fee_details}</span>
                    <span class="th-fee-amt">Rs ${Number(tx.amount_paid).toLocaleString()}</span>
                </div>`;
    }).join('');

    setTimeout(() => window.print(), 350);
}

// ─── Print Bill ───────────────────────────────────────────────────────────────
function printBill() {
    if (!activeFamily || pendingDues.length === 0) return;

    let totalRemaining = 0;
    let totalPreviouslyPaid = 0;

    const txRecords = pendingDues.map(c => {
        const rem = parseFloat(c.amount) - parseFloat(c.paid_amount || 0);
        totalRemaining += rem;
        totalPreviouslyPaid += parseFloat(c.paid_amount || 0);
        
        let desc = c.fee_type;
        if (c.fee_month && c.fee_month !== 'N/A') desc += ` (${c.fee_month})`;
        
        desc = `[${c._studentName.split(' ')[0]} (${c._studentRoll})] ${desc}`;

        return {
           fee_details: desc,
           amount_paid: rem
        };
    });

    applyThermalSettings('collect_family_fee');
    document.getElementById('rctNo').textContent       = 'BILL-' + Date.now().toString().slice(-4);
    document.getElementById('rctDate').textContent     = new Date().toLocaleString('en-PK', { timeZone: 'Asia/Karachi' });
    const userName = cleanCollectorName(window.currentUserFullName);
    document.getElementById('rctUser').textContent     = userName ? `User: ${userName}` : '';
    document.getElementById('rctName').textContent     = `${activeFamily.primaryName}`;
    
    const rctFamNode = document.getElementById('rctFamilyNo');
    if(rctFamNode) rctFamNode.textContent = activeFamily.familyNo || 'N/A';
    
    // Hide details for Bill
    const rowReceiptNo = document.getElementById('rowReceiptNo');
    if(rowReceiptNo) rowReceiptNo.style.display = 'none';
    const rowTotalPaid = document.getElementById('rowTotalPaid');
    if(rowTotalPaid) rowTotalPaid.style.display = 'none';
    
    // Hide Fine & Discount for Bill
    const rowFine = document.getElementById('rowFine');
    if(rowFine) rowFine.style.display = 'none';
    const rowDiscount = document.getElementById('rowDiscount');
    if(rowDiscount) rowDiscount.style.display = 'none';
    const dividerBeforeTotals = document.getElementById('dividerBeforeTotals');
    if(dividerBeforeTotals) dividerBeforeTotals.style.display = 'none';
    
    const lblRemaining = document.getElementById('lblRemaining');
    if(lblRemaining) lblRemaining.textContent = "Remaining";
    document.getElementById('rctRemaining').textContent = totalRemaining.toLocaleString();

    const rctFooter = document.getElementById('rctFooter');
    if(rctFooter) rctFooter.textContent = 'No Payment Received in This Bill';

    const rctBody = document.getElementById('rctBody');
    rctBody.innerHTML = txRecords.map(tx => {
        return `<div class="th-fee-row">
                    <span class="th-fee-desc">${tx.fee_details}</span>
                    <span class="th-fee-amt">Rs ${Number(tx.amount_paid).toLocaleString()}</span>
                </div>`;
    }).join('');

    setTimeout(() => window.print(), 350);
}

// ─── Apply Discount to Challans ───────────────────────────────────────────────
async function applyDiscountToChallans() {
    if (!activeFamily || pendingDues.length === 0) {
        return showAlert('No family selected or no pending dues.', true);
    }

    if (selectedIds.size === 0) {
        return showAlert('Select at least one fee month before applying a discount.', true);
    }

    const discountAmt = parseFloat(inputDiscount?.value) || 0;
    if (discountAmt <= 0) {
        return showAlert('Please enter a discount amount.', true);
    }

    const selectedChallans = pendingDues.filter(challan => selectedIds.has(challan.id));
    const selectedOutstanding = Math.round(selectedChallans.reduce((total, challan) => {
        return total + Math.max(0, parseFloat(challan.amount) - parseFloat(challan.paid_amount || 0));
    }, 0) * 100) / 100;

    if (discountAmt > selectedOutstanding) {
        return showAlert('Discount cannot exceed the selected balance of Rs ' + selectedOutstanding + '.', true);
    }

    const discountCollector = cleanCollectorName(window.currentUserFullName) || 'Unknown User';
    const enteredRemarks = inputRemarks?.value?.trim() || 'Direct discount applied';
    const discountRemarks = enteredRemarks + ' | Applied by: ' + discountCollector;

    btnApplyDiscount.innerHTML = 'Applying...';
    btnApplyDiscount.disabled = true;

    try {
        let remainingDiscount = discountAmt;
        const discountLogs = [];

        // ── Single sequential loop: compute → update → log ────────────────────
        // Sequential (not parallel) to avoid Supabase "Failed to fetch" on
        // simultaneous connections.
        for (const challan of selectedChallans) {
            if (remainingDiscount <= 0) break;

            const outstanding = Math.max(0, parseFloat(challan.amount) - parseFloat(challan.paid_amount || 0));
            const discountToApply = Math.min(remainingDiscount, outstanding);
            if (discountToApply <= 0) continue;

            const newPaidAmount = Math.round((parseFloat(challan.paid_amount || 0) + discountToApply) * 100) / 100;
            const newStatus = newPaidAmount >= parseFloat(challan.amount) ? 'Paid' : 'Partially Paid';

            // ── Await each update individually ─────────────────────────────────
            const { error: updErr } = await db
                .from('challans')
                .update({ paid_amount: newPaidAmount, status: newStatus })
                .eq('id', challan.id);

            if (updErr) throw new Error('Could not update challan ' + challan.id + ': ' + (updErr.message || updErr));

            // Build fee description for log
            let feeDesc = challan.fee_type;
            if (challan.fee_month && challan.fee_month !== 'N/A') feeDesc += ' (' + challan.fee_month + ')';
            feeDesc = '[' + challan._studentName.split(' ')[0] + ' (' + challan._studentRoll + ')] ' + feeDesc;

            discountLogs.push({
                receipt_number:    'DISC-' + Date.now().toString().slice(-7) + '-' + discountLogs.length,
                student_id:        challan.student_id,
                roll_number:       challan._studentRoll,
                challan_id:        challan.id,
                fee_details:       feeDesc,
                amount_paid:       0,
                fine_amount:       0,
                discount_amount:   discountToApply,
                payment_method:    'Discount',
                payment_reference: 'DISC-' + activeFamily.primaryName,
                remarks:           discountRemarks,
                school_id:         getCurrentSchoolId(),
                collected_by:      discountCollector,
                collected_by_user_id: window.currentUser?.id || null,
                ...((() => { const sd = inputPaymentDate?.value; if (!sd) return {}; const p = sd.split('-'); return { created_at: new Date(parseInt(p[0]), parseInt(p[1])-1, parseInt(p[2]), 12, 0, 0).toISOString(), payment_date: sd }; })())
            });

            remainingDiscount = Math.round((remainingDiscount - discountToApply) * 100) / 100;
        }

        // ── Log discounts to transactions table so history is queryable ────────
        if (discountLogs.length > 0) {
            const { error: logErr } = await db.from('transactions').insert(discountLogs);
            if (logErr) console.warn('Discount log insert warning:', logErr.message);
        }

        showAlert('Discount of Rs ' + discountAmt + ' applied successfully!', false);

        // Reset and refresh
        if(inputDiscount) inputDiscount.value = '0';
        if(inputFine) inputFine.value = '0';

        await Promise.all([
            loadHistory(activeFamily.members),
            loadFamilyDues(activeFamily.members),
            loadDiscountHistory(activeFamily.members)
        ]);

    } catch (e) {
        console.error(e);
        showAlert('Failed: ' + (e.message || 'Network error — please try again.'), true);

    } finally {
        btnApplyDiscount.innerHTML = 'Apply';
        btnApplyDiscount.disabled = false;
    }
}

// ─── Load Discount History ────────────────────────────────────────────────────
async function loadDiscountHistory(famMembers) {
    if (!famMembers || famMembers.length === 0) return;
    if (!discountBody) return;

    const studentIds = famMembers.map(m => m.id);
    discountBody.innerHTML = '<tr><td colspan="5" style="text-align:center; color:#94a3b8;">Loading discounts...</td></tr>';

    try {
        // Fetch from transactions where discount_amount > 0
        const { data, error } = await db
            .from('transactions')
            .select('created_at, student_id, roll_number, discount_amount, fee_details, payment_reference, amount_paid')
            .in('student_id', studentIds)
            .gt('discount_amount', 0)
            .order('created_at', { ascending: false });

        if (error) throw error;

        const rows = data || [];

        if (rows.length === 0) {
            discountBody.innerHTML = '<tr><td colspan="5" style="text-align:center; color:#94a3b8;">No discounts have been applied to this family yet.</td></tr>';
            return;
        }

        discountBody.innerHTML = rows.map(row => {
            const stu = famMembers.find(m => m.id === row.student_id);
            const stuName = stu ? stu.full_name.split(' ')[0] + ' (' + (stu.roll_number || row.roll_number || '?') + ')' : (row.roll_number || 'Unknown');
            const dateStr = new Date(row.created_at).toLocaleDateString('en-PK', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'Asia/Karachi' });
            const timeStr = new Date(row.created_at).toLocaleTimeString('en-PK', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Karachi' });
            const reason  = row.fee_details || row.payment_reference || '—';
            const rem     = typeof row.amount_paid === 'number' ? `Rs ${Number(row.amount_paid).toLocaleString()}` : '—';
            return `
            <tr>
                <td><strong>${dateStr}</strong><br><span style="color:#94a3b8;font-size:0.78rem;">${timeStr}</span></td>
                <td style="font-weight:700;color:#1e293b;">${stuName}</td>
                <td style="font-weight:800;color:#7c3aed;font-size:1rem;">Rs ${Number(row.discount_amount).toLocaleString()}</td>
                <td style="color:#64748b;font-size:0.82rem;">${reason}</td>
                <td style="color:#16a34a;font-weight:600;">${rem}</td>
            </tr>`;
        }).join('');

        // Append total concession summary row
        const totalDiscount = rows.reduce((sum, row) => sum + parseFloat(row.discount_amount || 0), 0);
        discountBody.innerHTML += `
            <tr style="background:linear-gradient(135deg,#f5f3ff,#ede9fe);border-top:3px solid #c4b5fd;">
                <td colspan="2" style="font-weight:800;font-size:1.05rem;color:#5b21b6;padding:0.9rem 1rem;">🎟️ Total Family Concession</td>
                <td style="font-weight:900;color:#7c3aed;font-size:1.2rem;padding:0.9rem 1rem;">Rs ${Number(totalDiscount).toLocaleString()}</td>
                <td colspan="2" style="color:#64748b;font-size:0.85rem;padding:0.9rem 1rem;">${rows.length} discount(s) applied</td>
            </tr>`;

    } catch (e) {
        console.warn('Discount history load error:', e.message);
        if (discountBody) discountBody.innerHTML = `<tr><td colspan="5" style="color:red;text-align:center;">Error: ${e.message}</td></tr>`;
    }
}

// ─── Alert Helper ─────────────────────────────────────────────────────────────
function showAlert(msg, isError) {
    checkoutAlert.textContent = msg;
    checkoutAlert.style.background = isError ? '#fee2e2' : '#d1fae5';
    checkoutAlert.style.color      = isError ? '#991b1b' : '#065f46';
    checkoutAlert.style.display    = 'block';
    setTimeout(() => checkoutAlert.style.display = 'none', 5000);
}
