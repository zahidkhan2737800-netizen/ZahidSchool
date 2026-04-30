document.addEventListener("DOMContentLoaded", () => {
    // Wait for auth to complete
    const checkAuth = setInterval(() => {
        if (window.authReady && window.supabaseClient) {
            clearInterval(checkAuth);
            initSalesReport();
        }
    }, 100);
});

async function initSalesReport() {
    const db = window.supabaseClient;
    const schoolId = window.currentSchoolId;

    const tableBody = document.querySelector('#salesTable tbody');
    const searchInput = document.getElementById('searchQuery');
    const dateFrom = document.getElementById('dateFrom');
    const dateTo = document.getElementById('dateTo');
    const searchBtn = document.getElementById('searchBtn');
    const resetBtn = document.getElementById('resetBtn');

    const editModal = document.getElementById('editModal');
    const editForm = document.getElementById('editForm');
    const cancelEditBtn = document.getElementById('cancelEditBtn');

    let allSales = [];

    async function loadSales() {
        tableBody.innerHTML = '<tr><td colspan="8" style="text-align:center;">Fetching sales data...</td></tr>';
        
        try {
            let q = db.from('book_sales').select('*').order('created_at', { ascending: false });
            if (schoolId) q = q.eq('school_id', schoolId);
            
            const { data, error } = await q;
            if (error) throw error;
            
            allSales = data || [];
            applyFilters();
        } catch (err) {
            console.error('Error fetching sales:', err);
            tableBody.innerHTML = `<tr><td colspan="8" style="color:red; text-align:center;">Failed to load sales: ${err.message}</td></tr>`;
        }
    }

    function applyFilters() {
        const query = searchInput.value.toLowerCase().trim();
        const from = dateFrom.value ? new Date(dateFrom.value) : null;
        const to = dateTo.value ? new Date(dateTo.value) : null;

        const filtered = allSales.filter(s => {
            // Date filter
            if (from || to) {
                const sd = s.sale_date || (s.created_at ? s.created_at.slice(0, 10) : '');
                if (!sd) return false;
                const d = new Date(sd + 'T00:00:00');
                if (from && d < from) return false;
                if (to && d > to) return false;
            }
            
            // Text filter
            if (query) {
                const matchRoll = (s.buyer_roll || '').toLowerCase().includes(query);
                const matchName = (s.buyer_name || '').toLowerCase().includes(query);
                const matchClass = (s.buyer_class || '').toLowerCase().includes(query);
                if (!matchRoll && !matchName && !matchClass) {
                    return false;
                }
            }
            
            return true;
        });

        renderTable(filtered);
    }

    function renderTable(sales) {
        tableBody.innerHTML = '';

        if (sales.length === 0) {
            tableBody.innerHTML = '<tr><td colspan="8" class="muted" style="text-align:center;">No sales records found matching the criteria.</td></tr>';
            return;
        }

        sales.forEach(s => {
            const tr = document.createElement('tr');
            
            const items = Array.isArray(s.items) ? s.items : [];
            const itemsFormatted = items.map(it => {
                const num = it.bookNumber ? `[${it.bookNumber}] ` : '';
                return `<div>${escapeHtml(num)}${escapeHtml(it.name)} (x${it.quantity})</div>`;
            }).join('');

            tr.innerHTML = `
                <td>${escapeHtml(s.sale_date || '')}</td>
                <td><strong>${escapeHtml(s.buyer_roll || '')}</strong></td>
                <td>${escapeHtml(s.buyer_name || '')}</td>
                <td>${escapeHtml(s.buyer_father || '')}</td>
                <td>${escapeHtml(s.buyer_class || '')}</td>
                <td style="font-size:0.85rem;">${itemsFormatted || '-'}</td>
                <td><strong>Rs ${Number(s.total_amount || 0).toFixed(2)}</strong></td>
                <td></td>
            `;

            const actionsTd = tr.querySelector('td:last-child');
            
            if (!window.hasPermission || window.hasPermission('book_sales_report', 'can_edit')) {
                const editBtn = document.createElement('button');
                editBtn.textContent = 'Edit';
                editBtn.className = 'small';
                editBtn.style.marginRight = '4px';
                editBtn.addEventListener('click', () => openEditModal(s));
                actionsTd.appendChild(editBtn);
            }

            if (!window.hasPermission || window.hasPermission('book_sales_report', 'can_delete')) {
                const delBtn = document.createElement('button');
                delBtn.textContent = 'Delete';
                delBtn.className = 'small btn-danger';
                delBtn.addEventListener('click', () => deleteSale(s.id));
                actionsTd.appendChild(delBtn);
            }

            tableBody.appendChild(tr);
        });
    }

    function escapeHtml(s) {
        return (s || '').toString()
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#039;');
    }

    // Filters
    searchBtn.addEventListener('click', applyFilters);
    searchInput.addEventListener('keyup', (e) => { if (e.key === 'Enter') applyFilters(); });
    resetBtn.addEventListener('click', () => {
        searchInput.value = '';
        dateFrom.value = '';
        dateTo.value = '';
        applyFilters();
    });

    // Delete
    async function deleteSale(id) {
        if (!confirm('Are you sure you want to delete this sale record? The sold books WILL be automatically restored to your inventory.')) return;
        
        try {
            // Find the sale locally to get its items
            const sale = allSales.find(s => s.id === id);
            if (!sale) throw new Error("Sale not found locally.");
            
            const items = Array.isArray(sale.items) ? sale.items : [];
            
            // 1. Restore inventory
            if (items.length > 0) {
                const restorePayloads = items.map(it => {
                    const payload = {
                        name: it.name,
                        class_name: it.class_name,
                        cost_price: Number(it.costPrice) || 0,
                        selling_price: Number(it.sellingPrice) || 0,
                        quantity: Number(it.quantity) || 1,
                        date_added: new Date().toISOString().slice(0, 10)
                    };
                    if (schoolId) payload.school_id = schoolId;
                    if (it.bookNumber) payload.book_number = it.bookNumber;
                    return payload;
                });
                
                const { error: restoreError } = await db.from('books_inventory').insert(restorePayloads);
                if (restoreError) throw new Error("Failed to restore inventory: " + restoreError.message);
            }

            // 2. Delete the sale record
            const { error: deleteError } = await db.from('book_sales').delete().eq('id', id);
            if (deleteError) throw new Error("Failed to delete sale record: " + deleteError.message);
            
            allSales = allSales.filter(s => s.id !== id);
            applyFilters();
            alert('Sale deleted and inventory stock restored successfully.');
        } catch (err) {
            console.error('Delete error', err);
            alert(err.message);
        }
    }

    // Edit
    function openEditModal(sale) {
        document.getElementById('editId').value = sale.id;
        document.getElementById('editDate').value = sale.sale_date || '';
        document.getElementById('editRoll').value = sale.buyer_roll || '';
        document.getElementById('editName').value = sale.buyer_name || '';
        document.getElementById('editFather').value = sale.buyer_father || '';
        document.getElementById('editClass').value = sale.buyer_class || '';
        document.getElementById('editTotal').value = sale.total_amount || 0;
        
        editModal.style.display = 'flex';
    }

    cancelEditBtn.addEventListener('click', () => {
        editModal.style.display = 'none';
    });

    editForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        
        const id = document.getElementById('editId').value;
        const submitBtn = document.getElementById('saveEditBtn');
        const originalText = submitBtn.textContent;
        submitBtn.textContent = 'Saving...';
        submitBtn.disabled = true;

        try {
            const payload = {
                sale_date: document.getElementById('editDate').value,
                buyer_roll: document.getElementById('editRoll').value.trim(),
                buyer_name: document.getElementById('editName').value.trim(),
                buyer_father: document.getElementById('editFather').value.trim(),
                buyer_class: document.getElementById('editClass').value.trim(),
                total_amount: parseFloat(document.getElementById('editTotal').value) || 0
            };

            const { error } = await db.from('book_sales').update(payload).eq('id', id);
            if (error) throw error;

            // Update local state
            const index = allSales.findIndex(s => s.id === id);
            if (index !== -1) {
                allSales[index] = { ...allSales[index], ...payload };
            }
            
            applyFilters();
            editModal.style.display = 'none';
            alert('Sale updated successfully.');
            
        } catch (err) {
            console.error('Update error', err);
            alert('Failed to update sale: ' + err.message);
        } finally {
            submitBtn.textContent = originalText;
            submitBtn.disabled = false;
        }
    });

    // Initial Load
    loadSales();
}
