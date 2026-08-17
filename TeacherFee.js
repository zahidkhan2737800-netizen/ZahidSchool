let teacherFeeRows = [];
let filteredTeacherFeeRows = [];
let allActiveStudents = [];
let showOnlyUnfilledTeacherFeeRows = false;
let teacherCommitmentRowId = null;
let classOrderMap = {};

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

function teacherCommitmentToday(date = new Date()) {
    const parts = new Intl.DateTimeFormat('en-GB', {
        timeZone: 'Asia/Karachi', year: 'numeric', month: '2-digit', day: '2-digit'
    }).formatToParts(date);
    const values = Object.fromEntries(parts.map(part => [part.type, part.value]));
    return `${values.year}-${values.month}-${values.day}`;
}

function addTeacherCommitmentDays(ymd, days) {
    const [year, month, day] = ymd.split('-').map(Number);
    const date = new Date(Date.UTC(year, month - 1, day));
    date.setUTCDate(date.getUTCDate() + days);
    return date.toISOString().slice(0, 10);
}

function longTeacherCommitmentDate(ymd) {
    return new Date(`${ymd}T00:00:00Z`).toLocaleDateString('en-GB', {
        weekday: 'long', day: '2-digit', month: 'short', year: 'numeric', timeZone: 'UTC'
    });
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
        .eq('month_key', teacherCommitmentToday().slice(0, 7))
        .eq('status', 'Pending')
        .order('due_date', { ascending: true });
    let classesQuery = window.supabaseClient
        .from('classes')
        .select('class_name, section, display_order');
    if (window.currentSchoolId) {
        rowsQuery = rowsQuery.eq('school_id', window.currentSchoolId);
        studentsQuery = studentsQuery.eq('school_id', window.currentSchoolId);
        commitmentsQuery = commitmentsQuery.eq('school_id', window.currentSchoolId);
        classesQuery = classesQuery.eq('school_id', window.currentSchoolId);
    }

    const [rowsResult, studentsResult, commitmentsResult, classesResult] = await Promise.all([rowsQuery, studentsQuery, commitmentsQuery, classesQuery]);
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

    classOrderMap = {};
    if (!classesResult.error) {
        (classesResult.data || []).forEach(cls => {
            const key = `${cls.class_name || ''} ${cls.section || ''}`.trim();
            classOrderMap[key] = cls.display_order || 9999;
        });
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
    const paymentsByStudent = new Map();
    const attendanceByStudent = new Map();
    
    const dates = [];
    for (let i = 0; i < 3; i++) {
        const d = new Date();
        d.setDate(d.getDate() - i);
        dates.push(d.toISOString().slice(0, 10));
    }

    const selectedStudentIds = [...new Set(rows.map(row => row.student_id).filter(Boolean))];
    for (let index = 0; index < selectedStudentIds.length; index += 40) {
        const batch = selectedStudentIds.slice(index, index + 40);
        let paymentsQuery = window.supabaseClient
            .from('transactions')
            .select('student_id, amount_paid, created_at')
            .in('student_id', batch)
            .gt('amount_paid', 0)
            .limit(2000);
        if (window.currentSchoolId) paymentsQuery = paymentsQuery.eq('school_id', window.currentSchoolId);

        let attQuery = window.supabaseClient
            .from('attendance')
            .select('student_id, date, status')
            .in('student_id', batch)
            .in('date', dates);
        if (window.currentSchoolId) attQuery = attQuery.eq('school_id', window.currentSchoolId);

        const [challansResult, paymentsResult, attResult] = await Promise.all([
            window.supabaseClient
            .from('challans')
            .select('student_id, amount, paid_amount')
            .in('student_id', batch)
            .in('status', ['Unpaid', 'Partially Paid'])
            .limit(2000),
            paymentsQuery,
            attQuery
        ]);
        const { data: challans, error: challansError } = challansResult;
        if (challansError) {
            console.warn('Could not load TeacherFee remaining balances:', challansError);
        } else {
            (challans || []).forEach(challan => {
                const studentId = String(challan.student_id);
                const remaining = Math.max(0, Number(challan.amount || 0) - Number(challan.paid_amount || 0));
                balanceByStudent.set(studentId, (balanceByStudent.get(studentId) || 0) + remaining);
            });
        }

        if (paymentsResult.error) {
            console.warn('Could not load TeacherFee payment activity:', paymentsResult.error);
        } else {
            (paymentsResult.data || []).forEach(payment => {
                const studentId = String(payment.student_id);
                if (!paymentsByStudent.has(studentId)) paymentsByStudent.set(studentId, []);
                paymentsByStudent.get(studentId).push(payment);
            });
        }

        if (attResult.error) {
            console.warn('Could not load TeacherFee attendance:', attResult.error);
        } else {
            (attResult.data || []).forEach(row => {
                const sid = String(row.student_id);
                if (!attendanceByStudent.has(sid)) attendanceByStudent.set(sid, {});
                attendanceByStudent.get(sid)[row.date] = row.status;
            });
        }
    }

    const studentsById = new Map(allActiveStudents.map(student => [String(student.id), student]));
    return rows
        .map(row => {
            const rowCreatedAt = new Date(row.created_at || 0).getTime();
            const paymentsSinceAdded = (paymentsByStudent.get(String(row.student_id)) || [])
                .filter(payment => new Date(payment.created_at || 0).getTime() >= rowCreatedAt);
            const paidSinceAdded = paymentsSinceAdded.reduce((sum, payment) => sum + Number(payment.amount_paid || 0), 0);
            
            const sId = String(row.student_id);
            const attStrs = [];
            for (let i = 2; i >= 0; i--) {
                const d = dates[i];
                const studentAtt = attendanceByStudent.get(sId);
                const status = (studentAtt && studentAtt[d]) ? studentAtt[d] : 'None';
                if (status === 'Present') attStrs.push('1');
                else if (status === 'Absent') attStrs.push('0');
                else if (status === 'Leave') attStrs.push('7');
                else attStrs.push('7');
            }
            const attStr = `[${attStrs.join(' ')}]`;

            return {
                ...row,
                student: studentsById.get(String(row.student_id)),
                commitment_due_date: commitmentByStudent.get(String(row.student_id)) || null,
                remaining_amount: balanceByStudent.get(String(row.student_id)) || 0,
                paid_since_added: paidSinceAdded,
                has_payment: paidSinceAdded > 0,
                att_str: attStr
            };
        })
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
        .sort((a, b) => {
            const orderA = classOrderMap[a] !== undefined ? classOrderMap[a] : 9999;
            const orderB = classOrderMap[b] !== undefined ? classOrderMap[b] : 9999;
            if (orderA !== orderB) return orderA - orderB;
            return a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' });
        });
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
        const aClass = String(a.student.applying_for_class || '').trim();
        const bClass = String(b.student.applying_for_class || '').trim();
        const orderA = classOrderMap[aClass] !== undefined ? classOrderMap[aClass] : 9999;
        const orderB = classOrderMap[bClass] !== undefined ? classOrderMap[bClass] : 9999;
        if (orderA !== orderB) return orderA - orderB;
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
        return `<tr class="${row.has_payment ? 'payment-made-row' : ''}">
            <td>${index + 1}</td>
            <td><strong>${escapeTeacherFeeHtml(student.roll_number || '—')}</strong></td>
            <td class="student-name">${escapeTeacherFeeHtml(student.full_name || 'Student')} <span class="attendance-str" style="color: #6b7280; font-size: 0.9em; margin-left: 4px;">${escapeTeacherFeeHtml(row.att_str || '')}</span></td>
            <td class="class-cell">${escapeTeacherFeeHtml(student.applying_for_class || '—')}</td>
            <td>${escapeTeacherFeeHtml(student.father_name || '—')}</td>
            <td>${escapeTeacherFeeHtml(student.family_id_manual || '—')}</td>
            <td><div class="commitment-cell"><span class="commitment-date ${row.commitment_due_date ? '' : 'none'}" title="${row.commitment_due_date ? `Payment due ${escapeTeacherFeeHtml(row.commitment_due_date)}` : 'No pending commitment'}">${formatTeacherFeeCommitmentDate(row.commitment_due_date)}</span><button type="button" class="teacher-commitment-btn screen-only" data-row-id="${escapeTeacherFeeHtml(row.id)}">Co</button></div></td>
            <td class="remaining-cell screen-only">${formatTeacherFeeAmount(row.remaining_amount)}${row.has_payment ? `<span class="payment-amount">Paid ${formatTeacherFeeAmount(row.paid_since_added)}</span>` : ''}</td>
            ${choiceCells}
            <td class="screen-only"><button class="remove-student-btn${row.has_payment ? ' paid' : ''}" data-row-id="${escapeTeacherFeeHtml(row.id)}"><i class="fas fa-xmark"></i> ${row.has_payment ? 'Remove Paid' : 'Remove'}</button></td>
        </tr>`;
    }).join('');
    updateTeacherFeeSummary(filteredTeacherFeeRows);
}

function updateTeacherFeeSummary(rows) {
    const classCount = new Set(rows.map(row => String(row.student?.applying_for_class || '')).filter(Boolean)).size;
    const selectedCount = rows.filter(row => row.choice_1 || row.choice_2 || row.choice_3 || row.choice_4).length;
    const paidCount = rows.filter(row => row.has_payment).length;
    document.getElementById('teacherStudentCount').textContent = rows.length.toLocaleString();
    document.getElementById('teacherClassCount').textContent = classCount.toLocaleString();
    document.getElementById('teacherSelectedCount').textContent = selectedCount.toLocaleString();
    document.getElementById('teacherPaidCount').textContent = paidCount.toLocaleString();

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
    if (!row) return;
    const paymentNote = row.has_payment ? ` They have paid ${formatTeacherFeeAmount(row.paid_since_added)} since being added.` : '';
    if (!window.confirm(`Remove ${row.student.full_name} from TeacherFee?${paymentNote}`)) return;
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

function setupTeacherCommitmentModal() {
    const modal = document.getElementById('teacherCommitmentModal');
    const input = document.getElementById('teacherCommitmentDays');
    document.getElementById('teacherCommitmentCancel').addEventListener('click', closeTeacherCommitmentModal);
    document.getElementById('teacherCommitmentSave').addEventListener('click', saveTeacherCommitment);
    input.addEventListener('input', () => {
        input.value = input.value.replace(/\D/g, '');
        updateTeacherCommitmentPreview();
    });
    input.addEventListener('keydown', event => {
        if (['e', 'E', '+', '-', '.', ','].includes(event.key)) event.preventDefault();
        if (event.key === 'Enter') saveTeacherCommitment();
        if (event.key === 'Escape') closeTeacherCommitmentModal();
    });
    modal.addEventListener('click', event => {
        if (event.target === modal) closeTeacherCommitmentModal();
    });
}

function openTeacherCommitmentModal(rowId) {
    const row = teacherFeeRows.find(item => String(item.id) === String(rowId));
    if (!row) return;
    teacherCommitmentRowId = row.id;
    document.getElementById('teacherCommitmentStudent').textContent = `${row.student.full_name} (Roll ${row.student.roll_number || '—'}) · ${row.student.father_name || 'Parent'}`;
    const input = document.getElementById('teacherCommitmentDays');
    input.value = '';
    updateTeacherCommitmentPreview();
    const modal = document.getElementById('teacherCommitmentModal');
    modal.classList.add('open');
    modal.setAttribute('aria-hidden', 'false');
    setTimeout(() => input.focus(), 30);
}

function closeTeacherCommitmentModal() {
    const modal = document.getElementById('teacherCommitmentModal');
    modal.classList.remove('open');
    modal.setAttribute('aria-hidden', 'true');
    teacherCommitmentRowId = null;
}

function updateTeacherCommitmentPreview() {
    const input = document.getElementById('teacherCommitmentDays');
    const preview = document.getElementById('teacherCommitmentPreview');
    if (!/^\d+$/.test(input.value)) {
        preview.textContent = 'Enter the number of days.';
        return;
    }
    const madeOn = teacherCommitmentToday();
    const dueDate = addTeacherCommitmentDays(madeOn, Number(input.value));
    preview.innerHTML = `Made on <strong>${longTeacherCommitmentDate(madeOn)}</strong><br>Payment due <strong>${longTeacherCommitmentDate(dueDate)}</strong>`;
}

async function saveTeacherCommitment() {
    const row = teacherFeeRows.find(item => String(item.id) === String(teacherCommitmentRowId));
    const input = document.getElementById('teacherCommitmentDays');
    const saveButton = document.getElementById('teacherCommitmentSave');
    const rawDays = input.value.trim();
    if (!row || !/^\d+$/.test(rawDays) || !window.currentSchoolId) {
        showTeacherFeeToast('Enter a valid whole number of promised days.', true);
        return;
    }
    const days = Number(rawDays);
    if (!Number.isSafeInteger(days) || days < 0) {
        showTeacherFeeToast('Enter a valid whole number of promised days.', true);
        return;
    }
    const madeOn = teacherCommitmentToday();
    const dueDate = addTeacherCommitmentDays(madeOn, days);
    const student = row.student;
    const payload = {
        school_id: window.currentSchoolId,
        family_mobile: String(student.father_mobile || '').trim(),
        family_no: String(student.family_id_manual || student.roll_number || ''),
        family_name: student.father_name || student.full_name,
        members: [{
            student_id: student.id,
            name: student.full_name,
            father_name: student.father_name || '',
            roll: student.roll_number,
            class_name: student.applying_for_class
        }],
        days_promised: days,
        month_key: madeOn.slice(0, 7),
        commitment_made_on: madeOn,
        due_date: dueDate,
        created_by_user_id: window.currentUser?.id || null,
        created_by: window.currentUserFullName || window.currentUser?.email || 'Unknown User',
        status: 'Pending'
    };

    saveButton.disabled = true;
    saveButton.textContent = 'Saving...';
    try {
        const { error } = await window.supabaseClient.from('family_fee_commitments').insert(payload);
        if (error) throw error;
        closeTeacherCommitmentModal();
        showTeacherFeeToast(`Commitment saved for ${longTeacherCommitmentDate(dueDate)}.`);
        await loadTeacherFeeList();
    } catch (error) {
        showTeacherFeeToast(`Could not save commitment: ${teacherFeeErrorMessage(error)}`, true);
    } finally {
        saveButton.disabled = false;
        saveButton.textContent = 'Save';
    }
}

async function printTeacherFeeThermalOptionTwo() {
    if (filteredTeacherFeeRows.length === 0) {
        showTeacherFeeToast('No students in list to print.', true);
        return;
    }

    const btn = document.getElementById('printTeacherFeeThermal');
    if (btn) {
        btn.disabled = true;
        btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Loading...';
    }

    try {
        const studentIds = filteredTeacherFeeRows.map(r => String(r.student_id));
        
        // Get last 3 days
        const dates = [];
        for (let i = 0; i < 3; i++) {
            const d = new Date();
            d.setDate(d.getDate() - i);
            dates.push(d.toISOString().slice(0, 10));
        }

        let attQuery = window.supabaseClient
            .from('attendance')
            .select('student_id, date, status')
            .in('student_id', studentIds)
            .in('date', dates);
            
        if (window.currentSchoolId) {
            attQuery = attQuery.eq('school_id', window.currentSchoolId);
        }
            
        const { data: attData, error: attError } = await attQuery;
        if (attError) throw attError;

        const attMap = {};
        if (attData) {
            attData.forEach(a => {
                const sId = String(a.student_id);
                if (!attMap[sId]) attMap[sId] = {};
                attMap[sId][a.date] = a.status;
            });
        }

        const classFilter = document.getElementById('teacherClassSelect').value;
        const currentDate = new Date().toLocaleDateString();
        
        const groups = {};
        if (classFilter) {
            groups[classFilter] = filteredTeacherFeeRows;
        } else {
            filteredTeacherFeeRows.forEach(row => {
                const cls = row.student?.applying_for_class || 'Unknown';
                if (!groups[cls]) groups[cls] = [];
                groups[cls].push(row);
            });
        }

        const classKeys = Object.keys(groups).sort((a, b) => {
            const orderA = classOrderMap[a] !== undefined ? classOrderMap[a] : 9999;
            const orderB = classOrderMap[b] !== undefined ? classOrderMap[b] : 9999;
            if (orderA !== orderB) return orderA - orderB;
            return a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' });
        });

        const printWindow = window.open('', '_blank', 'width=400,height=600');
        if (!printWindow) {
            showTeacherFeeToast('Please allow popups to print.', true);
            if (btn) {
                btn.disabled = false;
                btn.innerHTML = '<i class="fas fa-print"></i> Thermal Print 2';
            }
            return;
        }

        let currentIndex = 0;
        
        window.addEventListener('message', function onPrintNext(e) {
            if (e.data === 'printNextReceipt') {
                currentIndex++;
                if (currentIndex >= classKeys.length) {
                    window.removeEventListener('message', onPrintNext);
                    printWindow.close();
                    if (btn) {
                        btn.disabled = false;
                        btn.innerHTML = '<i class="fas fa-print"></i> Thermal Print 2';
                    }
                } else {
                    printNextClass();
                }
            }
        });

        function printNextClass() {
            if (currentIndex >= classKeys.length) return;
            const cls = classKeys[currentIndex];
            const rows = groups[cls];

            let html = `
                <html><head><title>Thermal Print - Teacher Fee</title>
                <style>
                    @media print { @page { margin: 0; } body { margin: 0; padding: 5px; } }
                    body { font-family: monospace; width: 100%; max-width: 260px; box-sizing: border-box; margin: 0 auto; padding: 5px; color: #000; font-size: 12px; }
                    h3 { text-align: center; margin: 5px 0; font-size: 14px; text-transform: uppercase; }
                    .meta { text-align: center; margin-bottom: 10px; font-size: 11px; border-bottom: 1px dashed #000; padding-bottom: 5px; }
                    table { width: 100%; border-collapse: collapse; margin-top: 5px; table-layout: auto; }
                    th { border-bottom: 1px dashed #000; text-align: left; padding: 4px 0; }
                    td { padding: 4px 0; vertical-align: top; word-wrap: break-word; }
                    .right { text-align: right; padding-right: 8px; }
                    .name-compact { white-space: nowrap; font-size: 11px; }
                </style>
                </head>
                <body>
                  <h3>ATTENTION LIST</h3>
                  <div class="meta">
                    Date: ${currentDate}<br>Class: ${escapeTeacherFeeHtml(cls)}<br>
                    Total Students: ${rows.length}<br>Type: Fee &amp; Follow-up
                  </div>
                  <table>
                    <tr>
                        <th style="width:20%">Roll</th>
                        <th style="width:45%">Name</th>
                        <th style="width:35%" class="right">Act</th>
                    </tr>
            `;

            rows.forEach(row => {
                const sId = String(row.student_id);
                
                const attStrs = [];
                // Older to newer (dates[2] to dates[0])
                for (let i = 2; i >= 0; i--) {
                    const d = dates[i];
                    const status = (attMap[sId] && attMap[sId][d]) ? attMap[sId][d] : 'None';
                    if (status === 'Present') attStrs.push('1');
                    else if (status === 'Absent') attStrs.push('0');
                    else if (status === 'Leave') attStrs.push('7');
                    else attStrs.push('7'); // Holiday/No Record
                }
                const attStr = `[${attStrs.join(' ')}]`;

                let commStr = '(N)';
                if (row.commitment_due_date) {
                    const match = String(row.commitment_due_date).match(/-(\d{2})$/);
                    if (match) commStr = `(${parseInt(match[1], 10)})`;
                }

                const fullName = row.student?.full_name || 'Student';
                const fatherName = row.student?.father_name || '';
                const roll = row.student?.roll_number || '-';

                // Map choices to short codes
                const actionCodes = [];
                const choiceMapping = {
                    'Ask': '0',
                    'Std 10': '10',
                    'Std 40': '40',
                    'St 80': '80',
                    'Stc 10': 'S'
                };
                
                [row.choice_1, row.choice_2, row.choice_3, row.choice_4].forEach(choice => {
                    if (choice && choiceMapping[choice]) {
                        actionCodes.push(choiceMapping[choice]);
                    }
                });
                const actionStr = actionCodes.join(' ');

                html += `
                    <tr>
                        <td>${escapeTeacherFeeHtml(roll)}</td>
                        <td class="name-compact">
                            ${escapeTeacherFeeHtml(fullName)} ${escapeTeacherFeeHtml(attStr)} ${escapeTeacherFeeHtml(commStr)}
                            ${fatherName ? `<br>(${escapeTeacherFeeHtml(fatherName)})` : ''}
                        </td>
                        <td class="right" style="font-size:11px; letter-spacing:0.5px; font-weight: bold;">${escapeTeacherFeeHtml(actionStr)}</td>
                    </tr>
                `;
            });

            html += `</table><div style="text-align:center;margin-top:15px;font-size:10px;">Total Printed: ${rows.length}</div>
                <script>
                    window.onafterprint = function() {
                        if (window.opener) window.opener.postMessage('printNextReceipt', '*');
                    };
                    window.onload = function() {
                        setTimeout(() => window.print(), 100);
                    };
                </script>
            </body></html>`;

            printWindow.document.open();
            printWindow.document.write(html);
            printWindow.document.close();
        }

        printNextClass();

    } catch (err) {
        showTeacherFeeToast('Print error: ' + err.message, true);
        if (btn) {
            btn.disabled = false;
            btn.innerHTML = '<i class="fas fa-print"></i> Thermal Print 2';
        }
    }
}

window.onAppReady(async () => {
    fontSizeRange.value = localStorage.getItem(TEACHER_FEE_LAYOUT_KEYS.fontSize) || '9';
    compactnessRange.value = localStorage.getItem(TEACHER_FEE_LAYOUT_KEYS.compactness) || '75';
    applyTeacherFeeLayout();
    setupTeacherCommitmentModal();
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
    const thermalBtn = document.getElementById('printTeacherFeeThermal');
    if (thermalBtn) {
        thermalBtn.addEventListener('click', printTeacherFeeThermalOptionTwo);
    }
    teacherFeeBody.addEventListener('click', event => {
        const commitmentButton = event.target.closest('.teacher-commitment-btn');
        if (commitmentButton) {
            openTeacherCommitmentModal(commitmentButton.dataset.rowId);
            return;
        }
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
