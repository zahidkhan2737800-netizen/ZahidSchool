// Monthly Fee Report — active admission fees and discounts.
const db = window.supabaseClient;
const applySchoolScope = query => window.currentSchoolId ? query.eq('school_id', window.currentSchoolId) : query;

const searchInput = document.getElementById('searchText');
const classFilter = document.getElementById('classFilter');
const fontSizeRange = document.getElementById('fontSizeRange');
const compactnessRange = document.getElementById('compactnessRange');
const fontSizeValue = document.getElementById('fontSizeValue');
const compactnessValue = document.getElementById('compactnessValue');
const loadBtn = document.getElementById('loadBtn');
const printBtn = document.getElementById('printBtn');
const reportBody = document.getElementById('reportBody');
const reportFoot = document.getElementById('reportFoot');

const LS_KEYS = {
    fontSize: 'monthly_fee_report_font_size',
    compactness: 'monthly_fee_report_compactness'
};

let allStudents = [];
let orderedClassNames = [];
let classOrderMap = new Map();

function money(value) {
    return `Rs ${Math.round(Number(value) || 0).toLocaleString()}`;
}

function escapeHtml(value) {
    return String(value ?? '')
        .replaceAll('&', '&amp;')
        .replaceAll('<', '&lt;')
        .replaceAll('>', '&gt;')
        .replaceAll('"', '&quot;')
        .replaceAll("'", '&#039;');
}

function compareNatural(a, b) {
    return String(a || '').localeCompare(String(b || ''), undefined, { numeric: true, sensitivity: 'base' });
}

function classKey(value) {
    return String(value || '').trim().replace(/\s+/g, ' ').toLowerCase();
}

function getFilteredStudents() {
    const search = searchInput.value.trim().toLowerCase();
    const selectedClass = classFilter.value;
    return allStudents.filter(student => {
        if (selectedClass && classKey(student.applying_for_class) !== classKey(selectedClass)) return false;
        if (!search) return true;
        return [student.full_name, student.roll_number, student.applying_for_class]
            .some(value => String(value || '').toLowerCase().includes(search));
    });
}

function updateSchoolSummary() {
    const totalFee = allStudents.reduce((sum, student) => sum + student.monthlyFee, 0);
    const totalDiscount = allStudents.reduce((sum, student) => sum + student.discount, 0);
    document.getElementById('activeCount').textContent = allStudents.length.toLocaleString();
    document.getElementById('totalMonthlyFee').textContent = money(totalFee);
    document.getElementById('totalDiscount').textContent = money(totalDiscount);
}

function updatePrintHeader(visibleStudents) {
    const totalFee = allStudents.reduce((sum, student) => sum + student.monthlyFee, 0);
    const totalDiscount = allStudents.reduce((sum, student) => sum + student.discount, 0);
    const schoolName = window.currentSchoolName && window.currentSchoolName !== 'System'
        ? window.currentSchoolName
        : 'Zahid School';
    document.getElementById('printTitle').textContent = `${schoolName} — Monthly Fee Report`;
    document.getElementById('printDateHeader').textContent =
        `Generated: ${new Date().toLocaleString('en-PK')} | Active Students: ${allStudents.length.toLocaleString()} | ` +
        `Total Monthly Fee: ${money(totalFee)} | Total School Discount: ${money(totalDiscount)} | ` +
        `Printed Rows: ${visibleStudents.length.toLocaleString()}`;
}

function renderReport() {
    const rows = getFilteredStudents();
    document.getElementById('visibleCount').textContent = rows.length.toLocaleString();

    if (rows.length === 0) {
        reportBody.innerHTML = '<tr><td colspan="6" class="empty">No active students match the selected filters.</td></tr>';
        reportFoot.innerHTML = '';
        updatePrintHeader(rows);
        return;
    }

    reportBody.innerHTML = rows.map((student, index) => `
        <tr>
            <td>${index + 1}</td>
            <td class="mono">${escapeHtml(student.roll_number || '—')}</td>
            <td><strong>${escapeHtml(student.full_name || '—')}</strong></td>
            <td>${escapeHtml(student.applying_for_class || '—')}</td>
            <td class="number-cell discount-cell">${money(student.discount)}</td>
            <td class="number-cell fee-cell">${money(student.monthlyFee)}</td>
        </tr>
    `).join('');

    const visibleDiscount = rows.reduce((sum, student) => sum + student.discount, 0);
    const visibleFee = rows.reduce((sum, student) => sum + student.monthlyFee, 0);
    reportFoot.innerHTML = `
        <tr>
            <td colspan="4" style="text-align:right">Visible Total (${rows.length.toLocaleString()} students)</td>
            <td class="number-cell discount-cell">${money(visibleDiscount)}</td>
            <td class="number-cell fee-cell">${money(visibleFee)}</td>
        </tr>`;
    updatePrintHeader(rows);
}

function populateClassFilter() {
    const previous = classFilter.value;
    // Keep the exact manual order from Class Management. Any legacy class that
    // is attached to an active student but no longer exists there is shown last.
    const configuredKeys = new Set(orderedClassNames.map(classKey));
    const unconfiguredClasses = [...new Set(allStudents
        .map(student => String(student.applying_for_class || '').trim())
        .filter(className => className && !configuredKeys.has(classKey(className))))]
        .sort(compareNatural);
    const classes = [...orderedClassNames, ...unconfiguredClasses];
    classFilter.innerHTML = '<option value="">All Classes</option>' + classes
        .map(className => `<option value="${escapeHtml(className)}">${escapeHtml(className)}</option>`)
        .join('');
    if (classes.includes(previous)) classFilter.value = previous;
}

function applyLayoutControls() {
    const font = Number(fontSizeRange.value || 10);
    const compact = Number(compactnessRange.value || 70);
    const tdVertical = Math.max(2, 8 - compact * 0.05);
    const tdHorizontal = Math.max(4, 8 - compact * 0.03);
    const thVertical = Math.max(2.2, 9 - compact * 0.055);
    const thHorizontal = Math.max(4, 8 - compact * 0.03);
    const printFont = Math.max(7, font - 0.5);
    const printTdVertical = Math.max(0.9, 2.8 - compact * 0.015);
    const printTdHorizontal = Math.max(2.4, 4 - compact * 0.013);
    const printThVertical = Math.max(1.2, 3 - compact * 0.016);
    const printThHorizontal = Math.max(2.4, 4 - compact * 0.013);

    document.documentElement.style.setProperty('--table-font-size', `${font}px`);
    document.documentElement.style.setProperty('--table-td-pad', `${tdVertical.toFixed(1)}px ${tdHorizontal.toFixed(1)}px`);
    document.documentElement.style.setProperty('--table-th-pad', `${thVertical.toFixed(1)}px ${thHorizontal.toFixed(1)}px`);
    document.documentElement.style.setProperty('--print-font-size', `${printFont.toFixed(1)}px`);
    document.documentElement.style.setProperty('--print-td-pad', `${printTdVertical.toFixed(1)}px ${printTdHorizontal.toFixed(1)}px`);
    document.documentElement.style.setProperty('--print-th-pad', `${printThVertical.toFixed(1)}px ${printThHorizontal.toFixed(1)}px`);
    fontSizeValue.textContent = `${font.toFixed(1)}px`;
    compactnessValue.textContent = `${Math.round(compact)}%`;
}

async function loadReport() {
    loadBtn.disabled = true;
    loadBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Loading';
    reportBody.innerHTML = '<tr><td colspan="6" class="empty">Loading active students...</td></tr>';
    reportFoot.innerHTML = '';

    try {
        const [studentsResult, classesResult] = await Promise.all([
            applySchoolScope(
                db.from('admissions')
                    .select('id, roll_number, full_name, applying_for_class, monthly_fee, discount')
                    .eq('status', 'Active')
            ),
            applySchoolScope(
                db.from('classes')
                    .select('class_name, section, display_order, is_active')
                    .eq('is_active', true)
                    .order('display_order', { ascending: true, nullsFirst: false })
                    .order('class_name', { ascending: true })
                    .order('section', { ascending: true })
            )
        ]);
        if (studentsResult.error) throw studentsResult.error;
        if (classesResult.error) throw classesResult.error;

        const seenClassKeys = new Set();
        orderedClassNames = (classesResult.data || [])
            .map(item => `${item.class_name || ''} ${item.section || ''}`.trim().replace(/\s+/g, ' '))
            .filter(className => {
                const key = classKey(className);
                if (!key || seenClassKeys.has(key)) return false;
                seenClassKeys.add(key);
                return true;
            });
        classOrderMap = new Map(orderedClassNames.map((className, index) => [classKey(className), index]));

        allStudents = (studentsResult.data || []).map(student => ({
            ...student,
            monthlyFee: Math.max(0, Number(student.monthly_fee) || 0),
            discount: Math.max(0, Number(student.discount) || 0)
        })).sort((a, b) =>
            (classOrderMap.get(classKey(a.applying_for_class)) ?? Number.MAX_SAFE_INTEGER) -
                (classOrderMap.get(classKey(b.applying_for_class)) ?? Number.MAX_SAFE_INTEGER) ||
            (classOrderMap.has(classKey(a.applying_for_class)) ? 0 : compareNatural(a.applying_for_class, b.applying_for_class)) ||
            compareNatural(a.roll_number, b.roll_number) ||
            compareNatural(a.full_name, b.full_name)
        );

        populateClassFilter();
        updateSchoolSummary();
        renderReport();
    } catch (error) {
        console.error('Monthly fee report load failed:', error);
        allStudents = [];
        updateSchoolSummary();
        document.getElementById('visibleCount').textContent = '0';
        reportBody.innerHTML = `<tr><td colspan="6" class="empty" style="color:#dc2626">Error: ${escapeHtml(error.message || 'Could not load report.')}</td></tr>`;
    } finally {
        loadBtn.disabled = false;
        loadBtn.innerHTML = '<i class="fas fa-sync"></i> Load';
    }
}

window.onAppReady(() => {
    fontSizeRange.value = localStorage.getItem(LS_KEYS.fontSize) || '10';
    compactnessRange.value = localStorage.getItem(LS_KEYS.compactness) || '70';
    applyLayoutControls();

    searchInput.addEventListener('input', renderReport);
    classFilter.addEventListener('change', renderReport);
    loadBtn.addEventListener('click', loadReport);
    fontSizeRange.addEventListener('input', applyLayoutControls);
    compactnessRange.addEventListener('input', applyLayoutControls);
    fontSizeRange.addEventListener('change', () => localStorage.setItem(LS_KEYS.fontSize, fontSizeRange.value));
    compactnessRange.addEventListener('change', () => localStorage.setItem(LS_KEYS.compactness, compactnessRange.value));
    printBtn.addEventListener('click', () => {
        applyLayoutControls();
        updatePrintHeader(getFilteredStudents());
        window.print();
    });

    loadReport();
});
