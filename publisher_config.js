// ═══════════════════════════════════════════════════════════════
// publisher_config.js — Publisher Config (Supabase)
// ═══════════════════════════════════════════════════════════════
const db = supabaseClient;
const currentSchoolId = window.currentSchoolId || null;
const applySchoolScope = (query) => currentSchoolId ? query.eq('school_id', currentSchoolId) : query;

function getTenantScopePatch() {
    const patch = { school_id: currentSchoolId };
    if (window.campusFeatureReady && window.currentCampusId) patch.campus_id = window.currentCampusId;
    return patch;
}

// DOM Elements
const classSelect = document.getElementById('classSelect');
const loadConfigBtn = document.getElementById('loadConfigBtn');
const configArea = document.getElementById('configArea');
const configForm = document.getElementById('configForm');
const editIdEl = document.getElementById('editId');
const categoryNameEl = document.getElementById('categoryName');
const complaintPrefixEl = document.getElementById('complaintPrefix');
const categoryItemsEl = document.getElementById('categoryItems');
const saveBtn = document.getElementById('saveBtn');
const cancelBtn = document.getElementById('cancelBtn');
const configsList = document.getElementById('configsList');
const displayClassName = document.getElementById('displayClassName');
const toastContainer = document.getElementById('toastContainer');
const formTitle = document.getElementById('formTitle');
const copyTargetClassSelect = document.getElementById('copyTargetClassSelect');
const copySourceClass = document.getElementById('copySourceClass');
const copyConfigBtn = document.getElementById('copyConfigBtn');

let currentClassConfigs = [];
let selectedClass = '';

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
        const optionsHtml = classes.map(c => `<option value="${c}">${c}</option>`).join('');
        classSelect.innerHTML = '<option value="">-- Select Class --</option>' + optionsHtml;
        if (copyTargetClassSelect) {
            copyTargetClassSelect.innerHTML = '<option value="">-- Select Target Class --</option>' + optionsHtml;
        }
    } catch (e) {
        console.error('loadClasses failed', e);
        showToast('Failed to load classes', 'danger');
    }
}

// ─── Load Configurations for Class ────────────────────────────
async function loadConfigs() {
    selectedClass = classSelect.value;
    if (!selectedClass) {
        showToast('Please select a class first', 'warning');
        configArea.style.display = 'none';
        return;
    }

    displayClassName.textContent = selectedClass;
    if (copySourceClass) copySourceClass.textContent = selectedClass;
    configArea.style.display = 'block';
    configsList.innerHTML = '<p style="color:#94a3b8;">Loading configurations...</p>';
    cancelEdit();

    try {
        const { data, error } = await applySchoolScope(db
            .from('publisher_config')
            .select('*')
            .eq('class_name', selectedClass)
            .order('created_at', { ascending: true }));
        
        if (error) throw error;
        currentClassConfigs = data || [];
        renderConfigs();
    } catch (e) {
        console.error('loadConfigs failed', e);
        configsList.innerHTML = '<p style="color:#ef4444;">Failed to load configurations.</p>';
    }
}

// ─── Render Configurations ────────────────────────────────────
function renderConfigs() {
    if (currentClassConfigs.length === 0) {
        configsList.innerHTML = '<p style="color:#94a3b8;">No categories configured for this class yet. Add one above.</p>';
        return;
    }

    let html = `
        <table class="config-table">
            <thead>
                <tr>
                    <th>Category</th>
                    <th>Complaint Prefix</th>
                    <th>Items (Buttons)</th>
                    <th style="width: 100px;">Actions</th>
                </tr>
            </thead>
            <tbody>
    `;

    currentClassConfigs.forEach(conf => {
        const items = Array.isArray(conf.items) ? conf.items : [];
        const itemsHtml = items.map(item => `<span class="tag">${escapeHtml(item)}</span>`).join('');
        
        html += `
            <tr>
                <td><strong>${escapeHtml(conf.category)}</strong></td>
                <td>${escapeHtml(conf.complaint_prefix)}</td>
                <td>${itemsHtml}</td>
                <td>
                    <button type="button" class="btn btn-primary btn-sm" onclick="editConfig('${conf.id}')">✏️</button>
                    <button type="button" class="btn btn-danger btn-sm" onclick="deleteConfig('${conf.id}')">🗑</button>
                </td>
            </tr>
        `;
    });

    html += `</tbody></table>`;
    configsList.innerHTML = html;
}

// ─── Save Configuration ───────────────────────────────────────
configForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    
    if (!selectedClass) {
        showToast('No class selected', 'danger');
        return;
    }

    const category = categoryNameEl.value.trim();
    const prefix = complaintPrefixEl.value.trim();
    const itemsRaw = categoryItemsEl.value.trim();
    
    if (!category || !prefix || !itemsRaw) {
        showToast('Please fill all fields', 'warning');
        return;
    }

    const itemsArray = itemsRaw.split(',').map(s => s.trim()).filter(s => s.length > 0);
    if (itemsArray.length === 0) {
        showToast('Please provide at least one valid item', 'warning');
        return;
    }

    const payload = {
        class_name: selectedClass,
        category: category,
        complaint_prefix: prefix,
        items: itemsArray,
        ...getTenantScopePatch(),
        updated_at: new Date().toISOString()
    };

    const id = editIdEl.value;

    try {
        if (id) {
            // Update
            const { error } = await applySchoolScope(db
                .from('publisher_config')
                .update(payload)
                .eq('id', id));
            if (error) throw error;
            showToast('Configuration updated', 'success');
        } else {
            // Insert
            const { error } = await db.from('publisher_config').insert([payload]);
            if (error) {
                if (error.code === '23505') { // Unique violation
                    showToast('This category already exists for this class', 'danger');
                    return;
                }
                throw error;
            }
            showToast('Configuration added', 'success');
        }
        
        cancelEdit();
        loadConfigs();
    } catch (e) {
        console.error('Save config error', e);
        showToast('Failed to save configuration', 'danger');
    }
});

// ─── Edit & Delete ────────────────────────────────────────────
window.editConfig = function(id) {
    const conf = currentClassConfigs.find(c => c.id === id);
    if (!conf) return;

    editIdEl.value = conf.id;
    categoryNameEl.value = conf.category;
    complaintPrefixEl.value = conf.complaint_prefix;
    categoryItemsEl.value = (conf.items || []).join(', ');
    
    formTitle.textContent = '✏️ Edit Category';
    saveBtn.textContent = 'Update Category';
    cancelBtn.style.display = 'inline-block';
    
    window.scrollTo({ top: 0, behavior: 'smooth' });
};

window.deleteConfig = async function(id) {
    if (!confirm('Are you sure you want to delete this category configuration?')) return;
    
    try {
        const { error } = await applySchoolScope(db
            .from('publisher_config')
            .delete()
            .eq('id', id));
        if (error) throw error;
        
        showToast('Configuration deleted', 'success');
        loadConfigs();
    } catch (e) {
        console.error('Delete config error', e);
        showToast('Failed to delete configuration', 'danger');
    }
};

function cancelEdit() {
    editIdEl.value = '';
    configForm.reset();
    formTitle.textContent = '➕ Add Category for Class';
    saveBtn.textContent = 'Save Category';
    cancelBtn.style.display = 'none';
}

cancelBtn.addEventListener('click', cancelEdit);
loadConfigBtn.addEventListener('click', loadConfigs);

// ─── Helpers ──────────────────────────────────────────────────
function escapeHtml(s) {
    return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// ─── Copy Configuration ───────────────────────────────────────
if (copyConfigBtn) {
    copyConfigBtn.addEventListener('click', async () => {
        if (!selectedClass || currentClassConfigs.length === 0) {
            showToast('No configurations to copy from source class.', 'warning');
            return;
        }
        const targetClass = copyTargetClassSelect.value;
        if (!targetClass) {
            showToast('Please select a target class to copy to.', 'warning');
            return;
        }
        if (targetClass === selectedClass) {
            showToast('Source and target classes cannot be the same.', 'warning');
            return;
        }

        if (!confirm(`Are you sure you want to copy ${currentClassConfigs.length} categories from ${selectedClass} to ${targetClass}?`)) {
            return;
        }

        try {
            const payload = currentClassConfigs.map(conf => ({
                class_name: targetClass,
                category: conf.category,
                complaint_prefix: conf.complaint_prefix,
                items: conf.items,
                ...getTenantScopePatch(),
                updated_at: new Date().toISOString()
            }));

            // Insert new configurations
            const { error } = await db.from('publisher_config').insert(payload);
            if (error) {
                if (error.code === '23505') { // Unique violation
                    showToast('Some categories already exist in the target class.', 'danger');
                    return;
                }
                throw error;
            }

            showToast('Configurations copied successfully!', 'success');
            copyTargetClassSelect.value = ''; // reset selection
            
            // Switch to target class to show the copied configs
            classSelect.value = targetClass;
            loadConfigs();

        } catch (e) {
            console.error('Copy config error', e);
            showToast('Failed to copy configurations.', 'danger');
        }
    });
}

// ─── Init ─────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
    loadClasses();
});
