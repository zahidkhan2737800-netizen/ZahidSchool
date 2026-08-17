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
let currentSession = '';   // active session, set in loadClassData

// Persist hidden column preferences in browser
let hiddenTopicIds = JSON.parse(localStorage.getItem('mon_hiddenTopics')) || [];

// DOM References
const sessionSelect       = document.getElementById('sessionSelect');
const classSelect         = document.getElementById('classSelect');
const studentSearchInput  = document.getElementById('studentSearchInput');
const subjectsToolbar     = document.getElementById('subjectsToolbar');
const actionsToolbar      = document.getElementById('actionsToolbar');
const subjectButtonsContainer = document.getElementById('subjectButtons');
const tableContainer      = document.getElementById('tableContainer');
const addSubjectBtn       = document.getElementById('addSubjectBtn');
const addColBtn           = document.getElementById('addColBtn');
const thermalPrintBtn     = document.getElementById('thermalPrintBtn');
const saveSessionBtn      = document.getElementById('saveSessionBtn');
const archiveBadge        = document.getElementById('archiveBadge');
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
window.onAppReady(async () => {
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
    await loadSessions();
    await loadClasses();
});

// ── 1. Load Sessions ──
async function loadSessions() {
    const { data, error } = await applySchoolScope(
        supabaseClient
            .from('session')
            .select('session_value')
    )
        .order('created_at', { ascending: false });

    if (error) { 
        console.error('Error loading sessions:', error); 
        sessionSelect.innerHTML = '<option value="">Error loading sessions</option>';
        return; 
    }

    sessionSelect.innerHTML = '<option value="">-- Select Session --</option>';
    if (data && data.length > 0) {
        data.forEach(sess => {
            const opt = document.createElement('option');
            opt.value = sess.session_value;
            opt.textContent = sess.session_value;
            sessionSelect.appendChild(opt);
        });
        // Select the first session by default
        sessionSelect.value = data[0].session_value;
    } else {
        sessionSelect.innerHTML = '<option value="">No sessions available</option>';
    }
}

// ── 1b. Load Classes — directly from classes table ──
async function loadClasses() {
    const { data, error } = await applySchoolScope(
        supabaseClient
            .from('classes')
            .select('*')
    )
        .eq('is_active', true)
        .order('display_order', { ascending: true, nullsFirst: false })
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

// ── 2. Session and Class Selection ──
function onFilterChange() {
    const selectedClass = classSelect.value;
    const selectedSession = sessionSelect.value;
    selectedSubject = null;
    tableContainer.style.display = 'none';
    actionsToolbar.style.display = 'none';
    studentSearchInput.value = '';

    if (!selectedClass || !selectedSession) {
        subjectsToolbar.style.display = 'none';
        studentSearchInput.style.display = 'none';
        clearData();
        return;
    }

    subjectsToolbar.style.display = 'flex';
    studentSearchInput.style.display = 'block';
    loadClassData(selectedClass, selectedSession);
}

classSelect.addEventListener('change', onFilterChange);
sessionSelect.addEventListener('change', onFilterChange);

// ── Search ──
studentSearchInput.addEventListener('input', () => {
    if (selectedSubject) renderTable();
});

// ── Global Archive State ──
let isArchived = false;
let archiveData = null;

// ── 3. Load Students & Subjects for Selected Class ──
async function loadClassData(className, sessionName) {
    isArchived = false;
    archiveData = null;
    currentSession = sessionName;   // ← track which session is active
    archiveBadge.style.display = 'none';
    addSubjectBtn.style.display = 'inline-block';
    addColBtn.style.display = 'inline-block';
    saveSessionBtn.style.display = 'inline-block';

    // 3a. Check for Archive First
    let archQuery = supabaseClient
        .from('monitoring_archives')
        .select('archive_data')
        .eq('session_value', sessionName)
        .eq('class_name', className);
    if (window.currentSchoolId) archQuery = archQuery.eq('school_id', window.currentSchoolId);

    const { data: archData, error: archErr } = await archQuery.maybeSingle();
    
    if (archData && archData.archive_data) {
        isArchived = true;
        archiveData = archData.archive_data;
        students = archiveData.students || [];
        subjects = archiveData.subjects || [];
        archiveBadge.style.display = 'inline-block';
        archiveBadge.textContent = '📦 Archived (Edit Mode)';
        addSubjectBtn.style.display = 'inline-block';
        addColBtn.style.display = 'inline-block';
        saveSessionBtn.style.display = 'inline-block';
        saveSessionBtn.innerHTML = '💾 Update Archive';
        renderSubjectButtons();
        if (selectedSubject) renderTable();
        return;
    }

    // 3b. Fetch Subjects first to see if any historical students have scores
    const { data: subData, error: subErr } = await applySchoolScope(
        supabaseClient
            .from('monitoring_subjects')
            .select('*')
    )
        .eq('applying_for_class', className)
        .eq('session_value', sessionName)
        .order('created_at', { ascending: true });

    if (subErr) { console.error('Subject load error:', subErr); return; }
    subjects = subData || [];

    // If no subjects exist yet for this class+session, auto-import from class_subjects_assignment
    if (subjects.length === 0) {
        subjects = await autoImportSubjectsFromClassAssignment(className, sessionName);
    }

    // Find historical students who have scores in this session + class
    let historicalStudentIds = [];
    if (subjects.length > 0) {
        const subjectIds = subjects.map(s => s.id);
        const { data: scoreData } = await applySchoolScope(
            supabaseClient
                .from('monitoring_scores')
                .select('student_id')
        )
            .in('subject_id', subjectIds)
            .eq('session_value', sessionName);
            
        if (scoreData) {
            historicalStudentIds = [...new Set(scoreData.map(r => r.student_id))];
        }
    }

    // 3c. Live Data (Students — Active only)
    let query = supabaseClient
        .from('admissions')
        .select('id, roll_number, full_name, applying_for_class, session')
        .eq('status', 'Active');

    if (window.currentSchoolId) {
        query = query.eq('school_id', window.currentSchoolId);
    }
    
    if (historicalStudentIds.length > 0) {
        // Fetch students currently in the class OR students who have historical scores in this class
        query = query.or(`applying_for_class.eq."${className}",id.in.(${historicalStudentIds.join(',')})`);
    } else {
        query = query.eq('applying_for_class', className);
    }

    const { data: sData, error: sErr } = await query;

    if (sErr) { console.error('Student load error:', sErr); return; }
    students = sData || [];
    students.sort((a, b) => parseFloat(a.roll_number || 0) - parseFloat(b.roll_number || 0));
    await loadRecentAbsentDaysForStudents();

    renderSubjectButtons();
    if (selectedSubject) renderTable();
}

// ── Auto-import subjects from class_subjects_assignment ──
async function autoImportSubjectsFromClassAssignment(className, sessionName) {
    try {
        // 1. Find the class record by name (className is like "Four B")
        const parts = className.trim().split(' ');
        const section = parts.length > 1 ? parts[parts.length - 1] : '';
        const classNameOnly = parts.length > 1 ? parts.slice(0, -1).join(' ') : className;

        let classQuery = supabaseClient
            .from('classes')
            .select('id')
            .eq('class_name', classNameOnly)
            .eq('section', section);
        if (window.currentSchoolId) classQuery = classQuery.eq('school_id', window.currentSchoolId);
        const { data: classData } = await classQuery.maybeSingle();

        if (!classData) return [];

        // 2. Fetch subjects assigned to this class via class_subject → subject
        const { data: assignedData, error: assignedErr } = await supabaseClient
            .from('class_subject')
            .select('subject:subject_id(id, name)')
            .eq('class_id', classData.id);

        if (assignedErr || !assignedData || assignedData.length === 0) return [];

        // 3. Insert them into monitoring_subjects tagged with this session
        const toInsert = assignedData
            .filter(row => row.subject && row.subject.name)
            .map(row => ({
                applying_for_class: className,
                subject_name: row.subject.name,
                session_value: sessionName,
                ...(window.currentSchoolId ? { school_id: window.currentSchoolId } : {})
            }));

        if (toInsert.length === 0) return [];

        const { data: inserted, error: insertErr } = await supabaseClient
            .from('monitoring_subjects')
            .insert(toInsert)
            .select();

        if (insertErr) {
            console.error('Auto-import subjects failed:', insertErr);
            return [];
        }

        console.log(`Auto-imported ${inserted.length} subjects from class assignment for ${className} (${sessionName})`);
        return inserted;
    } catch (e) {
        console.error('autoImportSubjectsFromClassAssignment error:', e);
        return [];
    }
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

    if (isArchived) {
        const newSub = {
            id: 'arch-sub-' + Date.now(),
            applying_for_class: className,
            subject_name: subName.trim()
        };
        subjects.push(newSub);
        if (archiveData) archiveData.subjects = subjects;
        renderSubjectButtons();
        return;
    }

    const payload = {
        applying_for_class: className,
        subject_name: subName.trim(),
        session_value: sessionSelect.value   // ← scope to current session
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

    if (isArchived) {
        progressColumns = (archiveData.progressColumns || []).filter(c => c.subject_id === subjectId);
        scoresMap = archiveData.scoresMap || {};
        renderDropdownMenu();
        renderTable();
        return;
    }

    const { data: cData, error: cErr } = await applySchoolScope(
        supabaseClient
            .from('monitoring_topics')
            .select('*')
    )
        .eq('subject_id', subjectId)
        .eq('session_value', currentSession)   // ← scope to current session
        .order('created_at', { ascending: true });

    if (cErr) { console.error('Topics error:', cErr); return; }
    progressColumns = cData || [];

    const { data: scData, error: scErr } = await applySchoolScope(
        supabaseClient
            .from('monitoring_scores')
            .select('*')
    )
        .eq('subject_id', subjectId)
        .eq('session_value', currentSession);   // ← scope to current session

    if (scErr) { console.error('Scores error:', scErr); return; }
    scoresMap = {};
    (scData || []).forEach(row => {
        scoresMap[`${row.student_id}_${row.topic_id}`] = row;
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
            if (isArchived) {
                // Update in memory only
                const idx = (archiveData.progressColumns || []).findIndex(c => c.id === col.id);
                if (idx !== -1) archiveData.progressColumns[idx].topic_name = col.topic_name;
            } else {
                const { error } = await supabaseClient.from('monitoring_topics').update({ topic_name: colInput.value }).eq('id', col.id);
                if (error) alert('Failed to rename: ' + error.message);
            }
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
            if (isArchived) {
                // Update in memory
                const idx = (archiveData.progressColumns || []).findIndex(c => c.id === col.id);
                if (idx !== -1) archiveData.progressColumns[idx].criteria = col.criteria;
            } else {
                const { error } = await supabaseClient.from('monitoring_topics').update({ criteria: criteriaInput.value }).eq('id', col.id);
                if (error) alert('Failed to save criteria: ' + error.message);
            }
        });

        // Delete button
        const delBtn = document.createElement('button');
        delBtn.className = 'delete-col-btn';
        delBtn.textContent = '✖';
        delBtn.title = 'Delete Topic Permanently';
        delBtn.addEventListener('click', async () => {
            if (confirm(`PERMANENTLY delete "${col.topic_name}"? (Use 👁️ to just hide it instead!)`)) {
                if (isArchived) {
                    progressColumns = progressColumns.filter(c => c.id !== col.id);
                    if (archiveData) {
                        archiveData.progressColumns = archiveData.progressColumns.filter(c => c.id !== col.id);
                    }
                    renderDropdownMenu();
                    renderTable();
                } else {
                    await supabaseClient.from('monitoring_topics').delete().eq('id', col.id);
                    progressColumns = progressColumns.filter(c => c.id !== col.id);
                    renderDropdownMenu();
                    renderTable();
                }
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
            td.style.minWidth = '80px';
            
            const scoreInput = document.createElement('input');
            scoreInput.type = 'text';
            scoreInput.className = 'score-input';
            scoreInput.placeholder = '-';
            scoreInput.style.width = '100%';
            scoreInput.style.marginBottom = '2px';

            const dateInput = document.createElement('input');
            dateInput.type = 'text';
            dateInput.placeholder = 'dd-mm';
            dateInput.style.width = '100%';
            dateInput.style.fontSize = '11px';
            dateInput.style.textAlign = 'center';
            dateInput.style.border = '1px solid #cbd5e1';
            dateInput.style.borderRadius = '4px';
            dateInput.style.padding = '2px';

            const mapKey = `${student.id}_${col.id}`;
            const existingData = scoresMap[mapKey] || {};
            
            scoreInput.value = existingData.score !== undefined ? existingData.score : '';
            if (existingData.covered_date) {
                const parts = existingData.covered_date.split('-');
                if (parts.length === 3) dateInput.value = `${parts[2]}-${parts[1]}`;
                else dateInput.value = existingData.covered_date;
            }

            const saveScoreAndDate = async () => {
                let dbDate = null;
                
                if (scoreInput.value && !dateInput.value) {
                    const today = new Date();
                    const d = String(today.getDate()).padStart(2, '0');
                    const m = String(today.getMonth() + 1).padStart(2, '0');
                    dateInput.value = `${d}-${m}`;
                }

                if (dateInput.value) {
                    const parts = dateInput.value.split('-');
                    if (parts.length === 2) {
                        const yr = new Date().getFullYear();
                        dbDate = `${yr}-${parts[1]}-${parts[0]}`;
                    } else if (parts.length === 3) {
                        dbDate = `${parts[2]}-${parts[1]}-${parts[0]}`;
                    } else {
                        dbDate = dateInput.value;
                    }
                }

                scoresMap[mapKey] = { score: scoreInput.value, covered_date: dbDate };
                
                if (isArchived) {
                    // Update in memory archiveData
                    if (archiveData) {
                        if (!archiveData.scoresMap) archiveData.scoresMap = {};
                        archiveData.scoresMap[mapKey] = scoresMap[mapKey];
                    }
                } else {
                    const payload = {
                        student_id: student.id,
                        topic_id: col.id,
                        subject_id: selectedSubject.id,
                        score: scoreInput.value,
                        covered_date: dbDate,
                        session_value: currentSession   // ← scope to current session
                    };
                    if (window.currentSchoolId) payload.school_id = window.currentSchoolId;

                    const { error } = await supabaseClient.from('monitoring_scores').upsert(payload, { onConflict: 'student_id, topic_id, session_value' });
                    if (error) alert('Failed to save score/date: ' + error.message);
                }
            };

            scoreInput.addEventListener('change', saveScoreAndDate);
            dateInput.addEventListener('change', saveScoreAndDate);

            td.appendChild(scoreInput);
            td.appendChild(dateInput);
            tr.appendChild(td);
        });

        tableBody.appendChild(tr);
    });
}

// ── 10. Add Topic (Column) ──
addColBtn.addEventListener('click', async () => {
    if (!selectedSubject) { alert('Please select a subject first.'); return; }
    const tName = prompt(`Enter new topic name for ${selectedSubject.subject_name}:`);
    if (!tName || !tName.trim()) return;

    if (isArchived) {
        const newTopic = {
            id: 'arch-top-' + Date.now(),
            subject_id: selectedSubject.id,
            topic_name: tName.trim(),
            criteria: ''
        };
        progressColumns.push(newTopic);
        if (archiveData) {
            if (!archiveData.progressColumns) archiveData.progressColumns = [];
            archiveData.progressColumns.push(newTopic);
        }
        renderDropdownMenu();
        renderTable();
        return;
    }

    const payload = {
        subject_id: selectedSubject.id,
        topic_name: tName.trim(),
        session_value: currentSession   // ← scope to current session
    };
    if (window.currentSchoolId) payload.school_id = window.currentSchoolId;

    const { data: inserted, error } = await supabaseClient
        .from('monitoring_topics')
        .insert(payload)
        .select();

    if (error) { alert('Failed to add topic: ' + error.message); return; }
    progressColumns.push(inserted[0]);
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
        const data = scoresMap[`${student.id}_${targetCol.id}`] || {};
        const scoreVal = parseFloat(data.score);
        if (isNaN(scoreVal) || scoreVal < minScore) {
            defaulters.push({
                roll: student.roll_number,
                name: student.full_name,
                absentFive: getStudentLastFiveAbsenceText(student),
                score: data.score !== undefined ? data.score : 'N/A'
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

// ── Save Session (Archive) Button ──
saveSessionBtn.addEventListener('click', async () => {
    if (!classSelect.value || !sessionSelect.value) return;

    if (isArchived) {
        // UPDATE existing archive
        if (!confirm('Update the saved archive with your recent edits?')) return;
        saveSessionBtn.disabled = true;
        saveSessionBtn.innerHTML = 'Updating...';
        try {
            let archQuery = supabaseClient
                .from('monitoring_archives')
                .update({ archive_data: archiveData })
                .eq('session_value', sessionSelect.value)
                .eq('class_name', classSelect.value);
            if (window.currentSchoolId) archQuery = archQuery.eq('school_id', window.currentSchoolId);

            const { error } = await archQuery;
            if (error) throw error;
            alert('Archive successfully updated!');
        } catch (err) {
            alert('Failed to update archive: ' + err.message);
        } finally {
            saveSessionBtn.disabled = false;
            saveSessionBtn.innerHTML = '💾 Update Archive';
        }
    } else {
        // CREATE new archive
        if (!confirm(`Are you sure you want to SAVE (Archive) the ${sessionSelect.value} data for ${classSelect.value}?\n\nThis will freeze all students, subjects, topics, and scores. If a student is promoted later, their historical data will remain intact in this session view.\n\nNote: You can still edit the archive later.`)) return;
        
        saveSessionBtn.disabled = true;
        saveSessionBtn.innerHTML = 'Saving...';
        
        try {
            const subjectIds = subjects.map(s => s.id);
            
            let allTopics = [];
            let allScores = [];
            
            if (subjectIds.length > 0) {
                const { data: tData } = await applySchoolScope(supabaseClient.from('monitoring_topics').select('*').in('subject_id', subjectIds));
                const { data: sData } = await applySchoolScope(supabaseClient.from('monitoring_scores').select('*').in('subject_id', subjectIds));
                allTopics = tData || [];
                allScores = sData || [];
            }
            
            const fullScoresMap = {};
            allScores.forEach(row => {
                fullScoresMap[`${row.student_id}_${row.topic_id}`] = row;
            });
            
            const payload = {
                session_value: sessionSelect.value,
                class_name: classSelect.value,
                archive_data: {
                    students: students,
                    subjects: subjects,
                    progressColumns: allTopics,
                    scoresMap: fullScoresMap
                }
            };
            if (window.currentSchoolId) payload.school_id = window.currentSchoolId;
            
            const { error } = await supabaseClient.from('monitoring_archives').insert(payload);
            if (error) {
                if (error.code === '23505') throw new Error('An archive already exists for this Class and Session.');
                throw error;
            }
            
            alert('Session data successfully saved! This view is now archived.');
            onFilterChange(); // Reload view as read-only/edit-archive mode
        } catch (err) {
            alert('Failed to save archive: ' + err.message);
            saveSessionBtn.disabled = false;
            saveSessionBtn.innerHTML = '💾 Save Session Data';
        }
    }
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

// ── 12. Auto-Recover Old Data ──
const recoverDataBtn = document.getElementById('recoverDataBtn');
if (recoverDataBtn) {
    recoverDataBtn.addEventListener('click', async () => {
        const oldSession = prompt("What was the EXACT name of your old session? (e.g., 2026 or 2025-2026)\n\nWe will move all hidden old data into this session.", "2026");
        if (!oldSession) return;
        
        recoverDataBtn.disabled = true;
        recoverDataBtn.textContent = 'Recovering...';
        
        try {
            // Update where session_value is '' or null
            await supabaseClient.from('monitoring_subjects').update({ session_value: oldSession }).eq('session_value', '');
            await supabaseClient.from('monitoring_subjects').update({ session_value: oldSession }).is('session_value', null);
            
            await supabaseClient.from('monitoring_topics').update({ session_value: oldSession }).eq('session_value', '');
            await supabaseClient.from('monitoring_topics').update({ session_value: oldSession }).is('session_value', null);
            
            await supabaseClient.from('monitoring_scores').update({ session_value: oldSession }).eq('session_value', '');
            await supabaseClient.from('monitoring_scores').update({ session_value: oldSession }).is('session_value', null);
            
            alert(`Recovery complete! All old data has been assigned to the "${oldSession}" session.\n\nPlease refresh the page.`);
            recoverDataBtn.style.display = 'none';
        } catch (err) {
            alert('Recovery failed: ' + err.message);
            recoverDataBtn.disabled = false;
            recoverDataBtn.textContent = '🔄 Recover Old Data';
        }
    });
}
