// ═══════════════════════════════════════════════════════════════════════════════
// finance.js — Handles Revenue, Expenses, and Cash Flow Charting
// ═══════════════════════════════════════════════════════════════════════════════

let cashFlowChart = null;

document.addEventListener('DOMContentLoaded', () => {
    // Wait for auth to complete
    const checkAuth = setInterval(() => {
        if (window.authReady) {
            clearInterval(checkAuth);
            
            // Check if user has permission to view finance
            if (!window.canView('finance')) {
                window.location.href = 'dashboard.html?denied=1';
                return;
            }
            
            initFinanceModule();
        }
    }, 100);
});

function initFinanceModule() {
    // Set default dates to current month
    const now = new Date();
    const firstDay = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0];
    const lastDay = new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().split('T')[0];
    
    document.getElementById('filterStart').value = firstDay;
    document.getElementById('filterEnd').value = lastDay;
    
    // Set default modal dates
    const today = now.toISOString().split('T')[0];
    document.getElementById('revDate').value = today;
    document.getElementById('expDate').value = today;

    // Attach form listeners
    document.getElementById('revenueForm').addEventListener('submit', handleAddRevenue);
    document.getElementById('expenseForm').addEventListener('submit', handleAddExpense);

    loadFinancialData();
}

// ─── Data Loading ─────────────────────────────────────────────────────────────
async function loadFinancialData() {
    const start = document.getElementById('filterStart').value;
    const end = document.getElementById('filterEnd').value;
    
    if (!start || !end) {
        showToast('Please select valid start and end dates', 'error');
        return;
    }

    document.getElementById('profitSubtitle').textContent = 'Loading...';

    try {
        // 1. Fetch Student Fees (from transactions table)
        const { data: feesData, error: feesErr } = await window.supabaseClient
            .from('transactions')
            .select('amount_paid, created_at')
            .gte('created_at', start + 'T00:00:00')
            .lte('created_at', end + 'T23:59:59');
        if (feesErr) throw feesErr;

        // 2. Fetch Other Revenue
        const { data: otherRevData, error: revErr } = await window.supabaseClient
            .from('other_revenue')
            .select('category, amount, revenue_date')
            .gte('revenue_date', start)
            .lte('revenue_date', end);
        if (revErr) throw revErr;

        // 3. Fetch Expenses
        const { data: expensesData, error: expErr } = await window.supabaseClient
            .from('expenses')
            .select('category, amount, expense_date')
            .gte('expense_date', start)
            .lte('expense_date', end);
        if (expErr) throw expErr;

        // Process Data
        processAndRender(feesData, otherRevData, expensesData);

    } catch(e) {
        console.error('Error fetching finance data:', e);
        showToast('Failed to load financial data', 'error');
        document.getElementById('profitSubtitle').textContent = 'Error loading data.';
    }
}

function processAndRender(fees, otherRev, expenses) {
    let totalRev = 0;
    let totalExp = 0;
    
    // Group Revenue
    const revItems = [];
    
    // Compile Fees
    let totalFees = 0;
    fees.forEach(f => { totalFees += Number(f.amount_paid) || 0; });
    if (totalFees > 0) {
        revItems.push({ category: 'Student Fees', amount: totalFees, date: 'Various' });
        totalRev += totalFees;
    }

    // Compile Other Revenue
    otherRev.forEach(r => {
        revItems.push({ category: r.category, amount: Number(r.amount), date: r.revenue_date });
        totalRev += Number(r.amount);
    });

    // Compile Expenses
    const expItems = [];
    expenses.forEach(e => {
        expItems.push({ category: e.category, amount: Number(e.amount), date: e.expense_date });
        totalExp += Number(e.amount);
    });

    // Render Tables
    renderTable('revenueTableBody', revItems);
    renderTable('expenseTableBody', expItems);

    // Update Totals
    document.getElementById('totalRevenueAmt').textContent = formatMoney(totalRev);
    document.getElementById('totalExpenseAmt').textContent = formatMoney(totalExp);

    // Calculate Profit
    const profit = totalRev - totalExp;
    const profitEl = document.getElementById('totalProfitVal');
    profitEl.textContent = formatMoney(profit);
    
    if (profit >= 0) {
        profitEl.className = 'profit-val profit-positive';
        document.getElementById('profitIcon').textContent = '📈';
    } else {
        profitEl.className = 'profit-val profit-negative';
        document.getElementById('profitIcon').textContent = '📉';
    }
    document.getElementById('profitSubtitle').textContent = `From ${document.getElementById('filterStart').value} to ${document.getElementById('filterEnd').value}`;

    // Render Chart
    renderChart(fees, otherRev, expenses);
}

function renderTable(tbodyId, items) {
    const tbody = document.getElementById(tbodyId);
    if (items.length === 0) {
        tbody.innerHTML = '<tr><td colspan="3" style="text-align: center; color: #94a3b8; padding: 1.5rem;">No records found.</td></tr>';
        return;
    }
    
    // Sort descending by date (if valid) or amount
    items.sort((a,b) => b.amount - a.amount);
    
    tbody.innerHTML = items.map(item => `
        <tr>
            <td style="font-weight: 500; color: #334155;">${item.category}</td>
            <td style="color: #64748b;">${formatDateDisp(item.date)}</td>
            <td class="amount-col" style="color: #0f172a;">${formatMoney(item.amount)}</td>
        </tr>
    `).join('');
}

// ─── Chart Integration ────────────────────────────────────────────────────────
function renderChart(fees, otherRev, expenses) {
    const ctx = document.getElementById('cashFlowChart').getContext('2d');
    
    // Map dates to totals
    const datesMap = {}; // { 'YYYY-MM-DD': { rev: 0, exp: 0 } }
    
    // Helper to add data to map
    const addData = (dateStr, type, amount) => {
        const d = dateStr.slice(0, 10); // Extract YYYY-MM-DD
        if (!datesMap[d]) datesMap[d] = { rev: 0, exp: 0 };
        datesMap[d][type] += Number(amount);
    };

    fees.forEach(f => addData(f.created_at, 'rev', f.amount_paid));
    otherRev.forEach(r => addData(r.revenue_date, 'rev', r.amount));
    expenses.forEach(e => addData(e.expense_date, 'exp', e.amount));
    
    // Sort dates
    const sortedDates = Object.keys(datesMap).sort();
    
    const labels = sortedDates.map(formatDateDisp);
    const revData = sortedDates.map(d => datesMap[d].rev);
    const expData = sortedDates.map(d => datesMap[d].exp);

    // Destroy existing chart to prevent hover bugs
    if (cashFlowChart) {
        cashFlowChart.destroy();
    }

    cashFlowChart = new Chart(ctx, {
        type: 'line',
        data: {
            labels: labels,
            datasets: [
                {
                    label: 'Revenue',
                    data: revData,
                    borderColor: '#16a34a',
                    backgroundColor: 'rgba(22, 163, 74, 0.1)',
                    borderWidth: 3,
                    tension: 0.4,
                    fill: true
                },
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

// ─── Modal & Form Handlers ───────────────────────────────────────────────────
function openModal(id) { document.getElementById(id).classList.add('active'); }
function closeModal(id) { document.getElementById(id).classList.remove('active'); }

async function handleAddRevenue(e) {
    e.preventDefault();
    const btn = document.getElementById('btnSaveRev');
    btn.disabled = true; btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Saving...';

    const payload = {
        category: document.getElementById('revCategory').value,
        amount: parseFloat(document.getElementById('revAmount').value),
        revenue_date: document.getElementById('revDate').value,
        description: document.getElementById('revDesc').value,
        created_by: window.currentUser.id
    };

    try {
        const { error } = await window.supabaseClient.from('other_revenue').insert(payload);
        if (error) throw error;
        
        showToast('Revenue added successfully!', 'success');
        closeModal('revenueModal');
        document.getElementById('revenueForm').reset();
        document.getElementById('revDate').value = new Date().toISOString().split('T')[0];
        
        loadFinancialData(); // Refresh UI
    } catch(err) {
        showToast('Error saving revenue: ' + err.message, 'error');
    } finally {
        btn.disabled = false; btn.textContent = 'Save Revenue';
    }
}

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
        
        loadFinancialData(); // Refresh UI
    } catch(err) {
        showToast('Error saving expense: ' + err.message, 'error');
    } finally {
        btn.disabled = false; btn.textContent = 'Save Expense';
    }
}

// ─── Utils ───────────────────────────────────────────────────────────────────
function formatMoney(num) {
    return 'Rs ' + Math.round(num || 0).toLocaleString();
}

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

function exportData() {
    showToast('Exporting data to CSV...', 'success');
    // Implement standard CSV export logic here based on current loaded filters...
    setTimeout(() => showToast('In a full version, this triggers a CSV download.', 'success'), 1500);
}
