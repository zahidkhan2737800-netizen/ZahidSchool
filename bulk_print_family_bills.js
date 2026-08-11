// Supabase client is provided by auth.js (supabaseClient)
const db = supabaseClient;
const getCurrentSchoolId = () => window.currentSchoolId || null;
const applySchoolScope = (query) => getCurrentSchoolId() ? query.eq('school_id', getCurrentSchoolId()) : query;

// ─── State ────────────────────────────────────────────────────────────────────
let allStudents = [];
let familiesData = []; // grouped by mobile
let familyDisplayNamesMap = new Map();

let matchedFamilies = []; // families that match the user's input

// ─── DOM Refs ─────────────────────────────────────────────────────────────────
const familyNumbersInput = document.getElementById('familyNumbersInput');
const btnFetch = document.getElementById('btnFetch');
const btnPrintAll = document.getElementById('btnPrintAll');
const resultsSection = document.getElementById('resultsSection');
const resultsStatus = document.getElementById('resultsStatus');
const resultsList = document.getElementById('resultsList');
const printContainer = document.getElementById('printContainer');

window.onAppReady(async () => {
    applyThermalSettings('collect_family_fee');
    await loadFamiliesData();
    
    btnFetch.addEventListener('click', handleFetch);
    btnPrintAll.addEventListener('click', handlePrintAll);
});

// ─── Load all active students and group into families ─────────────────────────
async function loadFamiliesData() {
    btnFetch.disabled = true;
    btnFetch.textContent = 'Loading database...';
    try {
        let studentsQuery = db
            .from('admissions')
            .select('id, roll_number, full_name, father_name, father_mobile, status, family_id_manual')
            .eq('status', 'Active')
            .order('roll_number');
            
        let displayNamesQuery = db
            .from('family_display_names')
            .select('mobile_number, family_name');
            
        if (getCurrentSchoolId()) {
            studentsQuery = studentsQuery.eq('school_id', getCurrentSchoolId());
            displayNamesQuery = displayNamesQuery.eq('school_id', getCurrentSchoolId());
        }

        const [studentsResult, displayNamesResult] = await Promise.all([studentsQuery, displayNamesQuery]);
        
        if (studentsResult.error) throw studentsResult.error;
        allStudents = studentsResult.data || [];
        
        familyDisplayNamesMap = new Map((displayNamesResult.data || []).map(row => [String(row.mobile_number || '').replace(/[\s-]/g, ''), row.family_name]));
        
        processFamilies(allStudents);

        btnFetch.disabled = false;
        btnFetch.textContent = 'Fetch Bills';
    } catch (e) {
        alert('Failed to load students: ' + e.message);
        btnFetch.textContent = 'Error Loading';
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
        if (members.length < 2) return; // Note: Family collect fee only looks at 2+ members
        
        const names = [...new Set(members.map(m => m.father_name).filter(n => n && n.trim() !== ''))];
        const primaryName = familyDisplayNamesMap.get(mobile) || (names.length > 0 ? names[0] : 'Unknown Family');
        const familyNos = [...new Set(members.map(m => m.family_id_manual).filter(n => n && n.trim() !== ''))];
        const familyNo = familyNos.length > 0 ? familyNos[0] : '';
        
        familiesData.push({
            mobile,
            members,
            primaryName,
            familyNo,
            firstStudentId: members[0].id
        });
    });
}

// ─── Fetch Action ─────────────────────────────────────────────────────────────
async function handleFetch() {
    const input = familyNumbersInput.value.trim();
    if (!input) {
        alert("Please enter family numbers.");
        return;
    }

    const requestedNumbers = input.split(',').map(n => n.trim().toLowerCase()).filter(n => n);
    if (requestedNumbers.length === 0) return;

    btnFetch.disabled = true;
    btnFetch.textContent = 'Fetching...';
    btnPrintAll.style.display = 'none';
    resultsSection.style.display = 'block';
    resultsList.innerHTML = '<div style="padding: 1rem; text-align: center; color: #64748b;">Querying challans...</div>';
    
    // Find matching families
    matchedFamilies = [];
    let notFound = [];
    
    for (const req of requestedNumbers) {
        const fam = familiesData.find(f => (f.familyNo || '').toLowerCase() === req);
        if (fam) {
            matchedFamilies.push({ ...fam, pendingDues: [], totalRemaining: 0, fetched: false });
        } else {
            notFound.push(req);
        }
    }

    // De-duplicate matched families (in case user entered same number twice)
    matchedFamilies = matchedFamilies.filter((v, i, a) => a.findIndex(t => (t.familyNo === v.familyNo)) === i);

    resultsStatus.innerHTML = `Found ${matchedFamilies.length} families. ${notFound.length > 0 ? `(Not found: ${notFound.join(', ')})` : ''}`;
    resultsList.innerHTML = '';

    if (matchedFamilies.length === 0) {
        btnFetch.disabled = false;
        btnFetch.textContent = 'Fetch Bills';
        return;
    }

    // Now fetch dues for all matched families
    for (const fam of matchedFamilies) {
        const studentIds = fam.members.map(m => m.id);
        const { data, error } = await db
            .from('challans')
            .select('*')
            .in('student_id', studentIds)
            .in('status', ['Unpaid', 'Partially Paid'])
            .order('due_date', { ascending: true });

        fam.fetched = true;
        fam.pendingDues = [];

        if (!error && data) {
            fam.pendingDues = data.map(ch => {
                const stu = fam.members.find(m => m.id === ch.student_id);
                return {
                    ...ch,
                    _studentName: stu ? stu.full_name : 'Unknown',
                    _studentRoll: stu ? stu.roll_number : '-'
                };
            });
            
            // Calculate total remaining
            fam.totalRemaining = fam.pendingDues.reduce((sum, c) => sum + (parseFloat(c.amount) - parseFloat(c.paid_amount || 0)), 0);
        }

        renderResultItem(fam);
    }

    btnFetch.disabled = false;
    btnFetch.textContent = 'Fetch Bills';
    
    if (matchedFamilies.some(f => f.pendingDues.length > 0)) {
        btnPrintAll.style.display = 'inline-block';
    }
}

function renderResultItem(fam) {
    const div = document.createElement('div');
    div.className = 'family-item';
    
    let statusHtml = '';
    if (fam.pendingDues.length > 0) {
        statusHtml = `<span class="family-status status-ready">Rs ${fam.totalRemaining.toLocaleString()} (${fam.pendingDues.length} challans)</span>`;
    } else {
        statusHtml = `<span class="family-status status-empty">Zero Balance</span>`;
    }

    div.innerHTML = `
        <div class="family-info">
            <strong>${fam.primaryName} (#${fam.familyNo})</strong>
            <span>${fam.members.length} Student(s) | Mobile: ${fam.mobile}</span>
        </div>
        ${statusHtml}
    `;
    resultsList.appendChild(div);
}

// ─── Print Action ─────────────────────────────────────────────────────────────
function handlePrintAll() {
    printContainer.innerHTML = '';
    let hasBills = false;
    
    const userName = cleanCollectorName(window.currentUserFullName);
    const dateStr = new Date().toLocaleString('en-PK', { timeZone: 'Asia/Karachi' });

    matchedFamilies.forEach((fam) => {
        if (fam.pendingDues.length === 0) return; // Skip zero balance
        
        hasBills = true;
        const wrapper = document.createElement('div');
        wrapper.className = 'print-receipt-wrapper';
        
        const txRecordsHtml = fam.pendingDues.map(c => {
            const rem = parseFloat(c.amount) - parseFloat(c.paid_amount || 0);
            let desc = c.fee_type;
            if (c.fee_month && c.fee_month !== 'N/A') desc += ` (${c.fee_month})`;
            desc = `[${c._studentName.split(' ')[0]} (${c._studentRoll})] ${desc}`;
            
            return `<div class="th-fee-row">
                        <span class="th-fee-desc">${desc}</span>
                        <span class="th-fee-amt">Rs ${Number(rem).toLocaleString()}</span>
                    </div>`;
        }).join('');

        const billHtml = `
            <div class="printArea">
                <!-- School Header -->
                <div class="th-center">
                    <div class="th-school">Zahid School</div>
                    <div class="th-phone">03337502737</div>
                    <div class="th-date">${dateStr}</div>
                    <div class="th-date" style="font-size:18px; font-weight:700;">${userName ? `User: ${userName}` : ''}</div>
                </div>
                <hr class="th-divider">

                <!-- Family Info -->
                <div class="th-row"><span class="th-label">Family Name</span><span class="th-value">${fam.primaryName}</span></div>
                <div class="th-row"><span class="th-label">Family #</span><span class="th-value">${fam.familyNo || 'N/A'}</span></div>
                <!-- Hidden Receipt No for matching exact logic of Bills where receipt no is hidden -->
                <div class="th-row" style="display:none;"><span class="th-label">Receipt #</span><span class="th-value"></span></div>
                <hr class="th-divider">

                <div class="th-center" style="font-size:20px; font-weight:900; margin-bottom:5px;">FAMILY COMBINED STATEMENT</div>

                <!-- Itemised Fee Lines (Grouped) -->
                <div>${txRecordsHtml}</div>
                <hr class="th-divider">

                <!-- Fine & Discount -->
                <div class="th-row" style="display:none;">
                    <span class="th-label">Fine (Rs)</span><span class="th-value">0</span>
                </div>
                <div class="th-row" style="display:none;">
                    <span class="th-label">Discount (Rs)</span><span class="th-value">0</span>
                </div>
                <hr class="th-divider" style="display:none;">

                <!-- Totals -->
                <div class="th-total-row" style="display:none;">
                    <span>Total Paid</span><span>Rs <span></span></span>
                </div>
                <div class="th-remain-row">
                    <span>Remaining</span><span>Rs <span>${fam.totalRemaining.toLocaleString()}</span></span>
                </div>
                <hr class="th-divider">

                <div class="th-footer">Thank you! — Zahid School System</div>
            </div>
        `;
        
        wrapper.innerHTML = billHtml;
        printContainer.appendChild(wrapper);
    });

    if (hasBills) {
        setTimeout(() => window.print(), 350);
    } else {
        alert("No bills to print among the selected families.");
    }
}

function cleanCollectorName(value) {
    return String(value || '').trim().replace(/\s*\([^)]*\)\s*$/, '').trim();
}

function applyThermalSettings(moduleName) {
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
