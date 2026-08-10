// Supabase client is now provided by auth.js (supabaseClient)

window.onAppReady(() => {
    const classForm = document.getElementById('classForm');
    const classesBody = document.getElementById('classesBody');
    const formAlert = document.getElementById('formAlert');
    const submitBtn = document.getElementById('submitBtn');
    const cancelEditBtn = document.getElementById('cancelEditBtn');

    let editClassId = null;

    // Fetch and display existing classes on load
    fetchClasses();

    // Handle Cancel Edit
    cancelEditBtn.addEventListener('click', () => {
        resetFormToCreateMode();
    });

    function resetFormToCreateMode() {
        editClassId = null;
        document.getElementById('className').value = '';
        document.getElementById('classSection').value = '';
        document.getElementById('classOrder').value = '';
        
        submitBtn.innerHTML = `
            <span>Save Class</span>
            <svg viewBox="0 0 24 24" width="20" height="20" stroke="currentColor" stroke-width="2" fill="none" class="btn-icon"><line x1="5" y1="12" x2="19" y2="12"></line><polyline points="12 5 19 12 12 19"></polyline></svg>
        `;
        cancelEditBtn.style.display = 'none';
    }

    classForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        formAlert.style.display = 'none';

        const classNameInput = document.getElementById('className');
        const classSectionInput = document.getElementById('classSection');
        const classOrderInput = document.getElementById('classOrder');
        
        const className = classNameInput.value.trim();
        const section = classSectionInput.value.trim();
        const displayOrder = Number(classOrderInput.value);

        if(!className || !section || !Number.isSafeInteger(displayOrder) || displayOrder < 1) {
            showAlert('Class Name, Section, and a positive whole-number Order are required.', true);
            return;
        }

        submitBtn.innerHTML = '<span style="display:inline-block; animation: spin 1s linear infinite;">⏳</span> Saving...';
        submitBtn.style.opacity = '0.8';
        submitBtn.style.pointerEvents = 'none';

        try {
            const payload = {
                class_name: className,
                section: section,
                display_order: displayOrder
            };
            // Save the class under the logged-in customer's school explicitly.
            if (window.currentSchoolId) payload.school_id = window.currentSchoolId;
            if (!editClassId) payload.is_active = true;

            if (editClassId) {
                // Update
                const { error } = await supabaseClient
                    .from('classes')
                    .update(payload)
                    .eq('id', editClassId);
                if (error) throw new Error(error.message);
                showAlert('✅ Class updated successfully!', false);
            } else {
                // Insert
                const { error } = await supabaseClient
                    .from('classes')
                    .insert([payload]);
                if (error) throw new Error(error.message);
                showAlert('✅ Class added successfully to the database!', false);
            }

            resetFormToCreateMode();
            fetchClasses(); // Refresh list
            
        } catch (error) {
            console.error('Error:', error);
            const isOldGlobalConstraint = String(error.message || '').includes('classes_class_name_section_key');
            showAlert(isOldGlobalConstraint
                ? '❌ The old global class rule is still active. Run fix_classes_school_unique.sql in Supabase, then try again.'
                : '❌ Failed to save class: ' + error.message, true);
        } finally {
            submitBtn.innerHTML = `
                <span>Save Class</span>
                <svg viewBox="0 0 24 24" width="20" height="20" stroke="currentColor" stroke-width="2" fill="none" class="btn-icon"><line x1="5" y1="12" x2="19" y2="12"></line><polyline points="12 5 19 12 12 19"></polyline></svg>
            `;
            submitBtn.style.opacity = '1';
            submitBtn.style.pointerEvents = 'all';
        }
    });

    async function fetchClasses() {
        try {
            const { data, error } = await supabaseClient
                .from('classes')
                .select('*')
                .order('display_order', { ascending: true, nullsFirst: false })
                .order('class_name', { ascending: true })
                .order('section', { ascending: true });

            if (error) throw error;

            classesBody.innerHTML = ''; // Clear loading text

            if (data.length === 0) {
                classesBody.innerHTML = '<tr><td colspan="6" style="text-align: center;">No classes found. Add one above!</td></tr>';
                return;
            }

            window._classesData = data; // Store globally for edit mapping

            data.forEach(cls => {
                const tr = document.createElement('tr');
                const addedDate = new Date(cls.created_at).toLocaleDateString();
                const isActive = cls.is_active !== false;
                if (!isActive) tr.classList.add('inactive-class');
                
                tr.innerHTML = `
                    <td><input type="number" class="class-order-input" data-id="${cls.id}" min="1" step="1" value="${cls.display_order || 1}" aria-label="Display order"></td>
                    <td><strong>${cls.class_name}</strong></td>
                    <td><span class="class-badge">${cls.section}</span></td>
                    <td><span class="class-status ${isActive ? 'active' : 'inactive'}">${isActive ? 'Active' : 'Inactive'}</span></td>
                    <td>${addedDate}</td>
                    <td>
                        <button type="button" class="edit-btn" data-id="${cls.id}" style="background:var(--primary); color:white; border:none; padding:0.3rem 0.6rem; border-radius:6px; cursor:pointer; font-size:0.8rem; margin-right:0.3rem;">Edit</button>
                        <button type="button" class="status-toggle-btn ${isActive ? 'make-inactive' : 'make-active'}" data-id="${cls.id}" data-active="${isActive}">${isActive ? 'Inactive' : 'Make Active'}</button>
                        <button type="button" class="del-btn" data-id="${cls.id}" style="background:var(--error); color:white; border:none; padding:0.3rem 0.6rem; border-radius:6px; cursor:pointer; font-size:0.8rem;">Delete</button>
                    </td>
                `;
                classesBody.appendChild(tr);
            });
            
            attachActionListeners();
            
        } catch (error) {
            console.error('Error fetching classes:', error);
            classesBody.innerHTML = '<tr><td colspan="6" style="text-align: center; color: red;">Failed to load classes from database. Run add_class_order_and_status.sql in Supabase.</td></tr>';
        }
    }

    function attachActionListeners() {
        document.querySelectorAll('.edit-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const id = e.target.getAttribute('data-id');
                const cls = window._classesData.find(c => c.id === id);
                if(!cls) return;

                editClassId = cls.id;
                document.getElementById('className').value = cls.class_name;
                document.getElementById('classSection').value = cls.section;
                document.getElementById('classOrder').value = cls.display_order || 1;
                
                submitBtn.innerHTML = `<span>🔄 Update Class</span>`;
                cancelEditBtn.style.display = 'inline-block';
                
                window.scrollTo({ top: 0, behavior: 'smooth' });
            });
        });

        document.querySelectorAll('.class-order-input').forEach(input => {
            input.addEventListener('change', async event => {
                const control = event.target;
                const order = Number(control.value);
                if (!Number.isSafeInteger(order) || order < 1) {
                    showAlert('Order must be a positive whole number such as 1, 2, or 3.', true);
                    fetchClasses();
                    return;
                }
                control.disabled = true;
                const { error } = await supabaseClient.from('classes').update({ display_order: order }).eq('id', control.dataset.id);
                if (error) showAlert('Failed to update order: ' + error.message, true);
                else showAlert('Class order updated.', false);
                fetchClasses();
            });
        });

        document.querySelectorAll('.status-toggle-btn').forEach(button => {
            button.addEventListener('click', async event => {
                const control = event.currentTarget;
                const currentlyActive = control.dataset.active === 'true';
                control.disabled = true;
                control.textContent = 'Saving...';
                const { error } = await supabaseClient
                    .from('classes')
                    .update({ is_active: !currentlyActive })
                    .eq('id', control.dataset.id);
                if (error) showAlert('Failed to update class status: ' + error.message, true);
                else showAlert(`Class marked ${currentlyActive ? 'Inactive' : 'Active'}.`, false);
                fetchClasses();
            });
        });

        document.querySelectorAll('.del-btn').forEach(btn => {
            btn.addEventListener('click', async (e) => {
                const id = e.target.getAttribute('data-id');
                if(!confirm('Are you sure you want to delete this Class? Linked fee heads or admissions may fail.')) return;

                e.target.innerHTML = '...';
                e.target.disabled = true;

                try {
                    const { error } = await supabaseClient.from('classes').delete().eq('id', id);
                    if (error) throw error;
                    
                    fetchClasses();
                    showAlert('✅ Class deleted successfully!', false);
                    
                    if(editClassId === id) resetFormToCreateMode();
                } catch(err) {
                    alert('Failed to delete: ' + err.message);
                    fetchClasses();
                }
            });
        });
    }

    function showAlert(msg, isError) {
        formAlert.textContent = msg;
        formAlert.style.background = isError ? 'var(--error)' : 'var(--success)';
        formAlert.style.display = 'block';
        setTimeout(() => { formAlert.style.display = 'none'; }, 5000);
    }
    
    // Create simple keyframes for spinner locally
    if (!document.getElementById('spin-style')) {
        const style = document.createElement('style');
        style.id = 'spin-style';
        style.innerHTML = `
            @keyframes spin {
                100% { transform: rotate(360deg); }
            }
        `;
        document.head.appendChild(style);
    }
});
