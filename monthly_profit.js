let profitChartInstance = null;

document.addEventListener('DOMContentLoaded', () => {
    const checkAuth = setInterval(() => {
        if (window.authReady && window.currentUser) {
            clearInterval(checkAuth);
            initPage();
        }
    }, 100);
});

function initPage() {
    const yearSelect = document.getElementById('filterYear');
    const currentYear = new Date().getFullYear();
    for (let y = currentYear - 2; y <= currentYear + 1; y++) {
        const option = document.createElement('option');
        option.value = y;
        option.textContent = y;
        if (y === currentYear) option.selected = true;
        yearSelect.appendChild(option);
    }
    
    loadMonthlyProfit();
}

async function loadMonthlyProfit() {
    try {
        const year = document.getElementById('filterYear').value;
        const schoolId = window.currentSchoolId;
        const tbody = document.getElementById('reportTableBody');
        tbody.innerHTML = '<tr><td colspan="4" style="text-align: center; color: #94a3b8;">Fetching data...</td></tr>';

        const monthNames = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
        
        const monthlyData = {};
        for (let i = 0; i < 12; i++) {
            monthlyData[i] = { revenue: 0, expense: 0 };
        }

        const startOfYear = `${year}-01-01T00:00:00`;
        const endOfYear = `${year}-12-31T23:59:59`;
        
        const sc = (q) => schoolId ? q.eq('school_id', schoolId) : q;

        // 1. Fee Revenue
        const { data: feesData, error: feesError } = await sc(window.supabaseClient
            .from('transactions')
            .select('amount_paid, created_at')
            .gte('created_at', startOfYear)
            .lte('created_at', endOfYear));
        if (feesError) throw feesError;

        feesData.forEach(r => {
            const d = new Date(r.created_at);
            if (d.getFullYear() == year) {
                monthlyData[d.getMonth()].revenue += Number(r.amount_paid) || 0;
            }
        });

        // 2. Other Revenue
        const { data: otherRevData, error: otherRevError } = await sc(window.supabaseClient
            .from('other_revenue')
            .select('amount, revenue_date')
            .gte('revenue_date', `${year}-01-01`)
            .lte('revenue_date', `${year}-12-31`));
        if (otherRevError) throw otherRevError;

        otherRevData.forEach(r => {
            const d = new Date(r.revenue_date);
            if (d.getFullYear() == year) {
                monthlyData[d.getMonth()].revenue += Number(r.amount) || 0;
            }
        });

        // 3. Expenses
        const { data: expData, error: expError } = await sc(window.supabaseClient
            .from('expenses')
            .select('amount, expense_date')
            .gte('expense_date', `${year}-01-01`)
            .lte('expense_date', `${year}-12-31`));
        if (expError) throw expError;

        expData.forEach(r => {
            const d = new Date(r.expense_date);
            if (d.getFullYear() == year) {
                monthlyData[d.getMonth()].expense += Number(r.amount) || 0;
            }
        });

        let totalRev = 0;
        let totalExp = 0;
        
        let html = '';
        const chartLabels = [];
        const chartRev = [];
        const chartExp = [];
        const chartProfit = [];

        for (let i = 0; i < 12; i++) {
            const rev = monthlyData[i].revenue;
            const exp = monthlyData[i].expense;
            const profit = rev - exp;
            
            totalRev += rev;
            totalExp += exp;

            chartLabels.push(monthNames[i]);
            chartRev.push(rev);
            chartExp.push(exp);
            chartProfit.push(profit);

            const profitClass = profit >= 0 ? 'revenue-amt' : 'expense-amt';
            const profitPrefix = profit >= 0 ? '' : '-';

            html += `<tr>
                <td><strong>${monthNames[i]}</strong></td>
                <td class="amount-col revenue-amt">Rs ${Math.round(rev).toLocaleString()}</td>
                <td class="amount-col expense-amt">Rs ${Math.round(exp).toLocaleString()}</td>
                <td class="amount-col profit-amt ${profitClass}">Rs ${profitPrefix}${Math.abs(Math.round(profit)).toLocaleString()}</td>
            </tr>`;
        }

        tbody.innerHTML = html;

        const totalProfit = totalRev - totalExp;
        document.getElementById('totalYearlyRevenue').textContent = 'Rs ' + Math.round(totalRev).toLocaleString();
        document.getElementById('totalYearlyExpense').textContent = 'Rs ' + Math.round(totalExp).toLocaleString();
        
        const totProfEl = document.getElementById('totalYearlyProfit');
        totProfEl.textContent = 'Rs ' + (totalProfit < 0 ? '-' : '') + Math.abs(Math.round(totalProfit)).toLocaleString();
        totProfEl.className = 'amount-col profit-amt ' + (totalProfit >= 0 ? 'revenue-amt' : 'expense-amt');

        updateChart(chartLabels, chartRev, chartExp, chartProfit);

    } catch (e) {
        console.error('Error loading monthly profit:', e);
        document.getElementById('reportTableBody').innerHTML = `<tr><td colspan="4" style="text-align: center; color: red;">Error: ${e.message}</td></tr>`;
    }
}

function updateChart(labels, revData, expData, profitData) {
    const ctx = document.getElementById('profitChart').getContext('2d');
    
    if (profitChartInstance) {
        profitChartInstance.destroy();
    }

    profitChartInstance = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: labels,
            datasets: [
                {
                    label: 'Revenue',
                    data: revData,
                    backgroundColor: 'rgba(22, 163, 74, 0.7)',
                    borderColor: '#16a34a',
                    borderWidth: 1
                },
                {
                    label: 'Expense',
                    data: expData,
                    backgroundColor: 'rgba(220, 38, 38, 0.7)',
                    borderColor: '#dc2626',
                    borderWidth: 1
                },
                {
                    type: 'line',
                    label: 'Profit / Loss',
                    data: profitData,
                    borderColor: '#2563eb',
                    backgroundColor: 'rgba(37, 99, 235, 0.2)',
                    borderWidth: 2,
                    tension: 0.3,
                    fill: true
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            scales: {
                y: {
                    beginAtZero: true,
                    ticks: {
                        callback: function(value) {
                            return 'Rs ' + value.toLocaleString();
                        }
                    }
                }
            },
            plugins: {
                tooltip: {
                    callbacks: {
                        label: function(context) {
                            let label = context.dataset.label || '';
                            if (label) {
                                label += ': ';
                            }
                            if (context.parsed.y !== null) {
                                label += 'Rs ' + context.parsed.y.toLocaleString();
                            }
                            return label;
                        }
                    }
                }
            }
        }
    });
}
