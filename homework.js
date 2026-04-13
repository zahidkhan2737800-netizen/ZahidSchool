// ═══════════════════════════════════════════════════════════════
// homework.js — Homework Publisher (Supabase)
// ═══════════════════════════════════════════════════════════════
const db = supabaseClient;
const currentSchoolId = window.currentSchoolId || null;
const applySchoolScope = (query) => currentSchoolId ? query.eq('school_id', currentSchoolId) : query;

function getTenantScopePatch() {
    const patch = { school_id: currentSchoolId };
    if (window.campusFeatureReady && window.currentCampusId) patch.campus_id = window.currentCampusId;
    return patch;
}

const SUBJECTS = ["English", "Math", "Science", "Sindhi", "Urdu"];

// DOM
const classSelect        = document.getElementById('classSelect');
const studentsContainer  = document.getElementById('studentsContainer');
const selectAllBtn       = document.getElementById('selectAllBtn');
const clearAllBtn        = document.getElementById('clearAllBtn');
const refreshStudents    = document.getElementById('refreshStudents');
const studentCountEl     = document.getElementById('studentCount');
const recentContainer    = document.getElementById('recentContainer');
const toastContainer     = document.getElementById('toastContainer');

function getToday() {
    return new Date().toISOString().split('T')[0];
}

// ─── Toast ────────────────────────────────────────────────────
function showToast(msg, type = 'info') {
    const t = document.createElement('div');
    t.className = `toast-item ${type}`;
    t.textContent = msg;
    toastContainer.appendChild(t);
    setTimeout(() => t.remove(), 3500);
}

// ─── Load Classes ─────────────────────────────────────────────
async function loadClasses() {
    try {
        const { data, error } = await applySchoolScope(db
            .from('admissions')
            .select('applying_for_class')
            .eq('status', 'Active'));
        if (error) throw error;

        const classes = [...new Set((data || []).map(d => d.applying_for_class).filter(Boolean))].sort();
        classSelect.innerHTML = '<option value="">-- Select Class --</option>' +
            classes.map(c => `<option value="${c}">${c}</option>`).join('');
    } catch (e) {
        console.error('loadClasses failed', e);
        showToast('Failed to load classes', 'error');
    }
}

// ─── Load Students for Class ──────────────────────────────────
async function loadStudentsForClass(cls) {
    if (!cls) {
        studentsContainer.innerHTML = '<div class="empty-state">Select a class above to load students.</div>';
        studentCountEl.textContent = '0 students';
        return;
    }
    studentsContainer.innerHTML = '<div class="empty-state">⏳ Loading students...</div>';

    try {
        // Fetch students
        const { data: students, error: stuErr } = await applySchoolScope(db
            .from('admissions')
            .select('id, roll_number, full_name, father_name, applying_for_class')
            .eq('status', 'Active')
            .eq('applying_for_class', cls)
            .order('roll_number'));
        if (stuErr) throw stuErr;

        if (!students || students.length === 0) {
            studentsContainer.innerHTML = '<div class="empty-state">No students found for this class.</div>';
            studentCountEl.textContent = '0 students';
            return;
        }
        studentCountEl.textContent = `${students.length} student(s)`;

        // Fetch existing homework complaints for today
        const today = getToday();
        const { data: existing, error: hwErr } = await applySchoolScope(db
            .from('complaints')
            .select('roll, subjects')
            .eq('class_name', cls)
            .eq('date', today)
            .eq('category', 'Homework'));

        const existingMap = {};
        if (!hwErr && existing) {
            existing.forEach(row => {
                const r = String(row.roll || '').trim();
                if (r) existingMap[r] = Array.isArray(row.subjects) ? row.subjects : [];
            });
        }

        // Render
        studentsContainer.innerHTML = students.map(s => {
            const roll = String(s.roll_number || '').trim();
            const name = s.full_name || '';
            const activeSubjects = existingMap[roll] || [];

            const buttonsHtml = SUBJECTS.map(sub =>
                `<button type="button" class="subject-btn ${activeSubjects.includes(sub) ? 'active' : ''}" data-subject="${sub}">${sub}</button>`
            ).join('');

            return `<div class="student-row" data-roll="${escapeHtml(roll)}" data-name="${escapeHtml(name)}" data-class="${escapeHtml(cls)}">
                <input class="student-checkbox" type="checkbox" value="${escapeHtml(roll)}">
                <div class="student-name">
                    <strong>${escapeHtml(name)}</strong>
                    <div class="roll">Roll: ${escapeHtml(roll)}</div>
                </div>
                <div class="subjects-inline">${buttonsHtml}</div>
            </div>`;
        }).join('');

        // Attach subject button handlers
        studentsContainer.querySelectorAll('.student-row').forEach(rowEl => {
            rowEl.querySelectorAll('.subject-btn').forEach(btn => {
                btn.addEventListener('click', async () => {
                    btn.classList.toggle('active');
                    const activeSubjects = Array.from(rowEl.querySelectorAll('.subject-btn.active')).map(b => b.dataset.subject);
                    await upsertHomework(
                        { roll: rowEl.dataset.roll, name: rowEl.dataset.name, className: rowEl.dataset.class },
                        activeSubjects
                    );
                });
            });
        });

    } catch (e) {
        console.error('loadStudentsForClass failed', e);
        studentsContainer.innerHTML = '<div class="empty-state" style="color:#ef4444;">Failed to load students.</div>';
    }
}

// ─── Upsert Homework Complaint ────────────────────────────────
async function upsertHomework(student, subjectsArray) {
    const { roll, name, className } = student;
    const cleanRoll = String(roll || '').trim();
    if (!cleanRoll) { showToast('Missing roll', 'error'); return; }
    const today = getToday();

    // If no subjects selected → delete any existing homework entry for today
    if (!subjectsArray || subjectsArray.length === 0) {
        try {
            const { data, error } = await applySchoolScope(db
                .from('complaints')
                .select('id')
                .eq('roll', cleanRoll)
                .eq('date', today)
                .eq('category', 'Homework'));
            if (!error && data) {
                for (const row of data) {
                    await applySchoolScope(db.from('complaints').delete().eq('id', row.id));
                }
            }
            showToast(`Cleared homework for Roll ${cleanRoll}`, 'info');
            loadRecentHomework();
        } catch (e) {
            console.error('delete failed', e);
            showToast('Remove failed', 'error');
        }
        return;
    }

    try {
        const finalSubjects = [...new Set(subjectsArray)];
        const complaintText = finalSubjects.length === 1
            ? `Undone Homework of ${finalSubjects[0]}.`
            : `Undone Homework of ${finalSubjects.slice(0, -1).join(', ')} and ${finalSubjects.slice(-1)}.`;

        // Check if record exists for this roll + today + Homework
        const { data: existing } = await applySchoolScope(db
            .from('complaints')
            .select('id')
            .eq('roll', cleanRoll)
            .eq('date', today)
            .eq('category', 'Homework')
            .limit(1));

        if (existing && existing.length > 0) {
            // Update
            await applySchoolScope(db.from('complaints').update({
                name: name || '',
                class_name: className || '',
                complaint: complaintText,
                subjects: finalSubjects,
                updated_at: new Date().toISOString()
            }).eq('id', existing[0].id));
        } else {
            // Insert
            await db.from('complaints').insert({
                name: name || '',
                roll: cleanRoll,
                class_name: className || '',
                date: today,
                complaint: complaintText,
                category: 'Homework',
                status: 'Pending',
                contact_status: '',
                subjects: finalSubjects,
                ...getTenantScopePatch()
            });
        }

        showToast(`Saved: ${cleanRoll} → ${finalSubjects.join(', ')}`, 'success');
        loadRecentHomework();
    } catch (e) {
        console.error('upsert failed', e);
        showToast('Save failed', 'error');
    }
}

// ─── Load Recent Homework ─────────────────────────────────────
async function loadRecentHomework() {
    try {
        const today = getToday();
        const { data, error } = await applySchoolScope(db
            .from('complaints')
            .select('*')
            .eq('category', 'Homework')
            .eq('date', today)
            .order('updated_at', { ascending: false })
            .limit(50));
        if (error) throw error;

        if (!data || data.length === 0) {
            recentContainer.innerHTML = '<div class="empty-state">No homework entries for today yet.</div>';
            return;
        }

        recentContainer.innerHTML = `
            <table class="recent-table">
                <thead><tr>
                    <th>Roll</th><th>Name</th><th>Class</th><th>Subjects</th><th>Complaint</th>
                </tr></thead>
                <tbody>
                    ${data.map(r => `<tr>
                        <td>${escapeHtml(r.roll || '')}</td>
                        <td>${escapeHtml(r.name || '')}</td>
                        <td>${escapeHtml(r.class_name || '')}</td>
                        <td>${escapeHtml((r.subjects || []).join(', '))}</td>
                        <td>${escapeHtml(r.complaint || '')}</td>
                    </tr>`).join('')}
                </tbody>
            </table>`;
    } catch (e) {
        console.error('loadRecentHomework failed', e);
    }
}

// ─── Helpers ──────────────────────────────────────────────────
function escapeHtml(s) {
    return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// ─── Event Wiring ─────────────────────────────────────────────
classSelect.addEventListener('change', () => loadStudentsForClass(classSelect.value));
refreshStudents.addEventListener('click', () => loadStudentsForClass(classSelect.value));
selectAllBtn.addEventListener('click', () => {
    studentsContainer.querySelectorAll('.student-checkbox').forEach(cb => cb.checked = true);
});
clearAllBtn.addEventListener('click', () => {
    studentsContainer.querySelectorAll('.student-checkbox').forEach(cb => cb.checked = false);
});

// ─── Init ─────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', async () => {
    await loadClasses();
    loadRecentHomework();
});
