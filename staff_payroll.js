// ═══════════════════════════════════════════════════════════════════════════════
// staff_payroll.js — Calculates absents and generates monthly salary slips
// ═══════════════════════════════════════════════════════════════════════════════

let staffDataList = [];
let currentMonthStr = "";

document.addEventListener('DOMContentLoaded', () => {
    const checkAuth = setInterval(() => {
        if (window.authReady) {
            clearInterval(checkAuth);
            if (!window.canView('staff_payroll')) {
                window.location.href = 'dashboard.html?denied=1';
                return;
            }
            initPayrollModule();
        }
    }, 100);
});

function initPayrollModule() {
    // Default config: current month
    const now = new Date();
    // YYYY-MM
    let y = now.getFullYear();
    let m = (now.getMonth() + 1).toString().padStart(2, '0');
    document.getElementById('payrollMonth').value = `${y}-${m}`;
}

async function loadPayrollData() {
    const monthInput = document.getElementById('payrollMonth').value;
    if (!monthInput) { showToast('Please select a valid month', 'error'); return; }

    const tbody = document.getElementById('payrollGrid');
    tbody.innerHTML = '<tr><td colspan="7" style="text-align: center; padding: 2rem;"><i class="fas fa-spinner fa-spin"></i> Processing Salary Data...</td></tr>';

    try {
        // Parse date boundaries
        const [year, month] = monthInput.split('-');
        const startDate = `${year}-${month}-01`;
        const endDate = new Date(year, month, 0).toISOString().split('T')[0];
        
        // Month string for DB logic e.g. "March 2026"
        const monthNames = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
        currentMonthStr = `${monthNames[parseInt(month)-1]} ${year}`;

        // 1. Fetch Active Staff
        const { data: staffData, error: staffErr } = await window.supabaseClient
            .from('staff')
            .select('id, full_name, employee_id, base_salary')
            .eq('status', 'Active')
            .order('employee_id');
        if (staffErr) throw staffErr;
        
        // 2. Fetch Attendance for this month (Absents only)
        const { data: attData, error: attErr } = await window.supabaseClient
            .from('staff_attendance')
            .select('staff_id')
            .eq('status', 'Absent')
            .gte('date', startDate)
            .lte('date', endDate);
        if (attErr) throw attErr;

        // Group Absents by staff_id
        const absentMap = {};
        if (attData) {
            attData.forEach(r => {
                absentMap[r.staff_id] = (absentMap[r.staff_id] || 0) + 1;
            });
        }

        // 3. Check if Payroll already generated for this month
        const { data: payData, error: payErr } = await window.supabaseClient
            .from('staff_payroll')
            .select('*')
            .eq('salary_month', currentMonthStr);
        if (payErr) throw payErr;
        
        // Map existing payroll state
        const payrollMap = {};
        if (payData) {
            payData.forEach(p => { payrollMap[p.staff_id] = p; });
        }

        // Prepare Master Data List
        staffDataList = staffData.map(s => {
            const absentsCount = absentMap[s.id] || 0;
            const dailyRate = Math.round(Number(s.base_salary) / 30);
            const calculatedDeduction = absentsCount * dailyRate;
            
            // If already generated, load existing numbers
            const existing = payrollMap[s.id];
            
            return {
                staff_id: s.id,
                name: s.full_name,
                emp_id: s.employee_id,
                base_salary: Number(s.base_salary),
                absents: absentsCount,
                deduction: existing ? Number(existing.leave_deductions) : calculatedDeduction,
                advance: existing ? Number(existing.advance_given) : 0,
                status: existing ? existing.status : 'None'
            };
        });

        renderGrid();

    } catch (err) {
        console.error(err);
        tbody.innerHTML = `<tr><td colspan="7" style="text-align: center; color: red;">Error: ${err.message}</td></tr>`;
    }
}

function renderGrid() {
    const tbody = document.getElementById('payrollGrid');
    if (staffDataList.length === 0) {
        tbody.innerHTML = '<tr><td colspan="7" style="text-align: center; color: #64748b; padding: 2rem;">No active staff records.</td></tr>';
        return;
    }

    tbody.innerHTML = staffDataList.map((item, index) => {
        // Compute dynamically
        const netPayable = item.base_salary - item.deduction - item.advance;
        
        // Badges
        let bClass = 'missing', bText = 'Not Generated';
        if (item.status === 'Paid') { bClass = 'paid'; bText = 'PAID'; }
        if (item.status === 'Unpaid') { bClass = 'unpaid'; bText = 'UNPAID'; }

        // Disable inputs if already paid
        const isPaid = item.status === 'Paid';
        const advInput = `<input type="number" class="input-mini" min="0" value="${item.advance}" oninput="updateRowCalc(${index}, this.value)" ${isPaid ? 'disabled' : ''}>`;
        
        return `
            <tr id="row_${index}">
                <td>
                    <div class="staff-info">
                        <span class="staff-name">${item.name}</span>
                        <span class="staff-id">${item.emp_id}</span>
                    </div>
                </td>
                <td class="money">Rs ${item.base_salary.toLocaleString()}</td>
                <td style="color: var(--danger); font-weight: 600;">${item.absents} Days</td>
                <td class="money" style="color: var(--danger);">- Rs ${item.deduction.toLocaleString()}</td>
                <td>${advInput}</td>
                <td class="money total-net">Rs ${Math.max(0, netPayable).toLocaleString()}</td>
                <td><span class="badge ${bClass}">${bText}</span></td>
            </tr>
        `;
    }).join('');
}

// Called when Advance input changes
window.updateRowCalc = function(index, advText) {
    const item = staffDataList[index];
    item.advance = parseInt(advText) || 0;
    
    // Update UI Net Payable
    const netPayable = Math.max(0, item.base_salary - item.deduction - item.advance);
    const tr = document.getElementById(`row_${index}`);
    tr.querySelector('.total-net').textContent = `Rs ${netPayable.toLocaleString()}`;
};

async function saveAllChallans() {
    if (!currentMonthStr || staffDataList.length === 0) {
        showToast('Please Calculate Deductions first', 'error'); return;
    }

    // Filter out Already Paid ones, we don't want to re-upsert and mess them up usually, 
    // but UPSERT is safe if we strictly override. Wait, we should only generate for Unpaid/None.
    const toUpsert = [];
    staffDataList.forEach(item => {
        if (item.status !== 'Paid') {
            const netPayable = Math.max(0, item.base_salary - item.deduction - item.advance);
            toUpsert.push({
                staff_id: item.staff_id,
                salary_month: currentMonthStr,
                base_salary: item.base_salary,
                leave_deductions: item.deduction,
                advance_given: item.advance,
                net_payable: netPayable,
                status: 'Unpaid',
                created_by: window.currentUser.id
            });
        }
    });

    if (toUpsert.length === 0) {
        showToast('All staff already paid for this month. Nothing to generate.', 'warning');
        return;
    }

    const btn = document.getElementById('btnSave');
    btn.disabled = true; btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Generating...';

    try {
        const { error } = await window.supabaseClient
            .from('staff_payroll')
            .upsert(toUpsert, { onConflict: 'staff_id, salary_month' });

        if (error) throw error;
        
        showToast(`Challans successfully generated for ${currentMonthStr}!`, 'success');
        loadPayrollData(); // refresh

    } catch (err) {
        console.error(err);
        showToast('Error generating challans: ' + err.message, 'error');
    } finally {
        btn.disabled = false; btn.innerHTML = '<i class="fas fa-save"></i> Generate All Unpaid Challans';
    }
}

function showToast(msg, type) {
    const toast = document.getElementById('toast');
    toast.textContent = msg;
    toast.className = `toast ${type}`;
    toast.style.display = 'block';
    setTimeout(() => toast.style.display = 'none', 3000);
}
