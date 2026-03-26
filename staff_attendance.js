// ═══════════════════════════════════════════════════════════════════════════════
// staff_attendance.js — Mirrors the Student Attendance System exactly
// ═══════════════════════════════════════════════════════════════════════════════

let allStaff = [];
let allAttendance = [];
let selectedDate = '';

document.addEventListener('DOMContentLoaded', async () => {
    const checkAuth = setInterval(() => {
        if (window.authReady) {
            clearInterval(checkAuth);
            if (!window.canView('staff_attendance')) {
                window.location.href = 'dashboard.html?denied=1';
                return;
            }
            initSystem();
        }
    }, 100);
});

async function initSystem() {
    const picker = document.getElementById('globalDate');
    picker.valueAsDate = new Date();
    selectedDate = picker.value;
    document.getElementById('tableDateDisplay').textContent = new Date(selectedDate + 'T00:00:00').toLocaleDateString('en-GB');

    picker.addEventListener('change', (e) => {
        selectedDate = e.target.value;
        document.getElementById('tableDateDisplay').textContent = new Date(selectedDate + 'T00:00:00').toLocaleDateString('en-GB');
        renderData();
    });

    document.getElementById('searchFilter').addEventListener('input', renderData);
    document.getElementById('statusFilter').addEventListener('change', renderData);

    document.getElementById('btnBulkPresent').addEventListener('click', () => applyBulkStatus('Present'));
    document.getElementById('btnBulkAbsent').addEventListener('click', () => applyBulkStatus('Absent'));
    document.getElementById('btnBulkLeave').addEventListener('click', () => applyBulkStatus('Leave'));

    showToast("Loading attendance data...", "success");
    await loadDatabase();
}

async function loadDatabase() {
    document.getElementById('loader').style.display = 'block';
    document.getElementById('attendanceTable').style.opacity = '0.3';

    try {
        const { data: staffData, error: sErr } = await window.supabaseClient
            .from('staff')
            .select('id, employee_id, full_name')
            .eq('status', 'Active')
            .order('employee_id');
        if (sErr) throw sErr;
        allStaff = staffData || [];

        const { data: attData, error: aErr } = await window.supabaseClient
            .from('staff_attendance')
            .select('*');
        if (aErr) throw aErr;
        allAttendance = attData || [];

    } catch (err) {
        showToast("Database Connection Error", "error");
        console.error(err);
    }

    document.getElementById('loader').style.display = 'none';
    document.getElementById('attendanceTable').style.opacity = '1';
    renderData();
}

async function performUpsert(payloadArray) {
    try {
        const { error } = await window.supabaseClient
            .from('staff_attendance')
            .upsert(payloadArray, { onConflict: 'staff_id, date' });

        if (error) throw error;

        payloadArray.forEach(payload => {
            const idx = allAttendance.findIndex(a => a.staff_id === payload.staff_id && a.date === payload.date);
            if (idx >= 0) {
                allAttendance[idx] = { ...allAttendance[idx], ...payload };
            } else {
                allAttendance.push(payload);
            }
        });

        showToast("Saved successfully!");
        renderData();
    } catch (err) {
        showToast("Save Failed!", "error");
        console.error(err);
    }
}

// Called when a single row dropdown changes
window.updateRow = async function(staffId) {
    const tr = document.getElementById(`row-${staffId}`);
    const sel = tr.querySelector('.inline-select').value;
    if (sel === '-') return;

    await performUpsert([{
        staff_id: staffId,
        date: selectedDate,
        status: sel,
        created_by: window.currentUser?.id
    }]);
};

async function applyBulkStatus(status) {
    const rows = document.querySelectorAll('#attendanceBody tr');
    let toUpsert = [];
    rows.forEach(tr => {
        const sid = tr.dataset.id;
        if (sid) {
            toUpsert.push({ staff_id: sid, date: selectedDate, status: status, created_by: window.currentUser?.id });
        }
    });

    if (toUpsert.length === 0) return showToast("No rows visible", "error");
    showToast(`Bulk applying ${status}...`);
    await performUpsert(toUpsert);
}

function renderData() {
    const tbody = document.getElementById('attendanceBody');
    tbody.innerHTML = '';

    const searchVal = document.getElementById('searchFilter').value.toLowerCase();
    const statusVal = document.getElementById('statusFilter').value;

    // Build today's attendance dictionary
    const todayDict = {};
    allAttendance.forEach(att => {
        if (att.date === selectedDate) {
            todayDict[att.staff_id] = att;
        }
    });

    // Build total absence count per staff
    const absentMap = {};
    allAttendance.forEach(att => {
        if (att.status === 'Absent') {
            absentMap[att.staff_id] = (absentMap[att.staff_id] || 0) + 1;
        }
    });

    let stats = { total: allStaff.length, present: 0, absent: 0, leave: 0 };

    allStaff.forEach(staff => {
        const record = todayDict[staff.id] || { status: '-' };
        const st = record.status;
        const totalAbs = absentMap[staff.id] || 0;

        if (st === 'Present') stats.present++;
        if (st === 'Absent') stats.absent++;
        if (st === 'Leave') stats.leave++;

        // Apply status filter
        if (statusVal !== 'All' && st !== statusVal) return;

        // Apply search filter
        if (searchVal) {
            const composite = `${staff.employee_id} ${staff.full_name}`.toLowerCase();
            if (!composite.includes(searchVal)) return;
        }

        const tr = document.createElement('tr');
        tr.id = `row-${staff.id}`;
        tr.dataset.id = staff.id;

        const badgeClass = totalAbs > 3 ? 'critical' : '';

        tr.innerHTML = `
            <td class="col-roll">${staff.employee_id}</td>
            <td><strong>${staff.full_name}</strong></td>
            <td><span class="absent-count ${badgeClass}">${totalAbs}</span></td>
            <td>
                <select class="inline-select ${st !== '-' ? st : ''}" onchange="updateRow('${staff.id}')">
                    ${st === '-' ? '<option value="-" selected disabled>---</option>' : ''}
                    <option value="Present" ${st === 'Present' ? 'selected' : ''}>✅ Present</option>
                    <option value="Absent" ${st === 'Absent' ? 'selected' : ''}>❌ Absent</option>
                    <option value="Leave" ${st === 'Leave' ? 'selected' : ''}>🏖️ Leave</option>
                </select>
            </td>
            <td>
                <button class="btn-icon save" onclick="updateRow('${staff.id}')" title="Force Save">💾</button>
            </td>
        `;
        tbody.appendChild(tr);
    });

    if (tbody.children.length === 0) {
        tbody.innerHTML = `<tr><td colspan="5" style="padding:2rem; text-align:center;">No staff matched the filter criteria.</td></tr>`;
    }

    document.getElementById('statTotal').textContent = stats.total;
    document.getElementById('statPresent').textContent = stats.present;
    document.getElementById('statAbsent').textContent = stats.absent;
    document.getElementById('statLeave').textContent = stats.leave;
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
