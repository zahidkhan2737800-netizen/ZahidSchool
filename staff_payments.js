// ═══════════════════════════════════════════════════════════════════════════════
// staff_payments.js — Handles paying salaries and auto-syncing to Finance Expenses
// ═══════════════════════════════════════════════════════════════════════════════

let allChallans = [];

document.addEventListener('DOMContentLoaded', () => {
    const checkAuth = setInterval(() => {
        if (window.authReady) {
            clearInterval(checkAuth);
            if (!window.canView('staff_payments')) {
                window.location.href = 'dashboard.html?denied=1';
                return;
            }
            initPaymentsModule();
        }
    }, 100);
});

function initPaymentsModule() {
    document.getElementById('searchInput').addEventListener('input', (e) => {
        renderGrid(e.target.value.toLowerCase());
    });
    loadChallans();
}

async function loadChallans() {
    try {
        // Fetch payroll slips JOINED with staff info
        const { data, error } = await window.supabaseClient
            .from('staff_payroll')
            .select(`
                id, salary_month, base_salary, leave_deductions, advance_given, net_payable, status, payment_date,
                staff ( id, full_name, employee_id )
            `)
            .order('created_at', { ascending: false });

        if (error) throw error;
        
        allChallans = data || [];
        renderGrid();

    } catch (err) {
        console.error(err);
        showToast('Failed to load salary slips', 'error');
    }
}

function renderGrid(searchTerm = '') {
    const tbody = document.getElementById('paymentGrid');
    
    // Filter logic
    const filtered = allChallans.filter(c => {
        if (!c.staff) return false;
        const sMatch = c.staff.full_name.toLowerCase().includes(searchTerm) || 
                       c.staff.employee_id.toLowerCase().includes(searchTerm) ||
                       c.salary_month.toLowerCase().includes(searchTerm);
        return sMatch;
    });

    if (filtered.length === 0) {
        tbody.innerHTML = '<tr><td colspan="8" style="text-align: center; color: #94a3b8; padding: 2rem;">No salary challans found. Generate them from the Payroll tab first.</td></tr>';
        return;
    }

    tbody.innerHTML = filtered.map(c => {
        const trClass = c.status === 'Paid' ? 'style="background: #f8fafc; opacity: 0.8;"' : '';
        const bClass = c.status === 'Paid' ? 'paid' : 'unpaid';
        const bText = c.status === 'Paid' ? `PAID ON ${c.payment_date || ''}` : 'UNPAID';

        const deductionsTotal = Number(c.leave_deductions) + Number(c.advance_given);
        
        let actionBtn = '';
        if (c.status === 'Unpaid') {
            actionBtn = `<button class="btn-pay" onclick="processPayment('${c.id}', ${c.net_payable}, '${c.salary_month}', '${c.staff.full_name}')"><i class="fas fa-hand-holding-usd"></i> Pay Now</button>`;
        } else {
            actionBtn = `<span style="color: #16a34a; font-weight: 600;"><i class="fas fa-check-circle"></i> Settled</span>`;
        }

        const deleteBtn = `<button onclick="deleteChallan('${c.id}', '${c.staff.full_name}', '${c.salary_month}', '${c.status}')" style="background:#fef2f2;color:#dc2626;border:1px solid #fecaca;padding:0.4rem 0.7rem;border-radius:6px;cursor:pointer;font-weight:600;font-size:0.8rem;margin-left:0.3rem;">🗑️</button>`;

        return `
            <tr ${trClass}>
                <td style="font-weight: 600; color: #334155;">${c.salary_month}</td>
                <td>
                    <div style="font-weight: 600; color: #0f172a;">${c.staff.full_name}</div>
                    <div style="font-size: 0.8rem; color: #64748b;">${c.staff.employee_id}</div>
                </td>
                <td style="color: #64748b;">Rs ${Number(c.base_salary).toLocaleString()}</td>
                <td style="color: var(--danger);">- Rs ${deductionsTotal.toLocaleString()}</td>
                <td class="money">Rs ${Number(c.net_payable).toLocaleString()}</td>
                <td><span class="badge ${bClass}">${bText}</span></td>
                <td>${actionBtn}</td>
                <td>${deleteBtn}</td>
            </tr>
        `;
    }).join('');
}

// ─── Payment & Finance Sync ──────────────────────────────────────────────────
window.processPayment = async function(payrollId, netPayableAmount, monthStr, staffName) {
    if (!confirm(`Are you sure you want to mark Rs ${netPayableAmount.toLocaleString()} as Paid for ${staffName}? This will automatically add an expense to your Finance Chart.`)) {
        return;
    }

    try {
        const today = new Date().toISOString().split('T')[0];

        // 1. Mark Payroll as Paid
        const { error: payErr } = await window.supabaseClient
            .from('staff_payroll')
            .update({ status: 'Paid', payment_date: today })
            .eq('id', payrollId);
        if (payErr) throw payErr;

        // 2. Inject into Finance Expenses Table (Cross-Module Sync)
        const { error: expErr } = await window.supabaseClient
            .from('expenses')
            .insert({
                category: 'Salaries',
                amount: netPayableAmount,
                expense_date: today,
                description: `Salary: ${staffName} (${monthStr})`,
                created_by: window.currentUser.id
            });
        
        if (expErr) {
            console.error('Warning: Payment marked, but failed to sync to expenses:', expErr);
            showToast('Paid, but failed to link to Finance chart.', 'error');
        } else {
            showToast('Payment Successful! Synced to Finance Dashboard.', 'success');
        }

        loadChallans(); // Reload UI

    } catch (err) {
        console.error(err);
        showToast('Error processing payment: ' + err.message, 'error');
    }
};

// ─── Delete Challan ────────────────────────────────────────────────────────────
window.deleteChallan = async function(id, name, month, status) {
    if (status === 'Paid') {
        if (!confirm(`WARNING: This challan for ${name} (${month}) is already PAID. Deleting it will NOT remove the expense from Finance. Are you sure?`)) return;
    } else {
        if (!confirm(`Delete unpaid challan for ${name} (${month})?`)) return;
    }

    try {
        const { error } = await window.supabaseClient
            .from('staff_payroll')
            .delete()
            .eq('id', id);
        if (error) throw error;
        showToast('Challan deleted.', 'success');
        loadChallans();
    } catch (err) {
        showToast('Delete failed: ' + err.message, 'error');
    }
};

function showToast(msg, type) {
    const toast = document.getElementById('toast');
    toast.textContent = msg;
    toast.className = `toast ${type}`;
    toast.style.display = 'block';
    setTimeout(() => toast.style.display = 'none', 3000);
}
