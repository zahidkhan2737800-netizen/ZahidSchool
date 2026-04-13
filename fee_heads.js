// ═══════════════════════════════════════════════════════════════════════════════
// fee_heads.js — Fee Head Types + Fee Head Assignment Management
// ═══════════════════════════════════════════════════════════════════════════════

let editFeeId = null;
let allFeeHeadsData = [];
const currentSchoolId = window.currentSchoolId || null;
const applySchoolScope = (query) => currentSchoolId ? query.eq('school_id', currentSchoolId) : query;

function getTenantScopePatch() {
    const patch = { school_id: currentSchoolId };
    if (window.campusFeatureReady && window.currentCampusId) patch.campus_id = window.currentCampusId;
    return patch;
}

document.addEventListener('DOMContentLoaded', () => {
    const checkAuth = setInterval(() => {
        if (window.authReady) {
            clearInterval(checkAuth);
            initFeeHeads();
        }
    }, 100);
});

function initFeeHeads() {
    document.getElementById('feeForm').addEventListener('submit', handleFeeFormSubmit);
    document.getElementById('searchFee').addEventListener('input', (e) => renderFeeHeads(e.target.value.toLowerCase()));

    loadFeeHeadTypes();
    loadClasses();
    fetchFeeHeads();
}

// ═══════════════════════════════════════════════════════════════════════════════
// SECTION 1: Fee Head Types (Tag Manager)
// ═══════════════════════════════════════════════════════════════════════════════

async function loadFeeHeadTypes() {
    try {
        const { data, error } = await applySchoolScope(window.supabaseClient
            .from('fee_head_types')
            .select('id, name')
            .order('name'));
        if (error) throw error;

        renderTypeTags(data || []);
        populateFeeTypeDropdown(data || []);
    } catch(err) {
        console.error('Error loading fee head types:', err);
        document.getElementById('typeTagsContainer').innerHTML = `<span style="color:red;font-size:0.85rem;">Error loading types. Did you run fee_head_types_setup.sql?</span>`;
    }
}

function renderTypeTags(types) {
    const container = document.getElementById('typeTagsContainer');
    if (types.length === 0) {
        container.innerHTML = `<span style="color:#94a3b8;font-size:0.85rem;">No types yet. Add one above.</span>`;
        return;
    }
    container.innerHTML = types.map(t => `
        <span class="type-tag">
            ${t.name}
            <button onclick="deleteFeeType('${t.id}', '${t.name.replace(/'/g, "\\'")}')" title="Remove">✕</button>
        </span>
    `).join('');
}

function populateFeeTypeDropdown(types) {
    const sel = document.getElementById('feeType');
    const currentVal = sel.value;
    sel.innerHTML = `<option value="" disabled selected>-- Select Fee Type --</option>`;
    types.forEach(t => {
        const opt = document.createElement('option');
        opt.value = t.name;
        opt.textContent = t.name;
        sel.appendChild(opt);
    });
    if (currentVal) sel.value = currentVal; // Preserve during edits
}

window.addFeeType = async function() {
    const input = document.getElementById('newTypeName');
    const name = input.value.trim();
    if (!name) { showToast('Please enter a type name.', 'error'); return; }

    try {
        const { error } = await window.supabaseClient
            .from('fee_head_types')
            .insert({ name, created_by: window.currentUser?.id, ...getTenantScopePatch() });
        if (error) {
            if (error.message.includes('unique') || error.code === '23505') {
                showToast(`"${name}" already exists.`, 'error');
            } else { throw error; }
            return;
        }
        input.value = '';
        showToast(`"${name}" added to fee types!`, 'success');
        loadFeeHeadTypes();
    } catch(err) {
        showToast('Failed to add: ' + err.message, 'error');
    }
};

window.deleteFeeType = async function(id, name) {
    if (!confirm(`Remove fee type "${name}"?`)) return;
    try {
        const { error } = await applySchoolScope(window.supabaseClient
            .from('fee_head_types')
            .delete()
            .eq('id', id));
        if (error) throw error;
        showToast(`"${name}" removed.`, 'success');
        loadFeeHeadTypes();
    } catch(err) {
        showToast('Failed to delete: ' + err.message, 'error');
    }
};

// ═══════════════════════════════════════════════════════════════════════════════
// SECTION 2: Load Classes into Checkboxes (Multi-select)
// ═══════════════════════════════════════════════════════════════════════════════

async function loadClasses() {
    const container = document.getElementById('classListContainer');
    try {
        const { data, error } = await applySchoolScope(window.supabaseClient
            .from('classes')
            .select('id, class_name, section')
            .order('class_name')
            .order('section'));
        if (error) throw error;

        container.innerHTML = '';
        (data || []).forEach(cls => {
            const div = document.createElement('div');
            div.className = 'class-selector-item';
            div.innerHTML = `
                <input type="checkbox" name="classCb" id="cls_${cls.id}" value="${cls.id}">
                <label for="cls_${cls.id}">${cls.class_name} (${cls.section})</label>
            `;
            container.appendChild(div);
        });

        // Set up "Select All" toggle
        document.getElementById('selectAllClasses').addEventListener('change', function(e) {
            const isChecked = e.target.checked;
            document.querySelectorAll('input[name="classCb"]').forEach(cb => {
                cb.checked = isChecked;
            });
        });

        // Set up "Apply Globally" toggle
        document.getElementById('globalApplyCb').addEventListener('change', function(e) {
            const isGlobal = e.target.checked;
            const specificBox = document.getElementById('specificClassesBox');
            if (isGlobal) {
                specificBox.style.opacity = '0.4';
                specificBox.style.pointerEvents = 'none';
                document.getElementById('selectAllClasses').checked = false;
                document.querySelectorAll('input[name="classCb"]').forEach(cb => cb.checked = false);
            } else {
                specificBox.style.opacity = '1';
                specificBox.style.pointerEvents = 'auto';
            }
        });

        // Update "Select All" state if user manually toggles individual boxes
        container.addEventListener('change', function(e) {
            if (e.target.name === 'classCb') {
                const total = document.querySelectorAll('input[name="classCb"]').length;
                const checked = document.querySelectorAll('input[name="classCb"]:checked').length;
                document.getElementById('selectAllClasses').checked = (total > 0 && total === checked);
            }
        });

    } catch(err) {
        container.innerHTML = `<div style="color:red;font-size:0.85rem;padding:0.5rem;">Error loading classes</div>`;
        console.error(err);
    }
}

// ═══════════════════════════════════════════════════════════════════════════════
// SECTION 3: Fee Head Form (Save/Update)
// ═══════════════════════════════════════════════════════════════════════════════

async function handleFeeFormSubmit(e) {
    e.preventDefault();
    
    let isGlobal = document.getElementById('globalApplyCb').checked;
    let selectedClassIds = [];
    
    if (editFeeId) { // In edit mode, class selection is locked
        isGlobal = document.getElementById('feeForm').dataset.editIsGlobal === 'true';
        if (!isGlobal) selectedClassIds = [ document.getElementById('feeForm').dataset.editClassId ];
    } else if (!isGlobal) { // In create mode, get checked classes
        const cbs = document.querySelectorAll('input[name="classCb"]:checked');
        cbs.forEach(cb => selectedClassIds.push(cb.value));
    }

    const feeType  = document.getElementById('feeType').value;
    const amountRaw = document.getElementById('amount').value.trim();
    const isMonthly = document.getElementById('isMonthly').checked;

    if (!isGlobal && selectedClassIds.length === 0) {
        showAlert('Please select at least one Target Class, or check Apply Globally.', true);
        return;
    }
    if (!feeType) {
        showAlert('Please select a Fee Type.', true);
        return;
    }

    const btn = document.getElementById('submitBtn');
    btn.disabled = true;
    btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Saving...';

    const payload = {
        fee_type: feeType,
        amount: amountRaw !== '' ? parseFloat(amountRaw) : null,
        is_monthly: isMonthly,
        ...getTenantScopePatch()
    };

    try {
        if (editFeeId) {
            // Updating a single record (Global or Specific)
            const payloadUpdate = { ...payload, class_id: isGlobal ? null : selectedClassIds[0] };
            const { error } = await window.supabaseClient
                .from('fee_heads')
                .update(payloadUpdate)
                .eq('id', editFeeId);
            if (error) throw error;
            showAlert('✅ Fee Head updated!', false);
        } else if (isGlobal) {
            // Single insert for Global fee head
            const { error } = await window.supabaseClient.from('fee_heads').insert([{ ...payload, class_id: null }]);
            if (error) throw error;
            showAlert('✅ Global Fee applied to ALL classes!', false);
        } else {
            // Bulk insert for all selected classes
            const inserts = selectedClassIds.map(cid => ({ ...payload, class_id: cid }));
            const { error } = await window.supabaseClient.from('fee_heads').insert(inserts);
            if (error) throw error;
            showAlert(`✅ Fee applied to ${inserts.length} classes!`, false);
        }

        cancelEdit();
        fetchFeeHeads();
    } catch(err) {
        console.error(err);
        showAlert('❌ Failed: ' + err.message, true);
    } finally {
        btn.disabled = false;
        btn.innerHTML = '<i class="fas fa-save"></i> Save Fee Head';
    }
}

window.cancelEdit = function() {
    editFeeId = null;
    document.getElementById('feeForm').reset();
    delete document.getElementById('feeForm').dataset.editClassId;
    delete document.getElementById('feeForm').dataset.editIsGlobal;
    
    // Unlock UI
    document.getElementById('classSelectionGroup').style.display = 'block';
    document.getElementById('globalApplyCb').checked = false;
    document.getElementById('specificClassesBox').style.opacity = '1';
    document.getElementById('specificClassesBox').style.pointerEvents = 'auto';
    document.getElementById('selectAllClasses').checked = false;
    document.getElementById('formTitle').textContent = '➕ Assign Fee Head';
    document.getElementById('editBanner').style.display = 'none';
    document.getElementById('submitBtn').innerHTML = '<i class="fas fa-save"></i> Save Fee Heads';
};

// ═══════════════════════════════════════════════════════════════════════════════
// SECTION 4: Fee Heads Table
// ═══════════════════════════════════════════════════════════════════════════════

async function fetchFeeHeads() {
    try {
        const { data, error } = await applySchoolScope(window.supabaseClient
            .from('fee_heads')
            .select(`id, class_id, fee_type, amount, is_monthly, created_at, classes ( class_name, section )`)
            .order('created_at', { ascending: false }));
        if (error) throw error;

        allFeeHeadsData = data || [];
        renderFeeHeads();
    } catch(err) {
        document.getElementById('feeBody').innerHTML = `<tr><td colspan="5" style="color:red;text-align:center;">Failed to load: ${err.message}</td></tr>`;
    }
}

function renderFeeHeads(searchTerm = '') {
    const tbody = document.getElementById('feeBody');
    const filtered = allFeeHeadsData.filter(fee => {
        const cls = fee.class_id ? (fee.classes ? `${fee.classes.class_name} ${fee.classes.section}` : '') : 'Global All Classes';
        return `${cls} ${fee.fee_type}`.toLowerCase().includes(searchTerm);
    });

    if (filtered.length === 0) {
        tbody.innerHTML = `<tr><td colspan="5" style="text-align:center;color:#94a3b8;padding:2rem;">No fee heads match your search.</td></tr>`;
        return;
    }

    tbody.innerHTML = filtered.map(fee => {
        const cls = fee.class_id ? (fee.classes ? `${fee.classes.class_name} (${fee.classes.section})` : '—') : '🌍 <strong style="color:var(--primary);">Global (All Classes)</strong>';
        const amtHtml = fee.amount != null
            ? `<span class="amt-cell">Rs ${Number(fee.amount).toLocaleString()}</span>`
            : `<span class="amt-na">Set at challan</span>`;
        const badge = fee.is_monthly
            ? `<span class="badge badge-green">Monthly</span>`
            : `<span class="badge badge-gray">One-time</span>`;

        return `<tr>
            <td>${cls}</td>
            <td>${fee.fee_type}</td>
            <td>${amtHtml}</td>
            <td>${badge}</td>
            <td style="white-space:nowrap;">
                <button onclick="editFeeHead('${fee.id}')" style="background:#eff6ff;color:#2563eb;border:1px solid #bfdbfe;padding:0.35rem 0.65rem;border-radius:6px;cursor:pointer;font-weight:600;font-size:0.8rem;margin-right:0.3rem;">✏️ Edit</button>
                <button onclick="deleteFeeHead('${fee.id}')" style="background:#fef2f2;color:#dc2626;border:1px solid #fecaca;padding:0.35rem 0.65rem;border-radius:6px;cursor:pointer;font-weight:600;font-size:0.8rem;">🗑️ Del</button>
            </td>
        </tr>`;
    }).join('');
}

window.editFeeHead = function(id) {
    const fee = allFeeHeadsData.find(f => f.id === id);
    if (!fee) return;
    editFeeId = id;

    // Lock class selection UI to prevent changing class during edit
    document.getElementById('classSelectionGroup').style.display = 'none';
    if (!fee.class_id) {
        document.getElementById('feeForm').dataset.editIsGlobal = 'true';
        document.getElementById('editingClassBadge').textContent = '🌍 Global (All Classes)';
    } else {
        document.getElementById('feeForm').dataset.editIsGlobal = 'false';
        document.getElementById('feeForm').dataset.editClassId = fee.class_id;
        const className = fee.classes ? `${fee.classes.class_name} (${fee.classes.section})` : '';
        document.getElementById('editingClassBadge').textContent = className;
    }

    document.getElementById('feeType').value = fee.fee_type;
    document.getElementById('amount').value = fee.amount != null ? fee.amount : '';
    document.getElementById('isMonthly').checked = fee.is_monthly;

    document.getElementById('formTitle').textContent = '✏️ Edit Fee Head';
    document.getElementById('editBanner').style.display = 'block';
    document.getElementById('submitBtn').innerHTML = '<i class="fas fa-save"></i> Update Fee Head';

    document.getElementById('feeForm').scrollIntoView({ behavior: 'smooth' });
};

window.deleteFeeHead = async function(id) {
    if (!confirm('Delete this fee head? Existing challans will not be affected.')) return;
    try {
        const { error } = await applySchoolScope(window.supabaseClient.from('fee_heads').delete().eq('id', id));
        if (error) throw error;
        showToast('Fee Head deleted.', 'success');
        if (editFeeId === id) cancelEdit();
        fetchFeeHeads();
    } catch(err) {
        showToast('Delete failed: ' + err.message, 'error');
    }
};

// ═══════════════════════════════════════════════════════════════════════════════
// Utils
// ═══════════════════════════════════════════════════════════════════════════════

function showAlert(msg, isError) {
    const el = document.getElementById('formAlert');
    el.textContent = msg;
    el.style.background = isError ? '#fee2e2' : '#dcfce7';
    el.style.color = isError ? '#991b1b' : '#166534';
    el.style.display = 'block';
    setTimeout(() => el.style.display = 'none', 4000);
}

function showToast(msg, type) {
    const toast = document.getElementById('toast');
    toast.textContent = msg;
    toast.className = `toast ${type}`;
    toast.style.display = 'block';
    setTimeout(() => toast.style.display = 'none', 3000);
}
