// ─── State ───────────────────────────────────────────────────────────────────
let allStudents       = [];      // Active admissions (fetched once)
let activeClassNames  = [];      // Active classes in their configured display order
let todayAttMap       = {};      // { student_id: {status, ...} } for selectedDate only
let absenceCountMap   = {};      // { student_id: totalAbsences }  (only absent rows)
let selectedDate      = '';
let waTemplates = [];
let currentOpenStudentId = null;
let _lastRefreshTime  = 0;       // Timestamp of last DB refresh (for debounce)
let _saveInProgress   = false;   // Prevent double-clicks during save

// ── Wait for auth context (school_id) to be ready ──
async function waitForAuthContext(timeoutMs = 10000) {
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
        if (window.authReady === true && window.supabaseClient) return;
        await new Promise(r => setTimeout(r, 80));
    }
    // Fallback
    if ((window.currentSchoolId === null || window.currentSchoolId === undefined) && window.currentUser?.id) {
        try {
            const { data } = await window.supabaseClient.from('user_roles').select('school_id').eq('user_id', window.currentUser.id).single();
            window.currentSchoolId = data?.school_id ?? null;
        } catch (e) { console.error('Fallback auth resolution failed:', e); }
    }
}

// ─── Real Time Date Helper ───────────────────────────────────────────────────
async function getRealDate() {
    try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 2000);
        
        const res = await fetch('https://worldtimeapi.org/api/timezone/Asia/Karachi', {
            signal: controller.signal
        });
        clearTimeout(timeoutId);
        
        if (res.ok) {
            const json = await res.json();
            if (json && json.datetime) {
                return json.datetime.slice(0, 10); // "YYYY-MM-DD"
            }
        }
    } catch (e) {
        console.warn('Primary Time API failed, trying backup:', e);
    }
    
    try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 2000);
        
        const res = await fetch('https://timeapi.io/api/Time/current/zone?timeZone=Asia/Karachi', {
            signal: controller.signal
        });
        clearTimeout(timeoutId);
        
        if (res.ok) {
            const json = await res.json();
            if (json && json.date) {
                const parts = json.date.split('/');
                if (parts.length === 3) {
                    return `${parts[2]}-${parts[0].padStart(2, '0')}-${parts[1].padStart(2, '0')}`;
                }
                return json.date;
            }
        }
    } catch (e) {
        console.warn('Backup Time API failed, falling back to computer clock:', e);
    }
    
    // Fallback to computer local clock
    const now = new Date();
    return now.getFullYear() + '-' +
        String(now.getMonth() + 1).padStart(2, '0') + '-' +
        String(now.getDate()).padStart(2, '0');
}

// ─── Init ─────────────────────────────────────────────────────────────────────
window.onAppReady(async () => {
    await waitForAuthContext();

    const picker = document.getElementById('globalDate');
    const realDateStr = await getRealDate();
    picker.value = realDateStr;
    selectedDate = realDateStr;
    document.getElementById('holidayFrom').value = realDateStr;
    document.getElementById('holidayTo').value = realDateStr;
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
    document.getElementById('btnHolidayRange').addEventListener('click', applyHolidayRange);
    document.getElementById('btnThermalPrint').addEventListener('click', generateThermalPrint);

    // ── Cross-device sync: refresh data when tab regains focus ──
    document.addEventListener('visibilitychange', handleVisibilityRefresh);

    showToast('Initializing System...', 'success');
    await loadWaTemplates();
    await loadDatabase();
    document.getElementById('btnHolidayRange').disabled = allStudents.length === 0;
});

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Auto-refresh when tab becomes visible again (cross-device consistency fix) */
async function handleVisibilityRefresh() {
    if (document.visibilityState !== 'visible') return;
    // Debounce: don't refresh if last refresh was < 5 seconds ago
    const now = Date.now();
    if (now - _lastRefreshTime < 5000) return;
    _lastRefreshTime = now;

    try {
        // Refresh today's attendance from DB (gets changes from other devices)
        await refreshTodayAttendance();
        // Also refresh absence counts from DB to prevent drift
        await refreshAbsenceCounts();
        renderData();
    } catch (err) {
        console.error('Tab-focus refresh failed:', err);
    }
}

function getValidPhone(s) {
    let w = String(s?.father_whatsapp || '').trim();
    let m = String(s?.father_mobile || '').trim();
    if (w.toLowerCase() === 'not provided' || w.toLowerCase() === 'n/a' || w === '-') w = '';
    if (m.toLowerCase() === 'not provided' || m.toLowerCase() === 'n/a' || m === '-') m = '';
    return w || m || '';
}

/** Single non-paginated query scoped to this school. Fast for small result sets. */
async function scopedQuery(table, selectCols, extraFilters = []) {
    let q = window.supabaseClient.from(table).select(selectCols);
    if (window.currentSchoolId) q = q.eq('school_id', window.currentSchoolId);
    for (const [col, val] of extraFilters) {
        if (Array.isArray(val)) {
            q = q.in(col, val);
        } else {
            q = q.eq(col, val);
        }
    }
    const { data, error } = await q;
    if (error) throw error;
    return data || [];
}

async function loadActiveClasses() {
    let q = window.supabaseClient
        .from('classes')
        .select('class_name, section, display_order')
        .eq('is_active', true)
        .order('display_order', { ascending: true, nullsFirst: false })
        .order('class_name', { ascending: true })
        .order('section', { ascending: true });

    if (window.currentSchoolId) q = q.eq('school_id', window.currentSchoolId);

    const { data, error } = await q;
    if (error) throw error;

    return [...new Set((data || [])
        .map(c => `${c.class_name || ''} ${c.section || ''}`.trim())
        .filter(Boolean))];
}

/** Paginated fetch for large datasets (used only for all-time absence counts). */
async function paginatedQuery(table, selectCols, filters = []) {
    const PAGE = 1000;
    let result = [], from = 0;
    while (true) {
        let q = window.supabaseClient.from(table).select(selectCols).range(from, from + PAGE - 1);
        if (window.currentSchoolId) q = q.eq('school_id', window.currentSchoolId);
        for (const [col, val] of filters) {
            if (Array.isArray(val)) {
                q = q.in(col, val);
            } else {
                q = q.eq(col, val);
            }
        }
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
        const [studentsData, todayData, absentData, classNames] = await Promise.all([
            // 1 – Students (fetched once, never re-fetched)
            scopedQuery(
                'admissions',
                'id, roll_number, full_name, applying_for_class, father_name, father_mobile, father_whatsapp',
                [['status', ['Active', 'active']]]
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
            ),
            loadActiveClasses()
        ]);

        allStudents = studentsData;
        activeClassNames = classNames;

        // Build today's lookup dict — only keep records for active students
        const activeIds = new Set(allStudents.map(s => s.id));
        todayAttMap = {};
        todayData.forEach(r => {
            if (activeIds.has(r.student_id)) {
                todayAttMap[r.student_id] = r;
            }
        });

        // Build absence count lookup
        absenceCountMap = {};
        absentData.forEach(r => {
            absenceCountMap[r.student_id] = (absenceCountMap[r.student_id] || 0) + 1;
        });

        _lastRefreshTime = Date.now();
    } catch (err) {
        showToast('Database Connection Error', 'error');
        console.error(err);
    }

    showLoader(false);
    populateClassFilter();
    renderData();
}

/** Called on date change or tab refocus – fetches attendance for the selected date. */
async function refreshTodayAttendance() {
    try {
        const todayData = await scopedQuery(
            'attendance',
            'student_id, status, date',
            [['date', selectedDate]]
        );
        // Only keep records for active students
        const activeIds = new Set(allStudents.map(s => s.id));
        todayAttMap = {};
        todayData.forEach(r => {
            if (activeIds.has(r.student_id)) {
                todayAttMap[r.student_id] = r;
            }
        });
        _lastRefreshTime = Date.now();
    } catch (err) {
        showToast('Failed to refresh attendance', 'error');
        console.error(err);
    }
}

/** Re-fetch absence counts from DB to prevent drift over time. */
async function refreshAbsenceCounts() {
    try {
        const absentData = await paginatedQuery(
            'attendance',
            'student_id',
            [['status', 'Absent']]
        );
        absenceCountMap = {};
        absentData.forEach(r => {
            absenceCountMap[r.student_id] = (absenceCountMap[r.student_id] || 0) + 1;
        });
    } catch (err) {
        console.error('Failed to refresh absence counts:', err);
    }
}

// ─── Entry Form ───────────────────────────────────────────────────────────────

function handleRollLookup(e) {
    const rNo = String(e.target.value).trim();
    const stu = allStudents.find(s => String(s.roll_number).trim() === rNo);
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
    const rNo = String(document.getElementById('entryRoll').value).trim();
    const s   = allStudents.find(x => String(x.roll_number).trim() === rNo);
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
    // Snapshot old state for rollback on failure
    const oldSnapshots = payloadArray.map(p => ({
        student_id: p.student_id,
        oldRecord: todayAttMap[p.student_id] ? { ...todayAttMap[p.student_id] } : null
    }));

    try {
        _saveInProgress = true;
        const scopedPayload = window.currentSchoolId
            ? payloadArray.map(item => ({ ...item, school_id: window.currentSchoolId }))
            : payloadArray;

        // Optimistic local update: update caches immediately so UI feels instant
        scopedPayload.forEach(payload => {
            const oldRecord   = todayAttMap[payload.student_id];
            const oldStatus   = oldRecord ? oldRecord.status : null;
            const newStatus   = payload.status;

            todayAttMap[payload.student_id] = payload;

            if (oldStatus !== 'Absent' && newStatus === 'Absent') {
                absenceCountMap[payload.student_id] = (absenceCountMap[payload.student_id] || 0) + 1;
            } else if (oldStatus === 'Absent' && newStatus !== 'Absent') {
                absenceCountMap[payload.student_id] = Math.max(0, (absenceCountMap[payload.student_id] || 0) - 1);
            }
        });
        renderData(); // Instant visual feedback with correct colors/counts

        // Now persist to DB
        const { error } = await window.supabaseClient
            .from('attendance')
            .upsert(scopedPayload, { onConflict: 'student_id,date' });

        if (error) throw error;

        showToast('Successfully saved records!');
        _lastRefreshTime = Date.now();
    } catch (err) {
        // Rollback local state on failure
        oldSnapshots.forEach(snap => {
            if (snap.oldRecord) {
                todayAttMap[snap.student_id] = snap.oldRecord;
            } else {
                delete todayAttMap[snap.student_id];
            }
        });
        // Recalculate absence counts from scratch after rollback
        // (simpler & safer than reverse-adjusting)
        const currentAbsenceAdjust = {};
        Object.values(todayAttMap).forEach(r => {
            if (r.status === 'Absent') {
                currentAbsenceAdjust[r.student_id] = true;
            }
        });

        renderData(); // Re-render with reverted state
        showToast('Save Failed! Reverted changes.', 'error');
        console.error(err);
    } finally {
        _saveInProgress = false;
    }
}

window.updateRow = async function(studentId) {
    if (_saveInProgress) return; // Prevent double-clicks
    const tr  = document.getElementById(`row-${studentId}`);
    if (!tr) return;
    const selEl = tr.querySelector('.inline-select');
    const sel = selEl.value;
    if (sel === '-') return;

    // Immediately update CSS class for visual feedback
    selEl.className = 'inline-select ' + sel;
    selEl.disabled = true;

    await performUpsert([{ student_id: studentId, date: selectedDate, status: sel }]);
};

async function applyBulkStatus(status) {
    if (_saveInProgress) return;
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

// ─── School-wide Holiday Date Range ──────────────────────────────────────────
function enumerateDateRange(startValue, endValue) {
    const parse = value => {
        const [year, month, day] = String(value || '').split('-').map(Number);
        return new Date(Date.UTC(year, month - 1, day));
    };
    const start = parse(startValue);
    const end = parse(endValue);
    if (!Number.isFinite(start.getTime()) || !Number.isFinite(end.getTime()) || start > end) return [];

    const dates = [];
    for (let cursor = start; cursor <= end; cursor = new Date(cursor.getTime() + 86400000)) {
        dates.push(cursor.toISOString().slice(0, 10));
        if (dates.length > 366) break;
    }
    return dates;
}

async function applyHolidayRange() {
    if (_saveInProgress) return;
    const fromInput = document.getElementById('holidayFrom');
    const toInput = document.getElementById('holidayTo');
    const button = document.getElementById('btnHolidayRange');
    const dates = enumerateDateRange(fromInput.value, toInput.value);

    if (!fromInput.value || !toInput.value) return showToast('Select both holiday dates.', 'error');
    if (dates.length === 0) return showToast('Holiday end date must be on or after the start date.', 'error');
    if (dates.length > 366) return showToast('Choose a holiday range of 366 days or less.', 'error');
    if (allStudents.length === 0) return showToast('No active students are available.', 'error');

    const totalRecords = dates.length * allStudents.length;
    const fromLabel = new Date(fromInput.value + 'T00:00:00').toLocaleDateString('en-GB');
    const toLabel = new Date(toInput.value + 'T00:00:00').toLocaleDateString('en-GB');
    const confirmed = window.confirm(
        `Mark ${dates.length} date${dates.length === 1 ? '' : 's'} (${fromLabel} to ${toLabel}) as Holiday for ` +
        `${allStudents.length} active students?\n\nThis will replace any Present, Absent, or Late records already saved inside this range.`
    );
    if (!confirmed) return;

    _saveInProgress = true;
    button.disabled = true;
    const originalButton = button.innerHTML;

    try {
        const batchSize = 500;
        let batch = [];
        let saved = 0;

        async function saveBatch() {
            if (batch.length === 0) return;
            const { error } = await window.supabaseClient
                .from('attendance')
                .upsert(batch, { onConflict: 'student_id,date' });
            if (error) throw error;
            saved += batch.length;
            button.innerHTML = `<i class="fas fa-spinner fa-spin"></i> Saving ${saved.toLocaleString()} / ${totalRecords.toLocaleString()}`;
            batch = [];
        }

        for (const date of dates) {
            for (const student of allStudents) {
                batch.push({
                    student_id: student.id,
                    date,
                    status: 'Holiday',
                    ...(window.currentSchoolId ? { school_id: window.currentSchoolId } : {})
                });
                if (batch.length >= batchSize) await saveBatch();
            }
        }
        await saveBatch();

        // A Holiday may replace an Absent record, so refresh both the selected
        // date and all-time absence counters before redrawing the dashboard.
        await Promise.all([refreshTodayAttendance(), refreshAbsenceCounts()]);
        renderData();
        showToast(`${dates.length} holiday date${dates.length === 1 ? '' : 's'} saved for all active students.`);
    } catch (error) {
        console.error('Holiday range save failed:', error);
        await Promise.all([refreshTodayAttendance(), refreshAbsenceCounts()]);
        renderData();
        showToast(`Holiday range stopped: ${error.message || error}`, 'error');
    } finally {
        _saveInProgress = false;
        button.disabled = allStudents.length === 0;
        button.innerHTML = originalButton;
    }
}

// ─── Class Filter Population ──────────────────────────────────────────────────

function populateClassFilter() {
    const select = document.getElementById('classFilter');
    const studentClasses = new Set(allStudents.map(s => s.applying_for_class).filter(Boolean));
    const classes = activeClassNames.filter(cls => studentClasses.has(cls));

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
    // Late counts as Present (student IS physically present, just late)
    let stats = { total: classFiltered.length, p: 0, a: 0, late: 0, notMarked: 0 };
    classFiltered.forEach(s => {
        const status = (todayAttMap[s.id] || {}).status;
        if (status === 'Present')     stats.p++;
        else if (status === 'Absent') stats.a++;
        else if (status === 'Late')   { stats.p++; stats.late++; }
        else if (!status || status === '-') stats.notMarked++;
        // Holiday is intentionally not counted in present/absent
    });
    document.getElementById('statTotal').textContent     = stats.total;
    document.getElementById('statPresent').textContent   = stats.p;
    document.getElementById('statAbsent').textContent    = stats.a;
    document.getElementById('statLate').textContent      = stats.late;
    document.getElementById('statNotMarked').textContent = stats.notMarked;

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
        // Handle "Not Marked" filter
        if (statusVal === 'NotMarked') {
            if (stType !== '-') return false;
        } else if (statusVal !== 'All' && stType !== statusVal) {
            return false;
        }
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
        const mob = getValidPhone(s);
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
        const { data, error } = await window.supabaseClient.from('wa_templates').select('*').order('created_at', { ascending: true });
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
    if(!currentOpenStudentId) {
        showToast("No student selected", 'error');
        return;
    }
    
    const ids = String(currentOpenStudentId).split(',');
    const students = ids.map(id => allStudents.find(x => x.id === id)).filter(Boolean);
    
    if (students.length === 0) {
        showToast("Student not found", 'error');
        return;
    }

    // Use first student for father's mobile (primary contact)
    let s = students[0];
    
    // Validate that at least one student has a mobile/whatsapp number
    const studentsWithMobile = students.filter(st => {
        const m = getValidPhone(st);
        return m && m.length > 0;
    });
    if (studentsWithMobile.length === 0) {
        showToast("No student has a registered WhatsApp or mobile number", 'error');
        return;
    }
    
    // If primary student has no contact, use the first one that does
    const sContact = getValidPhone(s);
    if (!sContact || sContact.length === 0) {
        s = studentsWithMobile[0];
    }

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
        
        // Validate message text
        if(!text || text.trim().length === 0) {
            showToast("Please enter a message", 'error');
            return;
        }
        
        // Validate phone number exists
        const targetPhone = getValidPhone(s);
        if(!targetPhone || targetPhone.length === 0) {
            showToast("This student has no WhatsApp or mobile number registered.", 'error');
            return;
        }
        
        // Process phone number - remove all non-numeric characters
        let phone = String(targetPhone).trim().replace(/[^0-9+]/g, '');
        
        // Remove leading + if present
        if (phone.startsWith('+')) {
            phone = phone.substring(1);
        }
        
        // Validate phone number length
        if (phone.length < 10 || phone.length > 15) {
            showToast("Invalid phone number format. Expected 10-15 digits.", 'error');
            return;
        }
        
        // Convert Pakistan phone numbers: 0XXXXXXXXXX -> 92XXXXXXXXX
        if (phone.startsWith('0') && phone.length === 11) {
            phone = '92' + phone.substring(1);
        }
        
        // Ensure country code is present (if it starts with digits and is 10 digits, assume Pakistan)
        if (!phone.startsWith('92') && !phone.startsWith('1') && phone.length === 10) {
            phone = '92' + phone; // Assume Pakistan
        }
        
        try {
            // Build WhatsApp URL
            const waUrl = `https://wa.me/${phone}?text=${encodeURIComponent(text)}`;
            
            // Validate URL length (WhatsApp has limits)
            if (waUrl.length > 2048) {
                showToast("Message is too long. Please reduce the length.", 'error');
                return;
            }
            
            // Open WhatsApp with error handling
            const newWindow = window.open(waUrl, '_blank');
            
            // Check if window was successfully opened
            if (!newWindow) {
                showToast("Failed to open WhatsApp. Your browser may have blocked the popup.", 'error');
                return;
            }
            
            showToast("WhatsApp opened successfully!");
            closeWaModal();
        } catch (error) {
            console.error('Error opening WhatsApp:', error);
            showToast("Error opening WhatsApp. Please try again.", 'error');
        }
    };
};

window.closeWaModal = function() {
    document.getElementById('waModal').style.display = 'none';
};

// ─── Thermal Print ─────────────────────────────────────────────────────────────
function generateThermalPrint() {
    const absentByClass = {};
    allStudents.forEach(s => {
        const record = todayAttMap[s.id] || {};
        if (record.status === 'Absent') {
            const cls = s.applying_for_class || 'Unknown';
            absentByClass[cls] = (absentByClass[cls] || 0) + 1;
        }
    });

    // Don't print if no absentees
    if (Object.keys(absentByClass).length === 0) {
        showToast("No absent students found for this date.", "success");
        return;
    }

    const d = new Date(selectedDate);
    // e.g. "16-May-2026"
    const dateStr = d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
    const dayStr = d.toLocaleDateString('en-GB', { weekday: 'long' });

    let html = `
        <html><head><title>Thermal Print - Absent Report</title>
        <style>
            @media print { @page { margin: 0; } body { margin: 0; padding: 5px; } }
            body { font-family: monospace; width: 100%; max-width: 260px; box-sizing: border-box; margin: 0 auto; padding: 5px; color: #000; font-size: 14px; }
            h3 { text-align: center; margin: 5px 0; font-size: 16px; text-transform: uppercase; font-weight: bold; }
            .meta { text-align: left; margin-bottom: 10px; font-size: 14px; padding-bottom: 5px; font-weight: bold; }
            .meta div { margin-bottom: 2px; }
            table { width: 100%; border-collapse: collapse; margin-top: 5px; table-layout: auto; }
            th { border-bottom: 1px dashed #000; text-align: left; padding: 4px 0; font-size: 14px; }
            td { padding: 4px 0; vertical-align: top; word-wrap: break-word; font-size: 14px; font-weight: bold; }
            .right { text-align: right; padding-right: 8px; }
        </style>
        </head>
        <body onload="window.print()">
          <div class="meta">
            <div>Date : ${dateStr}</div>
            <div>Day  : ${dayStr}</div>
          </div>
          <table>
    `;

    let totalAbsent = 0;
    const orderByClass = new Map(activeClassNames.map((name, index) => [name, index]));
    const classes = Object.keys(absentByClass).sort((a, b) => {
        const aOrder = orderByClass.has(a) ? orderByClass.get(a) : Number.MAX_SAFE_INTEGER;
        const bOrder = orderByClass.has(b) ? orderByClass.get(b) : Number.MAX_SAFE_INTEGER;
        return aOrder - bOrder || a.localeCompare(b, undefined, { numeric: true });
    });
    classes.forEach(cls => {
        const count = absentByClass[cls];
        totalAbsent += count;
        html += `<tr><td>${cls}</td><td class="right">${count}</td></tr>`;
    });

    html += `</table>
          <div style="text-align:left;margin-top:10px;border-top:1px dashed #000;padding-top:5px;font-size:14px; font-weight: bold;">
             Total Absent: <span style="float:right;padding-right:8px;">${totalAbsent}</span>
          </div>
        </body></html>`;

    const printWindow = window.open('', '_blank', 'width=400,height=600');
    printWindow.document.write(html);
    printWindow.document.close();
}
