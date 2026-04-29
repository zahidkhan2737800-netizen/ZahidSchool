const db = supabaseClient;
const currentSchoolId = window.currentSchoolId || null;
const applySchoolScope = (query) => currentSchoolId ? query.eq('school_id', currentSchoolId) : query;

// DOM Elements
const fromClassSelect = document.getElementById('fromClassSelect');
const toClassSelect = document.getElementById('toClassSelect');
const loadStudentsBtn = document.getElementById('loadStudentsBtn');
const alertBox = document.getElementById('alertBox');
const studentListContainer = document.getElementById('studentListContainer');
const displayFromClass = document.getElementById('displayFromClass');
const studentCount = document.getElementById('studentCount');
const studentsArea = document.getElementById('studentsArea');
const selectAllBtn = document.getElementById('selectAllBtn');
const deselectAllBtn = document.getElementById('deselectAllBtn');
const promoteBtn = document.getElementById('promoteBtn');

let currentStudents = [];

function showAlert(msg, isError = false) {
    alertBox.textContent = msg;
    alertBox.style.background = isError ? '#fee2e2' : '#d1fae5';
    alertBox.style.color = isError ? '#991b1b' : '#065f46';
    alertBox.style.display = 'block';
    setTimeout(() => { alertBox.style.display = 'none'; }, 5000);
}

async function loadClasses() {
    try {
        const { data, error } = await applySchoolScope(db
            .from('admissions')
            .select('applying_for_class')
            .eq('status', 'Active'));
        if (error) throw error;

        const classes = [...new Set((data || []).map(d => d.applying_for_class).filter(Boolean))].sort();
        const optionsHtml = classes.map(c => `<option value="${c}">${c}</option>`).join('');
        
        fromClassSelect.innerHTML = '<option value="">-- Select Source Class --</option>' + optionsHtml;
        toClassSelect.innerHTML = '<option value="">-- Select Target Class --</option>' + optionsHtml;
    } catch (e) {
        console.error('loadClasses failed', e);
        showAlert('Failed to load classes.', true);
    }
}

async function loadStudents() {
    const fromClass = fromClassSelect.value;
    const toClass = toClassSelect.value;

    if (!fromClass) {
        showAlert('Please select a From Class.', true);
        return;
    }

    studentsArea.innerHTML = '<div style="padding:1rem; text-align:center;">Loading students...</div>';
    studentListContainer.style.display = 'block';
    displayFromClass.textContent = fromClass;

    try {
        const { data, error } = await applySchoolScope(db
            .from('admissions')
            .select('id, roll_number, full_name, father_name')
            .eq('status', 'Active')
            .eq('applying_for_class', fromClass));
        if (error) throw error;

        currentStudents = data || [];
        
        // Sort students numerically by roll number
        currentStudents.sort((a, b) => {
            const numA = parseInt(a.roll_number, 10) || 0;
            const numB = parseInt(b.roll_number, 10) || 0;
            return numA - numB;
        });

        studentCount.textContent = currentStudents.length;

        if (currentStudents.length === 0) {
            studentsArea.innerHTML = '<div style="padding:2rem; text-align:center; color:#64748b;">No active students found in this class.</div>';
            return;
        }

        studentsArea.innerHTML = currentStudents.map(s => `
            <div class="student-row">
                <div style="display:flex; align-items:center; gap:1rem;">
                    <input type="checkbox" class="student-chk" value="${s.id}" checked style="width:18px; height:18px; cursor:pointer;">
                    <div>
                        <strong style="font-size:1.1rem; color:#0f172a;">${s.full_name}</strong>
                        <div style="font-size:0.85rem; color:#64748b;">Roll: ${s.roll_number} | Father: ${s.father_name || 'N/A'}</div>
                    </div>
                </div>
            </div>
        `).join('');

    } catch (e) {
        console.error(e);
        studentsArea.innerHTML = `<div style="padding:1rem; color:red; text-align:center;">Error: ${e.message}</div>`;
    }
}

async function promoteStudents() {
    const toClass = toClassSelect.value;
    if (!toClass) {
        showAlert('Please select a To Class before promoting.', true);
        toClassSelect.focus();
        return;
    }
    if (fromClassSelect.value === toClass) {
        showAlert('Source and Target classes cannot be the same.', true);
        return;
    }

    const checkboxes = document.querySelectorAll('.student-chk:checked');
    const selectedIds = Array.from(checkboxes).map(cb => cb.value);

    if (selectedIds.length === 0) {
        showAlert('Please select at least one student to promote.', true);
        return;
    }

    if (!confirm(`Are you sure you want to promote ${selectedIds.length} student(s) to ${toClass}?`)) {
        return;
    }

    promoteBtn.textContent = 'Promoting...';
    promoteBtn.disabled = true;

    try {
        const { error } = await db
            .from('admissions')
            .update({ applying_for_class: toClass })
            .in('id', selectedIds);
            
        if (error) throw error;

        showAlert(`Successfully promoted ${selectedIds.length} students to ${toClass}!`);
        
        // Refresh student list
        loadStudents();
    } catch (e) {
        console.error(e);
        showAlert(`Error promoting students: ${e.message}`, true);
    } finally {
        promoteBtn.textContent = 'Promote Selected Students 🚀';
        promoteBtn.disabled = false;
    }
}

// Event Listeners
loadStudentsBtn.addEventListener('click', loadStudents);

selectAllBtn.addEventListener('click', () => {
    document.querySelectorAll('.student-chk').forEach(cb => cb.checked = true);
});

deselectAllBtn.addEventListener('click', () => {
    document.querySelectorAll('.student-chk').forEach(cb => cb.checked = false);
});

promoteBtn.addEventListener('click', promoteStudents);

document.addEventListener('DOMContentLoaded', loadClasses);
