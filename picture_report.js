document.addEventListener('DOMContentLoaded', async () => {
    const classFilter = document.getElementById('classFilter');
    const photoFilter = document.getElementById('photoFilter');
    const reportTableBody = document.getElementById('reportTableBody');
    const studentCount = document.getElementById('studentCount');
    const printBtn = document.getElementById('printBtn');

    await waitForAuthContext();

    const applySchoolScope = (query) => {
        const sid = window.currentSchoolId || null;
        return sid ? query.eq('school_id', sid) : query;
    };

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

    async function loadClasses() {
        try {
            const { data, error } = await applySchoolScope(supabaseClient
                .from('admissions')
                .select('applying_for_class')
                .eq('status', 'Active'));
                
            if (error) throw error;
            
            if (data && data.length > 0) {
                const uniqueClasses = [...new Set(data
                    .map(c => c.applying_for_class)
                    .filter(c => c && c.trim() !== '')
                )].sort();

                classFilter.innerHTML = '<option value="">-- Select Class --</option>' + 
                    uniqueClasses.map(c => `<option value="${c}">${c}</option>`).join('');
            } else {
                classFilter.innerHTML = '<option value="">No classes found</option>';
            }
        } catch (error) {
            console.error('Error fetching classes:', error);
            classFilter.innerHTML = '<option value="">Error loading classes</option>';
        }
    }

    async function fetchReport() {
        const selectedClass = classFilter.value;
        const photoStatus = photoFilter.value;

        if (!selectedClass) {
            reportTableBody.innerHTML = '<tr><td colspan="4" style="text-align:center;">Select a class to view report</td></tr>';
            studentCount.textContent = '0';
            return;
        }

        reportTableBody.innerHTML = '<tr><td colspan="4" style="text-align:center;">Loading data...</td></tr>';

        try {
            let query = applySchoolScope(supabaseClient
                .from('admissions')
                .select('roll_number, full_name, father_name, photo_url')
                .eq('status', 'Active')
                .eq('applying_for_class', selectedClass)
                .order('roll_number', { ascending: true }));

            const { data, error } = await query;
            if (error) throw error;

            let filteredData = data;
            if (photoStatus === 'no_pic') {
                filteredData = data.filter(s => !s.photo_url || s.photo_url.trim() === '');
            } else if (photoStatus === 'has_pic') {
                filteredData = data.filter(s => s.photo_url && s.photo_url.trim() !== '');
            }

            studentCount.textContent = filteredData.length;

            if (filteredData.length === 0) {
                reportTableBody.innerHTML = '<tr><td colspan="4" style="text-align:center;">No students match the criteria.</td></tr>';
                return;
            }

            reportTableBody.innerHTML = filteredData.map(student => {
                const hasPhoto = student.photo_url && student.photo_url.trim() !== '';
                const photoHtml = hasPhoto 
                    ? `<img src="${student.photo_url}" class="student-photo" alt="Photo">`
                    : `<div class="student-photo no-photo">No Pic</div>`;

                return `
                    <tr>
                        <td style="font-weight:bold;">${student.roll_number}</td>
                        <td style="font-weight:600; color:var(--primary);">${student.full_name || '-'}</td>
                        <td>${student.father_name || '-'}</td>
                        <td>${photoHtml}</td>
                    </tr>
                `;
            }).join('');

        } catch (error) {
            console.error('Error fetching report:', error);
            reportTableBody.innerHTML = `<tr><td colspan="4" style="text-align:center; color:red;">Error: ${error.message}</td></tr>`;
        }
    }

    classFilter.addEventListener('change', fetchReport);
    photoFilter.addEventListener('change', fetchReport);

    printBtn.addEventListener('click', () => {
        window.print();
    });

    loadClasses();
});
