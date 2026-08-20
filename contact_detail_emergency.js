window.onAppReady(async () => {
    const body = document.getElementById('contactBody');
    const searchInput = document.getElementById('contactSearch');
    const classSelect = document.getElementById('contactClass');
    const medicalFilter = document.getElementById('medicalFilter');
    const fontRange = document.getElementById('fontSizeRange');
    const compactRange = document.getElementById('compactnessRange');
    let students = [];
    let visibleStudents = [];
    let classOrder = {};

    const esc = value => String(value ?? '').replace(/[&<>"']/g, character => ({
        '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;'
    }[character]));

    function parseContactMeta(value) {
        try {
            const parsed = JSON.parse(String(value || ''));
            if (parsed?.type === 'admission_contacts_v1') return parsed;
        } catch (_) {}
        return { type:'admission_contacts_v1', primary_mobile_source:'fatherMobile', whatsapp_source:'fatherWhatsapp', father_mobile_2:null, mother_mobile_2:null };
    }

    function sourceDetails(student, kind) {
        const meta = parseContactMeta(student.campus);
        const source = kind === 'mobile' ? (meta.primary_mobile_source || 'fatherMobile') : (meta.whatsapp_source || 'fatherWhatsapp');
        const values = {
            fatherMobile: student.father_mobile,
            fatherMobile2: meta.father_mobile_2,
            fatherWhatsapp: student.father_whatsapp,
            motherMobile: student.mother_mobile,
            motherMobile2: meta.mother_mobile_2,
            guardianContact: student.guardian_contact
        };
        return { source, value: values[source] || '' };
    }

    function editable(value, id, column, metaKey = '') {
        return `<span class="editable-field" contenteditable="true" spellcheck="false" data-id="${esc(id)}" data-column="${esc(column)}" data-meta-key="${esc(metaKey)}">${esc(value || '')}</span>`;
    }

    function normalizePhone(value) {
        return String(value || '').replace(/[\s\-]/g, '');
    }

    function whatsappUrl(value) {
        let phone = String(value || '').replace(/\D/g, '');
        if (phone.startsWith('0') && phone.length === 11) phone = `92${phone.slice(1)}`;
        return phone ? `https://wa.me/${phone}` : '';
    }

    function hasMedicalAlert(value) {
        const text = String(value || '').trim().toLowerCase();
        return Boolean(text && !['none', 'no', 'nil', 'n/a', 'na', '\u2014'].includes(text));
    }

    function showToast(message, error = false) {
        const toast = document.getElementById('contactToast');
        toast.textContent = message;
        toast.classList.toggle('error', error);
        toast.style.display = 'block';
        clearTimeout(showToast.timer);
        showToast.timer = setTimeout(() => { toast.style.display = 'none'; }, 2800);
    }

    function applyLayout() {
        const font = Number(fontRange.value || 11);
        const compact = Number(compactRange.value || 65);
        const vertical = Math.max(2, 8 - compact * .055);
        const horizontal = Math.max(3, 9 - compact * .05);
        document.documentElement.style.setProperty('--table-font-size', `${font}px`);
        document.documentElement.style.setProperty('--table-td-pad', `${vertical.toFixed(1)}px ${horizontal.toFixed(1)}px`);
        document.documentElement.style.setProperty('--table-th-pad', `${Math.max(2.5, vertical + 1).toFixed(1)}px ${horizontal.toFixed(1)}px`);
        document.documentElement.style.setProperty('--print-font-size', `${Math.max(7, font - 1.5).toFixed(1)}px`);
        document.documentElement.style.setProperty('--print-td-pad', `${Math.max(1, vertical - 1.5).toFixed(1)}px 2px`);
        document.documentElement.style.setProperty('--print-th-pad', `${Math.max(1.5, vertical - 1).toFixed(1)}px 2px`);
        document.getElementById('fontSizeValue').textContent = `${font}px`;
        document.getElementById('compactnessValue').textContent = `${compact}%`;
    }

    async function loadData() {
        if (!window.currentSchoolId) {
            body.innerHTML = '<tr><td colspan="13" class="empty">School could not be identified.</td></tr>';
            return;
        }
        body.innerHTML = '<tr><td colspan="13" class="empty">Loading contact details...</td></tr>';
        const [studentResult, classResult] = await Promise.all([
            window.supabaseClient.from('admissions').select('id, roll_number, full_name, applying_for_class, father_name, father_mobile, father_whatsapp, mother_name, mother_mobile, guardian_name, guardian_rel, guardian_contact, home_address, medical_condition, campus').eq('school_id', window.currentSchoolId).eq('status', 'Active'),
            window.supabaseClient.from('classes').select('class_name, section, display_order').eq('school_id', window.currentSchoolId).eq('is_active', true).order('display_order', { ascending:true })
        ]);
        if (studentResult.error) {
            body.innerHTML = `<tr><td colspan="13" class="empty">Could not load students: ${esc(studentResult.error.message)}</td></tr>`;
            return;
        }
        if (classResult.error) console.warn('Could not load class order:', classResult.error);
        classOrder = {};
        const classes = [];
        (classResult.data || []).forEach((item, index) => {
            const name = `${item.class_name || ''} ${item.section || ''}`.trim();
            if (!name) return;
            classOrder[name] = Number(item.display_order ?? index);
            if (!classes.includes(name)) classes.push(name);
        });
        classSelect.innerHTML = '<option value="">All Classes</option>' + classes.map(name => `<option value="${esc(name)}">${esc(name)}</option>`).join('');
        students = studentResult.data || [];
        render();
    }

    function render() {
        const text = searchInput.value.trim().toLowerCase();
        const selectedClass = classSelect.value;
        const selectedMedical = medicalFilter.value;
        visibleStudents = students.filter(student => {
            if (selectedClass && student.applying_for_class !== selectedClass) return false;
            const medicalAlert = hasMedicalAlert(student.medical_condition);
            if (selectedMedical === 'alerts' && !medicalAlert) return false;
            if (selectedMedical === 'clear' && medicalAlert) return false;
            const meta = parseContactMeta(student.campus);
            if (!text) return true;
            return [student.roll_number, student.full_name, student.applying_for_class, student.father_name, student.father_mobile, student.father_whatsapp, meta.father_mobile_2, student.mother_name, student.mother_mobile, meta.mother_mobile_2, student.guardian_name, student.guardian_contact, student.home_address, student.medical_condition]
                .filter(Boolean).join(' ').toLowerCase().includes(text);
        }).sort((a, b) => {
            const orderA = classOrder[a.applying_for_class] ?? 9999;
            const orderB = classOrder[b.applying_for_class] ?? 9999;
            if (orderA !== orderB) return orderA - orderB;
            return String(a.roll_number || '').localeCompare(String(b.roll_number || ''), undefined, { numeric:true, sensitivity:'base' });
        });

        document.getElementById('contactCount').textContent = visibleStudents.length.toLocaleString();
        document.getElementById('medicalCount').textContent = visibleStudents.filter(item => hasMedicalAlert(item.medical_condition)).length.toLocaleString();
        document.getElementById('missingCount').textContent = visibleStudents.filter(item => !sourceDetails(item, 'mobile').value).length.toLocaleString();
        const printed = new Date().toLocaleString('en-PK', { dateStyle:'medium', timeStyle:'short', hour12:true, timeZone:'Asia/Karachi' });
        const medicalLabel = selectedMedical === 'alerts' ? 'Medical Alerts Only' : (selectedMedical === 'clear' ? 'No Medical Alert' : 'All Medical Records');
        document.getElementById('contactPrintHeader').textContent = `${window.currentSchoolName || 'School'} — Contact Detail and Emergency | Class: ${selectedClass || 'All Classes'} | ${medicalLabel} | Students: ${visibleStudents.length} | Printed: ${printed}`;

        if (!visibleStudents.length) {
            body.innerHTML = '<tr><td colspan="13" class="empty">No active students match the selected filters.</td></tr>';
            return;
        }

        body.innerHTML = visibleStudents.map(student => {
            const meta = parseContactMeta(student.campus);
            const primary = sourceDetails(student, 'mobile');
            const whatsapp = sourceDetails(student, 'whatsapp');
            const waUrl = whatsappUrl(whatsapp.value);
            const medicalAlert = hasMedicalAlert(student.medical_condition);
            return `<tr>
                <td><strong>${esc(student.roll_number || '\u2014')}</strong></td>
                <td class="student-cell"><strong>${esc(student.full_name || '\u2014')}</strong></td>
                <td class="class-name">${esc(student.applying_for_class || '\u2014')}</td>
                <td class="medical-cell${medicalAlert ? '' : ' clear'}">${esc(student.medical_condition || '\u2014')}</td>
                <td><strong>${esc(student.father_name || '\u2014')}</strong></td>
                <td><div class="contact-lines"><div class="contact-line"><span class="contact-label">M1</span>${editable(student.father_mobile, student.id, 'father_mobile')}</div><div class="contact-line"><span class="contact-label">M2</span>${editable(meta.father_mobile_2, student.id, 'campus', 'father_mobile_2')}</div><div class="contact-line"><span class="contact-label">WA</span>${editable(student.father_whatsapp, student.id, 'father_whatsapp')}</div></div></td>
                <td><strong>${esc(student.mother_name || '\u2014')}</strong></td>
                <td><div class="contact-lines"><div class="contact-line"><span class="contact-label">M1</span>${editable(student.mother_mobile, student.id, 'mother_mobile')}</div><div class="contact-line"><span class="contact-label">M2</span>${editable(meta.mother_mobile_2, student.id, 'campus', 'mother_mobile_2')}</div></div></td>
                <td><strong>${esc(student.guardian_name || '\u2014')}</strong><span class="subtext">${esc(student.guardian_rel || '')}</span></td>
                <td>${editable(student.guardian_contact, student.id, 'guardian_contact')}</td>
                <td class="primary-contact">${esc(primary.value || '\u2014')}</td>
                <td class="whatsapp-contact">${esc(whatsapp.value || '\u2014')}${waUrl ? `<a class="wa-open" href="${waUrl}" target="_blank" title="Open WhatsApp"><i class="fab fa-whatsapp"></i></a>` : ''}</td>
                <td class="address-cell">${esc(student.home_address || '\u2014')}</td>
            </tr>`;
        }).join('');
    }

    body.addEventListener('focusin', event => {
        const field = event.target.closest('.editable-field');
        if (field) field.dataset.original = field.innerText.trim();
    });

    body.addEventListener('keydown', event => {
        const field = event.target.closest('.editable-field');
        if (field && event.key === 'Enter') { event.preventDefault(); field.blur(); }
    });

    body.addEventListener('focusout', async event => {
        const field = event.target.closest('.editable-field');
        if (!field) return;
        let value = field.innerText.trim();
        if (['father_mobile','father_whatsapp','mother_mobile','guardian_contact','campus'].includes(field.dataset.column)) value = normalizePhone(value);
        field.innerText = value;
        if (value === (field.dataset.original || '')) return;
        const student = students.find(item => String(item.id) === String(field.dataset.id));
        if (!student) return;
        field.classList.add('saving');
        const update = { updated_at:new Date().toISOString() };
        if (field.dataset.column === 'campus') {
            const meta = parseContactMeta(student.campus);
            meta[field.dataset.metaKey] = value || null;
            update.campus = JSON.stringify(meta);
        } else {
            update[field.dataset.column] = value || null;
        }
        const { error } = await window.supabaseClient.from('admissions').update(update).eq('id', student.id).eq('school_id', window.currentSchoolId);
        field.classList.remove('saving');
        if (error) {
            field.innerText = field.dataset.original || '';
            showToast(`Could not save: ${error.message}`, true);
            return;
        }
        Object.assign(student, update);
        field.classList.add('saved');
        setTimeout(() => field.classList.remove('saved'), 700);
        showToast('Contact detail saved.');
        render();
    });

    searchInput.addEventListener('input', render);
    classSelect.addEventListener('change', render);
    medicalFilter.addEventListener('change', render);
    document.getElementById('refreshContacts').addEventListener('click', loadData);
    document.getElementById('printContacts').addEventListener('click', () => { applyLayout(); render(); window.print(); });
    fontRange.addEventListener('input', applyLayout);
    compactRange.addEventListener('input', applyLayout);
    fontRange.addEventListener('change', () => localStorage.setItem('contactEmergency.fontSize', fontRange.value));
    compactRange.addEventListener('change', () => localStorage.setItem('contactEmergency.compactness', compactRange.value));
    fontRange.value = localStorage.getItem('contactEmergency.fontSize') || '11';
    compactRange.value = localStorage.getItem('contactEmergency.compactness') || '65';
    applyLayout();
    await loadData();
});
