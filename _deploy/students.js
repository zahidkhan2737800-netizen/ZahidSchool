// Supabase client is now provided by auth.js (supabaseClient)

document.addEventListener('DOMContentLoaded', () => {
    const studentsBody = document.getElementById('studentsBody');
    const searchNameInput = document.getElementById('searchName');
    const searchRollInput = document.getElementById('searchRoll');
    const searchClassSelect = document.getElementById('searchClass');

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

    searchNameInput.addEventListener('input', handleSearchInput);
    searchRollInput.addEventListener('input', handleSearchInput);
    searchClassSelect.addEventListener('change', fetchStudents);

    async function fetchStudents() {
        studentsBody.innerHTML = '<tr><td colspan="6" class="empty-state">🔄 Fetching records...</td></tr>';
        
        try {
            // Start building the query
            let query = supabaseClient
                .from('admissions')
                .select('id, roll_number, full_name, father_name, father_mobile, father_whatsapp, admission_date, applying_for_class')
                .eq('status', 'Active'); // ALWAYS filter by Active status!

            // Apply exact filter: Roll Number
            const searchRoll = searchRollInput.value.trim();
            if (searchRoll) {
                query = query.eq('roll_number', searchRoll);
            }

            // Apply exact filter: Class
            const searchClass = searchClassSelect.value;
            if (searchClass) {
                query = query.eq('applying_for_class', searchClass);
            }

            // Apply partial filter: Student Name OR Father Name
            const searchName = searchNameInput.value.trim();
            if (searchName) {
                // In Supabase, testing OR logic on single columns with ilike looks like this:
                query = query.or(`full_name.ilike.%${searchName}%,father_name.ilike.%${searchName}%`);
            }

            // Order by date
            query = query.order('admission_date', { ascending: false });

            const { data, error } = await query;

            if (error) throw error;

            // Update Counter
            document.getElementById('totalActive').textContent = data.length || 0;

            if (data.length === 0) {
                studentsBody.innerHTML = '<tr><td colspan="7" class="empty-state">No active students match your filters.</td></tr>';
                return;
            }

            // Clear table
            studentsBody.innerHTML = '';
            
            data.forEach(student => {
                const tr = document.createElement('tr');
                
                // Safety fallback for dates and whatsapp which might be null
                const admDate = student.admission_date ? new Date(student.admission_date).toLocaleDateString() : 'N/A';
                const whatsapp = student.father_whatsapp || 'Not provided';
                
                tr.innerHTML = `
                    <td><strong>${student.roll_number}</strong></td>
                    <td class="editable-cell" contenteditable="true" data-col="full_name" data-id="${student.id}">${student.full_name || ''}</td>
                    <td>
                        <select class="class-inline-select" data-id="${student.id}" style="padding:0.4rem; border-radius:6px; border:1px solid #d1d5db; background:#f9fafb; font-size:0.85rem; cursor:pointer;">
                            <option value="">-- None --</option>
                            ${allAvailableClasses.map(c => `<option value="${c}" ${c === student.applying_for_class ? 'selected' : ''}>${c}</option>`).join('')}
                        </select>
                    </td>
                    <td class="editable-cell" contenteditable="true" data-col="father_name" data-id="${student.id}">${student.father_name || ''}</td>
                    <td class="editable-cell" contenteditable="true" data-col="father_mobile" data-id="${student.id}">${student.father_mobile || ''}</td>
                    <td class="editable-cell" contenteditable="true" data-col="father_whatsapp" data-id="${student.id}">${whatsapp || ''}</td>
                    <td>${admDate}</td>
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
            
        } catch (error) {
            console.error('Error fetching students:', error);
            studentsBody.innerHTML = `<tr><td colspan="7" class="empty-state" style="color:var(--error);">Failed to load data: ${error.message}</td></tr>`;
        }
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
                        const { error } = await supabaseClient
                            .from('admissions')
                            .update({ 
                                status: newStatus,
                                updated_at: new Date().toISOString()
                            })
                            .eq('id', studentId);
                            
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
                const currentText = this.innerText.trim();
                const originalText = this.dataset.original;
                const studentId = this.getAttribute('data-id');
                const colName = this.getAttribute('data-col');

                // Only update if it actually changed
                if (currentText !== originalText) {
                    try {
                        const updateData = {};
                        updateData[colName] = currentText;
                        updateData['updated_at'] = new Date().toISOString();

                        const { error } = await supabaseClient
                            .from('admissions')
                            .update(updateData)
                            .eq('id', studentId);

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
                    const { error } = await supabaseClient
                        .from('admissions')
                        .update({ 
                            applying_for_class: newClass,
                            updated_at: new Date().toISOString()
                        })
                        .eq('id', studentId);
                        
                    if (error) throw error;
                    
                    e.target.style.backgroundColor = '#d1fae5';
                    setTimeout(() => e.target.style.backgroundColor = '#f9fafb', 600);
                } catch(err) {
                    alert('Error updating class: ' + err.message);
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
                        const { error } = await supabaseClient
                            .from('admissions')
                            .delete()
                            .eq('id', studentId);
                            
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
            // Fetch unique classes currently active in admissions
            const { data, error } = await supabaseClient
                .from('admissions')
                .select('applying_for_class')
                .eq('status', 'Active');
            
            if (error) throw error;
            
            if (data && data.length > 0) {
                // Filter out empty/null values and get unique classes
                allAvailableClasses = [...new Set(data
                    .map(c => c.applying_for_class)
                    .filter(c => c && c.trim() !== '')
                )].sort();

                searchClassSelect.innerHTML = '<option value="">All Classes</option>' + 
                    allAvailableClasses.map(c => `<option value="${c}">${c}</option>`).join('');
            }
        } catch (error) {
            console.error('Error fetching classes:', error);
        }
    }
});
