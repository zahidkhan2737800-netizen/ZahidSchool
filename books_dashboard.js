document.addEventListener("DOMContentLoaded", () => {
    // Wait for auth to complete
    const checkAuth = setInterval(() => {
        if (window.authReady && window.supabaseClient) {
            clearInterval(checkAuth);
            initBooksDashboard();
        }
    }, 100);
});

async function initBooksDashboard() {
    const db = window.supabaseClient;
    const schoolId = window.currentSchoolId;

    const todayStr = new Date().toISOString().slice(0, 10);
    const thisMonthPrefix = todayStr.slice(0, 7); // 'YYYY-MM'

    // Elements
    const elTotal = document.getElementById('valTotalBooks');
    const elSoldToday = document.getElementById('valSoldToday');
    const elSoldMonth = document.getElementById('valSoldMonth');
    const elAddedToday = document.getElementById('valAddedToday');
    const elAddedMonth = document.getElementById('valAddedMonth');

    const qtyTotal = document.getElementById('qtyTotalBooks');
    const qtySoldToday = document.getElementById('qtySoldToday');
    const qtySoldMonth = document.getElementById('qtySoldMonth');
    const qtyAddedToday = document.getElementById('qtyAddedToday');
    const qtyAddedMonth = document.getElementById('qtyAddedMonth');

    try {
        // 1. Fetch all inventory for total available
        let qInv = db.from('books_inventory').select('quantity, date_added, cost_price');
        if (schoolId) qInv = qInv.eq('school_id', schoolId);
        
        const { data: invData, error: invErr } = await qInv;
        if (invErr) throw invErr;

        let totalAvailableQty = 0;
        let totalValue = 0;
        let addedTodayQty = 0;
        let addedTodayValue = 0;
        let addedMonthQty = 0;
        let addedMonthValue = 0;

        (invData || []).forEach(item => {
            const qty = Number(item.quantity) || 0;
            const cost = Number(item.cost_price) || 0;
            const itemValue = qty * cost;

            totalAvailableQty += qty;
            totalValue += itemValue;
            
            const addedDate = item.date_added || '';
            if (addedDate === todayStr) {
                addedTodayQty += qty;
                addedTodayValue += itemValue;
            }
            if (addedDate.startsWith(thisMonthPrefix)) {
                addedMonthQty += qty;
                addedMonthValue += itemValue;
            }
        });

        elTotal.textContent = totalAvailableQty.toLocaleString();
        qtyTotal.textContent = 'Value: Rs ' + totalValue.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2});

        elAddedToday.textContent = addedTodayQty.toLocaleString();
        qtyAddedToday.textContent = 'Cost: Rs ' + addedTodayValue.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2});

        elAddedMonth.textContent = addedMonthQty.toLocaleString();
        qtyAddedMonth.textContent = 'Cost: Rs ' + addedMonthValue.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2});


        // 2. Fetch sales for the current month (which includes today)
        // We only need to fetch sales from this month to compute both Sold Month and Sold Today.
        const firstDayOfMonth = `${thisMonthPrefix}-01`;
        
        let qSales = db.from('book_sales').select('sale_date, items, total_amount').gte('sale_date', firstDayOfMonth);
        if (schoolId) qSales = qSales.eq('school_id', schoolId);
        
        const { data: salesData, error: salesErr } = await qSales;
        if (salesErr) throw salesErr;

        let soldTodayQty = 0;
        let soldTodayValue = 0;
        let soldMonthQty = 0;
        let soldMonthValue = 0;

        (salesData || []).forEach(sale => {
            const isToday = (sale.sale_date === todayStr);
            const isThisMonth = (sale.sale_date && sale.sale_date.startsWith(thisMonthPrefix));
            
            if (!isThisMonth) return; // Paranoia check

            const items = Array.isArray(sale.items) ? sale.items : [];
            let saleTotalQty = 0;
            items.forEach(it => {
                saleTotalQty += (Number(it.quantity) || 0);
            });
            const saleTotalAmount = Number(sale.total_amount) || 0;

            soldMonthQty += saleTotalQty;
            soldMonthValue += saleTotalAmount;
            
            if (isToday) {
                soldTodayQty += saleTotalQty;
                soldTodayValue += saleTotalAmount;
            }
        });

        elSoldToday.textContent = soldTodayQty.toLocaleString();
        qtySoldToday.textContent = 'Revenue: Rs ' + soldTodayValue.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2});

        elSoldMonth.textContent = soldMonthQty.toLocaleString();
        qtySoldMonth.textContent = 'Revenue: Rs ' + soldMonthValue.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2});

    } catch (err) {
        console.error('Error loading dashboard stats:', err);
        elTotal.textContent = 'Err';
        elSoldToday.textContent = 'Err';
        elSoldMonth.textContent = 'Err';
        elAddedToday.textContent = 'Err';
        elAddedMonth.textContent = 'Err';
        
        qtyTotal.textContent = '---';
        qtySoldToday.textContent = '---';
        qtySoldMonth.textContent = '---';
        qtyAddedToday.textContent = '---';
        qtyAddedMonth.textContent = '---';
        
        alert('Failed to load dashboard statistics.');
    }
}
