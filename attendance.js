let allStudents = [];
let allAttendance = [];
let selectedDate = '';
let currentAbsenceMap = {}; 

document.addEventListener('DOMContentLoaded', async () => {
    const picker = document.getElementById('globalDate');
    picker.valueAsDate = new Date();
    selectedDate = picker.value;
    document.getElementById('tableDateDisplay').textContent = new Date(selectedDate).toLocaleDateString('en-GB');

    picker.addEventListener('change', (e) => {
        selectedDate = e.target.value;
        document.getElementById('tableDateDisplay').textContent = new Date(selectedDate).toLocaleDateString('en-GB');
        renderData();
    });

    document.getElementById('entryRoll').addEventListener('input', handleRollLookup);
    document.getElementById('attendanceForm').addEventListener('submit', handleEntrySubmit);

    document.getElementById('searchFilter').addEventListener('input', renderData);
    document.getElementById('statusFilter').addEventListener('change', renderData);

    document.getElementById('btnBulkPresent').addEventListener('click', () => applyBulkStatus('Present'));
    document.getElementById('btnBulkAbsent').addEventListener('click', () => applyBulkStatus('Absent'));
    document.getElementById('btnBulkHoliday').addEventListener('click', () => applyBulkStatus('Holiday'));

    showToast("Initializing System...", "success");
    await loadDatabase();
});

async function fetchAllPages(table, selectCols, filters = []) {
    const PAGE_SIZE = 1000;
    let allData = [];
    let from = 0;

    while (true) {
        let query = supabaseClient
            .from(table)
            .select(selectCols)
            .range(from, from + PAGE_SIZE - 1);

        for (const [col, val] of filters) {
            query = query.eq(col, val);
        }

        const { data, error } = await query;
        if (error) throw error;
        if (!data || data.length === 0) break;

        allData = allData.concat(data);
        if (data.length < PAGE_SIZE) break; // last page
        from += PAGE_SIZE;
    }

    return allData;
}

async function loadDatabase() {
    document.getElementById('loader').style.display = 'block';
    document.getElementById('attendanceTable').style.opacity = '0.3';
    
    try {
        allStudents = await fetchAllPages(
            'admissions',
            'id, roll_number, full_name, applying_for_class',
            [['status', 'Active']]
        );

        allAttendance = await fetchAllPages('attendance', '*');

    } catch (err) {
        showToast("Database Connection Error", "error");
        console.error(err);
    }
    
    document.getElementById('loader').style.display = 'none';
    document.getElementById('attendanceTable').style.opacity = '1';
    renderData();
}

function handleRollLookup(e) {
    const rNo = String(e.target.value).trim();
    const stu = allStudents.find(s => String(s.roll_number) === rNo);
    if(stu) {
        document.getElementById('entryName').value = stu.full_name;
        document.getElementById('entryClass').value = stu.applying_for_class;
        e.target.classList.add('highlight-input');
    } else {
        document.getElementById('entryName').value = '';
        document.getElementById('entryClass').value = '';
        e.target.classList.remove('highlight-input');
    }
}

async function handleEntrySubmit(e) {
    e.preventDefault();
    const rNo = document.getElementById('entryRoll').value;
    const s = allStudents.find(x => String(x.roll_number) === rNo);
    
    if(!s) return showToast("Invalid Roll Number", "error");
    
    const payload = {
        student_id: s.id,
        date: selectedDate,
        status: document.getElementById('entryStatus').value || 'Absent'
    };

    await performUpsert([payload]);
    document.getElementById('entryRoll').value = '';
    document.getElementById('entryName').value = '';
    document.getElementById('entryClass').value = '';
    document.getElementById('entryRoll').focus();
}

async function performUpsert(payloadArray) {
    try {
        const { error } = await supabaseClient
            .from('attendance')
            .upsert(payloadArray, { onConflict: 'student_id, date' });
        
        if (error) throw error;
        
        payloadArray.forEach(payload => {
            const existingIdx = allAttendance.findIndex(a => a.student_id === payload.student_id && a.date === payload.date);
            if(existingIdx >= 0) {
                allAttendance[existingIdx] = payload;
            } else {
                allAttendance.push(payload);
            }
        });
        
        showToast(`Successfully saved records!`);
        renderData();
    } catch (err) {
        showToast("Save Failed!", "error");
        console.error(err);
    }
}

window.updateRow = async function(studentId) {
    const tr = document.getElementById(`row-${studentId}`);
    const sel = tr.querySelector('.inline-select').value;
    
    if (sel === '-') return; // Skip if unmarked
    
    await performUpsert([{
        student_id: studentId,
        date: selectedDate,
        status: sel
    }]);
}

async function applyBulkStatus(status) {
    const rows = document.querySelectorAll('#attendanceBody tr');
    let toUpsert = [];
    rows.forEach(tr => {
        const sid = tr.dataset.id;
        if(sid) {
            toUpsert.push({ student_id: sid, date: selectedDate, status: status });
        }
    });

    if(toUpsert.length === 0) return showToast("No rows visible", "error");

    showToast(`Bulk applying ${status}...`);
    await performUpsert(toUpsert);
}

function renderData() {
    const tbody = document.getElementById('attendanceBody');
    tbody.innerHTML = '';
    
    const searchVal = document.getElementById('searchFilter').value.toLowerCase();
    const statusVal = document.getElementById('statusFilter').value;

    const todayDict = {};
    allAttendance.forEach(att => {
        if(att.date === selectedDate) {
            todayDict[att.student_id] = att;
        }
    });

    currentAbsenceMap = {};
    allAttendance.forEach(att => {
        if(att.status === 'Absent') {
            currentAbsenceMap[att.student_id] = (currentAbsenceMap[att.student_id] || 0) + 1;
        }
    });

    let stats = { total: allStudents.length, p: 0, a: 0, warn: 0 };
    let viewList = [...allStudents].sort((a,b) => a.roll_number - b.roll_number);

    viewList.forEach(student => {
        const record = todayDict[student.id] || { status: '-', remarks: '' };
        const stType = record.status;
        const totalAb = currentAbsenceMap[student.id] || 0;
        
        if(stType === 'Present') stats.p++;
        if(stType === 'Absent') stats.a++;
        if(totalAb > 2) stats.warn++;

        if(statusVal !== 'All' && stType !== statusVal) return;
        
        if(searchVal) {
            const composite = `${student.roll_number} ${student.full_name} ${student.applying_for_class}`.toLowerCase();
            if(!composite.includes(searchVal)) return;
        }

        const tr = document.createElement('tr');
        tr.id = `row-${student.id}`;
        tr.dataset.id = student.id;
        
        let badgeClass = '';
        if(totalAb > 2) badgeClass = 'critical';

        tr.innerHTML = `
            <td class="col-roll">${student.roll_number}</td>
            <td><strong>${student.full_name}</strong></td>
            <td>${student.applying_for_class}</td>
            <td><span class="absent-count ${badgeClass}">${totalAb}</span></td>
            <td>
                <select class="inline-select ${stType !== '-' ? stType : ''}" onchange="updateRow('${student.id}')">
                    ${stType === '-' ? '<option value="-" selected disabled>---</option>' : ''}
                    <option value="Present" ${stType === 'Present' ? 'selected' : ''}>Present</option>
                    <option value="Absent" ${stType === 'Absent' ? 'selected' : ''}>Absent</option>
                    <option value="Late" ${stType === 'Late' ? 'selected' : ''}>Late</option>
                    <option value="Holiday" ${stType === 'Holiday' ? 'selected' : ''}>Holiday</option>
                </select>
            </td>
            <td>
                <button class="btn-icon save" onclick="updateRow('${student.id}')" title="Force Save">💾</button>
            </td>
        `;
        tbody.appendChild(tr);
    });

    if(tbody.children.length === 0) {
        tbody.innerHTML = `<tr><td colspan="6" style="padding:2rem; text-align:center;">No students matched the filtering criteria.</td></tr>`;
    }

    document.getElementById('statTotal').textContent = stats.total;
    document.getElementById('statPresent').textContent = stats.p;
    document.getElementById('statAbsent').textContent = stats.a;
}

function showToast(msg, type = 'success') {
    const container = document.getElementById('toastContainer');
    const t = document.createElement('div');
    t.classList.add('toast', type);
    
    const icon = type === 'success' ? '✅' : '🔴';
    t.innerHTML = `<span>${icon}</span> <div>${msg}</div>`;
    
    container.appendChild(t);
    
    setTimeout(() => {
        t.classList.add('fade-out');
        t.addEventListener('animationend', () => t.remove());
    }, 3000);
}
