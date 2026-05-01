let dailyChartInstance = null;

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
    const monthSelect = document.getElementById('filterMonth');
    const now = new Date();
    
    // Populate year
    const currentYear = now.getFullYear();
    for (let y = currentYear - 2; y <= currentYear + 1; y++) {
        const option = document.createElement('option');
        option.value = y;
        option.textContent = y;
        if (y === currentYear) option.selected = true;
        yearSelect.appendChild(option);
    }
    
    // Select current month
    monthSelect.value = now.getMonth();
    
    loadDailyData();
}

async function loadDailyData() {
    try {
        const year = parseInt(document.getElementById('filterYear').value);
        const month = parseInt(document.getElementById('filterMonth').value);
        const schoolId = window.currentSchoolId;
        const tbody = document.getElementById('reportTableBody');
        tbody.innerHTML = '<tr><td colspan="6" style="text-align: center; color: #94a3b8;">Fetching data...</td></tr>';

        // Calculate days in month
        const daysInMonth = new Date(year, month + 1, 0).getDate();
        const dailyData = {};
        for (let i = 1; i <= daysInMonth; i++) {
            dailyData[i] = { fee: 0, other: 0, expense: 0 };
        }

        const fmtDate = (y, m, d) => `${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
        const startOfMonth = fmtDate(year, month, 1) + 'T00:00:00';
        const endOfMonth = fmtDate(year, month, daysInMonth) + 'T23:59:59';
        const startOfMonthDateOnly = fmtDate(year, month, 1);
        const endOfMonthDateOnly = fmtDate(year, month, daysInMonth);

        const sc = (q) => schoolId ? q.eq('school_id', schoolId) : q;

        // 1. Fee Revenue (transactions)
        const { data: feesData, error: feesError } = await sc(window.supabaseClient
            .from('transactions')
            .select('amount_paid, created_at')
            .gte('created_at', startOfMonth)
            .lte('created_at', endOfMonth));
        if (feesError) throw feesError;

        feesData.forEach(r => {
            const d = new Date(r.created_at);
            if (d.getFullYear() === year && d.getMonth() === month) {
                dailyData[d.getDate()].fee += Number(r.amount_paid) || 0;
            }
        });

        // 2. Other Revenue
        const { data: otherRevData, error: otherRevError } = await sc(window.supabaseClient
            .from('other_revenue')
            .select('amount, revenue_date')
            .gte('revenue_date', startOfMonthDateOnly)
            .lte('revenue_date', endOfMonthDateOnly));
        if (otherRevError) throw otherRevError;

        otherRevData.forEach(r => {
            const d = new Date(r.revenue_date);
            if (d.getFullYear() === year && d.getMonth() === month) {
                dailyData[d.getDate()].other += Number(r.amount) || 0;
            }
        });

        // 3. Expenses
        const { data: expData, error: expError } = await sc(window.supabaseClient
            .from('expenses')
            .select('amount, expense_date')
            .gte('expense_date', startOfMonthDateOnly)
            .lte('expense_date', endOfMonthDateOnly));
        if (expError) throw expError;

        expData.forEach(r => {
            const d = new Date(r.expense_date);
            if (d.getFullYear() === year && d.getMonth() === month) {
                dailyData[d.getDate()].expense += Number(r.amount) || 0;
            }
        });

        let totalFee = 0;
        let totalOther = 0;
        let totalExp = 0;
        
        let html = '';
        const chartLabels = [];
        const chartFee = [];
        const chartExp = [];
        const chartNet = [];

        for (let i = 1; i <= daysInMonth; i++) {
            const fee = dailyData[i].fee;
            const other = dailyData[i].other;
            const exp = dailyData[i].expense;
            const totalRev = fee + other;
            const net = totalRev - exp;
            
            totalFee += fee;
            totalOther += other;
            totalExp += exp;

            chartLabels.push(i);
            chartFee.push(totalRev);
            chartExp.push(exp);
            chartNet.push(net);

            const netClass = net >= 0 ? 'revenue-amt' : 'expense-amt';
            const netPrefix = net >= 0 ? '' : '-';

            html += `<tr>
                <td><strong>${fmtDate(year, month, i)}</strong></td>
                <td class="amount-col">Rs ${Math.round(fee).toLocaleString()}</td>
                <td class="amount-col">Rs ${Math.round(other).toLocaleString()}</td>
                <td class="amount-col revenue-amt">Rs ${Math.round(totalRev).toLocaleString()}</td>
                <td class="amount-col expense-amt">Rs ${Math.round(exp).toLocaleString()}</td>
                <td class="amount-col profit-amt ${netClass}">Rs ${netPrefix}${Math.abs(Math.round(net)).toLocaleString()}</td>
            </tr>`;
        }

        tbody.innerHTML = html;

        const totalMonthRev = totalFee + totalOther;
        const totalNet = totalMonthRev - totalExp;

        document.getElementById('totalMonthFee').textContent = 'Rs ' + Math.round(totalFee).toLocaleString();
        document.getElementById('totalMonthOther').textContent = 'Rs ' + Math.round(totalOther).toLocaleString();
        document.getElementById('totalMonthRev').textContent = 'Rs ' + Math.round(totalMonthRev).toLocaleString();
        document.getElementById('totalMonthExp').textContent = 'Rs ' + Math.round(totalExp).toLocaleString();
        
        const totNetEl = document.getElementById('totalMonthNet');
        totNetEl.textContent = 'Rs ' + (totalNet < 0 ? '-' : '') + Math.abs(Math.round(totalNet)).toLocaleString();
        totNetEl.className = 'amount-col profit-amt ' + (totalNet >= 0 ? 'revenue-amt' : 'expense-amt');

        updateDailyChart(chartLabels, chartFee, chartExp, chartNet);

    } catch (e) {
        console.error('Error loading daily data:', e);
        document.getElementById('reportTableBody').innerHTML = `<tr><td colspan="6" style="text-align: center; color: red;">Error: ${e.message}</td></tr>`;
    }
}

function updateDailyChart(labels, revData, expData, netData) {
    const ctx = document.getElementById('dailyChart').getContext('2d');
    
    if (dailyChartInstance) {
        dailyChartInstance.destroy();
    }

    dailyChartInstance = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: labels,
            datasets: [
                {
                    label: 'Total Revenue',
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
                    label: 'Net Cash Flow',
                    data: netData,
                    borderColor: '#2563eb',
                    backgroundColor: 'rgba(37, 99, 235, 0.2)',
                    borderWidth: 2,
                    tension: 0.3,
                    fill: false
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
