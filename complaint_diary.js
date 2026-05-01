// ═══════════════════════════════════════════════════════════════
// complaint_diary.js — Complaint Diary (Supabase)
// ═══════════════════════════════════════════════════════════════
const db = supabaseClient;
const currentSchoolId = window.currentSchoolId || null;
const applySchoolScope = (query) => currentSchoolId ? query.eq('school_id', currentSchoolId) : query;

// ─── DOM ──────────────────────────────────────────────────────
const nameEl          = document.getElementById('name');
const rollEl          = document.getElementById('roll');
const classEl         = document.getElementById('className');
const dateEl          = document.getElementById('date');
const categoryEl      = document.getElementById('category');
const statusEl        = document.getElementById('status');
const contactEl       = document.getElementById('contactStatus');
const complaintEl     = document.getElementById('complaint');
const editIdEl        = document.getElementById('editId');
const submitBtn       = document.getElementById('submitBtn');
const cancelEditBtn   = document.getElementById('cancelEdit');
const container       = document.getElementById('complaintsTableContainer');

const categoryOptions = ["Homework","Fee","Fair Copy","Book(s)","Copies","Late Coming","Dressing Code","Attendance","No Response","Other"];
const statusOptions   = ["Pending","Resolved"];
const contactOptions  = ["Whatsapp","Call Received","Call Not Received","Number Off","No Number","No Response"];

let complaintsCache = [];
let studentsMap     = {};

let waTemplates = [];
let currentComplaintId = null;

function getTenantScopePatch() {
    const patch = { school_id: currentSchoolId };
    if (window.campusFeatureReady && window.currentCampusId) patch.campus_id = window.currentCampusId;
    return patch;
}

// ─── Toast ────────────────────────────────────────────────────
function showToast(msg, type = 'info') {
    const t = document.createElement('div');
    t.className = `toast-item ${type}`;
    t.textContent = msg;
    document.getElementById('toastContainer').appendChild(t);
    setTimeout(() => t.remove(), 3500);
}

// ─── Set Defaults ─────────────────────────────────────────────
function setDefaults() {
    const today = new Date().toISOString().split('T')[0];
    dateEl.value = today;
    categoryEl.value = 'Homework';
    statusEl.value = 'Pending';
    contactEl.value = 'Whatsapp';
    document.getElementById('searchDate').value = today;
}

// ─── Load WA Templates ─────────────────────────────────────────
async function loadWaTemplates() {
    try {
        const { data, error } = await db.from('wa_templates').select('*').order('created_at', { ascending: false });
        if (error) throw error;
        waTemplates = data || [];
        
        const sel = document.getElementById('waTemplateDropdown');
        if (sel) {
            sel.innerHTML = '<option value="">- Select Saved Template -</option>';
            waTemplates.forEach(t => {
                const opt = document.createElement('option');
                opt.value = t.id; 
                opt.textContent = t.title + (t.is_default ? ' (Default)' : '');
                sel.appendChild(opt);
            });
        }
    } catch (err) {
        console.error("Failed to load WA templates", err);
    }
}

// ─── Load Students Map (for autofill) ─────────────────────────
async function loadStudents() {
    try {
        const { data, error } = await applySchoolScope(db
            .from('admissions')
            .select('roll_number, full_name, applying_for_class, father_name, father_mobile, father_whatsapp')
            .eq('status', 'Active')
            .order('roll_number'));
        if (error) throw error;
        studentsMap = {};
        (data || []).forEach(s => {
            const roll = String(s.roll_number || '').trim();
            if (roll) studentsMap[roll] = { 
                name: s.full_name || '', 
                className: s.applying_for_class || '',
                fatherName: s.father_name || '',
                mobile: s.father_whatsapp || s.father_mobile || ''
            };
        });
    } catch (e) {
        console.warn('loadStudents failed', e);
    }
}

// Autofill on roll input
rollEl.addEventListener('input', () => {
    const val = rollEl.value.trim();
    if (studentsMap[val]) {
        nameEl.value = studentsMap[val].name;
        classEl.value = studentsMap[val].className;
    }
});

// ─── Load Complaints ──────────────────────────────────────────
async function loadComplaints() {
    try {
        const { data, error } = await applySchoolScope(db
            .from('complaints')
            .select('*')
            .order('date', { ascending: false })
            .limit(2000));
        if (error) throw error;
        complaintsCache = data || [];
        renderComplaints();
        generateAnalytics();
    } catch (e) {
        console.error('loadComplaints failed', e);
        container.innerHTML = '<p style="color:#ef4444; text-align:center;">Failed to load complaints.</p>';
    }
}

// ─── Render Complaints ────────────────────────────────────────
function renderComplaints() {
    const q   = (document.getElementById('searchBox').value || '').toLowerCase();
    const d   = document.getElementById('searchDate').value;
    const cat = (document.getElementById('searchCategory').value || '').toLowerCase();
    const st  = (document.getElementById('searchStatus').value || '').toLowerCase();

    const filtered = complaintsCache.filter(c => {
        if (q && !((c.name || '').toLowerCase().includes(q) || (c.roll || '').toLowerCase() === q || (c.class_name || '').toLowerCase() === q)) return false;
        if (d && c.date !== d) return false;
        if (cat && (c.category || '').toLowerCase() !== cat) return false;
        if (st && (c.status || '').toLowerCase() !== st) return false;
        return true;
    });

    if (filtered.length === 0) {
        container.innerHTML = '<p style="color:#94a3b8; text-align:center; padding:2rem;">No complaints match your filters.</p>';
        return;
    }

    let html = `<table class="complaints-table">
        <thead><tr>
            <th>Name</th><th>Roll</th><th>Class</th><th>Date</th>
            <th>Complaint</th><th>Category</th><th>Status</th><th>Contact</th><th>W</th><th>Actions</th>
        </tr></thead><tbody>`;

    filtered.forEach(r => {
        html += `<tr data-id="${r.id}">
            <td>${esc(r.name)}</td>
            <td>${esc(r.roll)}</td>
            <td>${esc(r.class_name)}</td>
            <td>${esc(r.date)}</td>
            <td class="complaint-text-cell">${esc(r.complaint)}</td>
            <td><button class="toggle-btn toggle-category" data-id="${r.id}">${esc(r.category)}</button></td>
            <td><button class="toggle-btn toggle-status" data-id="${r.id}">${esc(r.status)}</button></td>
            <td><button class="toggle-btn toggle-contact" data-id="${r.id}">${esc(r.contact_status)}</button></td>
            <td style="text-align: center;">
                <button class="btn btn-success btn-sm" onclick="openWaModal('${r.id}')" title="Send WhatsApp">
                    <i class="fab fa-whatsapp" style="font-size: 1.2rem;"></i>
                </button>
            </td>
            <td style="white-space:nowrap;">
                <button class="btn btn-primary btn-sm edit-btn" data-id="${r.id}">✏️</button>
                <button class="btn btn-danger btn-sm del-btn" data-id="${r.id}">🗑</button>
            </td>
        </tr>`;
    });
    html += '</tbody></table>';
    container.innerHTML = html;

    // Toggle category
    container.querySelectorAll('.toggle-category').forEach(btn => {
        btn.addEventListener('click', () => cycleField(btn.dataset.id, 'category', categoryOptions, btn));
    });
    // Toggle status
    container.querySelectorAll('.toggle-status').forEach(btn => {
        btn.addEventListener('click', () => cycleField(btn.dataset.id, 'status', statusOptions, btn));
    });
    // Toggle contact
    container.querySelectorAll('.toggle-contact').forEach(btn => {
        btn.addEventListener('click', () => cycleField(btn.dataset.id, 'contact_status', contactOptions, btn));
    });
    // Edit
    container.querySelectorAll('.edit-btn').forEach(btn => {
        btn.addEventListener('click', () => editComplaint(btn.dataset.id));
    });
    // Delete
    container.querySelectorAll('.del-btn').forEach(btn => {
        btn.addEventListener('click', () => deleteComplaint(btn.dataset.id));
    });
}

// ─── Cycle a field value ──────────────────────────────────────
async function cycleField(id, field, options, btnEl) {
    const current = btnEl.textContent.trim();
    const idx = options.indexOf(current);
    const next = options[(idx + 1) % options.length] || options[0];
    try {
        const { error } = await applySchoolScope(db.from('complaints').update({ [field]: next, updated_at: new Date().toISOString() }).eq('id', id));
        if (error) throw error;
        btnEl.textContent = next;
        // Update cache
        const cached = complaintsCache.find(c => c.id === id);
        if (cached) cached[field] = next;
        showToast(`${field} → ${next}`, 'success');
    } catch (e) {
        console.error(e);
        showToast('Update failed', 'danger');
    }
}

// ─── Add / Update Complaint ──────────────────────────────────
document.getElementById('complaintForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const obj = {
        name: nameEl.value.trim(),
        roll: rollEl.value.trim(),
        class_name: classEl.value.trim(),
        date: dateEl.value,
        complaint: complaintEl.value.trim(),
        category: categoryEl.value,
        status: statusEl.value,
        contact_status: contactEl.value,
        ...getTenantScopePatch(),
        updated_at: new Date().toISOString()
    };

    if (!obj.name || !obj.roll || !obj.date || !obj.complaint) {
        showToast('Fill all required fields', 'warning');
        return;
    }

    try {
        const id = editIdEl.value;
        if (id) {
            const { error } = await applySchoolScope(db.from('complaints').update(obj).eq('id', id));
            if (error) throw error;
            showToast('Complaint updated', 'success');
            editIdEl.value = '';
            submitBtn.textContent = 'Add Complaint';
            cancelEditBtn.style.display = 'none';
        } else {
            // ─── Duplicate check ────────────────────────────────
            const duplicate = complaintsCache.find(c =>
                String(c.roll).trim() === String(obj.roll).trim() &&
                c.date === obj.date &&
                (c.category || '').toLowerCase() === (obj.category || '').toLowerCase()
            );
            if (duplicate) {
                const proceed = confirm(
                    `⚠️ Duplicate Warning!\n\nA "${obj.category}" complaint for Roll ${obj.roll} on ${obj.date} already exists:\n\n"${duplicate.complaint}"\n\nDo you still want to add this as a new complaint?`
                );
                if (!proceed) return;
            }
            // ────────────────────────────────────────────────────
            const { error } = await db.from('complaints').insert(obj);
            if (error) throw error;
            showToast('Complaint added', 'success');
        }
        e.target.reset();
        setDefaults();
        await loadComplaints();
    } catch (err) {
        console.error(err);
        showToast('Save failed', 'danger');
    }
});

// ─── Edit Complaint ───────────────────────────────────────────
function editComplaint(id) {
    const c = complaintsCache.find(x => x.id === id);
    if (!c) return;
    nameEl.value = c.name || '';
    rollEl.value = c.roll || '';
    classEl.value = c.class_name || '';
    dateEl.value = c.date || '';
    categoryEl.value = c.category || '';
    statusEl.value = c.status || '';
    contactEl.value = c.contact_status || '';
    complaintEl.value = c.complaint || '';
    editIdEl.value = id;
    submitBtn.textContent = 'Update Complaint';
    cancelEditBtn.style.display = 'inline-block';
    window.scrollTo({ top: 0, behavior: 'smooth' });
}

cancelEditBtn.addEventListener('click', () => {
    editIdEl.value = '';
    submitBtn.textContent = 'Add Complaint';
    cancelEditBtn.style.display = 'none';
    document.getElementById('complaintForm').reset();
    setDefaults();
});

// ─── Delete Complaint ─────────────────────────────────────────
async function deleteComplaint(id) {
    if (!confirm('Delete this complaint?')) return;
    try {
        const { error } = await applySchoolScope(db.from('complaints').delete().eq('id', id));
        if (error) throw error;
        showToast('Deleted', 'success');
        await loadComplaints();
    } catch (e) {
        console.error(e);
        showToast('Delete failed', 'danger');
    }
}

// ─── Analytics ────────────────────────────────────────────────
function generateAnalytics() {
    const cnt = {};
    complaintsCache.forEach(c => cnt[c.category] = (cnt[c.category] || 0) + 1);
    const ctx = document.getElementById('chartCanvas').getContext('2d');
    if (window.myChart) window.myChart.destroy();
    window.myChart = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: Object.keys(cnt),
            datasets: [{
                label: 'Complaints by Category',
                data: Object.values(cnt),
                backgroundColor: ['#6366f1','#f59e0b','#10b981','#ef4444','#3b82f6','#8b5cf6','#ec4899','#14b8a6','#f97316','#64748b']
            }]
        },
        options: { scales: { y: { beginAtZero: true } }, plugins: { legend: { display: false } } }
    });
}


// ─── Student Report ───────────────────────────────────────────
document.getElementById('genStudentReport').addEventListener('click', () => {
    const q = (document.getElementById('reportStudent').value || '').trim().toLowerCase();
    const clsFilter = (document.getElementById('reportClass').value || '').trim().toLowerCase();
    if (!q && !clsFilter) { alert('Enter roll/name or class'); return; }

    const filtered = complaintsCache.filter(r => {
        if (q && !((r.roll || '').toLowerCase() === q || (r.name || '').toLowerCase().includes(q))) return false;
        if (clsFilter && (r.class_name || '').toLowerCase() !== clsFilter) return false;
        return true;
    });

    const out = document.getElementById('specificReport');
    if (filtered.length === 0) {
        out.innerHTML = '<p style="color:#94a3b8;">No records found.</p>';
        return;
    }

    out.innerHTML = `<h4>Report (${filtered.length} records)</h4>
        <table><thead><tr><th>Roll</th><th>Name</th><th>Date</th><th>Complaint</th><th>Category</th><th>Contact</th><th>Status</th></tr></thead>
        <tbody>${filtered.map(r => `<tr>
            <td>${esc(r.roll)}</td><td>${esc(r.name)}</td><td>${esc(r.date)}</td>
            <td>${esc(r.complaint)}</td><td>${esc(r.category)}</td>
            <td>${esc(r.contact_status)}</td><td>${esc(r.status)}</td>
        </tr>`).join('')}</tbody></table>`;
});

document.getElementById('printStudentReport').addEventListener('click', () => window.print());

// ─── Search Wiring ────────────────────────────────────────────
['searchBox', 'searchDate', 'searchCategory', 'searchStatus'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.addEventListener('input', renderComplaints);
});
document.getElementById('refreshBtn').addEventListener('click', loadComplaints);

// ─── Dark Mode ────────────────────────────────────────────────
document.getElementById('toggleDarkMode').addEventListener('click', () => document.body.classList.toggle('dark-mode'));

// ─── WA Modal Logic ───────────────────────────────────────────
window.openWaModal = function(id) {
    currentComplaintId = id;
    document.getElementById('waMessageText').value = '';
    document.getElementById('waTemplateDropdown').value = '';
    
    if (waTemplates.length > 0) {
        const savedId = localStorage.getItem('lastSelectedWaTemplateId');
        if (savedId && waTemplates.find(x => x.id === savedId)) {
            document.getElementById('waTemplateDropdown').value = savedId;
        } else {
            const def = waTemplates.find(x => x.is_default);
            document.getElementById('waTemplateDropdown').value = def ? def.id : waTemplates[0].id;
        }
        window.applyTemplate();
    }
    
    document.getElementById('waModal').style.display = 'flex';
};

window.closeWaModal = function() {
    document.getElementById('waModal').style.display = 'none';
    currentComplaintId = null;
};

window.applyTemplate = function() {
    if (!currentComplaintId) return;
    
    const tId = document.getElementById('waTemplateDropdown').value;
    if (!tId) {
        document.getElementById('waMessageText').value = '';
        return;
    }
    
    // Save to localStorage
    localStorage.setItem('lastSelectedWaTemplateId', tId);
    
    const tmpl = waTemplates.find(x => x.id === tId);
    if (!tmpl) return;
    
    const complaint = complaintsCache.find(x => x.id === currentComplaintId);
    if (!complaint) return;
    
    const student = studentsMap[complaint.roll] || {};
    
    let text = tmpl.message_text;
    
    // Extract subjects using regex (e.g., from "Undone Homework of Math, English." extracts "Math, English")
    let subjects = '';
    const match = (complaint.complaint || '').match(/of\s+(.*?)(?:\.|$)/i);
    if (match && match[1]) {
        subjects = match[1].trim();
    } else {
        subjects = complaint.complaint || ''; // fallback
    }

    text = text.replace(/{{STUDENT_NAME}}/g, complaint.name || '');
    text = text.replace(/{{FATHER_NAME}}/g, student.fatherName || 'Dear Parent');
    text = text.replace(/{{TODAY_DATE}}/g, new Date().toLocaleDateString());
    text = text.replace(/{{COMPLAINT}}/g, complaint.complaint || '');
    text = text.replace(/{{CATEGORY}}/g, complaint.category || '');
    text = text.replace(/{{SUBJECTS}}/g, subjects);

    document.getElementById('waMessageText').value = text;
};

window.sendWaMessage = function() {
    if (!currentComplaintId) return;
    const complaint = complaintsCache.find(x => x.id === currentComplaintId);
    if (!complaint) return;
    
    const student = studentsMap[complaint.roll] || {};
    let mobile = student.mobile;
    
    if (!mobile) {
        alert("This student doesn't have a Mobile or WhatsApp number saved in the system. Roll number: " + complaint.roll);
        return;
    }
    
    mobile = mobile.replace(/[^0-9]/g, '');
    if (mobile.startsWith('0')) mobile = '92' + mobile.substring(1);
    
    const msg = document.getElementById('waMessageText').value;
    if (!msg.trim()) {
        alert("Message cannot be empty.");
        return;
    }
    
    const encoded = encodeURIComponent(msg);
    const url = `https://wa.me/${mobile}?text=${encoded}`;
    
    window.open(url, '_blank');
    window.closeWaModal();
};

// ─── Helpers ──────────────────────────────────────────────────
function esc(s) { return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
function downloadBlob(content, filename, type) {
    const blob = new Blob([content], { type });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = filename; a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1500);
}

// ─── Init ─────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', async () => {
    setDefaults();
    await loadWaTemplates();
    await loadStudents();
    await loadComplaints();
});
