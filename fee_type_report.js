const db = window.supabaseClient;
const currentSchoolId = window.currentSchoolId || null;

let allRows = [];

const feeTypeFilter = document.getElementById('feeTypeFilter');
const classFilter = document.getElementById('classFilter');
const searchTextInput = document.getElementById('searchText');
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
const summaryFeeLabel = document.getElementById('summaryFeeLabel');

const LS_KEYS = {
    feeType: 'feeTypeReport.feeType',
    className: 'feeTypeReport.className',
    fontSize: 'feeTypeReport.fontSize',
    compactness: 'feeTypeReport.compactness'
};

function applySchoolScope(query) {
    return currentSchoolId ? query.eq('school_id', currentSchoolId) : query;
}

function toCurrencyLabel(amount) {
    return `Rs ${Math.round(Number(amount) || 0).toLocaleString()}`;
}

function updatePrintHeader() {
    const timeLabel = new Date().toLocaleTimeString('en-PK', {
        hour: 'numeric',
        minute: '2-digit',
        hour12: true
    });
    const dateLabel = new Date().toLocaleDateString('en-PK', {
        day: '2-digit',
        month: 'short',
        year: 'numeric'
    });
    const total = getFilteredRows().reduce((sum, row) => sum + row.paidAmount, 0);
    const feeTypeName = feeTypeFilter.options[feeTypeFilter.selectedIndex]?.text || '';
    
    printDateHeader.innerHTML = `Fee Type Report: <strong>${feeTypeName}</strong> | Date: ${dateLabel} ${timeLabel} | Total Collected: ${toCurrencyLabel(total)}`;
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
    fontSizeRange.value = localStorage.getItem(LS_KEYS.fontSize) || '8.5';
    compactnessRange.value = localStorage.getItem(LS_KEYS.compactness) || '80';
    applyLayoutControls();

    const waitAuth = setInterval(() => {
        if (window.authReady && window.supabaseClient) {
            clearInterval(waitAuth);
            initFilters();
        }
    }, 100);

    loadBtn.addEventListener('click', loadReport);
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
});

async function initFilters() {
    try {
        // Load Fee Types
        const { data: feeTypes, error: feeErr } = await applySchoolScope(
            db.from('fee_head_types')
                .select('name')
                .order('name')
        );
        if (feeErr) throw feeErr;

        feeTypeFilter.innerHTML = '<option value="" disabled selected>-- Select Fee Type --</option>' + 
            (feeTypes || []).map(f => `<option value="${f.name}">${f.name}</option>`).join('');

        const savedFeeType = localStorage.getItem(LS_KEYS.feeType);
        if (savedFeeType) {
            const hasOption = Array.from(feeTypeFilter.options).some(opt => opt.value === savedFeeType);
            if (hasOption) feeTypeFilter.value = savedFeeType;
        }

        // Load Classes
        const { data: classData, error: classErr } = await applySchoolScope(
            db.from('classes')
                .select('class_name, section')
                .order('class_name')
                .order('section')
        );
        if (classErr) throw classErr;

        // Extract unique class names based on admissions format
        const { data: admData } = await applySchoolScope(
            db.from('admissions')
                .select('applying_for_class')
                .eq('status', 'Active')
        );
        
        let uniqueClasses = [];
        if (admData) {
            uniqueClasses = [...new Set(admData.map(a => a.applying_for_class).filter(Boolean))].sort();
        }

        classFilter.innerHTML = '<option value="">All Classes</option>' + 
            uniqueClasses.map(c => `<option value="${c}">${c}</option>`).join('');

        const savedClassName = localStorage.getItem(LS_KEYS.className);
        if (savedClassName) {
            const hasOption = Array.from(classFilter.options).some(opt => opt.value === savedClassName);
            if (hasOption) classFilter.value = savedClassName;
        }

    } catch (err) {
        console.error('Error loading filters:', err);
    }
}

async function loadReport() {
    const selectedFeeType = feeTypeFilter.value;
    const selectedClass = classFilter.value;

    if (!selectedFeeType) {
        alert("Please select a Fee Type first.");
        return;
    }

    localStorage.setItem(LS_KEYS.feeType, selectedFeeType);
    localStorage.setItem(LS_KEYS.className, selectedClass);

    loadBtn.disabled = true;
    loadBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Loading';
    reportLogBody.innerHTML = '<tr><td colspan="9" class="empty">Loading report data...</td></tr>';

    try {
        // 1. Fetch Students (Filtered by Class if selected)
        let stuQuery = applySchoolScope(
            db.from('admissions')
                .select('id, full_name, father_name, applying_for_class, roll_number')
                .eq('status', 'Active')
        );

        if (selectedClass) {
            stuQuery = stuQuery.eq('applying_for_class', selectedClass);
        }

        const { data: stuData, error: stuErr } = await stuQuery;
        if (stuErr) throw stuErr;

        const students = stuData || [];
        if (students.length === 0) {
            allRows = [];
            renderRows();
            return;
        }

        const studentIds = students.map(s => s.id);

        // 2. Fetch Challans for these students with the target Fee Type
        // We want students who have PAID (or partially paid) this fee.
        const { data: chData, error: chErr } = await applySchoolScope(
            db.from('challans')
                .select('id, student_id, fee_type, fee_month, amount, paid_amount, status')
                .eq('fee_type', selectedFeeType)
                .in('student_id', studentIds)
                .gt('paid_amount', 0)
                .neq('status', 'Cancelled')
        );

        if (chErr) throw chErr;

        const challans = chData || [];

        // Build a map for students
        const admissionsMap = new Map((students).map(s => [s.id, s]));

        allRows = challans.map(ch => {
            const stu = admissionsMap.get(ch.student_id) || {};
            
            return {
                rollNo: stu.roll_number || 'N/A',
                studentName: stu.full_name || 'N/A',
                fatherName: stu.father_name || 'N/A',
                className: stu.applying_for_class || 'N/A',
                feeMonth: ch.fee_month || 'N/A',   
                totalAmount: Number(ch.amount || 0),
                paidAmount: Number(ch.paid_amount || 0),
                status: ch.status
            };
        });

        // Sort by Roll Number then Name
        allRows.sort((a, b) => {
            if (a.rollNo !== 'N/A' && b.rollNo !== 'N/A') {
                return Number(a.rollNo) - Number(b.rollNo);
            }
            return a.studentName.localeCompare(b.studentName);
        });

        renderRows();
    } catch (err) {
        console.error('Report load error:', err);
        reportLogBody.innerHTML = `<tr><td colspan="9" class="empty" style="color:#dc2626;">Failed to load data: ${err.message}</td></tr>`;
        rowCountEl.textContent = '0';
        totalAmountEl.textContent = 'Rs 0';
    } finally {
        loadBtn.disabled = false;
        loadBtn.innerHTML = '<i class="fas fa-sync"></i> Load';
    }
}

function getFilteredRows() {
    const q = (searchTextInput.value || '').trim().toLowerCase();

    return allRows.filter(r => {
        return !q || (
            String(r.rollNo).toLowerCase().includes(q) ||
            String(r.studentName).toLowerCase().includes(q) ||
            String(r.fatherName).toLowerCase().includes(q)
        );
    });
}

function renderRows() {
    const filtered = getFilteredRows();

    if (filtered.length === 0) {
        reportLogBody.innerHTML = '<tr><td colspan="9" class="empty">No records found for this filter.</td></tr>';
        rowCountEl.textContent = '0';
        totalAmountEl.textContent = 'Rs 0';
        updatePrintHeader();
        return;
    }

    let totalCollected = 0;
    
    // Render
    let rowsHtml = '';
    filtered.forEach((row, idx) => {
        totalCollected += row.paidAmount;

        let statusBadge = '';
        if (row.status === 'Paid') {
            statusBadge = '<span class="badge badge-paid">✓ Paid</span>';
        } else if (row.status === 'Partial') {
            statusBadge = '<span class="badge badge-partial">Partial</span>';
        } else {
            statusBadge = `<span class="badge badge-unpaid">${row.status}</span>`;
        }

        rowsHtml += `
            <tr>
                <td style="color:var(--muted); font-size:0.85em;">${idx + 1}</td>
                <td class="mono"><strong>${row.rollNo}</strong></td>
                <td>${row.studentName}</td>
                <td>${row.fatherName}</td>
                <td>${row.className}</td>
                <td>${row.feeMonth}</td>
                <td>${statusBadge}</td>
                <td style="text-align: right;">Rs ${Math.round(row.totalAmount).toLocaleString()}</td>
                <td style="text-align: right;"><strong>Rs ${Math.round(row.paidAmount).toLocaleString()}</strong></td>
            </tr>
        `;
    });

    reportLogBody.innerHTML = rowsHtml;

    // Use unique students count
    const uniqueStudents = new Set(filtered.map(r => r.rollNo + r.studentName)).size;
    rowCountEl.textContent = uniqueStudents.toLocaleString();
    
    totalAmountEl.textContent = toCurrencyLabel(totalCollected);
    
    updatePrintHeader();
}
