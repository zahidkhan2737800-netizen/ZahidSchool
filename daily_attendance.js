const db = window.supabaseClient;

let allRows = [];
let populatedClasses = false;
let activeClassNames = [];

const attDateInput = document.getElementById('attDate');
const statusFilterSelect = document.getElementById('statusFilter');
const classFilterSelect = document.getElementById('classFilter');
const searchTextInput = document.getElementById('searchText');

const fontSizeRange = document.getElementById('fontSizeRange');
const compactnessRange = document.getElementById('compactnessRange');
const fontSizeValue = document.getElementById('fontSizeValue');
const compactnessValue = document.getElementById('compactnessValue');

const printBtn = document.getElementById('printBtn');
const printDateHeader = document.getElementById('printDateHeader');
const loadBtn = document.getElementById('loadBtn');
const attendanceBody = document.getElementById('attendanceBody');

const rowCountEl = document.getElementById('rowCount');
const presentCountEl = document.getElementById('presentCount');
const absentCountEl = document.getElementById('absentCount');
const leaveCountEl = document.getElementById('leaveCount');
const lateCountEl = document.getElementById('lateCount');
const notMarkedCountEl = document.getElementById('notMarkedCount');

const LS_KEYS = {
    date: 'dailyAttendance.date',
    status: 'dailyAttendance.status',
    class: 'dailyAttendance.class',
    fontSize: 'dailyAttendance.fontSize',
    compactness: 'dailyAttendance.compactness'
};

function fmtDateOnly(dateObj) {
    const y = dateObj.getFullYear();
    const m = String(dateObj.getMonth() + 1).padStart(2, '0');
    const d = String(dateObj.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
}

function applySchoolScope(query) {
    return window.currentSchoolId ? query.eq('school_id', window.currentSchoolId) : query;
}

function toDateLabel(dateString) {
    if (!dateString) return '-';
    const parts = dateString.split('-');
    if (parts.length === 3) {
        const d = new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]));
        return d.toLocaleDateString('en-PK', {
            day: '2-digit',
            month: 'short',
            year: 'numeric',
            timeZone: 'Asia/Karachi'
        });
    }
    return dateString;
}

function getFilteredRows() {
    const q = (searchTextInput.value || '').trim().toLowerCase();
    const selectedStatus = statusFilterSelect.value || 'ALL';
    const selectedClass = classFilterSelect.value || 'ALL';

    return allRows.filter(r => {
        // Class filter
        if (selectedClass !== 'ALL' && r.className !== selectedClass) {
            return false;
        }

        // Status filter
        if (selectedStatus !== 'ALL') {
            const st = (r.status || '').toLowerCase();
            if (selectedStatus === 'Present' && st !== 'present') return false;
            if (selectedStatus === 'Absent' && st !== 'absent') return false;
            if (selectedStatus === 'Leave' && st !== 'leave' && st !== 'excused') return false;
            if (selectedStatus === 'Late' && st !== 'late') return false;
            if (selectedStatus === 'Holiday' && st !== 'holiday') return false;
            if (selectedStatus === 'NotMarked' && st !== 'not marked' && st !== '-') return false;
        }

        // Search text
        if (q) {
            const matchRoll = String(r.rollNo || '').toLowerCase().includes(q);
            const matchName = String(r.studentName || '').toLowerCase().includes(q);
            const matchFather = String(r.fatherName || '').toLowerCase().includes(q);
            const matchClass = String(r.className || '').toLowerCase().includes(q);
            const matchMobile = String(r.fatherMobile || '').toLowerCase().includes(q);

            if (!matchRoll && !matchName && !matchFather && !matchClass && !matchMobile) {
                return false;
            }
        }

        return true;
    });
}

function updatePrintHeader() {
    const selected = attDateInput.value;
    const dateLabel = toDateLabel(selected);
    const timeLabel = new Date().toLocaleTimeString('en-PK', {
        hour: 'numeric',
        minute: '2-digit',
        second: '2-digit',
        hour12: true,
        timeZone: 'Asia/Karachi'
    });

    let p = 0, a = 0, l = 0, late = 0, nm = 0;
    const filtered = getFilteredRows();

    filtered.forEach(r => {
        const st = (r.status || '').toLowerCase();
        if (st === 'present') p++;
        else if (st === 'absent') a++;
        else if (st === 'leave' || st === 'excused') l++;
        else if (st === 'late') late++;
        else nm++;
    });

    printDateHeader.textContent = `Daily Attendance Report | Date: ${dateLabel} | Total Students: ${filtered.length} | Present: ${p} | Absent: ${a} | Leave: ${l} | Late: ${late} | Not Marked: ${nm} | Printed: ${timeLabel}`;
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

function renderRows() {
    const filtered = getFilteredRows();

    // Calculate Summary stats for all loaded active students
    let pCount = 0, aCount = 0, lCount = 0, lateCount = 0, nmCount = 0;
    
    allRows.forEach(r => {
        const st = (r.status || '').toLowerCase();
        if (st === 'present') pCount++;
        else if (st === 'absent') aCount++;
        else if (st === 'leave' || st === 'excused') lCount++;
        else if (st === 'late') lateCount++;
        else nmCount++;
    });

    rowCountEl.textContent = filtered.length;
    presentCountEl.textContent = pCount;
    absentCountEl.textContent = aCount;
    leaveCountEl.textContent = lCount;
    lateCountEl.textContent = lateCount;
    notMarkedCountEl.textContent = nmCount;

    if (filtered.length === 0) {
        attendanceBody.innerHTML = '<tr><td colspan="7" class="empty">No matching attendance records found.</td></tr>';
        return;
    }

    attendanceBody.innerHTML = filtered.map(r => {
        const stLower = (r.status || '').toLowerCase();
        let badgeClass = 'badge-notmarked';
        let badgeText = r.status || 'Not Marked';

        if (stLower === 'present') {
            badgeClass = 'badge-present';
            badgeText = 'Present ✅';
        } else if (stLower === 'absent') {
            badgeClass = 'badge-absent';
            badgeText = 'Absent ❌';
        } else if (stLower === 'leave' || stLower === 'excused') {
            badgeClass = 'badge-leave';
            badgeText = 'Leave 📝';
        } else if (stLower === 'late') {
            badgeClass = 'badge-late';
            badgeText = 'Late ⏰';
        } else if (stLower === 'holiday') {
            badgeClass = 'badge-holiday';
            badgeText = 'Holiday 🏖️';
        }

        return `
            <tr>
                <td class="mono">${toDateLabel(r.date)}</td>
                <td class="mono" style="font-weight:600;">${r.rollNo || '-'}</td>
                <td style="font-weight:600; color:#0f172a;">${r.studentName}</td>
                <td>${r.className || '-'}</td>
                <td>${r.fatherName || '-'}</td>
                <td class="mono">${r.fatherMobile || '-'}</td>
                <td><span class="badge-status ${badgeClass}">${badgeText}</span></td>
            </tr>
        `;
    }).join('');

    updatePrintHeader();
}

async function loadAttendance() {
    const selectedDate = attDateInput.value;
    if (!selectedDate) return;

    loadBtn.disabled = true;
    loadBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Loading';
    attendanceBody.innerHTML = '<tr><td colspan="7" class="empty">Loading daily attendance records...</td></tr>';

    try {
        // 1. Fetch active students
        const { data: stuData, error: stuErr } = await applySchoolScope(
            db.from('admissions')
                .select('id, roll_number, full_name, father_name, father_mobile, applying_for_class, status')
                .in('status', ['Active', 'active'])
                .order('applying_for_class', { ascending: true })
                .order('roll_number', { ascending: true })
        );

        if (stuErr) throw stuErr;

        const students = stuData || [];

        // Populate class filter options dynamically once
        if (!populatedClasses) {
            const { data: classData, error: classErr } = await applySchoolScope(
                db.from('classes')
                    .select('class_name, section, display_order')
                    .eq('is_active', true)
                    .order('display_order', { ascending: true, nullsFirst: false })
                    .order('class_name', { ascending: true })
                    .order('section', { ascending: true })
            );

            if (classErr) throw classErr;

            activeClassNames = [...new Set((classData || [])
                .map(c => `${c.class_name || ''} ${c.section || ''}`.trim())
                .filter(Boolean))];

            const classSet = new Set(students.map(s => s.applying_for_class).filter(Boolean));
            const sortedClasses = activeClassNames.filter(cls => classSet.has(cls));
            
            sortedClasses.forEach(cls => {
                const opt = document.createElement('option');
                opt.value = cls;
                opt.textContent = cls;
                classFilterSelect.appendChild(opt);
            });

            const savedClass = localStorage.getItem(LS_KEYS.class);
            if (savedClass && sortedClasses.includes(savedClass)) {
                classFilterSelect.value = savedClass;
            }
            populatedClasses = true;
        }

        // 2. Fetch attendance for selected date
        const { data: attData, error: attErr } = await applySchoolScope(
            db.from('attendance')
                .select('student_id, status, date')
                .eq('date', selectedDate)
        );

        if (attErr) throw attErr;

        const attMap = new Map();
        (attData || []).forEach(a => {
            attMap.set(a.student_id, a);
        });

        // 3. Build unified rows
        const classOrder = new Map(activeClassNames.map((name, index) => [name, index]));
        allRows = students.map(s => {
            const att = attMap.get(s.id);
            return {
                id: s.id,
                rollNo: s.roll_number || '-',
                studentName: s.full_name || 'Unknown',
                fatherName: s.father_name || '-',
                fatherMobile: s.father_mobile || '-',
                className: s.applying_for_class || '-',
                status: att ? att.status : 'Not Marked',
                date: selectedDate
            };
        }).sort((a, b) => {
            const aOrder = classOrder.has(a.className) ? classOrder.get(a.className) : Number.MAX_SAFE_INTEGER;
            const bOrder = classOrder.has(b.className) ? classOrder.get(b.className) : Number.MAX_SAFE_INTEGER;
            return aOrder - bOrder || String(a.rollNo).localeCompare(String(b.rollNo), undefined, { numeric: true });
        });

        renderRows();

    } catch (err) {
        console.error('Error loading daily attendance:', err);
        attendanceBody.innerHTML = `<tr><td colspan="7" class="empty" style="color:var(--danger);">Error loading data: ${err.message || err}</td></tr>`;
    } finally {
        loadBtn.disabled = false;
        loadBtn.innerHTML = '<i class="fas fa-sync"></i> Load';
    }
}

document.addEventListener('DOMContentLoaded', () => {
    const today = fmtDateOnly(new Date());
    attDateInput.value = localStorage.getItem(LS_KEYS.date) || today;
    statusFilterSelect.value = localStorage.getItem(LS_KEYS.status) || 'ALL';
    fontSizeRange.value = localStorage.getItem(LS_KEYS.fontSize) || '8.5';
    compactnessRange.value = localStorage.getItem(LS_KEYS.compactness) || '80';

    applyLayoutControls();

    const waitAuth = setInterval(() => {
        if (window.authReady && window.supabaseClient) {
            clearInterval(waitAuth);
            loadAttendance();
        }
    }, 100);

    loadBtn.addEventListener('click', loadAttendance);
    
    attDateInput.addEventListener('change', () => {
        localStorage.setItem(LS_KEYS.date, attDateInput.value);
        loadAttendance();
    });

    statusFilterSelect.addEventListener('change', () => {
        localStorage.setItem(LS_KEYS.status, statusFilterSelect.value);
        renderRows();
    });

    classFilterSelect.addEventListener('change', () => {
        localStorage.setItem(LS_KEYS.class, classFilterSelect.value);
        renderRows();
    });

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
