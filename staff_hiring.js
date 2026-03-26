// ═══════════════════════════════════════════════════════════════════════════════
// staff_hiring.js — Handles teacher admissions, listing, editing, deleting
// ═══════════════════════════════════════════════════════════════════════════════

let allStaff = [];
let editingId = null; // Track if we're in edit mode

document.addEventListener('DOMContentLoaded', () => {
    const checkAuth = setInterval(() => {
        if (window.authReady) {
            clearInterval(checkAuth);
            if (!window.canView('staff_hiring')) {
                window.location.href = 'dashboard.html?denied=1';
                return;
            }
            initHiringModule();
        }
    }, 100);
});

function initHiringModule() {
    document.getElementById('joinDate').value = new Date().toISOString().split('T')[0];
    document.getElementById('hiringForm').addEventListener('submit', handleHiring);
    document.getElementById('searchInput').addEventListener('input', (e) => {
        renderStaff(e.target.value.toLowerCase());
    });
    loadStaff();
}

async function loadStaff() {
    try {
        const { data, error } = await window.supabaseClient
            .from('staff')
            .select('*')
            .eq('status', 'Active')
            .order('employee_id', { ascending: true });

        if (error) throw error;
        allStaff = data || [];
        renderStaff();
    } catch (err) {
        console.error(err);
        showToast('Failed to load staff list.', 'error');
    }
}

function renderStaff(searchTerm = '') {
    const tbody = document.getElementById('staffGrid');

    const filtered = allStaff.filter(s =>
        (s.full_name || '').toLowerCase().includes(searchTerm) ||
        (s.employee_id || '').toLowerCase().includes(searchTerm) ||
        (s.mobile && s.mobile.includes(searchTerm))
    );

    if (filtered.length === 0) {
        tbody.innerHTML = '<tr><td colspan="7" style="text-align: center; color: #94a3b8; padding: 2rem;">No active staff found.</td></tr>';
        return;
    }

    tbody.innerHTML = filtered.map(staff => `
        <tr>
            <td style="font-weight: bold; color: var(--primary);">${staff.employee_id}</td>
            <td>
                <div style="font-weight: 600;">${staff.full_name}</div>
                <div style="font-size: 0.8rem; color: #64748b;">${staff.father_name || ''}</div>
            </td>
            <td>
                <div style="font-weight:600;">${staff.job_title || '—'}</div>
                <div style="font-size:0.8rem;color:#64748b;">${staff.qualification || ''}</div>
            </td>
            <td>${staff.qualification || '—'}<br><small style="color: #64748b;">Exp: ${staff.experience || 'None'}</small></td>
            <td>${staff.whatsapp || staff.mobile}</td>
            <td>${formatDate(staff.joining_date)}</td>
            <td class="money">Rs ${Number(staff.base_salary).toLocaleString()}</td>
            <td>
                <div style="display:flex; gap:0.4rem;">
                    <button onclick="editStaff('${staff.id}')" style="background:#eff6ff;color:#2563eb;border:1px solid #bfdbfe;padding:0.4rem 0.7rem;border-radius:6px;cursor:pointer;font-weight:600;font-size:0.8rem;">✏️ Edit</button>
                    <button onclick="deleteStaff('${staff.id}', '${staff.full_name}')" style="background:#fef2f2;color:#dc2626;border:1px solid #fecaca;padding:0.4rem 0.7rem;border-radius:6px;cursor:pointer;font-weight:600;font-size:0.8rem;">🗑️ Delete</button>
                </div>
            </td>
        </tr>
    `).join('');
}

// ─── Edit Staff ───────────────────────────────────────────────────────────────
window.editStaff = function(id) {
    const staff = allStaff.find(s => s.id === id);
    if (!staff) return;

    editingId = id;

    // Populate form
    document.getElementById('empId').value = staff.employee_id;
    document.getElementById('empId').disabled = true;
    document.getElementById('fullName').value = staff.full_name;
    document.getElementById('fatherName').value = staff.father_name || '';
    document.getElementById('jobTitle').value = staff.job_title || '';
    document.getElementById('qual').value = staff.qualification || '';
    document.getElementById('experience').value = staff.experience || '';
    document.getElementById('whatsapp').value = staff.whatsapp || '';
    document.getElementById('mobile').value = staff.mobile || '';
    document.getElementById('joinDate').value = staff.joining_date;
    document.getElementById('salary').value = staff.base_salary;

    // Show editing banner
    document.getElementById('formTitle').textContent = '✏️ Edit Staff Record';
    document.getElementById('editBanner').style.display = 'block';
    document.getElementById('btnSubmit').innerHTML = '<i class="fas fa-save"></i> Save Changes';

    // Scroll form into view
    document.getElementById('hiringForm').scrollIntoView({ behavior: 'smooth' });
};

window.cancelEdit = function() {
    editingId = null;
    document.getElementById('hiringForm').reset();
    document.getElementById('joinDate').value = new Date().toISOString().split('T')[0];
    document.getElementById('empId').disabled = false;
    document.getElementById('formTitle').textContent = 'Hire New Staff';
    document.getElementById('editBanner').style.display = 'none';
    document.getElementById('btnSubmit').innerHTML = '<i class="fas fa-user-plus"></i> Complete Hiring';
};

// ─── Delete Staff ─────────────────────────────────────────────────────────────
window.deleteStaff = async function(id, name) {
    if (!confirm(`Are you sure you want to permanently delete "${name}"? This will also remove their attendance and payroll records!`)) return;

    try {
        const { error } = await window.supabaseClient
            .from('staff')
            .delete()
            .eq('id', id);
        if (error) throw error;

        showToast(`${name} deleted successfully.`, 'success');
        loadStaff();
    } catch (err) {
        console.error(err);
        showToast('Failed to delete: ' + err.message, 'error');
    }
};

// ─── Form Submission (Create OR Update) ───────────────────────────────────────
async function handleHiring(e) {
    e.preventDefault();
    const btn = document.getElementById('btnSubmit');
    btn.disabled = true;
    btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Processing...';

    const payload = {
        full_name: document.getElementById('fullName').value.trim(),
        father_name: document.getElementById('fatherName').value.trim(),
        job_title: document.getElementById('jobTitle').value,
        qualification: document.getElementById('qual').value.trim(),
        experience: document.getElementById('experience').value.trim(),
        whatsapp: document.getElementById('whatsapp').value.trim(),
        mobile: document.getElementById('mobile').value.trim(),
        joining_date: document.getElementById('joinDate').value,
        base_salary: parseFloat(document.getElementById('salary').value),
    };

    try {
        if (editingId) {
            // UPDATE mode
            const { error } = await window.supabaseClient
                .from('staff')
                .update(payload)
                .eq('id', editingId);
            if (error) throw error;
            showToast('Staff record updated successfully!', 'success');
            cancelEdit();
        } else {
            // INSERT mode
            payload.employee_id = document.getElementById('empId').value.trim();
            payload.status = 'Active';
            payload.created_by = window.currentUser.id;

            const { error } = await window.supabaseClient.from('staff').insert(payload);
            if (error) throw error;
            showToast('Teacher successfully hired!', 'success');
            document.getElementById('hiringForm').reset();
            document.getElementById('joinDate').value = new Date().toISOString().split('T')[0];
        }

        loadStaff();
    } catch (err) {
        console.error(err);
        if (err.message.includes('unique')) {
            showToast('Error: Employee ID already exists.', 'error');
        } else {
            showToast('Failed: ' + err.message, 'error');
        }
    } finally {
        btn.disabled = false;
        btn.innerHTML = editingId
            ? '<i class="fas fa-save"></i> Save Changes'
            : '<i class="fas fa-user-plus"></i> Complete Hiring';
    }
}

function formatDate(dateStr) {
    if (!dateStr) return '—';
    const d = new Date(dateStr + 'T00:00:00');
    const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    return `${d.getDate()} ${months[d.getMonth()]} ${d.getFullYear()}`;
}

function showToast(msg, type) {
    const toast = document.getElementById('toast');
    toast.textContent = msg;
    toast.className = `toast ${type}`;
    toast.style.display = 'block';
    setTimeout(() => toast.style.display = 'none', 3000);
}
