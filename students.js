const supabaseUrl = 'https://dkscydwftycubvwxondi.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRrc2N5ZHdmdHljdWJ2d3hvbmRpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQyNTMxOTQsImV4cCI6MjA4OTgyOTE5NH0.U84KKtJV2Lzz_FXbnXqlstvzzTW-FWBBtJTxbGlNYIE';
const supabaseClient = window.supabase.createClient(supabaseUrl, supabaseKey);

document.addEventListener('DOMContentLoaded', () => {
    const studentsBody = document.getElementById('studentsBody');
    const searchNameInput = document.getElementById('searchName');
    const searchRollInput = document.getElementById('searchRoll');

    // Fetch instantly on load
    fetchStudents();

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

    async function fetchStudents() {
        studentsBody.innerHTML = '<tr><td colspan="6" class="empty-state">🔄 Fetching records...</td></tr>';
        
        try {
            // Start building the query
            let query = supabaseClient
                .from('admissions')
                .select('id, roll_number, full_name, father_name, father_mobile, admission_date')
                .eq('status', 'Active'); // ALWAYS filter by Active status!

            // Apply exact filter: Roll Number
            const searchRoll = searchRollInput.value.trim();
            if (searchRoll) {
                query = query.eq('roll_number', searchRoll);
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
                    <td>${student.full_name}</td>
                    <td>${student.father_name || 'N/A'}</td>
                    <td>${student.father_mobile || 'N/A'}</td>
                    <td>${admDate}</td>
                    <td>
                        <select class="status-select" data-id="${student.id}" style="padding:0.4rem; border-radius:6px; border:1px solid #d1d5db; background:#f9fafb; font-size:0.85rem; cursor:pointer;">
                            <option value="Active" selected>Active</option>
                            <option value="Pending">Move to Pending</option>
                            <option value="Withdrawn">Withdraw</option>
                        </select>
                    </td>
                `;
                studentsBody.appendChild(tr);
            });
            
            // Attach event listeners for status change
            attachStatusListeners();
            
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
});
