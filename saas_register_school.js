window.onAppReady(async () => {
    if (!await window.SaasAdmin.ready('register')) return;
    document.getElementById('registerSchoolForm').addEventListener('submit', registerSchool);
});

async function registerSchool(event) {
    event.preventDefault();
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

        const { error: campusError } = await window.supabaseClient.from('campuses').insert({
            school_id: school.id,
            campus_name: 'Main Campus',
            campus_code: 'MAIN',
            is_active: true
        });
        if (campusError && !String(campusError.message || '').toLowerCase().includes('duplicate')) throw campusError;

        event.currentTarget.reset();
        document.getElementById('schoolMaxStudents').value = '100';
        document.getElementById('schoolFee').value = '0';
        window.SaasAdmin.toast(`${school.school_name} was registered successfully.`, 'success');
    } catch (error) {
        window.SaasAdmin.toast('Could not register school: ' + (error.message || 'Unknown error'), 'error');
    } finally {
        button.disabled = false;
        button.innerHTML = '<i class="fas fa-school"></i> Create School';
    }
}
