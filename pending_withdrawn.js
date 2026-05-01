// Supabase client is now provided by auth.js (supabaseClient)

document.addEventListener('DOMContentLoaded', () => {
    const inactiveBody = document.getElementById('inactiveBody');
    const statusFilter = document.getElementById('statusFilter');

    // Fetch instantly on load
    fetchRecords();

    statusFilter.addEventListener('change', fetchRecords);

    async function fetchRecords() {
        inactiveBody.innerHTML = '<tr><td colspan="6" style="text-align:center; padding:2rem;">🔄 Fetching records...</td></tr>';
        
        try {
            const filterValue = statusFilter.value;
            
            let query = supabaseClient
                .from('admissions')
                .select('id, roll_number, full_name, father_name, applying_for_class, status, updated_at, admission_date')
                
            if(filterValue === 'All') {
                query = query.in('status', ['Pending', 'Withdrawn', 'Passed Out']);
            } else {
                query = query.eq('status', filterValue);
            }

            // Order by most recently updated
            query = query.order('updated_at', { ascending: false, nullsFirst: false });

            const { data, error } = await query;

            if (error) throw error;

            if (data.length === 0) {
                inactiveBody.innerHTML = '<tr><td colspan="6" style="text-align:center; padding:2rem; color:var(--text-muted);">No records found.</td></tr>';
                return;
            }

            // Clear table
            inactiveBody.innerHTML = '';
            
            data.forEach(student => {
                const tr = document.createElement('tr');
                
                // If updated_at is null, fallback to admission_date or simply "Unknown"
                let updateDateText = 'Unknown';
                if(student.updated_at) {
                    updateDateText = new Date(student.updated_at).toLocaleDateString();
                } else if (student.admission_date) {
                    updateDateText = new Date(student.admission_date).toLocaleDateString() + ' (App)';
                }
                
                const badgeClass = student.status === 'Pending' ? 'pending' : student.status === 'Passed Out' ? 'passed-out' : 'withdrawn';
                
                tr.innerHTML = `
                    <td><strong>${student.roll_number || 'N/A'}</strong></td>
                    <td>${student.full_name}</td>
                    <td>${student.father_name || 'N/A'}</td>
                    <td>${student.applying_for_class || 'N/A'}</td>
                    <td><span class="badge ${badgeClass}">${student.status}</span></td>
                    <td>${updateDateText}</td>
                    <td>
                        <select class="status-select" data-id="${student.id}" style="padding:0.3rem; border-radius:4px; border:1px solid #ccc; font-size:0.8rem;">
                            <option value="Active">Make Active</option>
                            <option value="Pending" ${student.status === 'Pending' ? 'selected' : ''}>Pending</option>
                            <option value="Withdrawn" ${student.status === 'Withdrawn' ? 'selected' : ''}>Withdrawn</option>
                            <option value="Passed Out" ${student.status === 'Passed Out' ? 'selected' : ''}>Passed Out</option>
                        </select>
                    </td>
                `;
                inactiveBody.appendChild(tr);
            });
            
            // Attach status change listeners
            attachStatusListeners();
            
        } catch (error) {
            console.error('Error fetching records:', error);
            inactiveBody.innerHTML = `<tr><td colspan="6" style="text-align:center; padding:2rem; color:red;">Failed to load data: ${error.message} <br>(Did you run the ALTER TABLE sql to add updated_at?)</td></tr>`;
        }
    }

    function attachStatusListeners() {
        const selects = document.querySelectorAll('.status-select');
        selects.forEach(select => {
            select.addEventListener('change', async (e) => {
                const newStatus = e.target.value;
                const studentId = e.target.getAttribute('data-id');
                
                e.target.disabled = true;
                e.target.style.opacity = '0.5';
                
                try {
                    const { error } = await supabaseClient
                        .from('admissions')
                        .update({ 
                            status: newStatus,
                            updated_at: new Date().toISOString()
                        })
                        .eq('id', studentId);
                        
                    if(error) throw error;
                    
                    fetchRecords(); // refresh
                } catch(err) {
                    alert('Error updating status: ' + err.message);
                    fetchRecords(); // revert UI via fresh fetch
                }
            });
        });
    }
});
