const saasDirectory = { schools: [], roles: [], campuses: [], users: [] };
let editingSaasSchoolId = null;

window.onAppReady(async () => {
    if (!await window.SaasAdmin.ready('users')) return;

    document.getElementById('registerSchoolForm').addEventListener('submit', registerSchool);
    document.getElementById('createAdminForm').addEventListener('submit', createSchoolAdmin);
    document.getElementById('campusForm').addEventListener('submit', addCampus);
    document.getElementById('campusSchoolSelect').addEventListener('change', renderSelectedSchoolCampuses);
    document.getElementById('btnRefreshSchools').addEventListener('click', refreshDirectory);
    document.getElementById('btnRefreshUsers').addEventListener('click', refreshDirectory);
    await refreshDirectory();
});

async function registerSchool(event) {
    event.preventDefault();
    const form = event.currentTarget;
    const name = document.getElementById('schoolName').value.trim();
    const maxStudents = Number.parseInt(document.getElementById('schoolMaxStudents').value, 10);
    const monthlyFee = Number.parseFloat(document.getElementById('schoolFee').value);
    const button = document.getElementById('btnRegisterSchool');

    if (!name) return window.SaasAdmin.toast('School name is required.', 'error');
    if (!Number.isInteger(maxStudents) || maxStudents < 1) return window.SaasAdmin.toast('Max Students must be a positive number.', 'error');
    if (!Number.isFinite(monthlyFee) || monthlyFee < 0) return window.SaasAdmin.toast('Monthly fee cannot be negative.', 'error');

    button.disabled = true;
    button.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Creating School...';
    try {
        const { data: school, error } = await window.supabaseClient.from('schools').insert({
            school_name: name,
            city: document.getElementById('schoolCity').value.trim() || null,
            whatsapp: document.getElementById('schoolWhatsapp').value.trim() || null,
            max_students: maxStudents,
            monthly_fee: monthlyFee,
            is_active: true
        }).select('id, school_name').single();
        if (error) throw error;

        const { data: insertedCampus, error: campusError } = await window.supabaseClient.from('campuses').insert({
            school_id: school.id,
            campus_name: 'Main Campus',
            campus_code: 'MAIN',
            is_active: true
        }).select('id').single();
        if (campusError && !String(campusError.message || '').toLowerCase().includes('duplicate')) throw campusError;

        let mainCampus = insertedCampus;
        if (!mainCampus?.id) {
            const { data: existingCampus } = await window.supabaseClient
                .from('campuses')
                .select('id')
                .eq('school_id', school.id)
                .eq('campus_name', 'Main Campus')
                .maybeSingle();
            mainCampus = existingCampus;
        }

        const defaultFeeTypes = [
            'Monthly Fee', 'Exam Fee', 'Transport Fee', 'Book Fee',
            'Uniform Fee', 'Admission Fee', 'Late Payment Fee', 'Other'
        ].map(typeName => ({
            school_id: school.id,
            campus_id: mainCampus?.id || null,
            name: typeName,
            created_by: window.currentUser?.id || null
        }));
        const { error: feeTypesError } = await window.supabaseClient
            .from('fee_head_types')
            .upsert(defaultFeeTypes, { onConflict: 'school_id,name', ignoreDuplicates: true });
        if (feeTypesError) console.warn('School created, but default fee types could not be added:', feeTypesError.message);

        form.reset();
        document.getElementById('schoolMaxStudents').value = '100';
        document.getElementById('schoolFee').value = '0';
        window.SaasAdmin.toast(`${school.school_name} was registered successfully.`, 'success');
        await refreshDirectory();
    } catch (error) {
        window.SaasAdmin.toast('Could not register school: ' + (error.message || 'Unknown error'), 'error');
    } finally {
        button.disabled = false;
        button.innerHTML = '<i class="fas fa-school"></i> Create School';
    }
}

async function refreshDirectory() {
    const refreshButton = document.getElementById('btnRefreshUsers');
    if (refreshButton) refreshButton.disabled = true;
    try {
        const [schoolsResult, rolesResult, campusesResult, usersResult] = await Promise.all([
            window.supabaseClient.from('schools').select('id, school_name, city, whatsapp, max_students, monthly_fee, is_active').order('school_name'),
            window.supabaseClient.from('roles').select('id, role_name').order('role_name'),
            window.supabaseClient.from('campuses').select('id, school_id, campus_name, campus_code, is_active').order('campus_name'),
            window.supabaseClient.from('user_roles')
                .select('id, user_id, email, full_name, role_id, school_id, campus_id, schools(school_name), roles(role_name), campuses(campus_name)')
                .order('email')
        ]);

        for (const result of [schoolsResult, rolesResult, campusesResult, usersResult]) {
            if (result.error) throw result.error;
        }
        saasDirectory.schools = schoolsResult.data || [];
        saasDirectory.roles = rolesResult.data || [];
        saasDirectory.campuses = campusesResult.data || [];
        saasDirectory.users = usersResult.data || [];
        populateSchoolSelectors();
        renderSchools();
        renderSelectedSchoolCampuses();
        renderUsers();
    } catch (error) {
        window.SaasAdmin.toast('Could not load SAAS directory: ' + (error.message || 'Unknown error'), 'error');
    } finally {
        if (refreshButton) refreshButton.disabled = false;
    }
}

function renderSchools() {
    const list = document.getElementById('schoolsList');
    const count = document.getElementById('schoolCount');
    count.textContent = `${saasDirectory.schools.length} school${saasDirectory.schools.length === 1 ? '' : 's'}`;
    if (!saasDirectory.schools.length) {
        list.innerHTML = '<tr><td class="saas-empty" colspan="7">No schools registered.</td></tr>';
        return;
    }

    list.innerHTML = saasDirectory.schools.map(school => {
        const isCurrentSchool = school.id === window.currentSchoolId;
        const isEditing = school.id === editingSaasSchoolId;
        const whatsappDigits = String(school.whatsapp || '').replace(/[^0-9]/g, '');
        if (isEditing) {
            return `<tr style="background:#eff6ff;">
                <td><input class="saas-input" id="editSchoolName" value="${window.SaasAdmin.escapeHtml(school.school_name)}" aria-label="School name"></td>
                <td><input class="saas-input" id="editSchoolCity" value="${window.SaasAdmin.escapeHtml(school.city || '')}" aria-label="City"></td>
                <td><input class="saas-input" id="editSchoolWhatsapp" value="${window.SaasAdmin.escapeHtml(school.whatsapp || '')}" aria-label="WhatsApp number"></td>
                <td><input class="saas-input" id="editSchoolMaxStudents" type="number" min="1" step="1" value="${Number(school.max_students || 1)}" aria-label="Maximum students"></td>
                <td><input class="saas-input" id="editSchoolMonthlyFee" type="number" min="0" step="1" value="${Number(school.monthly_fee || 0)}" aria-label="Monthly subscription fee"></td>
                <td><span class="saas-badge ${school.is_active ? 'active' : 'inactive'}"><i class="fas ${school.is_active ? 'fa-circle-check' : 'fa-circle-xmark'}"></i> ${school.is_active ? 'Active' : 'Suspended'}</span></td>
                <td style="text-align:right;white-space:nowrap;">
                    <button class="saas-btn success" id="btnSaveSchoolEdit" onclick="saveSaasSchool('${school.id}')"><i class="fas fa-check"></i> Save</button>
                    <button class="saas-btn" onclick="cancelSaasSchoolEdit()"><i class="fas fa-xmark"></i> Cancel</button>
                </td>
            </tr>`;
        }
        return `<tr>
            <td><strong>${window.SaasAdmin.escapeHtml(school.school_name)}</strong></td>
            <td>${window.SaasAdmin.escapeHtml(school.city || '—')}</td>
            <td>${school.whatsapp ? `<a href="https://wa.me/${whatsappDigits}" target="_blank" rel="noopener" style="color:#15803d;font-weight:700;text-decoration:none;"><i class="fab fa-whatsapp"></i> ${window.SaasAdmin.escapeHtml(school.whatsapp)}</a>` : '—'}</td>
            <td><strong>${Number(school.max_students || 0).toLocaleString()}</strong></td>
            <td><strong style="color:#d97706;">Rs ${Number(school.monthly_fee || 0).toLocaleString()}</strong></td>
            <td><span class="saas-badge ${school.is_active ? 'active' : 'inactive'}"><i class="fas ${school.is_active ? 'fa-circle-check' : 'fa-circle-xmark'}"></i> ${school.is_active ? 'Active' : 'Suspended'}</span></td>
            <td style="text-align:right;white-space:nowrap;">
                <button class="saas-btn" onclick="editSaasSchool('${school.id}')"><i class="fas fa-pen"></i> Edit</button>
                ${isCurrentSchool
                    ? '<span class="saas-badge active"><i class="fas fa-lock"></i> Current School</span>'
                    : `<button class="saas-btn danger" onclick="deleteSaasSchool('${school.id}')"><i class="fas fa-trash-alt"></i> Delete</button>`}
            </td>
        </tr>`;
    }).join('');
}

window.editSaasSchool = function (schoolId) {
    if (!saasDirectory.schools.some(school => school.id === schoolId)) return;
    editingSaasSchoolId = schoolId;
    renderSchools();
    document.getElementById('editSchoolName')?.focus();
};

window.cancelSaasSchoolEdit = function () {
    editingSaasSchoolId = null;
    renderSchools();
};

window.saveSaasSchool = async function (schoolId) {
    const school = saasDirectory.schools.find(item => item.id === schoolId);
    if (!school || editingSaasSchoolId !== schoolId) return;

    const schoolName = document.getElementById('editSchoolName')?.value.trim() || '';
    const maxStudents = Number.parseInt(document.getElementById('editSchoolMaxStudents')?.value, 10);
    const monthlyFee = Number.parseFloat(document.getElementById('editSchoolMonthlyFee')?.value);
    if (!schoolName) return window.SaasAdmin.toast('School name is required.', 'error');
    if (!Number.isInteger(maxStudents) || maxStudents < 1) return window.SaasAdmin.toast('Max Students must be a positive number.', 'error');
    if (!Number.isFinite(monthlyFee) || monthlyFee < 0) return window.SaasAdmin.toast('Monthly fee cannot be negative.', 'error');

    const button = document.getElementById('btnSaveSchoolEdit');
    if (button) {
        button.disabled = true;
        button.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Saving';
    }

    try {
        const { error } = await window.supabaseClient
            .from('schools')
            .update({
                school_name: schoolName,
                city: document.getElementById('editSchoolCity')?.value.trim() || null,
                whatsapp: document.getElementById('editSchoolWhatsapp')?.value.trim() || null,
                max_students: maxStudents,
                monthly_fee: monthlyFee
            })
            .eq('id', schoolId);
        if (error) throw error;

        editingSaasSchoolId = null;
        window.SaasAdmin.toast(`School updated to “${schoolName}”. All existing data remains attached.`, 'success');
        await refreshDirectory();
    } catch (error) {
        window.SaasAdmin.toast('Could not update school: ' + (error.message || 'Unknown error'), 'error');
        if (button) {
            button.disabled = false;
            button.innerHTML = '<i class="fas fa-check"></i> Save';
        }
    }
};

window.deleteSaasSchool = async function (schoolId) {
    const school = saasDirectory.schools.find(item => item.id === schoolId);
    if (!school) return;
    if (school.id === window.currentSchoolId) {
        window.SaasAdmin.toast('The school assigned to your current Super Admin account cannot be deleted.', 'error');
        return;
    }

    const typedName = window.prompt(`PERMANENT DELETE\n\nThis removes "${school.school_name}" and all associated campuses and school data.\n\nType the exact school name to continue:`);
    if (typedName === null) return;
    if (typedName.trim() !== school.school_name) {
        window.SaasAdmin.toast('School name did not match. Nothing was deleted.', 'error');
        return;
    }
    if (!window.confirm(`Final confirmation: permanently delete ${school.school_name}? This cannot be undone.`)) return;

    try {
        const { error } = await window.supabaseClient.from('schools').delete().eq('id', school.id);
        if (error) throw error;
        window.SaasAdmin.toast(`${school.school_name} was permanently deleted.`, 'success');
        await refreshDirectory();
    } catch (error) {
        window.SaasAdmin.toast('Could not delete school: ' + (error.message || 'Unknown error'), 'error');
    }
};

function populateSchoolSelectors() {
    ['newAdminSchool', 'campusSchoolSelect'].forEach(id => {
        const select = document.getElementById(id);
        const selectedValue = select.value;
        select.innerHTML = '';
        saasDirectory.schools.forEach(school => {
            const option = document.createElement('option');
            option.value = school.id;
            option.textContent = `${school.school_name}${school.is_active ? '' : ' (Suspended)'}`;
            select.appendChild(option);
        });
        if (saasDirectory.schools.some(school => school.id === selectedValue)) select.value = selectedValue;
        if (!saasDirectory.schools.length) select.innerHTML = '<option value="">No schools available</option>';
    });
}

function renderSelectedSchoolCampuses() {
    const schoolId = document.getElementById('campusSchoolSelect').value;
    const rows = saasDirectory.campuses.filter(campus => campus.school_id === schoolId);
    const list = document.getElementById('campusesList');
    if (!rows.length) {
        list.innerHTML = '<tr><td class="saas-empty" colspan="4">No campuses found for this school.</td></tr>';
        return;
    }
    list.innerHTML = rows.map(campus => `
        <tr>
            <td><strong>${window.SaasAdmin.escapeHtml(campus.campus_name)}</strong></td>
            <td>${window.SaasAdmin.escapeHtml(campus.campus_code || '—')}</td>
            <td><span class="saas-badge ${campus.is_active ? 'active' : 'inactive'}"><i class="fas ${campus.is_active ? 'fa-circle-check' : 'fa-circle-xmark'}"></i> ${campus.is_active ? 'Active' : 'Inactive'}</span></td>
            <td style="text-align:right;"><button class="saas-btn ${campus.is_active ? 'danger' : 'success'}" onclick="toggleSaasCampus('${campus.id}', ${!campus.is_active})"><i class="fas ${campus.is_active ? 'fa-ban' : 'fa-check'}"></i> ${campus.is_active ? 'Deactivate' : 'Activate'}</button></td>
        </tr>`).join('');
}

async function addCampus(event) {
    event.preventDefault();
    const schoolId = document.getElementById('campusSchoolSelect').value;
    const campusName = document.getElementById('campusName').value.trim();
    const campusCode = document.getElementById('campusCode').value.trim();
    const button = document.getElementById('btnAddCampus');
    if (!schoolId || !campusName) return window.SaasAdmin.toast('School and campus name are required.', 'error');

    button.disabled = true;
    try {
        const { error } = await window.supabaseClient.from('campuses').insert({
            school_id: schoolId,
            campus_name: campusName,
            campus_code: campusCode || null,
            is_active: true
        });
        if (error) throw error;
        document.getElementById('campusName').value = '';
        document.getElementById('campusCode').value = '';
        window.SaasAdmin.toast('Campus added successfully.', 'success');
        await refreshDirectory();
        document.getElementById('campusSchoolSelect').value = schoolId;
        renderSelectedSchoolCampuses();
    } catch (error) {
        window.SaasAdmin.toast('Could not add campus: ' + (error.message || 'Unknown error'), 'error');
    } finally {
        button.disabled = false;
    }
}

window.toggleSaasCampus = async function (campusId, nextStatus) {
    if (!window.confirm(`${nextStatus ? 'Activate' : 'Deactivate'} this campus?`)) return;
    try {
        const { error } = await window.supabaseClient.from('campuses').update({ is_active: nextStatus }).eq('id', campusId);
        if (error) throw error;
        window.SaasAdmin.toast(nextStatus ? 'Campus activated.' : 'Campus deactivated.', 'success');
        await refreshDirectory();
    } catch (error) {
        window.SaasAdmin.toast('Campus update failed: ' + (error.message || 'Unknown error'), 'error');
    }
};

async function createSchoolAdmin(event) {
    event.preventDefault();
    const form = event.currentTarget;
    const fullName = document.getElementById('newAdminName').value.trim();
    const email = document.getElementById('newAdminEmail').value.trim();
    const password = document.getElementById('newAdminPassword').value;
    const schoolId = document.getElementById('newAdminSchool').value;
    const adminRole = saasDirectory.roles.find(role => role.role_name === 'admin');
    const button = document.getElementById('btnCreateAdmin');

    if (!fullName || !email || !password || !schoolId) return window.SaasAdmin.toast('Complete all School Admin fields.', 'error');
    if (password.length < 6) return window.SaasAdmin.toast('Password must be at least 6 characters.', 'error');
    if (!adminRole) return window.SaasAdmin.toast('The ADMIN role was not found.', 'error');

    button.disabled = true;
    button.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Creating...';
    try {
        const { data: sessionData } = await window.supabaseClient.auth.getSession();
        const ownerSession = sessionData?.session;
        const { data: signUpData, error: signUpError } = await window.supabaseClient.auth.signUp({
            email,
            password,
            options: { data: { full_name: fullName } }
        });
        if (signUpError) throw signUpError;
        if (!signUpData?.user?.id) throw new Error('Authentication account was not created.');

        // signUp can switch the browser to the new account. Restore the Super Admin
        // before assigning the cross-school role.
        if (ownerSession?.access_token && ownerSession?.refresh_token) {
            await window.supabaseClient.auth.setSession({
                access_token: ownerSession.access_token,
                refresh_token: ownerSession.refresh_token
            });
        }

        const { error: roleError } = await window.supabaseClient.from('user_roles').upsert({
            user_id: signUpData.user.id,
            email,
            full_name: fullName,
            role_id: adminRole.id,
            school_id: schoolId,
            campus_id: null
        }, { onConflict: 'user_id' });
        if (roleError) throw roleError;

        form.reset();
        window.SaasAdmin.toast(`School Admin created for ${email}.`, 'success');
        await refreshDirectory();
    } catch (error) {
        window.SaasAdmin.toast('Could not create School Admin: ' + (error.message || 'Unknown error'), 'error');
    } finally {
        button.disabled = false;
        button.innerHTML = '<i class="fas fa-user-plus"></i> Create Admin';
    }
}

function relationValue(value) {
    return Array.isArray(value) ? value[0] : value;
}

function renderUsers() {
    const list = document.getElementById('usersList');
    document.getElementById('userCount').textContent = `${saasDirectory.users.length} user${saasDirectory.users.length === 1 ? '' : 's'}`;
    if (!saasDirectory.users.length) {
        list.innerHTML = '<tr><td class="saas-empty" colspan="5">No users found.</td></tr>';
        return;
    }

    list.innerHTML = saasDirectory.users.map(user => {
        const roleName = relationValue(user.roles)?.role_name || 'unknown';
        const campusName = relationValue(user.campuses)?.campus_name || 'All Campuses';
        const protectedUser = roleName === 'super_admin' || user.user_id === window.currentUser?.id;
        const initial = String(user.full_name || user.email || '?').charAt(0).toUpperCase();
        const schoolOptions = saasDirectory.schools.map(school => `<option value="${school.id}" ${user.school_id === school.id ? 'selected' : ''}>${window.SaasAdmin.escapeHtml(school.school_name)}</option>`).join('');
        const roleOptions = saasDirectory.roles.filter(role => role.role_name !== 'super_admin').map(role => `<option value="${role.id}" ${user.role_id === role.id ? 'selected' : ''}>${window.SaasAdmin.escapeHtml(role.role_name.replaceAll('_', ' ').toUpperCase())}</option>`).join('');
        const campusOptions = ['<option value="">All Campuses</option>'].concat(
            saasDirectory.campuses.filter(campus => campus.school_id === user.school_id && campus.is_active).map(campus => `<option value="${campus.id}" ${user.campus_id === campus.id ? 'selected' : ''}>${window.SaasAdmin.escapeHtml(campus.campus_name)}</option>`)
        ).join('');

        return `<tr>
            <td><div class="saas-user"><span class="saas-avatar">${window.SaasAdmin.escapeHtml(initial)}</span><div><strong>${window.SaasAdmin.escapeHtml(user.full_name || 'Unnamed')}</strong><small>${window.SaasAdmin.escapeHtml(user.email || user.user_id)}</small></div></div></td>
            <td>${protectedUser ? `<strong>${window.SaasAdmin.escapeHtml(relationValue(user.schools)?.school_name || 'System')}</strong>` : `<select onchange="updateSaasUser('${user.id}','school_id',this.value)"><option value="">Unassigned</option>${schoolOptions}</select>`}</td>
            <td>${protectedUser ? '<span class="saas-badge active"><i class="fas fa-crown"></i> SUPER ADMIN</span>' : `<select onchange="updateSaasUser('${user.id}','role_id',this.value)">${roleOptions}</select>`}</td>
            <td>${protectedUser ? '<span class="saas-badge active">All Access</span>' : `<select onchange="updateSaasUser('${user.id}','campus_id',this.value)">${campusOptions}</select><div style="margin-top:4px;color:#64748b;font-size:.68rem;">${window.SaasAdmin.escapeHtml(campusName)}</div>`}</td>
            <td style="text-align:right;">${protectedUser ? '<span class="saas-badge active"><i class="fas fa-lock"></i> Protected</span>' : `<button class="saas-btn danger" onclick="removeSaasUser('${user.id}')"><i class="fas fa-user-minus"></i> Remove</button>`}</td>
        </tr>`;
    }).join('');
}

window.updateSaasUser = async function (id, field, value) {
    try {
        const update = { [field]: value || null };
        if (field === 'school_id') update.campus_id = null;
        const { error } = await window.supabaseClient.from('user_roles').update(update).eq('id', id);
        if (error) throw error;
        window.SaasAdmin.toast('User assignment updated.', 'success');
        await refreshDirectory();
    } catch (error) {
        window.SaasAdmin.toast('User update failed: ' + (error.message || 'Unknown error'), 'error');
    }
};

window.removeSaasUser = async function (id) {
    const email = saasDirectory.users.find(user => user.id === id)?.email || '';
    if (!window.confirm(`Remove ${email || 'this user'} from the system? They will lose access.`)) return;
    try {
        const { error } = await window.supabaseClient.from('user_roles').delete().eq('id', id);
        if (error) throw error;
        window.SaasAdmin.toast('User access removed.', 'success');
        await refreshDirectory();
    } catch (error) {
        window.SaasAdmin.toast('Could not remove user: ' + (error.message || 'Unknown error'), 'error');
    }
};
