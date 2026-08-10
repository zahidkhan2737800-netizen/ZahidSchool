let studentsList = [];
let studentsMap = {};
let reportMatches = [];
let selectedStudentRoll = '';

const reportStudentInput = document.getElementById('reportStudent');
const reportStudentSuggestions = document.getElementById('reportStudentSuggestions');
const selectedStudentDetails = document.getElementById('selectedStudentDetails');
const reportOutput = document.getElementById('specificReport');
const fontSizeRange = document.getElementById('fontSizeRange');
const compactnessRange = document.getElementById('compactnessRange');
const fontSizeValue = document.getElementById('fontSizeValue');
const compactnessValue = document.getElementById('compactnessValue');

const layoutStorageKeys = {
    fontSize: 'studentComplaintHistory.fontSize',
    compactness: 'studentComplaintHistory.compactness'
};

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

function esc(value) {
    return String(value || '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

async function waitForAuth(timeout = 10000) {
    const end = Date.now() + timeout;
    while (Date.now() < end) {
        if (window.authReady && window.supabaseClient) return true;
        await new Promise(resolve => setTimeout(resolve, 80));
    }
    return false;
}

function hideSuggestions() {
    reportStudentSuggestions.hidden = true;
    reportStudentInput.setAttribute('aria-expanded', 'false');
}

function clearSelection() {
    selectedStudentRoll = '';
    selectedStudentDetails.hidden = true;
    selectedStudentDetails.innerHTML = '';
}

function studentPhotoMarkup(student, extraClass = '') {
    const photoUrl = String(student.photoUrl || '').trim();
    if (!photoUrl) {
        return `<div class="student-photo-frame ${extraClass}"><span class="student-photo-fallback"><i class="fas fa-user"></i>No Photo</span></div>`;
    }
    return `<div class="student-photo-frame ${extraClass}">
        <img data-student-photo src="${esc(photoUrl)}" alt="Photo of ${esc(student.name)}">
        <span class="student-photo-fallback" hidden><i class="fas fa-user"></i>No Photo</span>
    </div>`;
}

function enablePhotoFallbacks(root) {
    root.querySelectorAll('[data-student-photo]').forEach(image => {
        image.addEventListener('error', () => {
            image.hidden = true;
            const fallback = image.nextElementSibling;
            if (fallback) fallback.hidden = false;
        }, { once: true });
    });
}

function complaintCategoryLabel(value) {
    const category = String(value || 'Other').trim().toLowerCase();
    const labels = {
        'homework': 'Homework',
        'fee': 'Fee',
        'fair copy': 'Fair Copy',
        'book(s)': 'Book(s)',
        'books': 'Book(s)',
        'book': 'Book(s)',
        'copy': 'Copy',
        'copies': 'Copy',
        'late coming': 'Late Coming',
        'dressing code': 'Dressing Code',
        'dress code': 'Dressing Code',
        'attendance': 'Attendance',
        'no response': 'No Response',
        'other': 'Other'
    };
    return labels[category] || String(value || 'Other').trim();
}

function complaintSummaryMarkup(complaints) {
    const totals = new Map();
    complaints.forEach(row => {
        const label = complaintCategoryLabel(row.category);
        totals.set(label, (totals.get(label) || 0) + 1);
    });
    const categories = [...totals.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
    return `<div class="complaint-counts">
        <div class="complaint-count total"><span>Total Complaints</span><strong>${complaints.length}</strong></div>
        ${categories.map(([label, count]) => `<div class="complaint-count"><span>${esc(label)}</span><strong>${count}</strong></div>`).join('')}
    </div>`;
}

function reportHeadingMarkup(student, complaints) {
    return `<div class="report-profile-header">
        <div class="report-profile-content">
            <h4>${esc(student.name)} — Complaint Report (${complaints.length} records)</h4>
            <div class="report-student-meta">
                <span><b>Father:</b> ${esc(student.fatherName || '—')}</span>
                <span><b>Class:</b> ${esc(student.className || '—')}</span>
                <span><b>Roll:</b> ${esc(student.roll)}</span>
            </div>
            ${complaintSummaryMarkup(complaints)}
        </div>
        ${studentPhotoMarkup(student, 'report-student-photo')}
    </div>`;
}

function selectStudent(student) {
    selectedStudentRoll = student.roll;
    reportStudentInput.value = `${student.name} (${student.roll})`;
    selectedStudentDetails.innerHTML = `
        <div class="selected-student-info">
            <strong>${esc(student.name)}</strong>
            <div class="selected-student-meta">
                <span><b>Father:</b> ${esc(student.fatherName || '—')}</span>
                <span><b>Class:</b> ${esc(student.className || '—')}</span>
                <span><b>Roll:</b> ${esc(student.roll)}</span>
            </div>
        </div>
        ${studentPhotoMarkup(student, 'selected-student-photo')}`;
    selectedStudentDetails.hidden = false;
    enablePhotoFallbacks(selectedStudentDetails);
    hideSuggestions();
}

function renderSuggestions() {
    const query = reportStudentInput.value.trim().toLowerCase();
    clearSelection();

    if (!query) {
        hideSuggestions();
        return;
    }

    reportMatches = studentsList.filter(student =>
        student.name.toLowerCase().includes(query) ||
        student.roll.toLowerCase().includes(query)
    ).slice(0, 15);

    if (!reportMatches.length) {
        reportStudentSuggestions.innerHTML = '<div class="student-suggestion-empty">No matching active student</div>';
    } else {
        reportStudentSuggestions.innerHTML = reportMatches.map((student, index) => `
            <button type="button" class="student-suggestion" role="option" data-student-index="${index}">
                <strong>${esc(student.name)}</strong>
                <span>Father: ${esc(student.fatherName || '—')}</span>
                <span>Class: ${esc(student.className || '—')} &nbsp;|&nbsp; Roll: ${esc(student.roll)}</span>
            </button>`).join('');
    }

    reportStudentSuggestions.hidden = false;
    reportStudentInput.setAttribute('aria-expanded', 'true');
}

async function loadStudents() {
    let query = window.supabaseClient
        .from('admissions')
        .select('roll_number, full_name, applying_for_class, father_name, photo_url')
        .eq('status', 'Active')
        .order('full_name');

    if (window.currentSchoolId) query = query.eq('school_id', window.currentSchoolId);
    const { data, error } = await query;
    if (error) throw error;

    studentsList = (data || []).map(student => ({
        roll: String(student.roll_number || '').trim(),
        name: student.full_name || '',
        fatherName: student.father_name || '',
        className: student.applying_for_class || '',
        photoUrl: student.photo_url || ''
    })).filter(student => student.roll);
    studentsMap = Object.fromEntries(studentsList.map(student => [student.roll, student]));
}

async function generateStudentReport() {
    if (!selectedStudentRoll) {
        const query = reportStudentInput.value.trim().toLowerCase();
        const exactMatch = studentsList.find(student =>
            student.roll.toLowerCase() === query || student.name.toLowerCase() === query
        );
        if (exactMatch) selectStudent(exactMatch);
    }

    if (!selectedStudentRoll) {
        alert('Type a student name or roll and select a student from the list.');
        return;
    }

    const student = studentsMap[selectedStudentRoll];
    reportOutput.innerHTML = '<p style="color:#64748b;text-align:center;padding:2rem;">Loading complaints...</p>';

    let query = window.supabaseClient
        .from('complaints')
        .select('roll, name, class_name, date, complaint, category, contact_status, status')
        .eq('roll', selectedStudentRoll)
        .order('date', { ascending: false })
        .limit(2000);
    if (window.currentSchoolId) query = query.eq('school_id', window.currentSchoolId);

    const { data, error } = await query;
    if (error) {
        console.error('Student complaints report error:', error);
        reportOutput.innerHTML = '<p style="color:#dc2626;">Could not load this student’s complaints.</p>';
        return;
    }

    const complaints = data || [];
    const heading = reportHeadingMarkup(student, complaints);

    if (!complaints.length) {
        reportOutput.innerHTML = `${heading}<p class="student-report-empty">No complaint records found for this student.</p>`;
        enablePhotoFallbacks(reportOutput);
        return;
    }

    reportOutput.innerHTML = `${heading}
        <table class="student-complaints-table">
            <colgroup><col class="col-date"><col class="col-complaint"><col class="col-category"><col class="col-contact"><col class="col-status"></colgroup>
            <thead><tr><th>Date</th><th>Complaint</th><th>Category</th><th>Contact</th><th>Status</th></tr></thead>
            <tbody>${complaints.map(row => `<tr>
                <td>${esc(row.date)}</td>
                <td>${esc(row.complaint)}</td>
                <td>${esc(row.category)}</td>
                <td>${esc(row.contact_status)}</td>
                <td>${esc(row.status)}</td>
            </tr>`).join('')}</tbody>
        </table>`;
    enablePhotoFallbacks(reportOutput);
}

reportStudentInput.addEventListener('input', renderSuggestions);
reportStudentInput.addEventListener('keydown', event => {
    if (event.key === 'Escape') hideSuggestions();
});
reportStudentSuggestions.addEventListener('click', event => {
    const option = event.target.closest('[data-student-index]');
    if (!option) return;
    const student = reportMatches[Number(option.dataset.studentIndex)];
    if (student) selectStudent(student);
});
document.addEventListener('click', event => {
    if (!event.target.closest('.student-autocomplete')) hideSuggestions();
});
document.getElementById('genStudentReport').addEventListener('click', generateStudentReport);
document.getElementById('printStudentReport').addEventListener('click', () => window.print());
fontSizeRange.addEventListener('input', applyLayoutControls);
compactnessRange.addEventListener('input', applyLayoutControls);
fontSizeRange.addEventListener('change', () => localStorage.setItem(layoutStorageKeys.fontSize, fontSizeRange.value));
compactnessRange.addEventListener('change', () => localStorage.setItem(layoutStorageKeys.compactness, compactnessRange.value));

window.onAppReady(async () => {
    fontSizeRange.value = localStorage.getItem(layoutStorageKeys.fontSize) || '8.5';
    compactnessRange.value = localStorage.getItem(layoutStorageKeys.compactness) || '80';
    applyLayoutControls();

    const ready = await waitForAuth();
    if (!ready) {
        reportOutput.innerHTML = '<p style="color:#dc2626;">Authentication did not finish. Refresh and try again.</p>';
        return;
    }
    try {
        await loadStudents();
    } catch (error) {
        console.error('Student list error:', error);
        reportOutput.innerHTML = '<p style="color:#dc2626;">Could not load students.</p>';
    }
});
