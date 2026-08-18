// Daily Class Absent — compact thermal attendance summary.
const db = window.supabaseClient;
const applySchoolScope = query => window.currentSchoolId ? query.eq('school_id', window.currentSchoolId) : query;

const reportDate = document.getElementById('reportDate');
const loadBtn = document.getElementById('loadBtn');
const printBtn = document.getElementById('printBtn');
const statusText = document.getElementById('statusText');
const reportBody = document.getElementById('reportBody');
const reportFoot = document.getElementById('reportFoot');

let reportRows = [];

function classKey(value) {
    return String(value || '').trim().replace(/\s+/g, ' ').toLowerCase();
}

function escapeHtml(value) {
    return String(value ?? '')
        .replaceAll('&', '&amp;')
        .replaceAll('<', '&lt;')
        .replaceAll('>', '&gt;')
        .replaceAll('"', '&quot;')
        .replaceAll("'", '&#039;');
}

function formatDate(dateValue) {
    if (!dateValue) return '—';
    const [year, month, day] = dateValue.split('-');
    return `${day}/${month}/${year}`;
}

function compareNatural(a, b) {
    return String(a || '').localeCompare(String(b || ''), undefined, { numeric:true, sensitivity:'base' });
}

function renderReport() {
    const schoolName = window.currentSchoolName && window.currentSchoolName !== 'System'
        ? window.currentSchoolName
        : 'Zahid School';
    document.getElementById('schoolName').textContent = schoolName;
    document.getElementById('printedDate').textContent = formatDate(reportDate.value);

    if (reportRows.length === 0) {
        reportBody.innerHTML = '<tr><td colspan="4" style="text-align:center;padding:8px 0">No active classes</td></tr>';
        reportFoot.innerHTML = '';
        document.getElementById('receiptFooter').textContent = 'Total Classes: 0';
        return;
    }

    reportBody.innerHTML = reportRows.map(row => `
        <tr>
            <td>${escapeHtml(row.className)}</td>
            <td class="num">${row.total}</td>
            <td class="num">${row.present}</td>
            <td class="num">${row.absent}</td>
        </tr>`).join('');

    const totals = reportRows.reduce((sum, row) => ({
        total: sum.total + row.total,
        present: sum.present + row.present,
        absent: sum.absent + row.absent
    }), { total:0, present:0, absent:0 });

    reportFoot.innerHTML = `
        <tr>
            <td>Total</td>
            <td class="num">${totals.total}</td>
            <td class="num">${totals.present}</td>
            <td class="num">${totals.absent}</td>
        </tr>`;
    document.getElementById('receiptFooter').textContent = `Total Classes: ${reportRows.length}`;
}

async function loadReport() {
    const selectedDate = reportDate.value;
    if (!selectedDate) return;

    loadBtn.disabled = true;
    loadBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Loading';
    statusText.textContent = 'Loading attendance...';

    try {
        const [classesResult, studentsResult, attendanceResult] = await Promise.all([
            applySchoolScope(
                db.from('classes')
                    .select('class_name, section, display_order, is_active')
                    .eq('is_active', true)
                    .order('display_order', { ascending:true, nullsFirst:false })
                    .order('class_name', { ascending:true })
                    .order('section', { ascending:true })
            ),
            applySchoolScope(
                db.from('admissions')
                    .select('id, applying_for_class, status')
                    .in('status', ['Active', 'active'])
            ),
            applySchoolScope(
                db.from('attendance')
                    .select('student_id, status, date')
                    .eq('date', selectedDate)
            )
        ]);

        if (classesResult.error) throw classesResult.error;
        if (studentsResult.error) throw studentsResult.error;
        if (attendanceResult.error) throw attendanceResult.error;

        const configuredNames = [];
        const configuredNameByKey = new Map();
        (classesResult.data || []).forEach(item => {
            const name = `${item.class_name || ''} ${item.section || ''}`.trim().replace(/\s+/g, ' ');
            const key = classKey(name);
            if (key && !configuredNameByKey.has(key)) {
                configuredNames.push(name);
                configuredNameByKey.set(key, name);
            }
        });
        const configuredOrder = new Map(configuredNames.map((name, index) => [classKey(name), index]));

        const attendanceByStudent = new Map();
        (attendanceResult.data || []).forEach(record => attendanceByStudent.set(String(record.student_id), record.status));

        const statsByClass = new Map();
        (studentsResult.data || []).forEach(student => {
            const rawClass = String(student.applying_for_class || '').trim().replace(/\s+/g, ' ');
            const key = classKey(rawClass) || '__unassigned__';
            const className = configuredNameByKey.get(key) || rawClass || 'Unassigned';
            if (!statsByClass.has(key)) statsByClass.set(key, { className, total:0, present:0, absent:0 });

            const stats = statsByClass.get(key);
            stats.total += 1;
            const status = String(attendanceByStudent.get(String(student.id)) || '').toLowerCase();
            if (status === 'present' || status === 'late') stats.present += 1;
            if (status === 'absent') stats.absent += 1;
        });

        reportRows = [...statsByClass.entries()]
            .map(([key, stats]) => ({ key, ...stats }))
            .filter(row => row.total > 0)
            .sort((a, b) => {
                const aOrder = configuredOrder.get(a.key) ?? Number.MAX_SAFE_INTEGER;
                const bOrder = configuredOrder.get(b.key) ?? Number.MAX_SAFE_INTEGER;
                return aOrder - bOrder || compareNatural(a.className, b.className);
            });

        renderReport();
        const absentTotal = reportRows.reduce((sum, row) => sum + row.absent, 0);
        statusText.textContent = `${reportRows.length} classes · ${absentTotal} absent`;
    } catch (error) {
        console.error('Daily Class Absent load failed:', error);
        reportRows = [];
        renderReport();
        reportBody.innerHTML = `<tr><td colspan="4" style="text-align:center;color:#b91c1c;padding:8px 0">${escapeHtml(error.message || 'Could not load report')}</td></tr>`;
        statusText.textContent = 'Could not load report';
    } finally {
        loadBtn.disabled = false;
        loadBtn.innerHTML = '<i class="fas fa-sync"></i> Load';
    }
}

window.onAppReady(() => {
    reportDate.value = window.karachiToday ? window.karachiToday() : new Date().toISOString().split('T')[0];
    reportDate.max = reportDate.value;
    reportDate.addEventListener('change', loadReport);
    loadBtn.addEventListener('click', loadReport);
    printBtn.addEventListener('click', () => {
        renderReport();
        window.print();
    });
    loadReport();
});
