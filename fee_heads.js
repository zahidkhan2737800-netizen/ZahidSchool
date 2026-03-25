// Supabase client is now provided by auth.js (supabaseClient)

document.addEventListener('DOMContentLoaded', () => {
    const feeForm = document.getElementById('feeForm');
    const classIdSelect = document.getElementById('classId');
    const feeBody = document.getElementById('feeBody');
    const formAlert = document.getElementById('formAlert');
    const submitBtn = document.getElementById('submitBtn');
    const cancelEditBtn = document.getElementById('cancelEditBtn');

    let editFeeId = null; // Track if we are editing an existing record

    // Load necessary data on startup
    loadClasses();
    fetchFeeHeads();

    // Handle Cancel Edit
    cancelEditBtn.addEventListener('click', () => {
        resetFormToCreateMode();
    });

    function resetFormToCreateMode() {
        editFeeId = null;
        document.getElementById('feeType').value = '';
        document.getElementById('amount').value = '';
        document.getElementById('isMonthly').checked = false;
        classIdSelect.value = ''; // Reset select
        
        // Reset UI Buttons
        submitBtn.innerHTML = `
            <span>Save Fee Head</span>
            <svg viewBox="0 0 24 24" width="20" height="20" stroke="currentColor" stroke-width="2" fill="none" class="btn-icon"><line x1="5" y1="12" x2="19" y2="12"></line><polyline points="12 5 19 12 12 19"></polyline></svg>
        `;
        cancelEditBtn.style.display = 'none';
    }

    feeForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        formAlert.style.display = 'none';

        const classId = classIdSelect.value;
        const feeType = document.getElementById('feeType').value.trim();
        const amount = document.getElementById('amount').value.trim();
        const isMonthly = document.getElementById('isMonthly').checked;

        if(!classId || !feeType || !amount) {
            showAlert('All fields are required.', true);
            return;
        }

        const originalText = submitBtn.innerHTML;
        submitBtn.innerHTML = '<span style="display:inline-block; animation: spin 1s linear infinite;">⏳</span> Saving...';
        submitBtn.style.opacity = '0.8';
        submitBtn.style.pointerEvents = 'none';

        try {
            const payload = { 
                class_id: classId, 
                fee_type: feeType, 
                amount: parseFloat(amount),
                is_monthly: isMonthly
            };

            if (editFeeId) {
                // Update Existing
                const { error } = await supabaseClient
                    .from('fee_heads')
                    .update(payload)
                    .eq('id', editFeeId);
                if (error) throw new Error(error.message);
                showAlert('✅ Fee Head updated successfully!', false);
            } else {
                // Create New
                const { error } = await supabaseClient
                    .from('fee_heads')
                    .insert([payload]);
                if (error) throw new Error(error.message);
                showAlert('✅ Fee Head added successfully!', false);
            }

            resetFormToCreateMode();
            fetchFeeHeads(); // Refresh list
            
        } catch (error) {
            console.error('Error:', error);
            showAlert('❌ Failed to save fee head: ' + error.message, true);
        } finally {
            submitBtn.innerHTML = originalText;
            submitBtn.style.opacity = '1';
            submitBtn.style.pointerEvents = 'all';
        }
    });

    // Populate dropdown with classes from DB
    async function loadClasses() {
        try {
            const { data, error } = await supabaseClient
                .from('classes')
                .select('id, class_name, section')
                .order('class_name', { ascending: true })
                .order('section', { ascending: true });
                
            if (error) throw error;
            
            classIdSelect.innerHTML = '<option value="" disabled selected>Select Target Class</option>';
            if(data && data.length > 0) {
                data.forEach(cls => {
                    const opt = document.createElement('option');
                    opt.value = cls.id;
                    opt.textContent = `${cls.class_name} (${cls.section})`;
                    classIdSelect.appendChild(opt);
                });
            } else {
                classIdSelect.innerHTML = '<option value="" disabled selected>No classes available</option>';
            }
        } catch(err) {
            console.error('Error loading classes:', err);
            classIdSelect.innerHTML = '<option value="" disabled selected>Error loading classes</option>';
        }
    }

    // Fetch and display existing fee heads
    async function fetchFeeHeads() {
        try {
            // Using Supabase relation query to get class name directly!
            const { data, error } = await supabaseClient
                .from('fee_heads')
                .select(`
                    id, 
                    class_id,
                    fee_type, 
                    amount, 
                    is_monthly,
                    created_at,
                    classes ( class_name, section )
                `)
                .order('created_at', { ascending: false });

            if (error) throw error;

            feeBody.innerHTML = ''; // Clear loading text

            if (data.length === 0) {
                feeBody.innerHTML = '<tr><td colspan="5" style="text-align: center;">No fee heads configured yet. Add one above!</td></tr>';
                return;
            }

            // Keep reference to raw data internally for edit populating
            window._feeHeadsData = data;

            data.forEach(fee => {
                const tr = document.createElement('tr');
                const addedDate = new Date(fee.created_at).toLocaleDateString();
                const className = fee.classes ? `${fee.classes.class_name} (${fee.classes.section})` : 'Unknown Class';
                
                const typeBadge = fee.is_monthly 
                    ? '<span style="color:var(--secondary); font-size:0.75rem; border:1px solid currentColor; padding:0.1rem 0.4rem; border-radius:12px; margin-left:0.5rem; vertical-align:middle;">Monthly</span>' 
                    : '<span style="color:var(--text-muted); font-size:0.75rem; border:1px solid currentColor; padding:0.1rem 0.4rem; border-radius:12px; margin-left:0.5rem; vertical-align:middle;">One-time</span>';
                
                tr.innerHTML = `
                    <td><strong>${className}</strong></td>
                    <td>${fee.fee_type} ${typeBadge}</td>
                    <td><span class="fee-badge">Rs ${fee.amount}</span></td>
                    <td>${addedDate}</td>
                    <td>
                        <button type="button" class="edit-btn" data-id="${fee.id}" style="background:var(--secondary); color:white; border:none; padding:0.3rem 0.6rem; border-radius:6px; cursor:pointer; font-size:0.8rem; margin-right:0.3rem;">Edit</button>
                        <button type="button" class="del-btn" data-id="${fee.id}" style="background:var(--error); color:white; border:none; padding:0.3rem 0.6rem; border-radius:6px; cursor:pointer; font-size:0.8rem;">Delete</button>
                    </td>
                `;
                feeBody.appendChild(tr);
            });
            
            attachActionListeners();
            
        } catch (error) {
            console.error('Error fetching fee heads:', error);
            feeBody.innerHTML = '<tr><td colspan="5" style="text-align: center; color: red;">Failed to load fee heads. (Did you run the SQL script for fee_heads table?)</td></tr>';
        }
    }

    function attachActionListeners() {
        // Edit listening
        document.querySelectorAll('.edit-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const id = e.target.getAttribute('data-id');
                const p = window._feeHeadsData.find(f => f.id === id);
                if(!p) return;

                // Enter edit mode
                editFeeId = p.id;
                document.getElementById('feeType').value = p.fee_type;
                document.getElementById('amount').value = p.amount;
                document.getElementById('isMonthly').checked = p.is_monthly;
                
                // Select matching class via text/id reverse lookup (actually we can just query the DOM or relation)
                // Wait, our query didn't fetch class_id! Let's just fix the fetch query to include class_id.
                // Assuming we fetched class_id:
                if (p.class_id) classIdSelect.value = p.class_id;
                
                // Update UI Buttons
                submitBtn.innerHTML = `<span>🔄 Update Fee Head</span>`;
                cancelEditBtn.style.display = 'inline-block';
                
                window.scrollTo({ top: 0, behavior: 'smooth' });
            });
        });

        // Delete listening
        document.querySelectorAll('.del-btn').forEach(btn => {
            btn.addEventListener('click', async (e) => {
                const id = e.target.getAttribute('data-id');
                if(!confirm('Are you sure you want to delete this Fee Head? Existing challans will not be affected.')) return;

                e.target.innerHTML = '...';
                e.target.disabled = true;

                try {
                    const { error } = await supabaseClient.from('fee_heads').delete().eq('id', id);
                    if (error) throw error;
                    
                    fetchFeeHeads(); // Refresh List
                    showAlert('✅ Fee Head deleted successfully!', false);
                    
                    if(editFeeId === id) resetFormToCreateMode(); // If deleting currently editing item
                } catch(err) {
                    alert('Failed to delete: ' + err.message);
                    fetchFeeHeads(); 
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
