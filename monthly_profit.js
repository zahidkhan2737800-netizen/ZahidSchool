let profitChartInstance = null;
const karachiYearMonthFormatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Karachi',
    year: 'numeric',
    month: 'numeric'
});

window.onAppReady(() => {
    const checkAuth = setInterval(() => {
        if (window.authReady && window.currentUser) {
            clearInterval(checkAuth);
            if (!window.canView('finance')) {
                window.location.href = 'dashboard.html?denied=1';
                return;
            }
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

async function fetchAllFinanceRows({ table, columns, dateColumn, start, end, schoolId }) {
    if (!schoolId) throw new Error('School could not be identified. Refresh and sign in again.');
    const pageSize = 1000;
    const rows = [];

    for (let from = 0; ; from += pageSize) {
        let query = window.supabaseClient
            .from(table)
            .select(columns)
            .gte(dateColumn, start)
            .lte(dateColumn, end);

        query = query.eq('school_id', schoolId);

        query = query
            .order(dateColumn, { ascending: true })
            .order('id', { ascending: true })
            .range(from, from + pageSize - 1);

        const { data, error } = await query;
        if (error) throw error;

        rows.push(...(data || []));
        if (!data || data.length < pageSize) break;
    }

    return rows;
}

function getKarachiYearMonth(timestamp) {
    const date = new Date(timestamp);
    if (Number.isNaN(date.getTime())) return null;
    const parts = Object.fromEntries(
        karachiYearMonthFormatter.formatToParts(date).map(part => [part.type, part.value])
    );
    return { year: Number(parts.year), month: Number(parts.month) };
}

async function loadMonthlyProfit() {
    try {
        const year = document.getElementById('filterYear').value;
        const schoolId = window.currentSchoolId;
        if (!schoolId) throw new Error('School could not be identified. Refresh and sign in again.');
        const tbody = document.getElementById('reportTableBody');
        tbody.innerHTML = '<tr><td colspan="4" style="text-align: center; color: #94a3b8;">Fetching data...</td></tr>';

        const monthNames = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
        
        const monthlyData = {};
        for (let i = 0; i < 12; i++) {
            monthlyData[i] = { revenue: 0, expense: 0 };
        }

        const startOfYear = `${year}-01-01T00:00:00`;
        const endOfYear = `${year}-12-31T23:59:59`;
        
        // Fetch every page. Supabase limits a normal response to 1,000 rows;
        // an annual fee query can easily exceed that and understate revenue.
        const [feesData, otherRevData, expData] = await Promise.all([
            fetchAllFinanceRows({
                table: 'transactions',
                columns: 'id, amount_paid, created_at',
                dateColumn: 'created_at',
                start: startOfYear,
                end: endOfYear,
                schoolId
            }),
            fetchAllFinanceRows({
                table: 'other_revenue',
                columns: 'id, amount, revenue_date',
                dateColumn: 'revenue_date',
                start: `${year}-01-01`,
                end: `${year}-12-31`,
                schoolId
            }),
            fetchAllFinanceRows({
                table: 'expenses',
                columns: 'id, amount, expense_date',
                dateColumn: 'expense_date',
                start: `${year}-01-01`,
                end: `${year}-12-31`,
                schoolId
            })
        ]);

        feesData.forEach(r => {
            // Fee revenue belongs to the month the payment was collected,
            // never to the month written on its challan or fee head.
            const collected = getKarachiYearMonth(r.created_at);
            if (collected?.year == year && collected.month >= 1 && collected.month <= 12) {
                monthlyData[collected.month - 1].revenue += Number(r.amount_paid) || 0;
            }
        });

        // 2. Other Revenue
        otherRevData.forEach(r => {
            const [rowYear, rowMonth] = String(r.revenue_date || '').slice(0, 10).split('-').map(Number);
            if (rowYear == year && rowMonth >= 1 && rowMonth <= 12) {
                monthlyData[rowMonth - 1].revenue += Number(r.amount) || 0;
            }
        });

        // 3. Expenses
        expData.forEach(r => {
            const [rowYear, rowMonth] = String(r.expense_date || '').slice(0, 10).split('-').map(Number);
            if (rowYear == year && rowMonth >= 1 && rowMonth <= 12) {
                monthlyData[rowMonth - 1].expense += Number(r.amount) || 0;
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
