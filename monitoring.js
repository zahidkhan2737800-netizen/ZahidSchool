// =============================================
// monitoring.js — Supabase-Only Monitoring System
// Reads students from admissions, classes from classes table
// =============================================

let students = [];
let subjects = [];
let progressColumns = [];
let scoresMap = {};
let selectedSubject = null;
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
let absentDaysByStudentId = new Map();
let absentDaysByRoll = new Map();

// Persist hidden column preferences in browser
let hiddenTopicIds = JSON.parse(localStorage.getItem('mon_hiddenTopics')) || [];

// DOM References
const classSelect         = document.getElementById('classSelect');
const studentSearchInput  = document.getElementById('studentSearchInput');
const subjectsToolbar     = document.getElementById('subjectsToolbar');
const actionsToolbar      = document.getElementById('actionsToolbar');
const subjectButtonsContainer = document.getElementById('subjectButtons');
const tableContainer      = document.getElementById('tableContainer');
const addSubjectBtn       = document.getElementById('addSubjectBtn');
const addColBtn           = document.getElementById('addColBtn');
const thermalPrintBtn     = document.getElementById('thermalPrintBtn');
const toggleColsBtn       = document.getElementById('toggleColsBtn');
const colToggleMenu       = document.getElementById('colToggleMenu');
const currentSubjectLabel = document.getElementById('currentSubjectLabel');
const tableHead           = document.getElementById('tableHead');
const tableBody           = document.getElementById('tableBody');

// ── Wait for auth context (school_id) to be ready ──
async function waitForAuthContext(timeoutMs = 10000) {
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
        if (window.authReady === true && window.supabaseClient) return;
        await new Promise(r => setTimeout(r, 80));
    }
    // Fallback: try to resolve school_id directly
    if ((window.currentSchoolId === null || window.currentSchoolId === undefined) && window.currentUser?.id) {
        const { data: roleData } = await supabaseClient
            .from('user_roles')
            .select('school_id')
            .eq('user_id', window.currentUser.id)
            .single();
        window.currentSchoolId = roleData?.school_id ?? null;
    }
}

// ── Apply school scope to a query ──
function applySchoolScope(query) {
    const sid = window.currentSchoolId || null;
    return sid ? query.eq('school_id', sid) : query;
}

// ── Boot ─────────────────────────────────────
document.addEventListener('DOMContentLoaded', async () => {
    // Dropdown toggle
    toggleColsBtn.addEventListener('click', () => {
        colToggleMenu.style.display = colToggleMenu.style.display === 'flex' ? 'none' : 'flex';
    });
    document.addEventListener('click', (e) => {
        if (!toggleColsBtn.contains(e.target) && !colToggleMenu.contains(e.target)) {
            colToggleMenu.style.display = 'none';
        }
    });

    await waitForAuthContext();
    await loadClasses();
});

// ── 1. Load Classes — directly from classes table ──
async function loadClasses() {
    const { data, error } = await applySchoolScope(
        supabaseClient
            .from('classes')
            .select('*')
    )
        .order('class_name', { ascending: true })
        .order('section', { ascending: true });

    if (error) { 
        console.error('Error loading classes:', error); 
        classSelect.innerHTML = '<option value="">Error loading classes</option>';
        return; 
    }

    classSelect.innerHTML = '<option value="">-- Select Class --</option>';
    if (data && data.length > 0) {
        data.forEach(cls => {
            const opt = document.createElement('option');
            const val = `${cls.class_name} ${cls.section}`;
            opt.value = val;
            opt.textContent = val;
            classSelect.appendChild(opt);
        });
    } else {
        classSelect.innerHTML = '<option value="">No classes available</option>';
    }
}

// ── 2. Class Selection ──
classSelect.addEventListener('change', async () => {
    const selectedClass = classSelect.value;
    selectedSubject = null;
    tableContainer.style.display = 'none';
    actionsToolbar.style.display = 'none';
    studentSearchInput.value = '';

    if (!selectedClass) {
        subjectsToolbar.style.display = 'none';
        studentSearchInput.style.display = 'none';
        clearData();
        return;
    }

    subjectsToolbar.style.display = 'flex';
    studentSearchInput.style.display = 'block';
    await loadClassData(selectedClass);
});

// ── Search ──
studentSearchInput.addEventListener('input', () => {
    if (selectedSubject) renderTable();
});

// ── 3. Load Students & Subjects for Selected Class ──
async function loadClassData(className) {
    // Students — from admissions table, Active only
    const { data: sData, error: sErr } = await applySchoolScope(
        supabaseClient
            .from('admissions')
            .select('id, roll_number, full_name, applying_for_class')
    )
        .eq('applying_for_class', className)
        .eq('status', 'Active');

    if (sErr) { console.error('Student load error:', sErr); return; }
    students = sData || [];
    students.sort((a, b) => parseFloat(a.roll_number || 0) - parseFloat(b.roll_number || 0));
    await loadRecentAbsentDaysForStudents();

    // Subjects — from monitoring_subjects table
    const { data: subData, error: subErr } = await applySchoolScope(
        supabaseClient
            .from('monitoring_subjects')
            .select('*')
    )
        .eq('applying_for_class', className)
        .order('created_at', { ascending: true });

    if (subErr) { console.error('Subject load error:', subErr); return; }
    subjects = subData || [];

    renderSubjectButtons();
    if (selectedSubject) renderTable();
}

async function loadRecentAbsentDaysForStudents() {
    absentDaysByStudentId = new Map();
    absentDaysByRoll = new Map();

    const studentIds = students.map(s => s.id).filter(Boolean);
    if (!studentIds.length) return;

    try {
        let q = applySchoolScope(
            supabaseClient
                .from('absent_days')
                .select('student_id, roll, months')
                .in('student_id', studentIds)
        );

        const { data, error } = await q;
        if (error) throw error;

        (data || []).forEach(row => {
            if (row.student_id) absentDaysByStudentId.set(String(row.student_id), row.months || {});
            if (row.roll !== undefined && row.roll !== null && String(row.roll).trim() !== '') {
                absentDaysByRoll.set(String(row.roll).trim(), row.months || {});
            }
        });
    } catch (e) {
        console.error('Absent days load error:', e);
    }
}

function getLastFiveMonthRefs() {
    const refs = [];
    const now = new Date();
    // Always exclude current month and take the previous five months.
    for (let i = 5; i >= 1; i--) {
        const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
        refs.push({ year: d.getFullYear(), month: MONTHS[d.getMonth()] });
    }
    return refs;
}

function getMonthValue(rawMonths, year, month) {
    if (!rawMonths || typeof rawMonths !== 'object') return 0;
    const keys = Object.keys(rawMonths);
    const isYearKeyed = keys.length === 0 || keys.every(k => /^\d{4}$/.test(k));
    const yearData = isYearKeyed ? (rawMonths[String(year)] || {}) : rawMonths;
    const raw = yearData[month] !== undefined ? yearData[month] : '';
    const n = Number(raw);
    return Number.isFinite(n) && raw !== '' ? n : 0;
}

function getStudentLastFiveAbsenceText(student) {
    const byId = absentDaysByStudentId.get(String(student.id));
    const byRoll = absentDaysByRoll.get(String(student.roll_number || '').trim());
    const monthsObj = byId || byRoll || {};
    return getLastFiveMonthRefs()
        .map(ref => String(getMonthValue(monthsObj, ref.year, ref.month)))
        .join(' ');
}

function escapeHtml(str) {
    return String(str || '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/\"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

// ── 4. Render Subject Buttons ──
function renderSubjectButtons() {
    subjectButtonsContainer.innerHTML = '';
    if (subjects.length === 0) {
        subjectButtonsContainer.innerHTML = `<span style="color:#666;font-size:13px;">No subjects yet. Add one.</span>`;
        return;
    }
    subjects.forEach(sub => {
        const btn = document.createElement('button');
        btn.className = `btn-subject ${selectedSubject && selectedSubject.id === sub.id ? 'active' : ''}`;
        btn.textContent = sub.subject_name;
        btn.addEventListener('click', () => selectSubject(sub));
        subjectButtonsContainer.appendChild(btn);
    });
}

// ── 5. Add Subject ──
addSubjectBtn.addEventListener('click', async () => {
    const className = classSelect.value;
    const subName = prompt("Enter a new Subject name (e.g., 'Math', 'Science'):");
    if (!subName || !subName.trim()) return;

    const payload = {
        applying_for_class: className,
        subject_name: subName.trim()
    };
    if (window.currentSchoolId) payload.school_id = window.currentSchoolId;

    const { data: inserted, error } = await supabaseClient
        .from('monitoring_subjects')
        .insert(payload)
        .select();

    if (error) { alert('Failed to add subject: ' + error.message); return; }
    subjects.push(inserted[0]);
    renderSubjectButtons();
});

// ── 6. Select Subject ──
function selectSubject(sub) {
    selectedSubject = sub;
    renderSubjectButtons();
    currentSubjectLabel.textContent = `Viewing: ${sub.subject_name} (Total Students: ${students.length})`;
    actionsToolbar.style.display = 'flex';
    tableContainer.style.display = 'block';
    loadColumnsAndScores(sub.id);
}

// ── 7. Load Topics & Scores ──
async function loadColumnsAndScores(subjectId) {
    tableBody.innerHTML = '<tr><td colspan="100%" class="loading-text">Loading topics and scores...</td></tr>';

    const { data: cData, error: cErr } = await applySchoolScope(
        supabaseClient
            .from('monitoring_topics')
            .select('*')
    )
        .eq('subject_id', subjectId)
        .order('created_at', { ascending: true });

    if (cErr) { console.error('Topics error:', cErr); return; }
    progressColumns = cData || [];

    const { data: scData, error: scErr } = await applySchoolScope(
        supabaseClient
            .from('monitoring_scores')
            .select('*')
    )
        .eq('subject_id', subjectId);

    if (scErr) { console.error('Scores error:', scErr); return; }
    scoresMap = {};
    (scData || []).forEach(row => {
        scoresMap[`${row.student_id}_${row.topic_id}`] = row.score;
    });

    renderDropdownMenu();
    renderTable();
}

// ── 8. Show/Hide Topics Dropdown ──
function renderDropdownMenu() {
    colToggleMenu.innerHTML = '<div style="font-weight:bold;border-bottom:1px solid #eee;padding-bottom:5px;margin-bottom:5px;">Check to Show</div>';
    if (progressColumns.length === 0) {
        colToggleMenu.innerHTML += '<div style="color:#888;font-size:12px;">No topics yet</div>';
        return;
    }
    progressColumns.forEach(col => {
        const label = document.createElement('label');
        const checkbox = document.createElement('input');
        checkbox.type = 'checkbox';
        checkbox.checked = !hiddenTopicIds.includes(col.id);
        checkbox.addEventListener('change', () => {
            if (checkbox.checked) {
                hiddenTopicIds = hiddenTopicIds.filter(id => id !== col.id);
            } else {
                if (!hiddenTopicIds.includes(col.id)) hiddenTopicIds.push(col.id);
            }
            localStorage.setItem('mon_hiddenTopics', JSON.stringify(hiddenTopicIds));
            renderTable();
        });
        label.appendChild(checkbox);
        label.appendChild(document.createTextNode(col.topic_name));
        colToggleMenu.appendChild(label);
    });
}

// ── 9. Render Table ──
function renderTable() {
    if (!selectedSubject) return;

    const visibleColumns = progressColumns.filter(col => !hiddenTopicIds.includes(col.id));

    // Headers
    tableHead.innerHTML = '';
    const headerRow = document.createElement('tr');
    headerRow.innerHTML = `<th style="width:50px;">Roll No</th><th style="width:150px;">Student Name</th>`;

    visibleColumns.forEach(col => {
        const th = document.createElement('th');

        const headerContent = document.createElement('div');
        headerContent.style.cssText = 'display:flex;flex-direction:column;align-items:center;';

        // Topic name input
        const colInput = document.createElement('input');
        colInput.type = 'text';
        colInput.className = 'col-header-input';
        colInput.value = col.topic_name || '';
        colInput.placeholder = 'Topic Name';
        colInput.addEventListener('change', async () => {
            col.topic_name = colInput.value;
            const { error } = await supabaseClient.from('monitoring_topics').update({ topic_name: colInput.value }).eq('id', col.id);
            if (error) alert('Failed to rename: ' + error.message);
        });

        // Criteria input
        const criteriaInput = document.createElement('input');
        criteriaInput.type = 'number';
        criteriaInput.id = `criteria_${col.id}`;
        criteriaInput.className = 'criteria-input';
        criteriaInput.value = col.criteria || '';
        criteriaInput.placeholder = 'Criteria';
        criteriaInput.title = 'Passing Criteria Score';
        criteriaInput.addEventListener('change', async () => {
            criteriaInput.classList.remove('criteria-error');
            col.criteria = criteriaInput.value;
            const { error } = await supabaseClient.from('monitoring_topics').update({ criteria: criteriaInput.value }).eq('id', col.id);
            if (error) alert('Failed to save criteria: ' + error.message);
        });

        // Delete button
        const delBtn = document.createElement('button');
        delBtn.className = 'delete-col-btn';
        delBtn.textContent = '✖';
        delBtn.title = 'Delete Topic Permanently';
        delBtn.addEventListener('click', async () => {
            if (confirm(`PERMANENTLY delete "${col.topic_name}"? (Use 👁️ to just hide it instead!)`)) {
                await supabaseClient.from('monitoring_topics').delete().eq('id', col.id);
                progressColumns = progressColumns.filter(c => c.id !== col.id);
                renderDropdownMenu();
                renderTable();
            }
        });

        // Per-column print button
        const printColBtn = document.createElement('button');
        printColBtn.className = 'print-col-btn';
        printColBtn.textContent = '🖨️';
        printColBtn.title = `Print trace for ${col.topic_name}`;
        printColBtn.addEventListener('click', () => printDefaulters(col));

        headerContent.appendChild(colInput);
        headerContent.appendChild(criteriaInput);
        th.appendChild(headerContent);
        th.appendChild(delBtn);
        th.appendChild(printColBtn);
        headerRow.appendChild(th);
    });

    tableHead.appendChild(headerRow);

    // Filter students by search
    const searchQuery = studentSearchInput.value.trim().toLowerCase();
    let filteredStudents = students;
    if (searchQuery) {
        filteredStudents = students.filter(s => {
            const exactRoll = s.roll_number && s.roll_number.toString().trim().toLowerCase() === searchQuery;
            const partialName = s.full_name && s.full_name.toLowerCase().includes(searchQuery);
            return exactRoll || partialName;
        });
    }

    // Rows
    tableBody.innerHTML = '';
    if (filteredStudents.length === 0) {
        tableBody.innerHTML = `<tr><td colspan="100%" class="loading-text">No students found matching your search.</td></tr>`;
        return;
    }

    filteredStudents.forEach(student => {
        const absentFiveText = getStudentLastFiveAbsenceText(student);
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td><b>${student.roll_number || '-'}</b></td>
            <td style="font-weight:bold;color:#333;">
                <div>${escapeHtml(student.full_name || 'Unknown')}</div>
                <div class="absent-five-months">${absentFiveText}</div>
            </td>
        `;

        visibleColumns.forEach(col => {
            const td = document.createElement('td');
            const scoreInput = document.createElement('input');
            scoreInput.type = 'text';
            scoreInput.className = 'score-input';
            scoreInput.placeholder = '-';

            const mapKey = `${student.id}_${col.id}`;
            scoreInput.value = scoresMap[mapKey] || '';

            scoreInput.addEventListener('change', async () => {
                scoresMap[mapKey] = scoreInput.value;
                const payload = {
                    student_id: student.id,
                    topic_id: col.id,
                    subject_id: selectedSubject.id,
                    score: scoreInput.value
                };
                if (window.currentSchoolId) payload.school_id = window.currentSchoolId;

                const { error } = await supabaseClient.from('monitoring_scores').upsert(payload, { onConflict: 'student_id, topic_id' });
                if (error) alert('Failed to save score: ' + error.message);
            });

            td.appendChild(scoreInput);
            tr.appendChild(td);
        });

        tableBody.appendChild(tr);
    });
}

// ── 10. Add Topic Column ──
addColBtn.addEventListener('click', async () => {
    if (!selectedSubject) return;
    const payload = { subject_id: selectedSubject.id, topic_name: 'New Topic', criteria: '' };
    if (window.currentSchoolId) payload.school_id = window.currentSchoolId;

    const { data: newCol, error } = await supabaseClient.from('monitoring_topics')
        .insert(payload)
        .select();

    if (error) { alert('Failed to add topic: ' + error.message); return; }
    progressColumns.push(newCol[0]);
    renderDropdownMenu();
    renderTable();
});

// ── 11. Print Defaulters (per-column) ──
function printDefaulters(targetCol) {
    if (!targetCol.criteria || targetCol.criteria.toString().trim() === '') {
        const el = document.getElementById(`criteria_${targetCol.id}`);
        if (el) el.classList.add('criteria-error');
        alert(`No criteria score set for "${targetCol.topic_name}". Please enter a criteria score in the box under the topic name.`);
        return;
    }

    const minScore = parseFloat(targetCol.criteria);
    if (isNaN(minScore)) {
        const el = document.getElementById(`criteria_${targetCol.id}`);
        if (el) el.classList.add('criteria-error');
        alert(`Invalid criteria score for "${targetCol.topic_name}". Please enter a valid number.`);
        return;
    }

    const defaulters = [];
    students.forEach(student => {
        const scoreStr = scoresMap[`${student.id}_${targetCol.id}`];
        const scoreVal = parseFloat(scoreStr);
        if (isNaN(scoreVal) || scoreVal < minScore) {
            defaulters.push({
                roll: student.roll_number,
                name: student.full_name,
                absentFive: getStudentLastFiveAbsenceText(student),
                score: scoreStr || 'N/A'
            });
        }
    });

    if (defaulters.length === 0) {
        alert(`Great! No students scored below ${minScore} in ${targetCol.topic_name}.`);
        return;
    }

    const currentDate = new Date().toLocaleDateString();
    const printWindow = window.open('', '_blank', 'width=400,height=600');
    let html = `
        <html><head><title>Thermal Print - Defaulters</title>
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
        <body onload="window.print()">
          <h3>ATTENTION LIST</h3>
          <div class="meta">
            Date: ${currentDate}<br>Class: ${classSelect.value}<br>
            Total Students: ${students.length}<br>Subject: ${selectedSubject.subject_name}<br>
            Topic: ${targetCol.topic_name}<br>Criteria: Score &lt; ${minScore}
          </div>
          <table>
            <tr><th style="width:25%">Roll</th><th style="width:50%">Name</th><th style="width:25%" class="right">Score</th></tr>
    `;
    defaulters.forEach(d => {
        html += `<tr><td>${d.roll || '-'}</td><td class="name-compact">${d.name || ''} [${d.absentFive || '0 0 0 0 0'}]</td><td class="right">${d.score}</td></tr>`;
    });
    html += `</table><div style="text-align:center;margin-top:15px;font-size:10px;">Total Defaulters: ${defaulters.length}</div></body></html>`;
    printWindow.document.write(html);
    printWindow.document.close();
}

// ── Global Print Button ──
thermalPrintBtn.addEventListener('click', () => {
    if (!selectedSubject) return;
    if (progressColumns.length === 0) { alert('No topics added yet.'); return; }

    const colSearch = prompt(`Which topic from "${selectedSubject.subject_name}" do you want to trace?`);
    if (!colSearch) return;

    const targetCol = progressColumns.find(c => (c.topic_name || '').toLowerCase().trim() === colSearch.toLowerCase().trim());
    if (!targetCol) { alert(`Topic "${colSearch}" not found.`); return; }

    printDefaulters(targetCol);
});

// ── Utility ──
function clearData() {
    students = [];
    subjects = [];
    progressColumns = [];
    scoresMap = {};
    selectedSubject = null;
    absentDaysByStudentId = new Map();
    absentDaysByRoll = new Map();
}
