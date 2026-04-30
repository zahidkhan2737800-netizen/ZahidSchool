document.addEventListener("DOMContentLoaded", () => {
    // Wait for auth to complete
    const checkAuth = setInterval(() => {
        if (window.authReady && window.supabaseClient) {
            clearInterval(checkAuth);
            initBooksInventory();
        }
    }, 100);
});

async function initBooksInventory() {
    const db = window.supabaseClient;
    const schoolId = window.currentSchoolId;

    // Form elements
    const bookForm = document.getElementById('bookForm');
    const bookNumberEl = document.getElementById('bookNumber');
    const bookNameEl = document.getElementById('bookName');
    const bookClassSelect = document.getElementById('bookClassSelect');
    const bookClassManual = document.getElementById('bookClassManual');
    const dateEl = document.getElementById('bookDate');
    const costEl = document.getElementById('costPrice');
    const sellEl = document.getElementById('sellPrice');
    const qtyEl = document.getElementById('quantity');
    const searchEl = document.getElementById('searchInventory');

    const inventoryBody = document.querySelector('#inventoryTable tbody');

    // Sell modal elements
    const modalBackdrop = document.getElementById('modalBackdrop');
    const classBooksList = document.getElementById('classBooksList');
    const buyerRollEl = document.getElementById('buyerRoll');
    const buyerNameEl = document.getElementById('buyerName');
    const buyerFatherEl = document.getElementById('buyerFather');
    const buyerClassEl = document.getElementById('buyerClass');
    const saleDateEl = document.getElementById('saleDate');
    const confirmSaleBtn = document.getElementById('confirmSaleBtn');
    const cancelSaleBtn = document.getElementById('cancelSaleBtn');
    const saleTotalDisplay = document.getElementById('saleTotal');

    // Report section
    const reportDateFilter = document.getElementById('reportDateFilter');
    const refreshReportBtn = document.getElementById('refreshReportBtn');
    const dailySalesTableBody = document.querySelector('#dailySalesTable tbody');
    const prevPageBtn = document.getElementById('prevPageBtn');
    const nextPageBtn = document.getElementById('nextPageBtn');
    const pageInfo = document.getElementById('pageInfo');
    const totalSalesCountSpan = document.getElementById('totalSalesCount');

    // State
    const todayISO = new Date().toISOString().slice(0, 10);
    dateEl.value = todayISO;
    saleDateEl.value = todayISO;
    reportDateFilter.value = todayISO;

    let rawBooks = [];
    let aggregated = [];
    let classesList = [];
    
    // Report State
    let reportSalesList = [];
    let currentPage = 1;
    const itemsPerPage = 10;

    // Load classes
    async function loadClasses() {
        try {
            let q = db.from('classes').select('class_name, section').order('class_name');
            if (schoolId) q = q.eq('school_id', schoolId);
            
            const { data, error } = await q;
            if (error && error.code !== '42P01') { 
                console.warn('classes fetch error', error);
            }
            if (data) {
                classesList = data.map(d => ({ 
                    name: d.section ? `${d.class_name} ${d.section}`.trim() : (d.class_name || d.name) 
                }));
            }
            populateClassSelect();
        } catch (e) {
            console.warn('Failed to fetch classes', e);
            populateClassSelect();
        }
    }

    function populateClassSelect() {
        const current = bookClassSelect.value;
        bookClassSelect.innerHTML = '';
        const emptyOpt = document.createElement('option');
        emptyOpt.value = '';
        emptyOpt.textContent = '-- select class --';
        bookClassSelect.appendChild(emptyOpt);

        const buyerCurrent = buyerClassEl.value;
        buyerClassEl.innerHTML = '';
        const buyerEmptyOpt = document.createElement('option');
        buyerEmptyOpt.value = '';
        buyerEmptyOpt.textContent = '-- select class --';
        buyerClassEl.appendChild(buyerEmptyOpt);

        classesList.forEach(c => {
            if (!c.name) return;
            const opt = document.createElement('option');
            opt.value = c.name.toString();
            opt.textContent = c.name.toString();
            bookClassSelect.appendChild(opt);

            const bOpt = document.createElement('option');
            bOpt.value = c.name.toString();
            bOpt.textContent = c.name.toString();
            buyerClassEl.appendChild(bOpt);
        });
        const other = document.createElement('option');
        other.value = 'OTHER';
        other.textContent = 'Other (type manually)';
        bookClassSelect.appendChild(other);

        if (current) {
            const exists = Array.from(bookClassSelect.options).some(o => o.value === current);
            bookClassSelect.value = exists ? current : '';
        }
        
        if (buyerCurrent) {
            const exists = Array.from(buyerClassEl.options).some(o => o.value === buyerCurrent);
            buyerClassEl.value = exists ? buyerCurrent : '';
        }

        bookClassManual.style.display = (bookClassSelect.value === 'OTHER') ? 'block' : 'none';
    }

    bookClassSelect.addEventListener('change', () => {
        if (bookClassSelect.value === 'OTHER') {
            bookClassManual.style.display = 'block';
            bookClassManual.focus();
        } else {
            bookClassManual.style.display = 'none';
        }
    });

    // Add Book
    bookForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        if (window.hasPermission && !window.hasPermission('books_inventory', 'can_create')) {
            alert('You do not have permission to add new books.');
            return;
        }

        const bookNumberRaw = (bookNumberEl.value || '').toString().trim();
        let nameInput = bookNameEl.value.trim();
        let cls = '';
        if (bookClassSelect.value === 'OTHER') {
            cls = (bookClassManual.value || '').trim();
        } else {
            cls = (bookClassSelect.value || '').trim();
        }
        const date = dateEl.value || todayISO;
        const cost = parseFloat(costEl.value) || 0;
        const sell = parseFloat(sellEl.value) || 0;
        const quantity = parseInt(qtyEl.value) || 1;

        if (!nameInput) return alert('Enter book name');
        if (!cls) return alert('Select or type class');
        if (quantity <= 0) return alert('Quantity must be positive');

        try {
            let nameToSave = nameInput;
            if (bookNumberRaw) {
                let q = db.from('books_inventory')
                          .select('name')
                          .eq('book_number', bookNumberRaw)
                          .limit(1);
                if (schoolId) q = q.eq('school_id', schoolId);
                const { data } = await q;
                if (data && data.length > 0 && data[0].name) {
                    nameToSave = data[0].name;
                }
            }

            const payload = {
                name: nameToSave,
                class_name: cls,
                date_added: date,
                cost_price: cost,
                selling_price: sell,
                quantity: quantity
            };
            if (schoolId) payload.school_id = schoolId;
            if (bookNumberRaw) payload.book_number = bookNumberRaw;

            const { error } = await db.from('books_inventory').insert([payload]);
            if (error) throw error;

            bookForm.reset();
            dateEl.value = todayISO;
            bookClassManual.style.display = 'none';
            alert('Book batch added.');
            loadBooks(); // refresh list
        } catch (err) {
            console.error(err);
            alert('Save error: ' + err.message);
        }
    });

    // Load Inventory
    async function loadBooks() {
        try {
            let q = db.from('books_inventory').select('*');
            if (schoolId) q = q.eq('school_id', schoolId);
            const { data, error } = await q;
            if (error) throw error;
            rawBooks = data || [];
            rebuildAggregate();
        } catch (err) {
            console.error('Books fetch error', err);
        }
    }

    function rebuildAggregate() {
        const map = new Map();
        for (const b of rawBooks) {
            const bn = (b.book_number || '').toString().trim();
            const nameKey = (b.name || '').toLowerCase().trim();
            const classKey = (b.class_name || '').toLowerCase().trim();
            const sellKey = String(b.selling_price || 0);
            const costKey = String(b.cost_price || 0);
            const key = `${bn}||${nameKey}||${classKey}||${sellKey}||${costKey}`;
            
            const entry = map.get(key) || {
                key,
                bookNumber: bn || '',
                name: b.name || '',
                className: b.class_name || '',
                sellingPrice: b.selling_price || 0,
                costPrice: b.cost_price || 0,
                totalQty: 0,
                docs: []
            };
            const qty = Number(b.quantity) || 0;
            entry.totalQty += qty;
            entry.docs.push({ id: b.id, quantity: qty, dateAdded: b.date_added || '' });
            map.set(key, entry);
        }
        aggregated = Array.from(map.values()).sort((a, b) => {
            if (a.bookNumber && b.bookNumber) return a.bookNumber.localeCompare(b.bookNumber);
            if (a.bookNumber) return -1;
            if (b.bookNumber) return 1;
            return (a.name || '').localeCompare(b.name || '');
        });
        renderInventory();
    }

    function renderInventory() {
        const q = (searchEl.value || '').toLowerCase();
        inventoryBody.innerHTML = '';
        const filtered = aggregated.filter(item => {
            if (!q) return true;
            return (item.bookNumber || '').toLowerCase().includes(q) ||
                   (item.name || '').toLowerCase().includes(q) ||
                   (item.className || '').toLowerCase().includes(q);
        });

        filtered.forEach(item => {
            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td><span class="book-number">${escapeHtml(item.bookNumber || '')}</span> ${escapeHtml(item.name)}</td>
                <td>${escapeHtml(item.className)}</td>
                <td>${item.costPrice ?? 0}</td>
                <td>${item.sellingPrice ?? 0}</td>
                <td>${item.totalQty}</td>
                <td class="muted">${item.docs.length} batch(es)</td>
                <td></td>
            `;
            const actionsTd = tr.querySelector('td:last-child');
            
            const sellBtn = document.createElement('button');
            sellBtn.textContent = 'Sell';
            sellBtn.className = 'small';
            sellBtn.style.marginRight = '4px';
            sellBtn.addEventListener('click', () => openSellModalSingle(item));
            actionsTd.appendChild(sellBtn);

            if (!window.hasPermission || window.hasPermission('books_inventory', 'can_delete')) {
                const deleteBtn = document.createElement('button');
                deleteBtn.textContent = 'Delete';
                deleteBtn.className = 'small btn-danger';
                deleteBtn.addEventListener('click', () => deleteAggregatedItem(item));
                actionsTd.appendChild(deleteBtn);
            }

            inventoryBody.appendChild(tr);
        });

        if (!filtered.length) {
            const tr = document.createElement('tr');
            tr.innerHTML = `<td colspan="7" class="muted">No books in inventory</td>`;
            inventoryBody.appendChild(tr);
        }
    }

    searchEl.addEventListener('input', renderInventory);

    async function deleteAggregatedItem(item) {
        if (window.hasPermission && !window.hasPermission('books_inventory', 'can_delete')) {
            alert('You do not have permission to delete books.');
            return;
        }

        if (!confirm(`Delete ALL ${item.totalQty} copies of "${item.name}" (class ${item.className})? This will remove all batches.`)) return;
        
        try {
            const ids = item.docs.map(d => d.id);
            const { error } = await db.from('books_inventory').delete().in('id', ids);
            if (error) throw error;
            alert('Deleted.');
            loadBooks(); // refresh
        } catch (err) {
            console.error(err);
            alert('Delete failed: ' + err.message);
        }
    }

    // Sell Modal
    function openSellModalSingle(item) {
        buyerRollEl.value = '';
        buyerNameEl.value = '';
        buyerFatherEl.value = '';
        buyerClassEl.value = item.className || '';
        populateClassBooks(item.className || '');
        saleDateEl.value = todayISO;
        saleTotalDisplay.textContent = '0';
        modalBackdrop.style.display = 'flex';
        setTimeout(() => {
            const checkbox = classBooksList.querySelector(`input[type="checkbox"][data-key="${escapeHtmlAttr(item.key)}"]`);
            if (checkbox) {
                checkbox.checked = true;
                checkbox.dispatchEvent(new Event('change'));
            }
        }, 120);
    }

    let rollTimer = null;
    buyerRollEl.addEventListener('input', () => {
        const roll = buyerRollEl.value.trim();
        buyerNameEl.value = '';
        buyerFatherEl.value = '';
        buyerClassEl.value = '';
        classBooksList.innerHTML = '<div class="muted">Type roll to autofill student and populate class books</div>';
        saleTotalDisplay.textContent = '0';
        if (rollTimer) clearTimeout(rollTimer);
        if (!roll) return;

        rollTimer = setTimeout(async () => {
            try {
                let q = db.from('admissions').select('full_name, father_name, applying_for_class').eq('roll_number', roll).eq('status', 'Active').limit(1);
                if (schoolId) q = q.eq('school_id', schoolId);
                const { data, error } = await q;
                if (data && data.length > 0) {
                    const d = data[0];
                    buyerNameEl.value = d.full_name || '';
                    buyerFatherEl.value = d.father_name || '';
                    const studentClass = d.applying_for_class || '';
                    
                    // Check if class exists in options, if not add it
                    if (studentClass) {
                        const exists = Array.from(buyerClassEl.options).some(o => o.value === studentClass);
                        if (!exists) {
                            const opt = document.createElement('option');
                            opt.value = studentClass;
                            opt.textContent = studentClass;
                            buyerClassEl.appendChild(opt);
                        }
                    }
                    
                    buyerClassEl.value = studentClass;
                    populateClassBooks(buyerClassEl.value);
                } else {
                    classBooksList.innerHTML = '<div class="muted">No admission found for this roll. Enter class to see class books.</div>';
                }
            } catch (err) {
                console.error('admissions lookup failed', err);
                classBooksList.innerHTML = '<div class="muted">Lookup failed.</div>';
            }
        }, 350);
    });

    buyerClassEl.addEventListener('change', () => populateClassBooks(buyerClassEl.value.trim()));

    function populateClassBooks(cls) {
        classBooksList.innerHTML = '';
        if (!cls) {
            classBooksList.innerHTML = '<div class="muted">Enter class to list books for that class.</div>';
            return;
        }
        const filtered = aggregated.filter(it => (it.className || '').toLowerCase() === (cls || '').toLowerCase());
        if (!filtered.length) {
            classBooksList.innerHTML = '<div class="muted">No books found for this class.</div>';
            saleTotalDisplay.textContent = '0';
            return;
        }

        filtered.forEach(it => {
            const row = document.createElement('div');
            row.className = 'book-row';
            row.innerHTML = `
                <input type="checkbox" class="checkbox" data-key="${escapeHtmlAttr(it.key)}" />
                <div class="book-name"><span class="book-number">${escapeHtml(it.bookNumber || '')}</span>${escapeHtml(it.name)}</div>
                <div class="book-meta">Price: ${it.sellingPrice ?? 0}</div>
                <div class="book-meta">Avail: <span class="avail">${it.totalQty}</span></div>
                <input type="number" class="qty-input" data-key="${escapeHtmlAttr(it.key)}" value="1" min="1" max="${it.totalQty}" disabled />
            `;
            const checkbox = row.querySelector('input[type="checkbox"]');
            const qtyInput = row.querySelector('input[type="number"]');
            
            checkbox.addEventListener('change', () => {
                qtyInput.disabled = !checkbox.checked;
                if (!checkbox.checked) qtyInput.value = 1;
                recalcSaleTotal();
            });
            qtyInput.addEventListener('input', () => {
                const max = Number(qtyInput.max) || 0;
                let v = parseInt(qtyInput.value) || 0;
                if (v < 1) v = 1;
                if (v > max) v = max;
                qtyInput.value = v;
                recalcSaleTotal();
            });
            classBooksList.appendChild(row);
        });
        recalcSaleTotal();
    }

    function recalcSaleTotal() {
        let total = 0;
        const rows = classBooksList.querySelectorAll('.book-row');
        rows.forEach(r => {
            const cb = r.querySelector('input[type="checkbox"]');
            if (!cb || !cb.checked) return;
            const key = cb.getAttribute('data-key');
            const qtyInput = r.querySelector('input[type="number"]');
            const qty = parseInt(qtyInput.value) || 0;
            const item = aggregated.find(a => a.key === key);
            if (item) total += (Number(item.sellingPrice) || 0) * qty;
        });
        saleTotalDisplay.textContent = total.toFixed(2);
    }

    cancelSaleBtn.addEventListener('click', () => { modalBackdrop.style.display = 'none'; });

    confirmSaleBtn.addEventListener('click', async () => {
        const saleDate = saleDateEl.value || todayISO;
        const roll = buyerRollEl.value.trim();
        const name = buyerNameEl.value.trim();
        const father = buyerFatherEl.value.trim();
        const cls = buyerClassEl.value.trim();

        const rows = Array.from(classBooksList.querySelectorAll('.book-row'));
        const selected = [];
        for (const r of rows) {
            const cb = r.querySelector('input[type="checkbox"]');
            if (!cb || !cb.checked) continue;
            const key = cb.getAttribute('data-key');
            const qty = parseInt(r.querySelector('input[type="number"]').value) || 0;
            if (qty <= 0) continue;
            const item = aggregated.find(a => a.key === key);
            if (!item) return alert('Item not found. Refreshing.');
            if (qty > item.totalQty) return alert(`Not enough quantity for ${item.name}. Available: ${item.totalQty}`);
            
            selected.push({
                key: item.key,
                bookNumber: item.bookNumber || '',
                name: item.name,
                class_name: item.className,
                sellingPrice: item.sellingPrice || 0,
                costPrice: item.costPrice || 0,
                quantity: qty,
                docs: item.docs.map(d => ({ id: d.id, quantity: d.quantity, dateAdded: d.dateAdded }))
            });
        }
        if (!selected.length) return alert('Select at least one book to sell.');
        if (!roll) return alert('Enter buyer roll number.');

        if (!confirm(`Confirm selling ${selected.length} different book(s) to ${name || roll} on ${saleDate}?`)) return;

        confirmSaleBtn.disabled = true;
        confirmSaleBtn.textContent = "Processing...";

        try {
            // Decrement stock
            for (const sel of selected) {
                const docs = [...sel.docs].sort((a, b) => ('' + a.dateAdded).localeCompare(b.dateAdded));
                let remaining = sel.quantity;
                for (const batch of docs) {
                    if (remaining <= 0) break;
                    const take = Math.min(remaining, batch.quantity);
                    const newQty = batch.quantity - take;
                    
                    if (newQty <= 0) {
                        await db.from('books_inventory').delete().eq('id', batch.id);
                    } else {
                        await db.from('books_inventory').update({ quantity: newQty }).eq('id', batch.id);
                    }
                    remaining -= take;
                }
                if (remaining > 0) throw new Error(`Insufficient stock while processing ${sel.name}`);
            }

            // Create sale record
            const itemsJson = selected.map(s => ({
                bookNumber: s.bookNumber,
                name: s.name,
                class_name: s.class_name,
                quantity: s.quantity,
                sellingPrice: s.sellingPrice,
                costPrice: s.costPrice
            }));

            const saleRecord = {
                buyer_roll: roll,
                buyer_name: name,
                buyer_father: father,
                buyer_class: cls,
                sale_date: saleDate,
                total_amount: Number(saleTotalDisplay.textContent) || 0,
                items: itemsJson
            };
            if (schoolId) saleRecord.school_id = schoolId;

            const { error } = await db.from('book_sales').insert([saleRecord]);
            if (error) throw error;

            alert('Sale recorded successfully.');
            modalBackdrop.style.display = 'none';
            loadBooks(); // refresh stock
            loadReport(); // refresh report
        } catch (err) {
            console.error('sell error', err);
            alert('Sell failed: ' + err.message);
        } finally {
            confirmSaleBtn.disabled = false;
            confirmSaleBtn.textContent = "Confirm Sale";
        }
    });

    function escapeHtml(s) {
        return (s || '').toString()
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#039;');
    }

    function escapeHtmlAttr(s) {
        return (s || '').toString().replace(/"/g, '&quot;');
    }

    // Report Section Logic
    async function loadReport() {
        try {
            const dateStr = reportDateFilter.value || todayISO;
            let q = db.from('book_sales').select('*').eq('sale_date', dateStr).order('created_at', { ascending: false });
            if (schoolId) q = q.eq('school_id', schoolId);
            
            dailySalesTableBody.innerHTML = '<tr><td colspan="7" class="muted">Loading...</td></tr>';
            
            const { data, error } = await q;
            if (error) throw error;
            
            reportSalesList = data || [];
            currentPage = 1;
            renderReport();
        } catch (e) {
            console.error('Report fetch error', e);
            dailySalesTableBody.innerHTML = '<tr><td colspan="7" style="color:red;">Error loading report.</td></tr>';
        }
    }

    refreshReportBtn.addEventListener('click', loadReport);
    reportDateFilter.addEventListener('change', loadReport);

    prevPageBtn.addEventListener('click', () => {
        if (currentPage > 1) {
            currentPage--;
            renderReport();
        }
    });

    nextPageBtn.addEventListener('click', () => {
        if (currentPage * itemsPerPage < reportSalesList.length) {
            currentPage++;
            renderReport();
        }
    });

    function renderReport() {
        dailySalesTableBody.innerHTML = '';
        
        const totalItems = reportSalesList.length;
        totalSalesCountSpan.textContent = totalItems;
        
        if (totalItems === 0) {
            dailySalesTableBody.innerHTML = `<tr><td colspan="7" class="muted">No books sold on the selected date.</td></tr>`;
            pageInfo.textContent = '0';
            prevPageBtn.disabled = true;
            nextPageBtn.disabled = true;
            return;
        }

        const startIndex = (currentPage - 1) * itemsPerPage;
        const endIndex = Math.min(startIndex + itemsPerPage, totalItems);
        const paginatedData = reportSalesList.slice(startIndex, endIndex);
        
        pageInfo.textContent = `${startIndex + 1}-${endIndex}`;
        prevPageBtn.disabled = currentPage === 1;
        nextPageBtn.disabled = endIndex >= totalItems;

        paginatedData.forEach(sale => {
            const tr = document.createElement('tr');
            
            const items = Array.isArray(sale.items) ? sale.items : [];
            const totalQty = items.reduce((acc, it) => acc + (Number(it.quantity) || 0), 0);
            
            // Format items list
            const itemsFormatted = items.map(it => {
                const bookNumStr = it.bookNumber ? `[${it.bookNumber}] ` : '';
                return `<div>${escapeHtml(bookNumStr)}${escapeHtml(it.name)} (Rs ${it.sellingPrice} x ${it.quantity})</div>`;
            }).join('');
            
            tr.innerHTML = `
                <td>${escapeHtml(sale.sale_date)}</td>
                <td><strong>${escapeHtml(sale.buyer_name || sale.buyer_roll || 'N/A')}</strong></td>
                <td>${escapeHtml(sale.buyer_father || '-')}</td>
                <td>${escapeHtml(sale.buyer_class || '-')}</td>
                <td>${totalQty}</td>
                <td>${itemsFormatted || '-'}</td>
                <td><strong>Rs ${Number(sale.total_amount || 0).toFixed(2)}</strong></td>
            `;
            
            dailySalesTableBody.appendChild(tr);
        });
    }

    // Initialize
    if (window.hasPermission && !window.hasPermission('books_inventory', 'can_create')) {
        const btn = bookForm.querySelector('button');
        if (btn) btn.style.display = 'none';
    }
    loadClasses();
    loadBooks();
    loadReport();
}
