let revenueChart = null;

document.addEventListener('DOMContentLoaded', () => {
    const checkAuth = setInterval(() => {
        if (window.authReady) {
            clearInterval(checkAuth);
            if (!window.canView('finance')) {
                window.location.href = 'dashboard.html?denied=1';
                return;
            }
            initRevenueModule();
        }
    }, 100);
});

function initRevenueModule() {
    const now = new Date();
    const firstDay = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0];
    const lastDay = new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().split('T')[0];
    
    document.getElementById('filterStart').value = firstDay;
    document.getElementById('filterEnd').value = lastDay;
    
    const today = now.toISOString().split('T')[0];
    document.getElementById('revDate').value = today;

    document.getElementById('revenueForm').addEventListener('submit', handleAddRevenue);

    loadRevenueData();
}

async function loadRevenueData() {
    const start = document.getElementById('filterStart').value;
    const end = document.getElementById('filterEnd').value;
    
    if (!start || !end) {
        showToast('Please select valid start and end dates', 'error');
        return;
    }

    document.getElementById('revenueSubtitle').textContent = 'Loading...';

    try {
        const { data: feesData, error: feesErr } = await window.supabaseClient
            .from('transactions')
            .select('amount_paid, created_at')
            .gte('created_at', start + 'T00:00:00')
            .lte('created_at', end + 'T23:59:59');
        if (feesErr) throw feesErr;

        const { data: otherRevData, error: revErr } = await window.supabaseClient
            .from('other_revenue')
            .select('id, category, amount, revenue_date, description')
            .gte('revenue_date', start)
            .lte('revenue_date', end);
        if (revErr) throw revErr;

        processAndRender(feesData, otherRevData);

    } catch(e) {
        console.error('Error fetching revenue data:', e);
        showToast('Failed to load revenue data', 'error');
        document.getElementById('revenueSubtitle').textContent = 'Error loading data.';
    }
}

function processAndRender(fees, otherRev) {
    let totalRev = 0;
    const revItems = [];
    
    let totalFees = 0;
    fees.forEach(f => { totalFees += Number(f.amount_paid) || 0; });
    if (totalFees > 0) {
        revItems.push({ id: null, tableRef: null, category: 'Student Fees', amount: totalFees, date: 'Various', description: 'Auto from fee collection' });
        totalRev += totalFees;
    }

    otherRev.forEach(r => {
        revItems.push({ id: r.id, tableRef: 'other_revenue', category: r.category, amount: Number(r.amount), date: r.revenue_date, description: r.description || '' });
        totalRev += Number(r.amount);
    });

    renderTable('revenueTableBody', revItems);

    document.getElementById('totalRevenueAmt').textContent = formatMoney(totalRev);
    document.getElementById('totalRevenueVal').textContent = formatMoney(totalRev);
    document.getElementById('revenueSubtitle').textContent = `From ${document.getElementById('filterStart').value} to ${document.getElementById('filterEnd').value}`;

    renderChart(fees, otherRev);
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
                <button onclick="editRevenueRecord('${item.id}',${item.amount},'${safeDesc}')"
                    style="background:#eff6ff;color:#2563eb;border:1px solid #bfdbfe;padding:0.3rem 0.6rem;border-radius:6px;cursor:pointer;font-weight:600;font-size:0.8rem;margin-right:0.3rem;">
                    ✏️
                </button>
                <button onclick="deleteRevenueRecord('${item.id}')"
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
                <td class="amount-col" style="color:#16a34a;">${formatMoney(item.amount)}</td>
                <td style="white-space:nowrap;">${actions}</td>
            </tr>`;
    }).join('');
}

window.deleteRevenueRecord = async function(id) {
    if (!confirm('Delete this record permanently?')) return;
    try {
        const { error } = await window.supabaseClient.from('other_revenue').delete().eq('id', id);
        if (error) throw error;
        showToast('Record deleted.', 'success');
        loadRevenueData();
    } catch(err) {
        showToast('Delete failed: ' + err.message, 'error');
    }
};

window.editRevenueRecord = async function(id, currentAmount, currentDesc) {
    const newAmount = prompt(`Enter new amount (Rs):`, currentAmount);
    if (newAmount === null) return;
    if (isNaN(parseFloat(newAmount)) || parseFloat(newAmount) <= 0) {
        alert('Please enter a valid amount.');
        return;
    }
    const newDesc = prompt('Update description (leave blank to keep):', currentDesc);
    if (newDesc === null) return;

    try {
        const { error } = await window.supabaseClient.from('other_revenue')
            .update({ amount: parseFloat(newAmount), description: newDesc }).eq('id', id);
        if (error) throw error;
        showToast('Record updated successfully!', 'success');
        loadRevenueData();
    } catch(err) {
        showToast('Update failed: ' + err.message, 'error');
    }
};

function renderChart(fees, otherRev) {
    const ctx = document.getElementById('revenueChart').getContext('2d');
    const datesMap = {};
    
    const addData = (dateStr, amount) => {
        const d = dateStr.slice(0, 10);
        if (!datesMap[d]) datesMap[d] = 0;
        datesMap[d] += Number(amount);
    };

    fees.forEach(f => addData(f.created_at, f.amount_paid));
    otherRev.forEach(r => addData(r.revenue_date, r.amount));
    
    const sortedDates = Object.keys(datesMap).sort();
    const labels = sortedDates.map(formatDateDisp);
    const revData = sortedDates.map(d => datesMap[d]);

    if (revenueChart) {
        revenueChart.destroy();
    }

    revenueChart = new Chart(ctx, {
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
        
        loadRevenueData();
    } catch(err) {
        showToast('Error saving revenue: ' + err.message, 'error');
    } finally {
        btn.disabled = false; btn.textContent = 'Save Revenue';
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
