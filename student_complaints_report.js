let allStudents = [];
let allComplaints = [];

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

document.addEventListener('DOMContentLoaded', async () => {
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
                const now = new Date();
                document.getElementById('printDateHeader').textContent = 
                    `Student Complaints Report - Printed on ${now.toLocaleDateString()} ${now.toLocaleTimeString()}`;
                window.print();
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
    tbody.innerHTML = '<tr><td colspan="14" class="empty">Loading data...</td></tr>';
    
    let schoolId = window.currentSchoolId;
    if (!schoolId && window.currentUser) {
        const { data: role } = await window.supabaseClient.from('user_roles').select('school_id').eq('user_id', window.currentUser.id).single();
        if (role) schoolId = role.school_id;
    }

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
            .select('roll, category, date');
            
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
        tbody.innerHTML = `<tr><td colspan="14" class="empty" style="color:red;">Error loading report. Please try again.</td></tr>`;
    }
}

function renderTable() {
    const tbody = document.getElementById('reportBody');
    tbody.innerHTML = '';
    
    const searchVal = document.getElementById('searchText').value.toLowerCase().trim();
    
    // Aggregate complaints by roll
    const countsByRoll = {};
    allComplaints.forEach(c => {
        const r = String(c.roll).trim();
        if (!countsByRoll[r]) {
            countsByRoll[r] = {
                homework: 0,
                fee: 0,
                fair_copy: 0,
                books: 0,
                copies: 0,
                late: 0,
                dress: 0,
                attendance: 0,
                other: 0,
                total: 0
            };
        }
        
        const cat = (c.category || '').toLowerCase().trim();
        if (cat === 'homework') countsByRoll[r].homework++;
        else if (cat === 'fee') countsByRoll[r].fee++;
        else if (cat === 'fair copy') countsByRoll[r].fair_copy++;
        else if (cat === 'book(s)' || cat === 'books') countsByRoll[r].books++;
        else if (cat === 'copies') countsByRoll[r].copies++;
        else if (cat === 'late coming') countsByRoll[r].late++;
        else if (cat === 'dressing code' || cat === 'dress code') countsByRoll[r].dress++;
        else if (cat === 'attendance') countsByRoll[r].attendance++;
        else countsByRoll[r].other++; // Includes "No Response" or "Other"
        
        countsByRoll[r].total++;
    });

    let renderedCount = 0;
    
    allStudents.forEach(s => {
        const rollStr = String(s.roll_number).trim();
        
        if (searchVal) {
            const nameMatch = (s.full_name || '').toLowerCase().includes(searchVal);
            const rollMatch = rollStr.toLowerCase().includes(searchVal);
            if (!nameMatch && !rollMatch) return;
        }
        
        const c = countsByRoll[rollStr] || {
            homework: 0, fee: 0, fair_copy: 0, books: 0, copies: 0, late: 0, dress: 0, attendance: 0, other: 0, total: 0
        };
        
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td>${s.roll_number}</td>
            <td style="font-weight:600;">${s.full_name}</td>
            <td>${s.father_name || ''}</td>
            <td>${s.applying_for_class || ''}</td>
            <td style="text-align:center;" class="cnt ${c.homework === 0 ? 'zero' : ''}">${c.homework}</td>
            <td style="text-align:center;" class="cnt ${c.fee === 0 ? 'zero' : ''}">${c.fee}</td>
            <td style="text-align:center;" class="cnt ${c.fair_copy === 0 ? 'zero' : ''}">${c.fair_copy}</td>
            <td style="text-align:center;" class="cnt ${c.books === 0 ? 'zero' : ''}">${c.books}</td>
            <td style="text-align:center;" class="cnt ${c.copies === 0 ? 'zero' : ''}">${c.copies}</td>
            <td style="text-align:center;" class="cnt ${c.late === 0 ? 'zero' : ''}">${c.late}</td>
            <td style="text-align:center;" class="cnt ${c.dress === 0 ? 'zero' : ''}">${c.dress}</td>
            <td style="text-align:center;" class="cnt ${c.attendance === 0 ? 'zero' : ''}">${c.attendance}</td>
            <td style="text-align:center;" class="cnt ${c.other === 0 ? 'zero' : ''}">${c.other}</td>
            <td style="text-align:center; font-weight:800; color:#b91c1c;" class="${c.total === 0 ? 'cnt zero' : ''}">${c.total}</td>
        `;
        
        tbody.appendChild(tr);
        renderedCount++;
    });
    
    if (renderedCount === 0) {
        tbody.innerHTML = `<tr><td colspan="14" class="empty">No students found matching the criteria.</td></tr>`;
    }
}
