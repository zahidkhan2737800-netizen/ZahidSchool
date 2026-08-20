// ═══════════════════════════════════════════════════════════════
// publisher_config.js — Publisher Config (Supabase)
// ═══════════════════════════════════════════════════════════════
const db = supabaseClient;
const applySchoolScope = (query) => window.currentSchoolId ? query.eq('school_id', window.currentSchoolId) : query;

function getTenantScopePatch() {
    const patch = { school_id: window.currentSchoolId };
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
const singleCopyModal = document.getElementById('singleCopyModal');
const singleCopySource = document.getElementById('singleCopySource');
const singleCopyClassList = document.getElementById('singleCopyClassList');
const singleCopySelectAll = document.getElementById('singleCopySelectAll');
const singleCopyClearAll = document.getElementById('singleCopyClearAll');
const singleCopyConfirm = document.getElementById('singleCopyConfirm');
const singleCopyCancel = document.getElementById('singleCopyCancel');

let currentClassConfigs = [];
let selectedClass = '';
let singleCopyConfigId = null;

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
        const [admissionsResult, classesResult] = await Promise.all([
            applySchoolScope(db.from('admissions').select('applying_for_class').eq('status', 'Active')),
            applySchoolScope(db.from('classes').select('class_name, section, display_order'))
        ]);
        
        if (admissionsResult.error) throw admissionsResult.error;
        if (classesResult.error) console.warn('Could not load classes order:', classesResult.error);

        const classOrderMap = {};
        (classesResult.data || []).forEach(cls => {
            const key = `${cls.class_name || ''} ${cls.section || ''}`.trim();
            classOrderMap[key] = cls.display_order || 9999;
        });

        const rawClasses = [...new Set((admissionsResult.data || []).map(d => d.applying_for_class).filter(Boolean))];
        const classes = rawClasses.sort((a, b) => {
            const orderA = classOrderMap[a] !== undefined ? classOrderMap[a] : 9999;
            const orderB = classOrderMap[b] !== undefined ? classOrderMap[b] : 9999;
            if (orderA !== orderB) return orderA - orderB;
            return a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' });
        });

        const optionsHtml = classes.map(c => `<option value="${c}">${c}</option>`).join('');
        classSelect.innerHTML = '<option value="">-- Select Class --</option>' + optionsHtml;
        if (copyTargetClassSelect) {
            copyTargetClassSelect.innerHTML = '<option value="">-- Select Target Class --</option>' + optionsHtml;
        }
        if (singleCopyClassList) {
            singleCopyClassList.innerHTML = classes.map(className => `
                <label class="single-copy-class-option" data-class="${escapeHtml(className)}">
                    <input type="checkbox" value="${escapeHtml(className)}">
                    <span>${escapeHtml(className)}</span>
                </label>`).join('');
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
                    <th style="width: 150px;">Actions</th>
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
                    <button type="button" class="btn btn-sm single-copy-btn" title="Copy only this category to another class" onclick="openSingleCopyModal('${conf.id}')">📄</button>
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

// ─── Copy One Configuration ──────────────────────────────────
window.openSingleCopyModal = function(id) {
    const conf = currentClassConfigs.find(item => String(item.id) === String(id));
    if (!conf) return;
    singleCopyConfigId = String(id);
    singleCopySource.innerHTML = `<strong>${escapeHtml(conf.category)}</strong><br><span>${escapeHtml(selectedClass)} \u2192 selected target classes</span>`;
    singleCopyClassList.querySelectorAll('.single-copy-class-option').forEach(option => {
        const input = option.querySelector('input');
        const isSource = input.value === selectedClass;
        input.checked = false;
        input.disabled = isSource;
        option.classList.toggle('source-class', isSource);
    });
    singleCopyModal.classList.add('open');
    singleCopyModal.setAttribute('aria-hidden', 'false');
};

function closeSingleCopyModal() {
    singleCopyConfigId = null;
    singleCopyModal.classList.remove('open');
    singleCopyModal.setAttribute('aria-hidden', 'true');
}

async function copySingleConfiguration() {
    const conf = currentClassConfigs.find(item => String(item.id) === String(singleCopyConfigId));
    const targetClasses = [...singleCopyClassList.querySelectorAll('input:checked')].map(input => input.value);
    if (!conf) return closeSingleCopyModal();
    if (targetClasses.length === 0) {
        showToast('Please select at least one target class.', 'warning');
        return;
    }

    singleCopyConfirm.disabled = true;
    singleCopyConfirm.textContent = 'Copying...';
    try {
        const { data: matches, error: fetchError } = await applySchoolScope(db
            .from('publisher_config')
            .select('id, class_name')
            .in('class_name', targetClasses)
            .eq('category', conf.category)
            .limit(targetClasses.length));
        if (fetchError) throw fetchError;

        const existingByClass = new Map((matches || []).map(item => [item.class_name, item]));
        const existingRows = targetClasses.map(className => existingByClass.get(className)).filter(Boolean);
        const newClasses = targetClasses.filter(className => !existingByClass.has(className));
        const values = {
            complaint_prefix: conf.complaint_prefix,
            items: conf.items,
            updated_at: new Date().toISOString()
        };
        let replaceExisting = true;

        if (existingRows.length > 0) {
            replaceExisting = confirm(`“${conf.category}” already exists in ${existingRows.length} selected class${existingRows.length === 1 ? '' : 'es'}. Replace the existing prefix and buttons there?\n\nChoose Cancel to copy only to classes where it does not exist.`);
        }

        if (replaceExisting && existingRows.length > 0) {
            const { error } = await applySchoolScope(db
                .from('publisher_config')
                .update(values)
                .in('id', existingRows.map(item => item.id)));
            if (error) throw error;
        }

        if (newClasses.length > 0) {
            const payload = newClasses.map(className => ({
                class_name: className,
                category: conf.category,
                ...values,
                ...getTenantScopePatch()
            }));
            const { error } = await db.from('publisher_config').insert(payload);
            if (error) throw error;
        }

        const updatedCount = replaceExisting ? existingRows.length : 0;
        const changedCount = newClasses.length + updatedCount;
        if (changedCount === 0) {
            showToast('No new classes were changed.', 'info');
            return;
        }
        showToast(`Copied “${conf.category}” to ${changedCount} class${changedCount === 1 ? '' : 'es'}.`, 'success');
        closeSingleCopyModal();
    } catch (e) {
        console.error('Copy single configuration error', e);
        showToast('Failed to copy this category.', 'danger');
    } finally {
        singleCopyConfirm.disabled = false;
        singleCopyConfirm.textContent = 'Copy Category';
    }
}

singleCopyConfirm.addEventListener('click', copySingleConfiguration);
singleCopyCancel.addEventListener('click', closeSingleCopyModal);
singleCopySelectAll.addEventListener('click', () => {
    singleCopyClassList.querySelectorAll('input:not(:disabled)').forEach(input => { input.checked = true; });
});
singleCopyClearAll.addEventListener('click', () => {
    singleCopyClassList.querySelectorAll('input').forEach(input => { input.checked = false; });
});
singleCopyModal.addEventListener('click', event => {
    if (event.target === singleCopyModal) closeSingleCopyModal();
});

function cancelEdit() {
    editIdEl.value = '';
    configForm.reset();
    formTitle.textContent = '➕ Add Category for Class';
    saveBtn.textContent = 'Save Category';
    cancelBtn.style.display = 'none';
}

cancelBtn.addEventListener('click', cancelEdit);
loadConfigBtn.addEventListener('click', loadConfigs);
classSelect.addEventListener('change', loadConfigs);

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
            // Check what already exists in target class
            const { data: existingConfigs, error: fetchErr } = await applySchoolScope(db
                .from('publisher_config')
                .select('category')
                .eq('class_name', targetClass));
                
            if (fetchErr) throw fetchErr;
            
            const existingCategories = new Set((existingConfigs || []).map(c => c.category));
            
            const payload = currentClassConfigs
                .filter(conf => !existingCategories.has(conf.category))
                .map(conf => ({
                    class_name: targetClass,
                    category: conf.category,
                    complaint_prefix: conf.complaint_prefix,
                    items: conf.items,
                    ...getTenantScopePatch(),
                    updated_at: new Date().toISOString()
                }));

            if (payload.length === 0) {
                showToast('All categories from the source class already exist in the target class.', 'info');
                return;
            }

            // Insert new configurations
            const { error } = await db.from('publisher_config').insert(payload);
            if (error) {
                if (error.code === '23505') { // Unique violation fallback
                    showToast('Some categories already exist in the target class.', 'danger');
                    return;
                }
                throw error;
            }

            showToast(`Successfully copied ${payload.length} new categories!`, 'success');
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
window.onAppReady(() => {
    loadClasses();
});
