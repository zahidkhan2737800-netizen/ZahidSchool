// Supabase client is now provided by auth.js (supabaseClient)

window.onAppReady(async () => {
    const studentsBody = document.getElementById('studentsBody');
    const searchQueryInput = document.getElementById('searchQuery');
    const searchClassSelect = document.getElementById('searchClass');
    const mobileNumberFilter = document.getElementById('mobileNumberFilter');
    const whatsappNumberFilter = document.getElementById('whatsappNumberFilter');
    const applySchoolScope = (query) => {
        const sid = window.currentSchoolId || null;
        return sid ? query.eq('school_id', sid) : query;
    };

    await waitForAuthContext();

    let allAvailableClasses = [];

    // Fetch instantly on load
    fetchClasses().then(fetchStudents);

    // Auto-search logic (Debounced to prevent spamming the database while typing)
    let debounceTimer;
    function handleSearchInput() {
        clearTimeout(debounceTimer);
        debounceTimer = setTimeout(() => {
            fetchStudents();
        }, 400); // Wait 400ms after last keystroke before querying
    }

    if (searchQueryInput) searchQueryInput.addEventListener('input', handleSearchInput);
    searchClassSelect.addEventListener('change', fetchStudents);
    mobileNumberFilter.addEventListener('change', fetchStudents);
    whatsappNumberFilter.addEventListener('change', fetchStudents);

    async function waitForAuthContext(timeoutMs = 10000) {
        const start = Date.now();
        while (Date.now() - start < timeoutMs) {
            if (window.authReady === true && window.supabaseClient) return;
            await new Promise(r => setTimeout(r, 80));
        }

        if ((window.currentSchoolId === null || window.currentSchoolId === undefined) && window.currentUser?.id) {
            const { data: roleData } = await supabaseClient
                .from('user_roles')
                .select('school_id')
                .eq('user_id', window.currentUser.id)
                .single();
            window.currentSchoolId = roleData?.school_id ?? null;
        }
    }

    async function fetchStudents() {
        studentsBody.innerHTML = '<tr><td colspan="10" class="empty-state">🔄 Fetching records...</td></tr>';
        
        try {
            // Start building the query
            let query = applySchoolScope(supabaseClient
                .from('admissions')
                .select('id, roll_number, full_name, father_name, father_mobile, father_whatsapp, whatsapp_group_status, admission_date, created_at, applying_for_class')
                .eq('status', 'Active')); // ALWAYS filter by Active status!

            // Apply exact filter: Class
            const searchClass = searchClassSelect.value;
            if (searchClass) {
                query = query.eq('applying_for_class', searchClass);
            }

            // Apply search query: Student Name OR Father Name OR Roll Number
            const searchQuery = searchQueryInput ? searchQueryInput.value.trim() : '';
            if (searchQuery) {
                const safeQuery = searchQuery.replace(/[,\(\)]/g, ' ').trim();
                query = query.or(`full_name.ilike.%${safeQuery}%,father_name.ilike.%${safeQuery}%,roll_number.eq.${safeQuery}`);
            }

            // Newly created student records always appear first. Admission date is
            // retained as a fallback/tie-breaker for older records.
            query = query
                .order('created_at', { ascending: false, nullsFirst: false })
                .order('admission_date', { ascending: false, nullsFirst: false });

            const { data, error } = await query;

            if (error) throw error;

            const filteredStudents = (data || []).filter(student => {
                const mobileValid = hasValid11DigitNumber(student.father_mobile);
                const whatsappValid = hasValid11DigitNumber(student.father_whatsapp);
                const mobileMatches = mobileNumberFilter.value === 'All'
                    || (mobileNumberFilter.value === 'Valid' ? mobileValid : !mobileValid);
                const whatsappMatches = whatsappNumberFilter.value === 'All'
                    || (whatsappNumberFilter.value === 'Valid' ? whatsappValid : !whatsappValid);
                return mobileMatches && whatsappMatches;
            });

            const classOrderMap = {};
            allAvailableClasses.forEach((cls, idx) => {
                classOrderMap[cls] = idx;
            });

            filteredStudents.sort((a, b) => {
                const orderA = classOrderMap[a.applying_for_class] ?? 999;
                const orderB = classOrderMap[b.applying_for_class] ?? 999;
                if (orderA !== orderB) return orderA - orderB;
                
                const rollA = parseInt(a.roll_number) || 999999;
                const rollB = parseInt(b.roll_number) || 999999;
                return rollA - rollB;
            });

            // Update Counter
            document.getElementById('totalActive').textContent = filteredStudents.length || 0;

            if (filteredStudents.length === 0) {
                studentsBody.innerHTML = '<tr><td colspan="10" class="empty-state">No active students match your filters.</td></tr>';
                return;
            }

            // Clear table
            studentsBody.innerHTML = '';
            
            filteredStudents.forEach(student => {
                const tr = document.createElement('tr');
                
                // Safety fallback for dates and whatsapp which might be null
                const addedDate = student.created_at
                    ? new Date(student.created_at).toLocaleDateString()
                    : (student.admission_date ? new Date(student.admission_date).toLocaleDateString() : 'N/A');
                const whatsapp = student.father_whatsapp || 'Not provided';
                
                tr.innerHTML = `
                    <td><strong>${student.roll_number}</strong></td>
                    <td class="editable-cell" contenteditable="true" data-col="full_name" data-id="${student.id}">${student.full_name || ''}</td>
                    <td>
                        <select class="class-inline-select" data-id="${student.id}" style="padding:0.4rem; border-radius:6px; border:1px solid #d1d5db; background:#f9fafb; font-size:0.85rem; cursor:pointer;">
                            <option value="">-- None --</option>
                            ${student.applying_for_class && !allAvailableClasses.includes(student.applying_for_class)
                                ? `<option value="${student.applying_for_class}" selected disabled>${student.applying_for_class} (Inactive)</option>`
                                : ''}
                            ${allAvailableClasses.map(c => `<option value="${c}" ${c === student.applying_for_class ? 'selected' : ''}>${c}</option>`).join('')}
                        </select>
                    </td>
                    <td class="editable-cell" contenteditable="true" data-col="father_name" data-id="${student.id}">${student.father_name || ''}</td>
                    <td class="editable-cell" contenteditable="true" data-col="father_mobile" data-id="${student.id}">${student.father_mobile || ''}</td>
                    <td class="editable-cell" contenteditable="true" data-col="father_whatsapp" data-id="${student.id}">${whatsapp || ''}</td>
                    <td>
                        <select class="whatsapp-group-select${student.whatsapp_group_status === 'WG' ? ' is-added' : ''}" data-id="${student.id}" data-saved-value="${student.whatsapp_group_status === 'WG' ? 'WG' : ''}" aria-label="WhatsApp group status">
                            <option value="" ${student.whatsapp_group_status !== 'WG' ? 'selected' : ''}></option>
                            <option value="WG" ${student.whatsapp_group_status === 'WG' ? 'selected' : ''}>WG</option>
                        </select>
                    </td>
                    <td>${addedDate}</td>
                    <td>
                        <select class="status-select" data-id="${student.id}" style="padding:0.4rem; border-radius:6px; border:1px solid #d1d5db; background:#f9fafb; font-size:0.85rem; cursor:pointer;">
                            <option value="Active" selected>Active</option>
                            <option value="Pending">Move to Pending</option>
                            <option value="Withdrawn">Withdraw</option>
                        </select>
                    </td>
                    <td>
                        <button class="delete-btn" data-id="${student.id}" data-name="${student.full_name}">Delete</button>
                    </td>
                `;
                studentsBody.appendChild(tr);
            });
            
            // Attach event listeners for actions
            attachStatusListeners();
            attachInlineEditListeners();
            attachDeleteListeners();
            attachClassChangeListeners();
            attachWhatsAppGroupListeners();
            
        } catch (error) {
            console.error('Error fetching students:', error);
            studentsBody.innerHTML = `<tr><td colspan="10" class="empty-state" style="color:var(--error);">Failed to load data: ${error.message}</td></tr>`;
        }
    }

    function hasValid11DigitNumber(value) {
        return String(value || '').replace(/\D/g, '').length === 11;
    }

    function attachStatusListeners() {
        const selects = document.querySelectorAll('.status-select');
        selects.forEach(select => {
            select.addEventListener('change', async (e) => {
                const newStatus = e.target.value;
                const studentId = e.target.getAttribute('data-id');
                
                if(newStatus !== 'Active') {
                    if(!confirm(`Are you sure you want to change this student's status to ${newStatus}? They will be moved to the Pending/Withdrawn list.`)) {
                        e.target.value = 'Active'; // revert
                        return;
                    }
                    
                    e.target.disabled = true;
                    try {
                        const { error } = await applySchoolScope(supabaseClient
                            .from('admissions')
                            .update({ 
                                status: newStatus,
                                updated_at: new Date().toISOString()
                            })
                            .eq('id', studentId));
                            
                        if(error) throw error;
                        
                        // Fetch again so the student disappears from this Active list
                        fetchStudents();
                    } catch(err) {
                        alert('Error updating status: ' + err.message);
                        e.target.value = 'Active';
                        e.target.disabled = false;
                    }
                }
            });
        });
    }

    function attachInlineEditListeners() {
        const editableCells = document.querySelectorAll('.editable-cell');
        
        editableCells.forEach(cell => {
            // Save original text in case we need to revert or check if changed
            cell.addEventListener('focus', function() {
                this.dataset.original = this.innerText.trim();
            });

            cell.addEventListener('blur', async function() {
                let currentText = this.innerText.trim();
                const originalText = this.dataset.original;
                const studentId = this.getAttribute('data-id');
                const colName = this.getAttribute('data-col');

                // Normalize mobile numbers
                if (colName === 'father_mobile' || colName === 'father_whatsapp') {
                    currentText = currentText.replace(/[\s\-]/g, '');
                    this.innerText = currentText; // Update UI to reflect normalization
                }

                // Only update if it actually changed
                if (currentText !== originalText) {
                    try {
                        const updateData = {};
                        updateData[colName] = currentText;
                        updateData['updated_at'] = new Date().toISOString();

                        const { error } = await applySchoolScope(supabaseClient
                            .from('admissions')
                            .update(updateData)
                            .eq('id', studentId));

                        if (error) throw error;
                        
                        // Briefly flash green to indicate success
                        this.style.backgroundColor = '#d1fae5';
                        setTimeout(() => this.style.backgroundColor = '', 600);
                        
                    } catch (error) {
                        alert('Error saving changes: ' + error.message);
                        this.innerText = originalText; // Revert visually on error
                    }
                }
            });

            // Prevent enter key from making new lines, instead blur to save
            cell.addEventListener('keydown', function(e) {
                if (e.key === 'Enter') {
                    e.preventDefault();
                    this.blur();
                }
            });
        });
    }

    function attachClassChangeListeners() {
        const selects = document.querySelectorAll('.class-inline-select');
        selects.forEach(select => {
            select.addEventListener('change', async (e) => {
                const newClass = e.target.value;
                const studentId = e.target.getAttribute('data-id');
                
                try {
                    const { error } = await applySchoolScope(supabaseClient
                        .from('admissions')
                        .update({ 
                            applying_for_class: newClass,
                            updated_at: new Date().toISOString()
                        })
                        .eq('id', studentId));
                        
                    if (error) throw error;
                    
                    e.target.style.backgroundColor = '#d1fae5';
                    setTimeout(() => e.target.style.backgroundColor = '#f9fafb', 600);
                } catch(err) {
                    alert('Error updating class: ' + err.message);
                }
            });
        });
    }

    function attachWhatsAppGroupListeners() {
        document.querySelectorAll('.whatsapp-group-select').forEach(select => {
            select.addEventListener('change', async event => {
                const control = event.target;
                const previousValue = control.dataset.savedValue || (control.classList.contains('is-added') ? 'WG' : '');
                const nextValue = control.value;
                control.disabled = true;

                try {
                    const { error } = await applySchoolScope(supabaseClient
                        .from('admissions')
                        .update({
                            whatsapp_group_status: nextValue || null,
                            updated_at: new Date().toISOString()
                        })
                        .eq('id', control.dataset.id));
                    if (error) throw error;

                    control.dataset.savedValue = nextValue;
                    control.classList.toggle('is-added', nextValue === 'WG');
                } catch (error) {
                    alert('Error saving WhatsApp group status: ' + error.message);
                    control.value = previousValue;
                } finally {
                    control.disabled = false;
                }
            });
        });
    }

    function attachDeleteListeners() {
        const deleteBtns = document.querySelectorAll('.delete-btn');
        deleteBtns.forEach(btn => {
            btn.addEventListener('click', async (e) => {
                const studentId = e.target.getAttribute('data-id');
                const studentName = e.target.getAttribute('data-name');
                
                if (confirm(`⚠️ DANGER: Are you absolutely sure you want to permanently delete the admission record for "${studentName}"? This action cannot be undone.`)) {
                    // Double confirmation for deletion as it's irreversible
                    if (prompt(`Type "DELETE" to confirm the removal of ${studentName}`) !== 'DELETE') {
                        return;
                    }

                    e.target.innerText = 'Deleting...';
                    e.target.disabled = true;

                    try {
                        const { error: monErr } = await supabaseClient
                            .from('monitoring_students')
                            .delete()
                            .eq('id', studentId);
                        if (monErr) throw monErr;

                        const { error } = await applySchoolScope(supabaseClient
                            .from('admissions')
                            .delete()
                            .eq('id', studentId));
                            
                        if (error) throw error;
                        
                        // Successfully deleted, refresh list
                        fetchStudents();
                    } catch (error) {
                        alert('Failed to delete student: ' + error.message);
                        e.target.innerText = 'Delete';
                        e.target.disabled = false;
                    }
                }
            });
        });
    }

    async function fetchClasses() {
        try {
            // Use active classes in the manual order configured on Classes page.
            const { data, error } = await applySchoolScope(supabaseClient
                .from('classes')
                .select('class_name, section, display_order, is_active')
                .eq('is_active', true)
                .order('display_order', { ascending: true, nullsFirst: false })
                .order('class_name', { ascending: true })
                .order('section', { ascending: true }));
            
            if (error) throw error;
            
            if (data && data.length > 0) {
                allAvailableClasses = data
                    .map(cls => `${cls.class_name || ''} ${cls.section || ''}`.trim())
                    .filter(Boolean);

                searchClassSelect.innerHTML = '<option value="">All Classes</option>' + 
                    allAvailableClasses.map(c => `<option value="${c}">${c}</option>`).join('');
            }
        } catch (error) {
            console.error('Error fetching classes:', error);
        }
    }

    // ── Print & Layout Controls ──
    const fontSizeRange = document.getElementById('fontSizeRange');
    const compactnessRange = document.getElementById('compactnessRange');
    const fontSizeValue = document.getElementById('fontSizeValue');
    const compactnessValue = document.getElementById('compactnessValue');
    const printBtn = document.getElementById('printBtn');

    function applyLayoutControls() {
        if (!fontSizeRange || !compactnessRange) return;
        const font = parseFloat(fontSizeRange.value || '14');
        const compact = parseFloat(compactnessRange.value || '20');

        // Normal screen layout scaling
        const tdVertical = Math.max(2, 10 - (compact * 0.08));
        const tdHorizontal = Math.max(4, 14 - (compact * 0.1));
        const thVertical = Math.max(2.2, 10 - (compact * 0.08));
        const thHorizontal = Math.max(4, 14 - (compact * 0.1));

        // Print layout scaling
        const printFont = Math.max(7, font - 3); // Prints slightly smaller than screen
        const printTdVertical = Math.max(1, 4 - (compact * 0.03));
        const printTdHorizontal = Math.max(2, 6 - (compact * 0.04));
        const printThVertical = Math.max(1.5, 5 - (compact * 0.035));
        const printThHorizontal = Math.max(2, 6 - (compact * 0.04));

        document.documentElement.style.setProperty('--table-font-size', `${font}px`);
        document.documentElement.style.setProperty('--table-td-pad', `${tdVertical.toFixed(1)}px ${tdHorizontal.toFixed(1)}px`);
        document.documentElement.style.setProperty('--table-th-pad', `${thVertical.toFixed(1)}px ${thHorizontal.toFixed(1)}px`);

        document.documentElement.style.setProperty('--print-font-size', `${printFont.toFixed(1)}px`);
        document.documentElement.style.setProperty('--print-td-pad', `${printTdVertical.toFixed(1)}px ${printTdHorizontal.toFixed(1)}px`);
        document.documentElement.style.setProperty('--print-th-pad', `${printThVertical.toFixed(1)}px ${printThHorizontal.toFixed(1)}px`);

        if (fontSizeValue) fontSizeValue.textContent = `${font.toFixed(1)}px`;
        if (compactnessValue) compactnessValue.textContent = `${Math.round(compact)}%`;
        
        // Save to localStorage
        localStorage.setItem('students.fontSize', fontSizeRange.value);
        localStorage.setItem('students.compactness', compactnessRange.value);
    }

    if (fontSizeRange && compactnessRange) {
        fontSizeRange.value = localStorage.getItem('students.fontSize') || '14';
        compactnessRange.value = localStorage.getItem('students.compactness') || '20';
        
        fontSizeRange.addEventListener('input', applyLayoutControls);
        compactnessRange.addEventListener('input', applyLayoutControls);
        applyLayoutControls();
    }

    if (printBtn) {
        printBtn.addEventListener('click', () => {
            window.print();
        });
    }
});
