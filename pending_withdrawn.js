// Supabase client is now provided by auth.js (supabaseClient)

document.addEventListener('DOMContentLoaded', () => {
    const inactiveBody = document.getElementById('inactiveBody');
    const statusFilter = document.getElementById('statusFilter');
    const yearFilter = document.getElementById('yearFilter');
    const monthFilter = document.getElementById('monthFilter');
    const studentSearch = document.getElementById('studentSearch');
    const classFilter = document.getElementById('classFilter');
    let loadedRecords = [];

    // Load saved filters from localStorage
    const savedStatus = localStorage.getItem('pw_statusFilter');
    const savedYear = localStorage.getItem('pw_yearFilter');
    const savedMonth = localStorage.getItem('pw_monthFilter');
    const savedSearch = localStorage.getItem('pw_studentSearch');
    const savedClass = localStorage.getItem('pw_classFilter');
    let initialClass = savedClass;

    if (savedStatus) statusFilter.value = savedStatus;
    if (savedYear) yearFilter.value = savedYear;
    if (savedMonth) monthFilter.value = savedMonth;
    if (savedSearch) studentSearch.value = savedSearch;

    const handleFilterChange = (key, el) => {
        localStorage.setItem(key, el.value);
        fetchRecords();
    };

    statusFilter.addEventListener('change', () => handleFilterChange('pw_statusFilter', statusFilter));
    yearFilter.addEventListener('change', () => handleFilterChange('pw_yearFilter', yearFilter));
    monthFilter.addEventListener('change', () => handleFilterChange('pw_monthFilter', monthFilter));
    classFilter.addEventListener('change', () => {
        localStorage.setItem('pw_classFilter', classFilter.value);
        renderRecords();
    });

    let searchTimer;
    studentSearch.addEventListener('input', () => {
        clearTimeout(searchTimer);
        searchTimer = setTimeout(() => {
            localStorage.setItem('pw_studentSearch', studentSearch.value);
            renderRecords();
        }, 150);
    });

    // Fetch instantly on load
    fetchRecords();

    async function fetchRecords() {
        inactiveBody.innerHTML = '<tr><td colspan="7" style="text-align:center; padding:2rem;">🔄 Fetching records...</td></tr>';
        
        try {
            const filterValue = statusFilter.value;
            const selectedYear = yearFilter.value;
            const selectedMonth = monthFilter.value;
            
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

            let filteredData = data;
            
            if (selectedYear !== 'All' || selectedMonth !== 'All') {
                filteredData = data.filter(student => {
                    let dateStr = student.updated_at || student.admission_date;
                    if (!dateStr) return false;
                    
                    let d = new Date(dateStr);
                    if (isNaN(d.getTime())) return false;
                    
                    let matchYear = true;
                    let matchMonth = true;
                    
                    if (selectedYear !== 'All') {
                        matchYear = (d.getFullYear().toString() === selectedYear);
                    }
                    if (selectedMonth !== 'All') {
                        matchMonth = ((d.getMonth() + 1).toString() === selectedMonth);
                    }
                    
                    return matchYear && matchMonth;
                });
            }

            loadedRecords = filteredData;
            populateClassFilter();
            renderRecords();

        } catch (error) {
            console.error('Error fetching records:', error);
            inactiveBody.innerHTML = `<tr><td colspan="7" style="text-align:center; padding:2rem; color:red;">Failed to load data: ${escapeHtml(error.message)} <br>(Did you run the ALTER TABLE sql to add updated_at?)</td></tr>`;
        }
    }

    function populateClassFilter() {
        const currentValue = classFilter.value !== 'All' ? classFilter.value : initialClass;
        const classes = [...new Set(loadedRecords
            .map(student => student.applying_for_class)
            .filter(Boolean))]
            .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));

        classFilter.innerHTML = '<option value="All">All Classes</option>';
        classes.forEach(className => {
            const option = document.createElement('option');
            option.value = className;
            option.textContent = className;
            classFilter.appendChild(option);
        });
        classFilter.value = classes.includes(currentValue) ? currentValue : 'All';
        initialClass = null;
    }

    function renderRecords() {
        const searchTerm = studentSearch.value.trim().toLowerCase();
        const selectedClass = classFilter.value;
        const filteredData = loadedRecords.filter(student => {
            const matchesSearch = !searchTerm || [student.full_name, student.roll_number, student.father_name]
                .some(value => String(value || '').toLowerCase().includes(searchTerm));
            const matchesClass = selectedClass === 'All' || student.applying_for_class === selectedClass;
            return matchesSearch && matchesClass;
        });

        if (filteredData.length === 0) {
            inactiveBody.innerHTML = '<tr><td colspan="7" style="text-align:center; padding:2rem; color:var(--text-muted);">No matching records found.</td></tr>';
            return;
        }

            // Clear table
            inactiveBody.innerHTML = '';
            
            filteredData.forEach(student => {
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
                    <td><strong>${escapeHtml(student.roll_number || 'N/A')}</strong></td>
                    <td>${escapeHtml(student.full_name || 'N/A')}</td>
                    <td>${escapeHtml(student.father_name || 'N/A')}</td>
                    <td>${escapeHtml(student.applying_for_class || 'N/A')}</td>
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
    }

    function escapeHtml(value) {
        const div = document.createElement('div');
        div.textContent = String(value || '');
        return div.innerHTML;
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
