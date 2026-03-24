// ═══════════════════════════════════════════════════════════════════════════════
// access_control.js — Admin panel for managing roles, permissions, and users
// ═══════════════════════════════════════════════════════════════════════════════

// Page metadata for display
const PAGE_LABELS = {
    dashboard:          { icon: '📊', label: 'Dashboard' },
    admissions:         { icon: '📝', label: 'Admission Form' },
    students:           { icon: '👥', label: 'Active Students' },
    pending_withdrawn:  { icon: '⏸️', label: 'Pending / Withdrawn' },
    challans:           { icon: '🧾', label: 'Create Challans' },
    collect_fee:        { icon: '💰', label: 'Collect Fee' },
    classes:            { icon: '🏫', label: 'Manage Classes' },
    fee_heads:          { icon: '⚙️', label: 'Fee Configuration' },
    access_control:     { icon: '🔐', label: 'Access Control' },
    attendance:         { icon: '📅', label: 'Attendance System' },
    monitoring:         { icon: '📈', label: 'Monitoring System' }
};

const PAGE_KEYS = Object.keys(PAGE_LABELS);

let allRoles = [];
let allPermissions = [];  // flat array from DB
let pendingChanges = {};  // track unsaved toggle changes

// ─── Boot ─────────────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', async () => {
    // Wait for auth to be ready
    await waitForAuth();

    // Only admin can use this page (enforced by auth.js, but double-check)
    if (userRoleName !== 'admin') {
        window.location.href = 'dashboard.html?denied=1';
        return;
    }

    // Tab switching
    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
            document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
            btn.classList.add('active');
            document.getElementById('tab-' + btn.dataset.tab).classList.add('active');
        });
    });

    // Load data
    await loadRolesAndPermissions();
    await loadUsers();

    // Save button
    document.getElementById('btnSavePerms').addEventListener('click', savePermissions);

    // Add user button
    document.getElementById('btnAddUser').addEventListener('click', addNewUser);
});

// Wait for auth.js to finish
function waitForAuth() {
    return new Promise(resolve => {
        const check = () => {
            if (window.authReady) {
                resolve();
            } else {
                setTimeout(check, 100);
            }
        };
        check();
    });
}

// ─── Load Roles & Permissions ─────────────────────────────────────────────────
async function loadRolesAndPermissions() {
    try {
        // Fetch roles
        const { data: roles, error: rErr } = await supabaseClient
            .from('roles')
            .select('*')
            .order('role_name');
        if (rErr) throw rErr;
        allRoles = roles;

        // Fetch all permissions
        const { data: perms, error: pErr } = await supabaseClient
            .from('permissions')
            .select('*');
        if (pErr) throw pErr;
        allPermissions = perms;

        // Render the matrix
        renderPermissionsMatrix();

        // Populate role dropdown in user form (HIDE ADMIN)
        const roleSelect = document.getElementById('newUserRole');
        roleSelect.innerHTML = allRoles
            .filter(r => r.role_name !== 'admin')
            .map(r => `<option value="${r.id}">${r.role_name.replace('_', ' ').toUpperCase()}</option>`)
            .join('');

    } catch (err) {
        console.error('Load error:', err);
        document.getElementById('permissionsContainer').innerHTML =
            `<p style="color:red;">Error loading permissions: ${err.message}</p>`;
    }
}

// ─── Render Permissions Matrix ────────────────────────────────────────────────
function renderPermissionsMatrix() {
    const container = document.getElementById('permissionsContainer');
    container.innerHTML = '';
    pendingChanges = {};

    // Do NOT render the matrix card for "admin" (supreme power)
    allRoles.filter(role => role.role_name !== 'admin').forEach(role => {
        const badgeClass = role.role_name;
        const card = document.createElement('div');
        card.className = 'perm-card';
        card.innerHTML = `
            <h3>
                <span class="role-badge ${badgeClass}">${role.role_name.replace('_', ' ').toUpperCase()}</span>
                ${role.description || ''}
            </h3>
            <table class="perm-table">
                <thead>
                    <tr>
                        <th style="width:30%;">Page / Module</th>
                        <th>👁️ View</th>
                        <th>➕ Create</th>
                        <th>✏️ Edit</th>
                        <th>🗑️ Delete</th>
                    </tr>
                </thead>
                <tbody>
                    ${PAGE_KEYS.map(pageKey => {
                        const perm = allPermissions.find(p => p.role_id === role.id && p.page_key === pageKey);
                        const meta = PAGE_LABELS[pageKey];
                        return `
                            <tr>
                                <td><span class="page-icon">${meta.icon}</span> ${meta.label}</td>
                                ${['can_view', 'can_create', 'can_edit', 'can_delete'].map(action => `
                                    <td>
                                        <label class="toggle">
                                            <input type="checkbox" 
                                                data-role="${role.id}" 
                                                data-page="${pageKey}" 
                                                data-action="${action}"
                                                ${perm && perm[action] ? 'checked' : ''}
                                            >
                                            <span class="toggle-slider"></span>
                                        </label>
                                    </td>
                                `).join('')}
                            </tr>
                        `;
                    }).join('')}
                </tbody>
            </table>
        `;
        container.appendChild(card);
    });

    // Track changes
    container.querySelectorAll('input[type="checkbox"]').forEach(cb => {
        cb.addEventListener('change', () => {
            const key = `${cb.dataset.role}|${cb.dataset.page}|${cb.dataset.action}`;
            pendingChanges[key] = {
                role_id: cb.dataset.role,
                page_key: cb.dataset.page,
                action: cb.dataset.action,
                value: cb.checked
            };
            document.getElementById('btnSavePerms').disabled = false;
        });
    });
}

// ─── Save Permissions ─────────────────────────────────────────────────────────
async function savePermissions() {
    const btn = document.getElementById('btnSavePerms');
    btn.disabled = true;
    btn.textContent = '⏳ Saving...';

    try {
        // Group changes by (role_id, page_key)
        const groupedUpdates = {};
        for (const change of Object.values(pendingChanges)) {
            const key = `${change.role_id}|${change.page_key}`;
            if (!groupedUpdates[key]) {
                groupedUpdates[key] = { role_id: change.role_id, page_key: change.page_key };
            }
            groupedUpdates[key][change.action] = change.value;
        }

        // Upsert each group
        for (const update of Object.values(groupedUpdates)) {
            const { role_id, page_key, ...fields } = update;

            // Check if permission row exists
            const existing = allPermissions.find(p => p.role_id === role_id && p.page_key === page_key);

            if (existing) {
                const { error } = await supabaseClient
                    .from('permissions')
                    .update(fields)
                    .eq('id', existing.id);
                if (error) throw error;
            } else {
                // Insert new permission row with defaults
                const newRow = {
                    role_id, page_key,
                    can_view: false, can_create: false, can_edit: false, can_delete: false,
                    ...fields
                };
                const { error } = await supabaseClient
                    .from('permissions')
                    .insert(newRow);
                if (error) throw error;
            }
        }

        pendingChanges = {};
        showToast('✅ Permissions saved successfully!', 'success');

        // Reload fresh data
        await loadRolesAndPermissions();

    } catch (err) {
        console.error('Save error:', err);
        showToast('❌ Error saving: ' + err.message, 'error');
    } finally {
        btn.textContent = '💾 Save All Changes';
        btn.disabled = true;
    }
}

// ─── Load Users ───────────────────────────────────────────────────────────────
async function loadUsers() {
    const container = document.getElementById('usersContainer');
    try {
        // Fetch user_roles with role info, name, and email
        const { data: userRoles, error } = await supabaseClient
            .from('user_roles')
            .select('id, user_id, full_name, email, role_id, roles(role_name)');
        if (error) throw error;

        if (!userRoles || userRoles.length === 0) {
            container.innerHTML = '<p style="color:#94a3b8; text-align:center; padding:2rem;">No users registered yet.</p>';
            return;
        }

        container.innerHTML = '';
        for (const ur of userRoles) {
            const rObj = Array.isArray(ur.roles) ? ur.roles[0] : ur.roles;
            const rName = rObj ? rObj.role_name : 'Unknown';
            const rChar = (ur.full_name ? ur.full_name : rName).charAt(0).toUpperCase();

            // Display Full Name. Fallback to Email. Fallback to UUID.
            const displayName = ur.full_name || 'Unnamed User';
            const displayEmail = ur.email || ur.user_id.substring(0, 8) + '...';

            const row = document.createElement('div');
            row.className = 'user-row';
            row.innerHTML = `
                <div class="user-avatar">${rChar}</div>
                <div class="user-info">
                    <strong>${displayName} <span style="font-weight:normal; color:#64748b; font-size:0.8rem;">(${displayEmail})</span></strong>
                    <small>Role: ${rName.replace('_', ' ').toUpperCase()}</small>
                </div>
                ${rName === 'admin' 
                    ? '<div style="font-size:0.8rem; font-weight:800; color:#2563eb; padding:0.5rem 1rem; border-radius:8px; background:#eff6ff;">SUPREME ADMIN</div>'
                    : `<select class="role-select" data-ur-id="${ur.id}" data-user-id="${ur.user_id}">
                        ${allRoles.filter(r => r.role_name !== 'admin').map(r => `<option value="${r.id}" ${r.id === ur.role_id ? 'selected' : ''}>${r.role_name.replace('_', ' ').toUpperCase()}</option>`).join('')}
                       </select>`
                }
            `;
            
            const sel = row.querySelector('.role-select');
            if(sel) {
                sel.addEventListener('change', async (e) => {
                    try {
                        const { error } = await supabaseClient
                            .from('user_roles')
                            .update({ role_id: e.target.value })
                            .eq('id', ur.id);
                        if (error) throw error;
                        showToast('✅ Role updated!', 'success');
                        await loadUsers();
                    } catch (err) {
                        showToast('❌ Error: ' + err.message, 'error');
                    }
                });
            } // Close if(sel)
            
            container.appendChild(row);
        }

    } catch (err) {
        container.innerHTML = `<p style="color:red;">Error: ${err.message}</p>`;
    }
}

// ─── Add New User ─────────────────────────────────────────────────────────────
async function addNewUser() {
    const fullName = document.getElementById('newUserName').value.trim();
    const email = document.getElementById('newUserEmail').value.trim();
    const password = document.getElementById('newUserPassword').value;
    const roleId = document.getElementById('newUserRole').value;
    const btn = document.getElementById('btnAddUser');

    if (!fullName || !email || !password) {
        showToast('⚠️ Please enter Name, Email, and Password.', 'error');
        return;
    }
    if (password.length < 6) {
        showToast('⚠️ Password must be at least 6 characters.', 'error');
        return;
    }

    btn.disabled = true;
    btn.textContent = '⏳ Creating...';

    try {
        // Create user via Supabase Auth Admin API
        // NOTE: For client-side, we use signUp (this logs the new user in on their first visit)
        // In production, you'd use a server-side admin API
        const { data: signUpData, error: signUpError } = await supabaseClient.auth.signUp({
            email,
            password
        });

        if (signUpError) throw signUpError;
        if (!signUpData.user) throw new Error('User creation failed.');

        // Assign role + Save Metadata
        const { error: roleError } = await supabaseClient
            .from('user_roles')
            .insert({ 
                user_id: signUpData.user.id, 
                role_id: roleId,
                full_name: fullName,
                email: email
            });

        if (roleError) throw roleError;

        showToast(`✅ User "${fullName}" created successfully!`, 'success');

        // Clear form
        document.getElementById('newUserName').value = '';
        document.getElementById('newUserEmail').value = '';
        document.getElementById('newUserPassword').value = '';

        // Refresh users list
        await loadUsers();

    } catch (err) {
        console.error('User creation error:', err);
        showToast('❌ ' + err.message, 'error');
    } finally {
        btn.disabled = false;
        btn.textContent = 'Create User';
    }
}

// ─── Toast Notification ───────────────────────────────────────────────────────
function showToast(message, type) {
    const toast = document.getElementById('alertToast');
    toast.textContent = message;
    toast.className = `alert-toast ${type}`;
    toast.style.display = 'block';
    setTimeout(() => {
        toast.style.display = 'none';
    }, 4000);
}
