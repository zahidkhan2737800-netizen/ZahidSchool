let expenseChart = null;

document.addEventListener('DOMContentLoaded', () => {
    const checkAuth = setInterval(() => {
        if (window.authReady) {
            clearInterval(checkAuth);
            if (!window.canView('finance')) {
                window.location.href = 'dashboard.html?denied=1';
                return;
            }
            initExpenseModule();
        }
    }, 100);
});

function initExpenseModule() {
    const now = new Date();
    const firstDay = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0];
    const lastDay = new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().split('T')[0];
    
    document.getElementById('filterStart').value = firstDay;
    document.getElementById('filterEnd').value = lastDay;
    
    const today = now.toISOString().split('T')[0];
    document.getElementById('expDate').value = today;

    document.getElementById('expenseForm').addEventListener('submit', handleAddExpense);

    loadExpenseData();
}

async function loadExpenseData() {
    const start = document.getElementById('filterStart').value;
    const end = document.getElementById('filterEnd').value;
    
    if (!start || !end) {
        showToast('Please select valid start and end dates', 'error');
        return;
    }

    document.getElementById('expenseSubtitle').textContent = 'Loading...';

    try {
        const { data: expensesData, error: expErr } = await window.supabaseClient
            .from('expenses')
            .select('id, category, amount, expense_date, description')
            .gte('expense_date', start)
            .lte('expense_date', end);
        if (expErr) throw expErr;

        processAndRender(expensesData);

    } catch(e) {
        console.error('Error fetching expense data:', e);
        showToast('Failed to load expense data', 'error');
        document.getElementById('expenseSubtitle').textContent = 'Error loading data.';
    }
}

function processAndRender(expenses) {
    let totalExp = 0;
    const expItems = [];
    
    expenses.forEach(e => {
        expItems.push({ id: e.id, tableRef: 'expenses', category: e.category, amount: Number(e.amount), date: e.expense_date, description: e.description || '' });
        totalExp += Number(e.amount);
    });

    renderTable('expenseTableBody', expItems);

    document.getElementById('totalExpenseAmt').textContent = formatMoney(totalExp);
    document.getElementById('totalExpenseVal').textContent = formatMoney(totalExp);
    document.getElementById('expenseSubtitle').textContent = `From ${document.getElementById('filterStart').value} to ${document.getElementById('filterEnd').value}`;

    renderChart(expenses);
}

function renderTable(tbodyId, items) {
    const tbody = document.getElementById(tbodyId);
    if (items.length === 0) {
        tbody.innerHTML = `<tr><td colspan="5" style="text-align: center; color: #94a3b8; padding: 1.5rem;">No records found.</td></tr>`;
        return;
    }

    tbody.innerHTML = items.map(item => {
        let actions = '';
        if (item.id) {
            const safeDesc = (item.description || '').replace(/'/g, "&apos;");
            actions = `
                <button onclick="editExpenseRecord('${item.id}',${item.amount},'${safeDesc}')"
                    style="background:#eff6ff;color:#2563eb;border:1px solid #bfdbfe;padding:0.3rem 0.6rem;border-radius:6px;cursor:pointer;font-weight:600;font-size:0.8rem;margin-right:0.3rem;">
                    ✏️
                </button>
                <button onclick="deleteExpenseRecord('${item.id}')"
                    style="background:#fef2f2;color:#dc2626;border:1px solid #fecaca;padding:0.3rem 0.6rem;border-radius:6px;cursor:pointer;font-weight:600;font-size:0.8rem;">
                    🗑️
                </button>`;
        } else {
            actions = '<span style="font-size:0.75rem;color:#94a3b8;">Auto</span>';
        }

        return `
            <tr>
                <td style="font-weight:500;color:#334155;">${item.category}</td>
                <td style="color:#64748b;font-size:0.9rem;">${formatDateDisp(item.date)}</td>
                <td style="color:#64748b;font-size:0.85rem;max-width:150px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;" title="${item.description || ''}">${item.description || '—'}</td>
                <td class="amount-col" style="color:#dc2626;">${formatMoney(item.amount)}</td>
                <td style="white-space:nowrap;">${actions}</td>
            </tr>`;
    }).join('');
}

window.deleteExpenseRecord = async function(id) {
    if (!confirm('Delete this record permanently?')) return;
    try {
        const { error } = await window.supabaseClient.from('expenses').delete().eq('id', id);
        if (error) throw error;
        showToast('Record deleted.', 'success');
        loadExpenseData();
    } catch(err) {
        showToast('Delete failed: ' + err.message, 'error');
    }
};

window.editExpenseRecord = async function(id, currentAmount, currentDesc) {
    const newAmount = prompt(`Enter new amount (Rs):`, currentAmount);
    if (newAmount === null) return;
    if (isNaN(parseFloat(newAmount)) || parseFloat(newAmount) <= 0) {
        alert('Please enter a valid amount.');
        return;
    }
    const newDesc = prompt('Update description (leave blank to keep):', currentDesc);
    if (newDesc === null) return;

    try {
        const { error } = await window.supabaseClient.from('expenses')
            .update({ amount: parseFloat(newAmount), description: newDesc }).eq('id', id);
        if (error) throw error;
        showToast('Record updated successfully!', 'success');
        loadExpenseData();
    } catch(err) {
        showToast('Update failed: ' + err.message, 'error');
    }
};

function renderChart(expenses) {
    const ctx = document.getElementById('expenseChart').getContext('2d');
    const datesMap = {};
    
    const addData = (dateStr, amount) => {
        const d = dateStr.slice(0, 10);
        if (!datesMap[d]) datesMap[d] = 0;
        datesMap[d] += Number(amount);
    };

    expenses.forEach(e => addData(e.expense_date, e.amount));
    
    const sortedDates = Object.keys(datesMap).sort();
    const labels = sortedDates.map(formatDateDisp);
    const expData = sortedDates.map(d => datesMap[d]);

    if (expenseChart) {
        expenseChart.destroy();
    }

    expenseChart = new Chart(ctx, {
        type: 'line',
        data: {
            labels: labels,
            datasets: [
                {
                    label: 'Expenses',
                    data: expData,
                    borderColor: '#dc2626',
                    backgroundColor: 'rgba(220, 38, 38, 0.1)',
                    borderWidth: 3,
                    borderDash: [5, 5],
                    tension: 0.4,
                    fill: true
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            interaction: { mode: 'index', intersect: false },
            plugins: {
                legend: { position: 'top', labels: { usePointStyle: true, boxWidth: 8 } },
                tooltip: { backgroundColor: 'rgba(15, 23, 42, 0.9)' }
            },
            scales: {
                y: { beginAtZero: true, grid: { color: '#f1f5f9' }, border: { dash: [4, 4] } },
                x: { grid: { display: false } }
            }
        }
    });
}

function openModal(id) { document.getElementById(id).classList.add('active'); }
function closeModal(id) { document.getElementById(id).classList.remove('active'); }

async function handleAddExpense(e) {
    e.preventDefault();
    const btn = document.getElementById('btnSaveExp');
    btn.disabled = true; btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Saving...';

    const payload = {
        category: document.getElementById('expCategory').value,
        amount: parseFloat(document.getElementById('expAmount').value),
        expense_date: document.getElementById('expDate').value,
        description: document.getElementById('expDesc').value,
        created_by: window.currentUser.id
    };

    try {
        const { error } = await window.supabaseClient.from('expenses').insert(payload);
        if (error) throw error;
        
        showToast('Expense recorded successfully!', 'success');
        closeModal('expenseModal');
        document.getElementById('expenseForm').reset();
        document.getElementById('expDate').value = new Date().toISOString().split('T')[0];
        
        loadExpenseData();
    } catch(err) {
        showToast('Error saving expense: ' + err.message, 'error');
    } finally {
        btn.disabled = false; btn.textContent = 'Save Expense';
    }
}

function formatMoney(num) { return 'Rs ' + Math.round(num || 0).toLocaleString(); }

function formatDateDisp(dateStr) {
    if (dateStr === 'Various') return 'Various';
    if (!dateStr) return '—';
    const d = new Date(dateStr);
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    return `${d.getDate()} ${months[d.getMonth()]} ${d.getFullYear()}`;
}

function showToast(message, type) {
    const toast = document.getElementById('alertToast');
    toast.textContent = message;
    toast.className = `alert-toast ${type}`;
    toast.style.display = 'block';
    setTimeout(() => { toast.style.display = 'none'; }, 4000);
}
