// Supabase client is now provided by auth.js (supabaseClient)

document.addEventListener('DOMContentLoaded', () => {
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
        
        const className = classNameInput.value.trim();
        const section = classSectionInput.value.trim();

        if(!className || !section) {
            showAlert('Both Class Name and Section are required.', true);
            return;
        }

        const originalText = submitBtn.innerHTML;
        submitBtn.innerHTML = '<span style="display:inline-block; animation: spin 1s linear infinite;">⏳</span> Saving...';
        submitBtn.style.opacity = '0.8';
        submitBtn.style.pointerEvents = 'none';

        try {
            const payload = { class_name: className, section: section };

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
            showAlert('❌ Failed to save class: ' + error.message, true);
        } finally {
            submitBtn.innerHTML = originalText;
            submitBtn.style.opacity = '1';
            submitBtn.style.pointerEvents = 'all';
        }
    });

    async function fetchClasses() {
        try {
            const { data, error } = await supabaseClient
                .from('classes')
                .select('*')
                .order('class_name', { ascending: true })
                .order('section', { ascending: true });

            if (error) throw error;

            classesBody.innerHTML = ''; // Clear loading text

            if (data.length === 0) {
                classesBody.innerHTML = '<tr><td colspan="4" style="text-align: center;">No classes found. Add one above!</td></tr>';
                return;
            }

            window._classesData = data; // Store globally for edit mapping

            data.forEach(cls => {
                const tr = document.createElement('tr');
                const addedDate = new Date(cls.created_at).toLocaleDateString();
                
                tr.innerHTML = `
                    <td><strong>${cls.class_name}</strong></td>
                    <td><span class="class-badge">${cls.section}</span></td>
                    <td>${addedDate}</td>
                    <td>
                        <button type="button" class="edit-btn" data-id="${cls.id}" style="background:var(--primary); color:white; border:none; padding:0.3rem 0.6rem; border-radius:6px; cursor:pointer; font-size:0.8rem; margin-right:0.3rem;">Edit</button>
                        <button type="button" class="del-btn" data-id="${cls.id}" style="background:var(--error); color:white; border:none; padding:0.3rem 0.6rem; border-radius:6px; cursor:pointer; font-size:0.8rem;">Delete</button>
                    </td>
                `;
                classesBody.appendChild(tr);
            });
            
            attachActionListeners();
            
        } catch (error) {
            console.error('Error fetching classes:', error);
            classesBody.innerHTML = '<tr><td colspan="4" style="text-align: center; color: red;">Failed to load classes from database. Did you run the SQL script?</td></tr>';
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
                
                submitBtn.innerHTML = `<span>🔄 Update Class</span>`;
                cancelEditBtn.style.display = 'inline-block';
                
                window.scrollTo({ top: 0, behavior: 'smooth' });
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
