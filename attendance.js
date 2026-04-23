// ─── State ───────────────────────────────────────────────────────────────────
let allStudents       = [];      // Active admissions (fetched once)
let todayAttMap       = {};      // { student_id: {status, ...} } for selectedDate only
let absenceCountMap   = {};      // { student_id: totalAbsences }  (only absent rows)
let selectedDate      = '';
const currentSchoolId = window.currentSchoolId || null;

let waTemplates = [];
let currentOpenStudentId = null;

// ─── Init ─────────────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', async () => {
    const picker = document.getElementById('globalDate');
    picker.valueAsDate = new Date();
    selectedDate = picker.value;
    document.getElementById('tableDateDisplay').textContent =
        new Date(selectedDate + 'T00:00:00').toLocaleDateString('en-GB');

    picker.addEventListener('change', async (e) => {
        selectedDate = e.target.value;
        document.getElementById('tableDateDisplay').textContent =
            new Date(selectedDate + 'T00:00:00').toLocaleDateString('en-GB');

        // Only re-fetch attendance for the new date; students & absence counts stay cached
        showLoader(true);
        await refreshTodayAttendance();
        showLoader(false);
        renderData();
    });

    document.getElementById('entryRoll').addEventListener('input', handleRollLookup);
    document.getElementById('attendanceForm').addEventListener('submit', handleEntrySubmit);
    document.getElementById('searchFilter').addEventListener('input', renderData);
    document.getElementById('statusFilter').addEventListener('change', renderData);
    document.getElementById('classFilter').addEventListener('change', renderData);

    document.getElementById('btnBulkPresent').addEventListener('click', () => applyBulkStatus('Present'));
    document.getElementById('btnBulkAbsent').addEventListener('click',  () => applyBulkStatus('Absent'));
    document.getElementById('btnBulkHoliday').addEventListener('click', () => applyBulkStatus('Holiday'));

    showToast('Initializing System...', 'success');
    await loadWaTemplates();
    await loadDatabase();
});

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Single non-paginated query scoped to this school. Fast for small result sets. */
async function scopedQuery(table, selectCols, extraFilters = []) {
    let q = supabaseClient.from(table).select(selectCols);
    if (currentSchoolId) q = q.eq('school_id', currentSchoolId);
    for (const [col, val] of extraFilters) q = q.eq(col, val);
    const { data, error } = await q;
    if (error) throw error;
    return data || [];
}

/** Paginated fetch for large datasets (used only for all-time absence counts). */
async function paginatedQuery(table, selectCols, filters = []) {
    const PAGE = 1000;
    let result = [], from = 0;
    while (true) {
        let q = supabaseClient.from(table).select(selectCols).range(from, from + PAGE - 1);
        if (currentSchoolId) q = q.eq('school_id', currentSchoolId);
        for (const [col, val] of filters) q = q.eq(col, val);
        const { data, error } = await q;
        if (error) throw error;
        if (!data || data.length === 0) break;
        result = result.concat(data);
        if (data.length < PAGE) break;
        from += PAGE;
    }
    return result;
}

function showLoader(visible) {
    document.getElementById('loader').style.display = visible ? 'block' : 'none';
    document.getElementById('attendanceTable').style.opacity = visible ? '0.3' : '1';
}

// ─── Data Loading ─────────────────────────────────────────────────────────────

/**
 * Initial load: runs 3 queries IN PARALLEL.
 *  1. Active students        – non-paginated, small result
 *  2. Today's attendance     – non-paginated, date-scoped (only N students max)
 *  3. All-time absent rows   – paginated BUT only student_id column + status=Absent
 *     (3 columns skipped = much less data vs fetching all attendance)
 */
async function loadDatabase() {
    showLoader(true);
    try {
        const [studentsData, todayData, absentData] = await Promise.all([
            // 1 – Students (fetched once, never re-fetched)
            scopedQuery(
                'admissions',
                'id, roll_number, full_name, applying_for_class, father_name, father_mobile',
                [['status', 'Active']]
            ),
            // 2 – Only today's attendance records
            scopedQuery(
                'attendance',
                'student_id, status, date',
                [['date', selectedDate]]
            ),
            // 3 – Only absent records (student_id only) for historical count
            paginatedQuery(
                'attendance',
                'student_id',
                [['status', 'Absent']]
            )
        ]);

        allStudents = studentsData;

        // Build today's lookup dict
        todayAttMap = {};
        todayData.forEach(r => { todayAttMap[r.student_id] = r; });

        // Build absence count lookup
        absenceCountMap = {};
        absentData.forEach(r => {
            absenceCountMap[r.student_id] = (absenceCountMap[r.student_id] || 0) + 1;
        });

    } catch (err) {
        showToast('Database Connection Error', 'error');
        console.error(err);
    }

    showLoader(false);
    populateClassFilter();
    renderData();
}

/** Called on date change – only fetches attendance for the new date (fast). */
async function refreshTodayAttendance() {
    try {
        const todayData = await scopedQuery(
            'attendance',
            'student_id, status, date',
            [['date', selectedDate]]
        );
        todayAttMap = {};
        todayData.forEach(r => { todayAttMap[r.student_id] = r; });
    } catch (err) {
        showToast('Failed to refresh attendance', 'error');
        console.error(err);
    }
}

// ─── Entry Form ───────────────────────────────────────────────────────────────

function handleRollLookup(e) {
    const rNo = String(e.target.value).trim();
    const stu = allStudents.find(s => String(s.roll_number) === rNo);
    if (stu) {
        document.getElementById('entryName').value  = stu.full_name;
        document.getElementById('entryClass').value = stu.applying_for_class;
        e.target.classList.add('highlight-input');
    } else {
        document.getElementById('entryName').value  = '';
        document.getElementById('entryClass').value = '';
        e.target.classList.remove('highlight-input');
    }
}

async function handleEntrySubmit(e) {
    e.preventDefault();
    const rNo = document.getElementById('entryRoll').value;
    const s   = allStudents.find(x => String(x.roll_number) === rNo);
    if (!s) return showToast('Invalid Roll Number', 'error');

    await performUpsert([{
        student_id: s.id,
        date:       selectedDate,
        status:     document.getElementById('entryStatus').value || 'Absent'
    }]);

    document.getElementById('entryRoll').value  = '';
    document.getElementById('entryName').value  = '';
    document.getElementById('entryClass').value = '';
    document.getElementById('entryRoll').focus();
}

// ─── Upsert (Save) ────────────────────────────────────────────────────────────

/**
 * Saves records to Supabase then updates LOCAL caches without a full reload.
 * Absence counts are adjusted mathematically (no re-fetch needed).
 */
async function performUpsert(payloadArray) {
    try {
        const scopedPayload = currentSchoolId
            ? payloadArray.map(item => ({ ...item, school_id: currentSchoolId }))
            : payloadArray;

        const { error } = await supabaseClient
            .from('attendance')
            .upsert(scopedPayload, { onConflict: 'student_id, date' });

        if (error) throw error;

        // Update local caches: no DB round-trip needed
        scopedPayload.forEach(payload => {
            const oldRecord   = todayAttMap[payload.student_id];
            const oldStatus   = oldRecord ? oldRecord.status : null;
            const newStatus   = payload.status;

            // Update today's map
            todayAttMap[payload.student_id] = payload;

            // Adjust absence count only if status crossed the Absent boundary
            if (oldStatus !== 'Absent' && newStatus === 'Absent') {
                absenceCountMap[payload.student_id] = (absenceCountMap[payload.student_id] || 0) + 1;
            } else if (oldStatus === 'Absent' && newStatus !== 'Absent') {
                absenceCountMap[payload.student_id] = Math.max(0, (absenceCountMap[payload.student_id] || 0) - 1);
            }
        });

        showToast('Successfully saved records!');
        renderData();
    } catch (err) {
        showToast('Save Failed!', 'error');
        console.error(err);
    }
}

window.updateRow = async function(studentId) {
    const tr  = document.getElementById(`row-${studentId}`);
    const sel = tr.querySelector('.inline-select').value;
    if (sel === '-') return;
    await performUpsert([{ student_id: studentId, date: selectedDate, status: sel }]);
};

async function applyBulkStatus(status) {
    const rows    = document.querySelectorAll('#attendanceBody tr');
    const toUpsert = [];
    rows.forEach(tr => {
        if (tr.dataset.id) {
            toUpsert.push({ student_id: tr.dataset.id, date: selectedDate, status });
        }
    });
    if (toUpsert.length === 0) return showToast('No rows visible', 'error');
    showToast(`Bulk applying ${status}...`);
    await performUpsert(toUpsert);
}

// ─── Class Filter Population ──────────────────────────────────────────────────

function populateClassFilter() {
    const select = document.getElementById('classFilter');
    const classes = [...new Set(allStudents.map(s => s.applying_for_class).filter(Boolean))]
        .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));

    select.innerHTML = '<option value="All">📚 All Classes</option>';
    classes.forEach(cls => {
        const opt = document.createElement('option');
        opt.value       = cls;
        opt.textContent = cls;
        select.appendChild(opt);
    });
}

// ─── Render ───────────────────────────────────────────────────────────────────

function renderData() {
    const tbody     = document.getElementById('attendanceBody');
    const searchVal = document.getElementById('searchFilter').value.toLowerCase();
    const statusVal = document.getElementById('statusFilter').value;
    const classVal  = document.getElementById('classFilter').value;

    // Scope to selected class
    const classFiltered = classVal === 'All'
        ? allStudents
        : allStudents.filter(s => s.applying_for_class === classVal);

    // ── Stat cards (always based on class scope, ignores search/status filters) ──
    let stats = { total: classFiltered.length, p: 0, a: 0 };
    classFiltered.forEach(s => {
        const status = (todayAttMap[s.id] || {}).status;
        if (status === 'Present') stats.p++;
        if (status === 'Absent')  stats.a++;
    });
    document.getElementById('statTotal').textContent   = stats.total;
    document.getElementById('statPresent').textContent = stats.p;
    document.getElementById('statAbsent').textContent  = stats.a;

    // Toggle WA column header based on filter
    const showWa = statusVal === 'Absent';
    const headerCol = document.getElementById('colWaHeader');
    if (headerCol) headerCol.style.display = showWa ? 'table-cell' : 'none';

    // ── Table rows (respects all filters) ──
    // Build fragment off-DOM for a single reflow
    const fragment = document.createDocumentFragment();
    const viewList  = [...classFiltered].sort((a, b) => a.roll_number - b.roll_number);

    let filteredList = viewList.filter(student => {
        const record  = todayAttMap[student.id] || {};
        const stType  = record.status || '-';
        if (statusVal !== 'All' && stType !== statusVal) return false;
        if (searchVal) {
            const composite = `${student.roll_number} ${student.full_name} ${student.applying_for_class}`.toLowerCase();
            if (!composite.includes(searchVal)) return false;
        }
        return true;
    });

    let grouped = {};
    let singles = [];
    let families = [];

    filteredList.forEach(s => {
        const mob = (s.father_mobile || '').trim();
        // Phone numbers should be long enough to be valid
        if (mob && mob.length > 5) {
            if (!grouped[mob]) grouped[mob] = [];
            grouped[mob].push(s);
        } else {
            singles.push(s);
        }
    });

    for (let mob in grouped) {
        if (grouped[mob].length > 1) {
            families.push({ mobile: mob, members: grouped[mob] });
        } else {
            singles.push(grouped[mob][0]);
        }
    }

    let rowCount = 0;

    // Render Families
    families.forEach(fam => {
        const fatherName = fam.members[0].father_name || 'Relative';
        const stIdsStr = fam.members.map(m => m.id).join(',');
        
        // Render Family Header
        const headerTr = document.createElement('tr');
        headerTr.style.background = '#fef3c7'; // soft yellow
        headerTr.innerHTML = `
            <td colspan="4" style="text-align:left; font-weight:800; color:#b45309; padding-left:1rem;">
                👨‍👩‍👧‍👦 Family of ${fatherName} (${fam.mobile}) — ${fam.members.length} student(s) 
            </td>
            <td></td>
            ${showWa ? `<td><button class="btn-icon" style="color:#2563eb; font-size:1.2rem; background:transparent; border:none; cursor:pointer;" title="Send Family WhatsApp" onclick="openWaModal('${stIdsStr}')"><i class="fab fa-whatsapp"></i></button></td>` : ''}
            <td></td>
        `;
        fragment.appendChild(headerTr);

        fam.members.forEach(student => {
            const tr = createStudentRow(student, showWa, true);
            fragment.appendChild(tr);
            rowCount++;
        });
    });

    // Render Singles
    singles.forEach(student => {
        const tr = createStudentRow(student, showWa, false);
        fragment.appendChild(tr);
        rowCount++;
    });

    tbody.innerHTML = '';
    if (rowCount === 0) {
        tbody.innerHTML = `<tr><td colspan="7" style="padding:2rem;text-align:center;">No students matched the filtering criteria.</td></tr>`;
    } else {
        tbody.appendChild(fragment);
    }
}

function createStudentRow(student, showWa, isFamilyMember) {
    const record  = todayAttMap[student.id] || {};
    const stType  = record.status || '-';
    const totalAb = absenceCountMap[student.id] || 0;
    const badgeCls = totalAb > 2 ? 'critical' : '';

    const tr = document.createElement('tr');
    tr.id = `row-${student.id}`;
    tr.dataset.id = student.id;
    if (isFamilyMember) tr.style.background = '#fffbeb'; // lighter yellow

    tr.innerHTML = `
        <td class="col-roll">${student.roll_number}</td>
        <td><strong>${student.full_name}</strong></td>
        <td>${student.applying_for_class}</td>
        <td><span class="absent-count ${badgeCls}">${totalAb}</span></td>
        <td>
            <select class="inline-select ${stType !== '-' ? stType : ''}" onchange="updateRow('${student.id}')">
                ${stType === '-' ? '<option value="-" selected disabled>---</option>' : ''}
                <option value="Present" ${stType === 'Present' ? 'selected' : ''}>Present</option>
                <option value="Absent"  ${stType === 'Absent'  ? 'selected' : ''}>Absent</option>
                <option value="Late"    ${stType === 'Late'    ? 'selected' : ''}>Late</option>
                <option value="Holiday" ${stType === 'Holiday' ? 'selected' : ''}>Holiday</option>
            </select>
        </td>
        ${showWa ? (isFamilyMember ? `<td style="color:#94a3b8; font-size:0.8rem; font-style:italic;">via Family</td>` : `<td><button class="btn-icon" style="color:#25D366; font-size:1.2rem; background:transparent; border:none; cursor:pointer;" title="Send WhatsApp Message" onclick="openWaModal('${student.id}')"><i class="fab fa-whatsapp"></i></button></td>`) : ''}
        <td>
            <button class="btn-icon save" onclick="updateRow('${student.id}')" title="Force Save">💾</button>
        </td>`;

    return tr;
}

// ─── Toast ────────────────────────────────────────────────────────────────────

function showToast(msg, type = 'success') {
    const container = document.getElementById('toastContainer');
    const t = document.createElement('div');
    t.classList.add('toast', type);
    t.innerHTML = `<span>${type === 'success' ? '✅' : '🔴'}</span> <div>${msg}</div>`;
    container.appendChild(t);
    setTimeout(() => {
        t.classList.add('fade-out');
        t.addEventListener('animationend', () => t.remove());
    }, 3000);
}

// ─── WA Modal Methods ──────────────────────────────────────────────────────────

async function loadWaTemplates() {
    try {
        const { data, error } = await supabaseClient.from('wa_templates').select('*').order('created_at', { ascending: true });
        if (!error && data) {
            waTemplates = data;
            const dropdown = document.getElementById('waTemplateDropdown');
            if(dropdown) {
                dropdown.innerHTML = '';
                const lastUsed = localStorage.getItem('lastWaTemplate_Att');
                let selectedId = null;
                
                if (lastUsed && waTemplates.find(t => t.id === lastUsed)) {
                    selectedId = lastUsed;
                } else if (waTemplates.length > 0) {
                    selectedId = waTemplates[0].id;
                }

                waTemplates.forEach(t => {
                    const opt = document.createElement('option');
                    opt.value = t.id;
                    opt.textContent = t.title;
                    if(t.id === selectedId) opt.selected = true;
                    dropdown.appendChild(opt);
                });
            }
        }
    } catch(e) { console.error("Error loading WA templates", e); }
}

window.openWaModal = function(studentId) {
    currentOpenStudentId = studentId;
    applySelectedWaTemplate();
    document.getElementById('waModal').style.display = 'flex';
};

window.applySelectedWaTemplate = function() {
    if(!currentOpenStudentId) return;
    const ids = String(currentOpenStudentId).split(',');
    const students = ids.map(id => allStudents.find(x => x.id === id)).filter(Boolean);
    if (students.length === 0) return;

    let s = students[0];

    let templateText = "";
    const dropdown = document.getElementById('waTemplateDropdown');
    
    if (dropdown && dropdown.value) {
        const t = waTemplates.find(x => x.id === dropdown.value);
        if(t) {
            templateText = t.message_text;
            localStorage.setItem('lastWaTemplate_Att', t.id);
        }
    }

    if (!templateText) {
        templateText = "Dear {{FATHER_NAME}},\n\nYour child {{STUDENT_NAME}} is absent today ({{TODAY_DATE}}).";
    }

    const todayDate = new Date(selectedDate).toLocaleDateString('en-GB', {day: 'numeric', month: 'short', year: 'numeric'});
    
    let namesStr = students.map(x => x.full_name).join(', ');
    if (students.length > 1) {
        const lastIndex = namesStr.lastIndexOf(', ');
        namesStr = namesStr.substring(0, lastIndex) + ' and ' + namesStr.substring(lastIndex + 2);
    }

    let parsed = templateText.replace(/{{TODAY_DATE}}/g, todayDate)
                             .replace(/{{FATHER_NAME}}/g, s.father_name || 'Relative')
                             .replace(/{{STUDENT_NAME}}/g, namesStr);
                             
    // Remove formatting tokens that only make sense in fee bills
    parsed = parsed.replace(/{{BILL_DETAILS}}/g, '').replace(/{{GRAND_TOTAL}}/g, '');

    document.getElementById('waMessageText').value = parsed;
    
    const btnSend = document.getElementById('btnSendWa');
    btnSend.onclick = function() {
        const text = document.getElementById('waMessageText').value;
        if(!s.father_mobile) {
            alert("This student has no mobile number registered.");
            closeWaModal();
            return;
        }
        let phone = String(s.father_mobile).replace(/[^0-9]/g, '');
        if (phone.startsWith('0') && phone.length === 11) {
            phone = '92' + phone.substring(1);
        }
        window.open(`https://wa.me/${phone}?text=${encodeURIComponent(text)}`, '_blank');
        closeWaModal();
    };
};

window.closeWaModal = function() {
    document.getElementById('waModal').style.display = 'none';
};
