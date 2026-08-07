let teacherFeeRows = [];
let filteredTeacherFeeRows = [];
let allActiveStudents = [];
let showOnlyUnfilledTeacherFeeRows = false;

const teacherFeeBody = document.getElementById('teacherFeeBody');
const teacherFeeSearch = document.getElementById('teacherFeeSearch');
const teacherClassSelect = document.getElementById('teacherClassSelect');
const fontSizeRange = document.getElementById('fontSizeRange');
const compactnessRange = document.getElementById('compactnessRange');
const fontSizeValue = document.getElementById('fontSizeValue');
const compactnessValue = document.getElementById('compactnessValue');

const TEACHER_FEE_CHOICES = ['Ask', 'Std 10', 'Std 40', 'St 80', 'Stc 10'];
const TEACHER_FEE_LAYOUT_KEYS = {
    fontSize: 'teacherFee.fontSize',
    compactness: 'teacherFee.compactness'
};

function legacyStudentSelectionKey() {
    return `teacher_fee_student_ids_${window.currentSchoolId || 'global'}`;
}

function legacyFamilySelectionKey() {
    return `teacher_fee_family_mobiles_${window.currentSchoolId || 'global'}`;
}

function readLegacyArray(key) {
    try {
        const stored = JSON.parse(localStorage.getItem(key) || '[]');
        return Array.isArray(stored) ? stored.map(String).filter(Boolean) : [];
    } catch (error) {
        return [];
    }
}

function escapeTeacherFeeHtml(value) {
    return String(value ?? '').replace(/[&<>'"]/g, char => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;'
    }[char]));
}

function showTeacherFeeToast(message, isError = false) {
    const toast = document.getElementById('teacherFeeToast');
    toast.textContent = message;
    toast.classList.toggle('error', isError);
    toast.style.display = 'block';
    window.clearTimeout(showTeacherFeeToast.timer);
    showTeacherFeeToast.timer = window.setTimeout(() => { toast.style.display = 'none'; }, 3200);
}

function isMissingTeacherFeeTable(error) {
    const message = String(error?.message || '').toLowerCase();
    return error?.code === '42P01' || error?.code === 'PGRST205' || message.includes('teacher_fee_rows');
}

function teacherFeeErrorMessage(error) {
    return isMissingTeacherFeeTable(error)
        ? 'TeacherFee storage is not installed. Run teacher_fee_setup.sql in Supabase.'
        : (error?.message || 'Unknown error');
}

async function waitForTeacherFeeAuth(timeoutMs = 10000) {
    const started = Date.now();
    while (Date.now() - started < timeoutMs) {
        if (window.authReady === true && window.supabaseClient) return;
        await new Promise(resolve => setTimeout(resolve, 80));
    }
}

function applyTeacherFeeLayout() {
    const font = Number(fontSizeRange.value || 9);
    const compact = Number(compactnessRange.value || 75);
    const tdVertical = Math.max(2, 8 - (compact * .05));
    const tdHorizontal = Math.max(4, 8 - (compact * .03));
    const thVertical = Math.max(2.2, 9 - (compact * .055));
    const thHorizontal = Math.max(4, 8 - (compact * .03));
    const printFont = Math.max(7, font - .5);
    const printTdVertical = Math.max(.9, 2.8 - (compact * .015));
    const printTdHorizontal = Math.max(2.4, 4 - (compact * .013));
    const printThVertical = Math.max(1.2, 3 - (compact * .016));
    const printThHorizontal = Math.max(2.4, 4 - (compact * .013));

    document.documentElement.style.setProperty('--table-font-size', `${font}px`);
    document.documentElement.style.setProperty('--table-td-pad', `${tdVertical.toFixed(1)}px ${tdHorizontal.toFixed(1)}px`);
    document.documentElement.style.setProperty('--table-th-pad', `${thVertical.toFixed(1)}px ${thHorizontal.toFixed(1)}px`);
    document.documentElement.style.setProperty('--print-font-size', `${printFont.toFixed(1)}px`);
    document.documentElement.style.setProperty('--print-td-pad', `${printTdVertical.toFixed(1)}px ${printTdHorizontal.toFixed(1)}px`);
    document.documentElement.style.setProperty('--print-th-pad', `${printThVertical.toFixed(1)}px ${printThHorizontal.toFixed(1)}px`);
    fontSizeValue.textContent = `${font.toFixed(1)}px`;
    compactnessValue.textContent = `${Math.round(compact)}%`;
}

function choiceOptionsHtml(selectedValue) {
    const selected = String(selectedValue || '');
    return '<option value="">—</option>' + TEACHER_FEE_CHOICES.map(choice =>
        `<option value="${choice}"${choice === selected ? ' selected' : ''}>${choice}</option>`
    ).join('');
}

function formatTeacherFeeCommitmentDate(ymd) {
    const match = String(ymd || '').match(/^(\d{4})-(\d{2})-(\d{2})$/);
    return match ? `${match[3]}-${match[2]}` : '—';
}

function formatTeacherFeeAmount(value) {
    return `Rs ${Math.max(0, Number(value || 0)).toLocaleString('en-PK')}`;
}

async function migrateLegacySelections(existingRows) {
    if (!window.currentSchoolId) return false;
    const legacyIds = new Set(readLegacyArray(legacyStudentSelectionKey()));
    const legacyMobiles = new Set(readLegacyArray(legacyFamilySelectionKey()).map(value => value.trim()).filter(Boolean));
    allActiveStudents.forEach(student => {
        if (legacyMobiles.has(String(student.father_mobile || '').trim())) legacyIds.add(String(student.id));
    });
    if (!legacyIds.size) return false;

    const existingIds = new Set((existingRows || []).map(row => String(row.student_id)));
    const payload = allActiveStudents
        .filter(student => legacyIds.has(String(student.id)) && !existingIds.has(String(student.id)))
        .map(student => ({
            school_id: window.currentSchoolId,
            student_id: student.id,
            source: legacyMobiles.has(String(student.father_mobile || '').trim()) ? 'Family' : 'Student',
            added_by: window.currentUser?.id || null,
            updated_by: window.currentUser?.id || null
        }));

    if (payload.length) {
        const { error } = await window.supabaseClient
            .from('teacher_fee_rows')
            .upsert(payload, { onConflict: 'school_id,student_id', ignoreDuplicates: true });
        if (error) throw error;
    }

    localStorage.removeItem(legacyStudentSelectionKey());
    localStorage.removeItem(legacyFamilySelectionKey());
    localStorage.removeItem(`teacher_fee_assignments_${window.currentSchoolId || 'global'}`);
    localStorage.removeItem(`teacher_fee_class_teachers_${window.currentSchoolId || 'global'}`);
    return payload.length > 0;
}

async function fetchTeacherFeeRows() {
    let rowsQuery = window.supabaseClient
        .from('teacher_fee_rows')
        .select('id, student_id, source, choice_1, choice_2, choice_3, choice_4, created_at')
        .order('created_at', { ascending: true });
    let studentsQuery = window.supabaseClient
        .from('admissions')
        .select('id, roll_number, full_name, father_name, father_mobile, applying_for_class, family_id_manual')
        .eq('status', 'Active')
        .order('roll_number', { ascending: true });
    let commitmentsQuery = window.supabaseClient
        .from('family_fee_commitments')
        .select('members, due_date')
        .eq('status', 'Pending')
        .order('due_date', { ascending: true });
    if (window.currentSchoolId) {
        rowsQuery = rowsQuery.eq('school_id', window.currentSchoolId);
        studentsQuery = studentsQuery.eq('school_id', window.currentSchoolId);
        commitmentsQuery = commitmentsQuery.eq('school_id', window.currentSchoolId);
    }

    const [rowsResult, studentsResult, commitmentsResult] = await Promise.all([rowsQuery, studentsQuery, commitmentsQuery]);
    if (rowsResult.error) throw rowsResult.error;
    if (studentsResult.error) throw studentsResult.error;
    allActiveStudents = studentsResult.data || [];

    const commitmentByStudent = new Map();
    if (!commitmentsResult.error) {
        (commitmentsResult.data || []).forEach(commitment => {
            (Array.isArray(commitment.members) ? commitment.members : []).forEach(member => {
                const studentId = String(member?.student_id || '');
                if (studentId && !commitmentByStudent.has(studentId)) {
                    commitmentByStudent.set(studentId, commitment.due_date);
                }
            });
        });
    } else {
        console.warn('Could not load TeacherFee commitments:', commitmentsResult.error);
    }

    let rows = rowsResult.data || [];
    if (await migrateLegacySelections(rows)) {
        let refreshedQuery = window.supabaseClient
            .from('teacher_fee_rows')
            .select('id, student_id, source, choice_1, choice_2, choice_3, choice_4, created_at')
            .order('created_at', { ascending: true });
        if (window.currentSchoolId) refreshedQuery = refreshedQuery.eq('school_id', window.currentSchoolId);
        const refreshed = await refreshedQuery;
        if (refreshed.error) throw refreshed.error;
        rows = refreshed.data || [];
    }

    const balanceByStudent = new Map();
    const selectedStudentIds = [...new Set(rows.map(row => row.student_id).filter(Boolean))];
    for (let index = 0; index < selectedStudentIds.length; index += 40) {
        const batch = selectedStudentIds.slice(index, index + 40);
        const { data: challans, error: challansError } = await window.supabaseClient
            .from('challans')
            .select('student_id, amount, paid_amount')
            .in('student_id', batch)
            .in('status', ['Unpaid', 'Partially Paid'])
            .limit(2000);
        if (challansError) {
            console.warn('Could not load TeacherFee remaining balances:', challansError);
            break;
        }
        (challans || []).forEach(challan => {
            const studentId = String(challan.student_id);
            const remaining = Math.max(0, Number(challan.amount || 0) - Number(challan.paid_amount || 0));
            balanceByStudent.set(studentId, (balanceByStudent.get(studentId) || 0) + remaining);
        });
    }

    const studentsById = new Map(allActiveStudents.map(student => [String(student.id), student]));
    return rows
        .map(row => ({
            ...row,
            student: studentsById.get(String(row.student_id)),
            commitment_due_date: commitmentByStudent.get(String(row.student_id)) || null,
            remaining_amount: balanceByStudent.get(String(row.student_id)) || 0
        }))
        .filter(row => row.student);
}

async function loadTeacherFeeList() {
    teacherFeeBody.innerHTML = '<tr><td colspan="13" class="empty">Loading TeacherFee list...</td></tr>';
    try {
        teacherFeeRows = await fetchTeacherFeeRows();
        populateClassFilter();
        renderTeacherFeeList();
    } catch (error) {
        console.error('Could not load TeacherFee list:', error);
        teacherFeeRows = [];
        const message = teacherFeeErrorMessage(error);
        teacherFeeBody.innerHTML = `<tr><td colspan="13" class="empty">${escapeTeacherFeeHtml(message)}</td></tr>`;
        updateTeacherFeeSummary([]);
        if (isMissingTeacherFeeTable(error)) showTeacherFeeToast(message, true);
    }
}

function populateClassFilter() {
    const previousClass = teacherClassSelect.value;
    const classes = [...new Set(teacherFeeRows.map(row => String(row.student.applying_for_class || '').trim()).filter(Boolean))]
        .sort((a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' }));
    teacherClassSelect.innerHTML = '<option value="">All classes</option>' + classes.map(className =>
        `<option value="${escapeTeacherFeeHtml(className)}">${escapeTeacherFeeHtml(className)}</option>`
    ).join('');
    if (classes.includes(previousClass)) teacherClassSelect.value = previousClass;
}

function renderTeacherFeeList() {
    const search = String(teacherFeeSearch.value || '').trim().toLowerCase();
    const classFilter = teacherClassSelect.value;
    filteredTeacherFeeRows = teacherFeeRows.filter(row => {
        const student = row.student;
        if (classFilter && String(student.applying_for_class || '') !== classFilter) return false;
        if (showOnlyUnfilledTeacherFeeRows && (row.choice_1 || row.choice_2 || row.choice_3 || row.choice_4)) return false;
        if (!search) return true;
        return [student.roll_number, student.full_name, student.applying_for_class, student.father_name, student.family_id_manual, row.commitment_due_date, row.choice_1, row.choice_2, row.choice_3, row.choice_4]
            .filter(Boolean).join(' ').toLowerCase().includes(search);
    }).sort((a, b) => {
        const aClass = String(a.student.applying_for_class || '');
        const bClass = String(b.student.applying_for_class || '');
        if (aClass !== bClass) return aClass.localeCompare(bClass, undefined, { numeric: true, sensitivity: 'base' });
        return String(a.student.roll_number || '').localeCompare(String(b.student.roll_number || ''), undefined, { numeric: true, sensitivity: 'base' });
    });

    if (!filteredTeacherFeeRows.length) {
        const message = teacherFeeRows.length
            ? (showOnlyUnfilledTeacherFeeRows ? 'No completely unfilled student rows match the selected filters.' : 'No student rows match the selected filters.')
            : 'No students selected. Click T in Family Fee Contacts or Student Fee Contacts.';
        teacherFeeBody.innerHTML = `<tr><td colspan="13" class="empty">${message}</td></tr>`;
        updateTeacherFeeSummary([]);
        return;
    }

    teacherFeeBody.innerHTML = filteredTeacherFeeRows.map((row, index) => {
        const student = row.student;
        const choiceCells = ['choice_1', 'choice_2', 'choice_3', 'choice_4'].map(field => `
            <td>
                <select class="choice-select screen-only" data-row-id="${escapeTeacherFeeHtml(row.id)}" data-field="${field}">${choiceOptionsHtml(row[field])}</select>
                <span class="choice-print">${escapeTeacherFeeHtml(row[field] || '—')}</span>
            </td>`).join('');
        return `<tr>
            <td>${index + 1}</td>
            <td><strong>${escapeTeacherFeeHtml(student.roll_number || '—')}</strong></td>
            <td class="student-name">${escapeTeacherFeeHtml(student.full_name || 'Student')}</td>
            <td class="class-cell">${escapeTeacherFeeHtml(student.applying_for_class || '—')}</td>
            <td>${escapeTeacherFeeHtml(student.father_name || '—')}</td>
            <td>${escapeTeacherFeeHtml(student.family_id_manual || '—')}</td>
            <td><span class="commitment-date ${row.commitment_due_date ? '' : 'none'}" title="${row.commitment_due_date ? `Payment due ${escapeTeacherFeeHtml(row.commitment_due_date)}` : 'No pending commitment'}">${formatTeacherFeeCommitmentDate(row.commitment_due_date)}</span></td>
            <td class="remaining-cell screen-only">${formatTeacherFeeAmount(row.remaining_amount)}</td>
            ${choiceCells}
            <td class="screen-only"><button class="remove-student-btn" data-row-id="${escapeTeacherFeeHtml(row.id)}"><i class="fas fa-xmark"></i> Remove</button></td>
        </tr>`;
    }).join('');
    updateTeacherFeeSummary(filteredTeacherFeeRows);
}

function updateTeacherFeeSummary(rows) {
    const classCount = new Set(rows.map(row => String(row.student?.applying_for_class || '')).filter(Boolean)).size;
    const selectedCount = rows.filter(row => row.choice_1 || row.choice_2 || row.choice_3 || row.choice_4).length;
    document.getElementById('teacherStudentCount').textContent = rows.length.toLocaleString();
    document.getElementById('teacherClassCount').textContent = classCount.toLocaleString();
    document.getElementById('teacherSelectedCount').textContent = selectedCount.toLocaleString();

    const printed = new Date().toLocaleString('en-PK', { dateStyle: 'medium', timeStyle: 'short', hour12: true, timeZone: 'Asia/Karachi' });
    const classLabel = teacherClassSelect.value || 'All classes';
    document.getElementById('teacherPrintHeader').textContent = `Zahid School — TeacherFee | Class: ${classLabel} | Printed: ${printed} | Student Rows: ${rows.length}`;
}

async function saveTeacherFeeChoice(select) {
    const row = teacherFeeRows.find(item => String(item.id) === String(select.dataset.rowId));
    const field = select.dataset.field;
    if (!row || !['choice_1', 'choice_2', 'choice_3', 'choice_4'].includes(field)) return;
    const previousValue = row[field] || '';
    const nextValue = select.value || null;
    select.disabled = true;
    row[field] = nextValue;
    updateTeacherFeeSummary(filteredTeacherFeeRows);
    try {
        const payload = {
            [field]: nextValue,
            updated_at: new Date().toISOString(),
            updated_by: window.currentUser?.id || null
        };
        const { error } = await window.supabaseClient.from('teacher_fee_rows').update(payload).eq('id', row.id);
        if (error) throw error;
        const printValue = select.parentElement.querySelector('.choice-print');
        if (printValue) printValue.textContent = nextValue || '—';
        showTeacherFeeToast(`${field.replace('_', ' ')} saved for ${row.student.full_name}.`);
    } catch (error) {
        row[field] = previousValue || null;
        select.value = previousValue;
        showTeacherFeeToast(`Could not save: ${teacherFeeErrorMessage(error)}`, true);
    } finally {
        select.disabled = false;
        if (showOnlyUnfilledTeacherFeeRows) renderTeacherFeeList();
        else updateTeacherFeeSummary(filteredTeacherFeeRows);
    }
}

async function removeTeacherFeeRow(rowId) {
    const row = teacherFeeRows.find(item => String(item.id) === String(rowId));
    if (!row || !window.confirm(`Remove ${row.student.full_name} from TeacherFee?`)) return;
    const { error } = await window.supabaseClient.from('teacher_fee_rows').delete().eq('id', row.id);
    if (error) {
        showTeacherFeeToast(`Could not remove row: ${teacherFeeErrorMessage(error)}`, true);
        return;
    }
    teacherFeeRows = teacherFeeRows.filter(item => String(item.id) !== String(row.id));
    populateClassFilter();
    renderTeacherFeeList();
    showTeacherFeeToast(`${row.student.full_name} removed from TeacherFee.`);
}

async function clearTeacherFeeList() {
    if (!teacherFeeRows.length || !window.confirm('Clear every student from the shared TeacherFee list?')) return;
    const rowIds = teacherFeeRows.map(row => row.id);
    const { error } = await window.supabaseClient.from('teacher_fee_rows').delete().in('id', rowIds);
    if (error) {
        showTeacherFeeToast(`Could not clear list: ${teacherFeeErrorMessage(error)}`, true);
        return;
    }
    teacherFeeRows = [];
    populateClassFilter();
    renderTeacherFeeList();
    showTeacherFeeToast('TeacherFee list cleared.');
}

document.addEventListener('DOMContentLoaded', async () => {
    fontSizeRange.value = localStorage.getItem(TEACHER_FEE_LAYOUT_KEYS.fontSize) || '9';
    compactnessRange.value = localStorage.getItem(TEACHER_FEE_LAYOUT_KEYS.compactness) || '75';
    applyTeacherFeeLayout();
    await waitForTeacherFeeAuth();
    await loadTeacherFeeList();

    teacherFeeSearch.addEventListener('input', renderTeacherFeeList);
    teacherClassSelect.addEventListener('change', renderTeacherFeeList);
    document.getElementById('filterUnfilledTeacherFee').addEventListener('click', event => {
        showOnlyUnfilledTeacherFeeRows = !showOnlyUnfilledTeacherFeeRows;
        event.currentTarget.classList.toggle('active', showOnlyUnfilledTeacherFeeRows);
        event.currentTarget.setAttribute('aria-pressed', String(showOnlyUnfilledTeacherFeeRows));
        event.currentTarget.innerHTML = showOnlyUnfilledTeacherFeeRows
            ? '<i class="fas fa-filter-circle-xmark"></i> Show All'
            : '<i class="fas fa-filter"></i> Unfilled Only';
        renderTeacherFeeList();
    });
    document.getElementById('loadTeacherFee').addEventListener('click', loadTeacherFeeList);
    document.getElementById('clearTeacherFee').addEventListener('click', clearTeacherFeeList);
    document.getElementById('printTeacherFee').addEventListener('click', () => {
        applyTeacherFeeLayout();
        updateTeacherFeeSummary(filteredTeacherFeeRows);
        window.print();
    });
    teacherFeeBody.addEventListener('click', event => {
        const button = event.target.closest('.remove-student-btn');
        if (button) removeTeacherFeeRow(button.dataset.rowId);
    });
    teacherFeeBody.addEventListener('change', event => {
        const select = event.target.closest('.choice-select');
        if (select) saveTeacherFeeChoice(select);
    });
    fontSizeRange.addEventListener('input', applyTeacherFeeLayout);
    compactnessRange.addEventListener('input', applyTeacherFeeLayout);
    fontSizeRange.addEventListener('change', () => localStorage.setItem(TEACHER_FEE_LAYOUT_KEYS.fontSize, fontSizeRange.value));
    compactnessRange.addEventListener('change', () => localStorage.setItem(TEACHER_FEE_LAYOUT_KEYS.compactness, compactnessRange.value));
});
