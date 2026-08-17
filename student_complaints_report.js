let allStudents = [];
let allComplaints = [];
let dynamicCategories = [];

const fontSizeRange = document.getElementById('fontSizeRange');
const compactnessRange = document.getElementById('compactnessRange');
const fontSizeValue = document.getElementById('fontSizeValue');
const compactnessValue = document.getElementById('compactnessValue');

const LS_KEYS = {
    fontSize: 'studentComplaints.fontSize',
    compactness: 'studentComplaints.compactness'
};

function applyLayoutControls() {
    const font = parseFloat(fontSizeRange.value || '8.5');
    const compact = parseFloat(compactnessRange.value || '80');

    const tdVertical = Math.max(2, 8 - (compact * 0.05));
    const tdHorizontal = Math.max(4, 8 - (compact * 0.03));
    const thVertical = Math.max(2.2, 9 - (compact * 0.055));
    const thHorizontal = Math.max(4, 8 - (compact * 0.03));

    const printFont = Math.max(7, font - 0.5);
    const printTdVertical = Math.max(0.9, 2.8 - (compact * 0.015));
    const printTdHorizontal = Math.max(2.4, 4 - (compact * 0.013));
    const printThVertical = Math.max(1.2, 3 - (compact * 0.016));
    const printThHorizontal = Math.max(2.4, 4 - (compact * 0.013));

    document.documentElement.style.setProperty('--table-font-size', `${font}px`);
    document.documentElement.style.setProperty('--table-td-pad', `${tdVertical.toFixed(1)}px ${tdHorizontal.toFixed(1)}px`);
    document.documentElement.style.setProperty('--table-th-pad', `${thVertical.toFixed(1)}px ${thHorizontal.toFixed(1)}px`);

    document.documentElement.style.setProperty('--print-font-size', `${printFont.toFixed(1)}px`);
    document.documentElement.style.setProperty('--print-td-pad', `${printTdVertical.toFixed(1)}px ${printTdHorizontal.toFixed(1)}px`);
    document.documentElement.style.setProperty('--print-th-pad', `${printThVertical.toFixed(1)}px ${printThHorizontal.toFixed(1)}px`);

    fontSizeValue.textContent = `${font.toFixed(1)}px`;
    compactnessValue.textContent = `${Math.round(compact)}%`;
}

window.onAppReady(async () => {
    // Restore UI preferences
    fontSizeRange.value = localStorage.getItem(LS_KEYS.fontSize) || '8.5';
    compactnessRange.value = localStorage.getItem(LS_KEYS.compactness) || '80';
    applyLayoutControls();
    
    fontSizeRange.addEventListener('input', applyLayoutControls);
    compactnessRange.addEventListener('input', applyLayoutControls);
    fontSizeRange.addEventListener('change', () => localStorage.setItem(LS_KEYS.fontSize, fontSizeRange.value));
    compactnessRange.addEventListener('change', () => localStorage.setItem(LS_KEYS.compactness, compactnessRange.value));

    // Wait for auth to initialize
    const checkAuth = setInterval(async () => {
        if (window.authReady && window.supabaseClient) {
            clearInterval(checkAuth);
            await loadClasses();
            
            // Set up event listeners
            document.getElementById('loadBtn').addEventListener('click', loadReport);
            document.getElementById('printBtn').addEventListener('click', () => {
                document.body.classList.remove('printing-cards');
                const now = new Date();
                document.getElementById('printDateHeader').textContent = 
                    `Student Complaints Report - Printed on ${now.toLocaleDateString()} ${now.toLocaleTimeString()}`;
                window.print();
            });
            document.getElementById('printCardsBtn').addEventListener('click', () => {
                document.body.classList.add('printing-cards');
                window.print();
                document.body.classList.remove('printing-cards');
            });
            document.getElementById('searchText').addEventListener('input', renderTable);
            
            document.getElementById('monthFilter').addEventListener('change', (e) => {
                const m = e.target.value;
                if (!m) return;
                const year = new Date().getFullYear();
                const firstDay = `${year}-${m}-01`;
                const lastDayObj = new Date(year, parseInt(m), 0);
                const lastDay = `${year}-${m}-${String(lastDayObj.getDate()).padStart(2, '0')}`;
                
                document.getElementById('fromDate').value = firstDay;
                document.getElementById('toDate').value = lastDay;
            });
        }
    }, 100);
});

function esc(s) {
    return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

async function loadDynamicCategories(schoolId, className) {
    const defaultCats = ["Homework","Fee","Fair Copy","Book(s)","Copies","Late Coming","Dress Code","Attendance"];
    try {
        let query = window.supabaseClient.from('publisher_config').select('category');
        if (schoolId) {
            query = query.eq('school_id', schoolId);
        }
        if (className) {
            query = query.eq('class_name', className);
        }
        const { data, error } = await query;
        if (error) throw error;
        
        let cats = [];
        if (data && data.length > 0) {
            cats = [...new Set(data.map(d => d.category))].filter(Boolean).sort();
        }
        
        // If filtering by class yielded no configs, fall back to school-wide configurations
        if (cats.length === 0 && className) {
            let fallbackQuery = window.supabaseClient.from('publisher_config').select('category');
            if (schoolId) {
                fallbackQuery = fallbackQuery.eq('school_id', schoolId);
            }
            const { data: fbData } = await fallbackQuery;
            if (fbData && fbData.length > 0) {
                cats = [...new Set(fbData.map(d => d.category))].filter(Boolean).sort();
            }
        }
        
        dynamicCategories = cats.length > 0 ? cats : defaultCats;
    } catch(err) {
        console.error("Failed to load dynamic categories", err);
        dynamicCategories = defaultCats;
    }
}

async function loadClasses() {
    try {
        let query = window.supabaseClient
            .from('classes')
            .select('class_name, section, display_order')
            .eq('is_active', true)
            .order('display_order', { ascending: true, nullsFirst: false })
            .order('class_name', { ascending: true })
            .order('section', { ascending: true });

        if (window.currentSchoolId) {
            query = query.eq('school_id', window.currentSchoolId);
        }

        const { data, error } = await query;
            
        if (error) throw error;
        
        const classFilter = document.getElementById('classFilter');
        classFilter.innerHTML = '<option value="">All Classes</option>';
        
        if (data) {
            data.forEach(c => {
                const opt = document.createElement('option');
                const val = `${c.class_name} ${c.section}`.trim();
                opt.value = val;
                opt.textContent = val;
                classFilter.appendChild(opt);
            });
        }
    } catch (err) {
        console.error("Error loading classes:", err);
    }
}

async function loadReport() {
    const classVal = document.getElementById('classFilter').value;
    const tbody = document.getElementById('reportBody');
    tbody.innerHTML = '<tr><td colspan="100%" class="empty">Loading data...</td></tr>';
    
    let schoolId = window.currentSchoolId;
    if (!schoolId && window.currentUser) {
        const { data: role } = await window.supabaseClient.from('user_roles').select('school_id').eq('user_id', window.currentUser.id).single();
        if (role) schoolId = role.school_id;
    }

    await loadDynamicCategories(schoolId, classVal);

    try {
        // 1. Fetch Students
        let qStudents = window.supabaseClient
            .from('admissions')
            .select('roll_number, full_name, father_name, applying_for_class')
            .eq('status', 'Active')
            .order('roll_number', { ascending: true });
            
        if (schoolId) qStudents = qStudents.eq('school_id', schoolId);
        if (classVal) qStudents = qStudents.eq('applying_for_class', classVal);
        
        const { data: students, error: sErr } = await qStudents;
        if (sErr) throw sErr;
        
        allStudents = students || [];

        // 2. Fetch Complaints for these rolls
        // If we have thousands of students, fetching all complaints might be heavy, but it's ok for one class or whole school.
        let qComplaints = window.supabaseClient
            .from('complaints')
            .select('roll, category, date, complaint');
            
        if (schoolId) qComplaints = qComplaints.eq('school_id', schoolId);
        
        const fromDate = document.getElementById('fromDate').value;
        const toDate = document.getElementById('toDate').value;
        if (fromDate) qComplaints = qComplaints.gte('date', fromDate);
        if (toDate) qComplaints = qComplaints.lte('date', toDate);
        
        // We do not filter by class here because complaints might have old class names. 
        // We match by roll.
        
        const { data: complaints, error: cErr } = await qComplaints;
        if (cErr) throw cErr;
        
        allComplaints = complaints || [];
        
        renderTable();
        
    } catch (err) {
        console.error("Error loading report:", err);
        tbody.innerHTML = `<tr><td colspan="100%" class="empty" style="color:red;">Error loading report. Please try again.</td></tr>`;
    }
}

function renderTable() {
    const tbody = document.getElementById('reportBody');
    tbody.innerHTML = '';
    
    const cardsContainer = document.getElementById('cardsPrintContainer');
    cardsContainer.className = 'card-container';
    cardsContainer.innerHTML = '';
    
    const searchVal = document.getElementById('searchText').value.toLowerCase().trim();
    
    // Aggregate complaints by roll
    const countsByRoll = {};
    allComplaints.forEach(c => {
        const r = String(c.roll).trim();
        if (!countsByRoll[r]) {
            countsByRoll[r] = { total: 0, other: 0, otherDetails: [], details: {} };
            dynamicCategories.forEach(cat => {
                countsByRoll[r][cat] = 0;
                countsByRoll[r].details[cat] = [];
            });
        }
        
        const cat = (c.category || '').trim();
        const matchedCat = dynamicCategories.find(dc => dc.toLowerCase() === cat.toLowerCase());
        
        if (matchedCat) {
            countsByRoll[r][matchedCat]++;
            if (c.complaint) {
                countsByRoll[r].details[matchedCat].push(`${c.date || ''}: ${c.complaint}`);
            }
        } else {
            countsByRoll[r].other++;
            if (c.complaint) {
                countsByRoll[r].otherDetails.push(`${cat || 'Other'} (${c.date || ''}): ${c.complaint}`);
            }
        }
        
        countsByRoll[r].total++;
    });

    const headerRow = document.getElementById('tableHeaderRow');
    if (headerRow) {
        headerRow.innerHTML = `
            <th>Roll No</th>
            <th>Student Name</th>
            <th>Father Name</th>
            <th>Class</th>
            ${dynamicCategories.map(cat => `<th style="text-align:center;">${esc(cat)}</th>`).join('')}
            <th style="text-align:center;">Other</th>
            <th style="text-align:center;">TOTAL</th>
        `;
    }

    let renderedCount = 0;
    
    // Sort students by total complaints descending
    const sortedStudents = [...allStudents].sort((a, b) => {
        const rollA = String(a.roll_number).trim();
        const rollB = String(b.roll_number).trim();
        const totalA = countsByRoll[rollA] ? countsByRoll[rollA].total : 0;
        const totalB = countsByRoll[rollB] ? countsByRoll[rollB].total : 0;
        return totalB - totalA;
    });
    
    sortedStudents.forEach(s => {
        const rollStr = String(s.roll_number).trim();
        
        if (searchVal) {
            const nameMatch = (s.full_name || '').toLowerCase().includes(searchVal);
            const rollMatch = rollStr.toLowerCase().includes(searchVal);
            if (!nameMatch && !rollMatch) return;
        }
        
        const c = countsByRoll[rollStr] || { total: 0, other: 0, otherDetails: [], details: {} };
        if (!countsByRoll[rollStr]) {
            dynamicCategories.forEach(cat => {
                c[cat] = 0;
                c.details[cat] = [];
            });
        }
        
        let dynamicColsHtml = dynamicCategories.map(cat => {
            const count = c[cat] || 0;
            const detailsList = c.details[cat] || [];
            const titleAttr = detailsList.length > 0 ? `title="${esc(detailsList.join('\n'))}"` : '';
            return `<td style="text-align:center;" class="cnt ${count === 0 ? 'zero' : ''}" ${titleAttr}>${count}</td>`;
        }).join('');
        
        const otherTitle = c.otherDetails && c.otherDetails.length > 0 
            ? `title="${esc(c.otherDetails.join('\n'))}"` 
            : '';
            
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td>${esc(s.roll_number)}</td>
            <td style="font-weight:600;">${esc(s.full_name)}</td>
            <td>${esc(s.father_name || '')}</td>
            <td>${esc(s.applying_for_class || '')}</td>
            ${dynamicColsHtml}
            <td style="text-align:center;" class="cnt ${c.other === 0 ? 'zero' : ''}" ${otherTitle}>${c.other || 0}</td>
            <td style="text-align:center; font-weight:800; color:#b91c1c;" class="${c.total === 0 ? 'cnt zero' : ''}">${c.total}</td>
        `;
        
        tbody.appendChild(tr);
        
        if (c.total > 0) {
            const monthSel = document.getElementById('monthFilter');
            let monthText = monthSel.options[monthSel.selectedIndex].text;
            if (monthText === 'Custom Range') {
                const fromD = document.getElementById('fromDate').value;
                const toD = document.getElementById('toDate').value;
                if (fromD || toD) monthText = `${fromD} to ${toD}`;
                else monthText = new Date().toLocaleString('default', { month: 'long' });
            }

            const card = document.createElement('div');
            card.className = 'student-card';
            card.innerHTML = `
                <h2>Zahid School</h2>
                <div class="phone">03337502737</div>
                <div class="month">Month: ${monthText}</div>
                <div class="info">${s.full_name} (${s.roll_number}) &nbsp;|&nbsp; ${s.father_name || '-'} &nbsp;|&nbsp; Class: ${s.applying_for_class || '-'}</div>
                <table>
                    <thead>
                        <tr>
                            <th>Category</th>
                            <th>Complaints</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${dynamicCategories.map(cat => `<tr><td>${esc(cat)}</td><td>${c[cat] || 0}</td></tr>`).join('')}
                        <tr><td>Other</td><td>${c.other || 0}</td></tr>
                        <tr style="font-weight:bold; color:#000;"><td>Total</td><td>${c.total}</td></tr>
                    </tbody>
                </table>
            `;
            cardsContainer.appendChild(card);
        }
        
        renderedCount++;
    });
    
    if (renderedCount === 0) {
        tbody.innerHTML = `<tr><td colspan="100%" class="empty">No students found matching the criteria.</td></tr>`;
    }
}
