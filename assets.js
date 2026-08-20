window.onAppReady(async () => {
    const db = window.supabaseClient;
    const schoolId = window.currentSchoolId;
    const PAGE_SIZE = 25;
    const money = value => `Rs ${Math.round(Number(value) || 0).toLocaleString()}`;
    const clean = value => String(value ?? '').trim();
    const esc = value => String(value ?? '').replace(/[&<>"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
    const today = () => {
        const parts = Object.fromEntries(new Intl.DateTimeFormat('en-CA', { timeZone:'Asia/Karachi', year:'numeric', month:'2-digit', day:'2-digit' }).formatToParts(new Date()).map(part => [part.type, part.value]));
        return `${parts.year}-${parts.month}-${parts.day}`;
    };
    const formatDate = value => value ? new Intl.DateTimeFormat('en-GB', { timeZone:'Asia/Karachi', day:'2-digit', month:'short', year:'numeric' }).format(new Date(`${String(value).slice(0,10)}T12:00:00+05:00`)) : '—';
    const can = action => window.userRoleName === 'super_admin' || !window.hasPermission || window.hasPermission('assets', action);
    const suggestedNames = ['Ceiling Fan','Air Conditioner','Chair','Table','Computer','Laptop','Printer','Projector','Whiteboard','UPS','Battery','Generator','Water Cooler','CCTV Camera','School Van','Furniture','Laboratory Equipment'];
    const suggestedCategories = ['Electrical','Air Conditioning','Furniture','Computers & IT','Printing','Classroom Equipment','Power & Backup','Vehicles','Security','Laboratory Equipment','Other'];

    let assets = [];
    let categories = [];
    let locations = [];
    let transactions = [];
    let enrichedAssets = [];
    let assetPage = 1;
    let editingAssetId = null;
    let transactionMode = 'DAMAGE';
    let categoryChart = null;
    let conditionChart = null;
    let currentReportRows = [];
    let currentReportHeaders = [];

    const $ = id => document.getElementById(id);
    const value = id => clean($(id)?.value);
    const numberValue = id => Math.max(0, Number($(id)?.value) || 0);

    function toast(message, error = false) {
        const element = $('assetToast');
        element.textContent = message;
        element.className = `toast show${error ? ' error' : ''}`;
        clearTimeout(toast.timer);
        toast.timer = setTimeout(() => { element.className = 'toast'; }, 3500);
    }

    function openModal(id) {
        const modal = $(id);
        modal.classList.add('open');
        modal.setAttribute('aria-hidden', 'false');
    }

    function closeModal(id) {
        const modal = $(id);
        modal.classList.remove('open');
        modal.setAttribute('aria-hidden', 'true');
    }

    async function fetchAll(table, columns = '*', orderColumn = 'created_at') {
        const rows = [];
        for (let from = 0; ; from += 1000) {
            let query = db.from(table).select(columns).eq('school_id', schoolId);
            if (orderColumn) query = query.order(orderColumn, { ascending:true }).order('id', { ascending:true });
            query = query.range(from, from + 999);
            const { data, error } = await query;
            if (error) throw error;
            rows.push(...(data || []));
            if (!data || data.length < 1000) break;
        }
        return rows;
    }

    function getAssetTransactions(assetId) {
        return transactions.filter(row => row.asset_id === assetId).sort((a,b) => {
            const dateCompare = String(a.transaction_date).localeCompare(String(b.transaction_date));
            return dateCompare || String(a.created_at).localeCompare(String(b.created_at));
        });
    }

    function yearsSince(value) {
        if (!value) return 0;
        const start = new Date(`${String(value).slice(0,10)}T12:00:00+05:00`);
        return Math.max(0, (Date.now() - start.getTime()) / 31557600000);
    }

    function computeAsset(asset) {
        const rows = getAssetTransactions(asset.id);
        const state = { working:0, damaged:0, repair:0, lost:0, disposed:0 };
        let originalQuantity = 0;
        let totalPurchaseCost = 0;
        let repairExpenses = 0;
        let recordedLoss = 0;

        rows.forEach(row => {
            const qty = Number(row.quantity) || 0;
            if (['PURCHASE','ADD_QUANTITY','ADJUSTMENT_IN'].includes(row.transaction_type)) {
                originalQuantity += qty;
                totalPurchaseCost += qty * (Number(row.unit_cost) || 0);
            }
            if (row.source_bucket && state[row.source_bucket] !== undefined) state[row.source_bucket] -= qty;
            if (row.destination_bucket && state[row.destination_bucket] !== undefined) state[row.destination_bucket] += qty;
            repairExpenses += Number(row.repair_cost) || 0;
            recordedLoss += Number(row.loss_amount) || 0;
        });

        Object.keys(state).forEach(key => { state[key] = Math.max(0, state[key]); });
        const averageUnitCost = originalQuantity ? totalPurchaseCost / originalQuantity : Number(asset.purchase_price_per_unit) || 0;
        const ageYears = yearsSince(asset.purchase_date || rows.find(row => row.transaction_type === 'PURCHASE')?.transaction_date);
        const life = Number(asset.useful_life_years) || 0;
        const percentage = Number(asset.depreciation_percentage) || 0;
        const annualPerUnit = percentage > 0 ? averageUnitCost * percentage / 100 : (life > 0 ? averageUnitCost / life : 0);
        const accumulatedPerUnit = Math.min(averageUnitCost, annualPerUnit * ageYears);
        const bookValuePerUnit = Math.max(0, averageUnitCost - accumulatedPerUnit);
        const liveUnits = state.working + state.damaged + state.repair;
        const currentBookValue = liveUnits * bookValuePerUnit;
        const accumulatedDepreciation = liveUnits * accumulatedPerUnit;
        const categoryName = asset.asset_categories?.name || 'Uncategorized';
        const locationName = asset.asset_locations?.name || [asset.building, asset.floor, asset.room].filter(Boolean).join(' / ') || 'Unassigned';
        const calculatedStatus = asset.status === 'Deleted' ? 'Deleted' : (asset.status === 'Archived' || (liveUnits === 0 && originalQuantity > 0) ? 'Archived' : 'Active');

        return { ...asset, rows, state, originalQuantity, totalPurchaseCost, repairExpenses, recordedLoss, averageUnitCost, annualPerUnit, accumulatedDepreciation, bookValuePerUnit, currentBookValue, ageYears, liveUnits, categoryName, locationName, calculatedStatus };
    }

    function rebuild() {
        enrichedAssets = assets.map(computeAsset);
        renderAll();
    }

    async function loadData() {
        if (!schoolId) throw new Error('School could not be identified.');
        try {
            [categories, locations, assets, transactions] = await Promise.all([
                fetchAll('asset_categories', '*', 'name'),
                fetchAll('asset_locations', '*', 'name'),
                fetchAll('assets', '*, asset_categories(name), asset_locations(name, building, floor, room)', 'created_at'),
                fetchAll('asset_transactions', '*', 'created_at')
            ]);
            $('setupWarning').style.display = 'none';
            rebuild();
        } catch (error) {
            console.error('Assets setup/load error:', error);
            if (error.code === '42P01' || /does not exist|schema cache|record_asset_transaction/i.test(error.message || '')) {
                $('setupWarning').style.display = 'block';
            }
            throw error;
        }
    }

    function renderAll() {
        populateLists();
        renderDashboard();
        renderRegister();
        renderDamageLoss();
        renderRepairs();
        renderManagers();
        generateReport();
    }

    function populateLists() {
        const categoryNames = [...new Set([...suggestedCategories, ...categories.map(item => item.name)].filter(Boolean))].sort();
        $('assetCategorySuggestions').innerHTML = categoryNames.map(name => `<option value="${esc(name)}"></option>`).join('');
        $('categoryFilter').innerHTML = '<option value="">All Categories</option>' + categoryNames.map(name => `<option>${esc(name)}</option>`).join('');
        $('assetNameSuggestions').innerHTML = suggestedNames.map(name => `<option value="${esc(name)}"></option>`).join('');

        const locationOptions = locations.filter(item => item.is_active !== false).map(item => `<option value="${item.id}">${esc(item.name)}</option>`).join('');
        $('assetLocation').innerHTML = '<option value="">Unassigned</option>' + locationOptions;
        $('locationFilter').innerHTML = '<option value="">All Locations</option>' + locations.map(item => `<option>${esc(item.name)}</option>`).join('');
        $('transactionFromLocation').innerHTML = '<option value="">Unassigned</option>' + locationOptions;
        $('transactionToLocation').innerHTML = '<option value="">Select destination</option>' + locationOptions;

        const assetOptions = enrichedAssets.filter(item => item.calculatedStatus !== 'Deleted').sort((a,b) => a.asset_name.localeCompare(b.asset_name)).map(item => `<option value="${item.id}">${esc(item.asset_name)} — ${esc(item.asset_code || item.id.slice(0,8))}</option>`).join('');
        $('transactionAsset').innerHTML = '<option value="">Select asset</option>' + assetOptions;
    }

    function renderDashboard() {
        const active = enrichedAssets.filter(item => item.calculatedStatus !== 'Deleted');
        const totals = active.reduce((sum, item) => {
            sum.units += item.originalQuantity;
            sum.purchase += item.totalPurchaseCost;
            sum.book += item.currentBookValue;
            sum.working += item.state.working;
            sum.damaged += item.state.damaged;
            sum.repair += item.state.repair;
            sum.lost += item.state.lost;
            sum.dep += item.accumulatedDepreciation;
            sum.repairs += item.repairExpenses;
            sum.loss += item.recordedLoss;
            return sum;
        }, { units:0,purchase:0,book:0,working:0,damaged:0,repair:0,lost:0,dep:0,repairs:0,loss:0 });
        const cards = [
            ['Total Asset Types', active.length, 'fa-boxes-stacked',''],['Total Asset Units', totals.units, 'fa-cubes',''],
            ['Total Purchase Value', money(totals.purchase), 'fa-money-bill-wave','green'],['Current Asset Value', money(totals.book), 'fa-scale-balanced','green'],
            ['Working Assets', totals.working, 'fa-circle-check','green'],['Damaged Assets', totals.damaged, 'fa-triangle-exclamation','red'],
            ['Under Repair', totals.repair, 'fa-screwdriver-wrench','amber'],['Lost Assets', totals.lost, 'fa-person-circle-question','purple'],
            ['Total Depreciation', money(totals.dep), 'fa-chart-line','amber'],['Repair Expenses', money(totals.repairs), 'fa-wrench','amber'],
            ['Total Recorded Loss', money(totals.loss), 'fa-arrow-trend-down','red']
        ];
        $('assetStats').innerHTML = cards.map(([label,val,icon,cls]) => `<article class="stat-card ${cls}"><span class="label">${label}</span><strong>${typeof val === 'number' ? val.toLocaleString() : val}</strong><i class="fas ${icon}"></i></article>`).join('');
        drawCharts(active);
    }

    function drawCharts(active) {
        if (!window.Chart) return;
        const byCategory = {};
        active.forEach(item => { byCategory[item.categoryName] = (byCategory[item.categoryName] || 0) + item.originalQuantity; });
        categoryChart?.destroy();
        categoryChart = new Chart($('categoryChart'), { type:'bar', data:{ labels:Object.keys(byCategory), datasets:[{ label:'Units', data:Object.values(byCategory), backgroundColor:'#60a5fa', borderRadius:6 }] }, options:{ responsive:true, maintainAspectRatio:false, plugins:{legend:{display:false}}, scales:{y:{beginAtZero:true}} } });
        const state = active.reduce((sum,item) => { Object.keys(sum).forEach(key => sum[key] += item.state[key]); return sum; }, {working:0,damaged:0,repair:0,lost:0,disposed:0});
        conditionChart?.destroy();
        conditionChart = new Chart($('conditionChart'), { type:'doughnut', data:{ labels:['Working','Damaged','Under Repair','Lost','Disposed'], datasets:[{ data:Object.values(state), backgroundColor:['#22c55e','#ef4444','#f59e0b','#8b5cf6','#64748b'] }] }, options:{ responsive:true, maintainAspectRatio:false, plugins:{legend:{position:'bottom'}} } });
    }

    function filteredAssets() {
        const search = value('assetSearch').toLowerCase();
        const category = value('categoryFilter');
        const location = value('locationFilter');
        const condition = value('conditionFilter');
        const status = value('statusFilter');
        const sort = value('sortAssets') || 'name';
        const rows = enrichedAssets.filter(item => {
            const haystack = [item.asset_code,item.asset_name,item.serial_number,item.model_number,item.invoice_number,item.categoryName,item.locationName].join(' ').toLowerCase();
            return (!search || haystack.includes(search)) && (!category || item.categoryName === category) && (!location || item.locationName === location) && (!condition || item.asset_condition === condition) && (!status || item.calculatedStatus === status);
        });
        rows.sort((a,b) => sort === 'value_desc' ? b.currentBookValue-a.currentBookValue : sort === 'date_desc' ? String(b.purchase_date||'').localeCompare(String(a.purchase_date||'')) : sort === 'damaged_desc' ? b.state.damaged-a.state.damaged : a.asset_name.localeCompare(b.asset_name,undefined,{numeric:true}));
        return rows;
    }

    function actionButton(action, id, icon, title, disabled = false) {
        return `<button class="icon-btn" data-action="${action}" data-id="${id}" title="${title}"${disabled ? ' disabled' : ''}><i class="fas ${icon}"></i></button>`;
    }

    function renderRegister() {
        const filtered = filteredAssets();
        const pages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
        assetPage = Math.min(assetPage, pages);
        const visible = filtered.slice((assetPage-1)*PAGE_SIZE, assetPage*PAGE_SIZE);
        $('registerCount').textContent = `${filtered.length.toLocaleString()} assets`;
        $('assetPageInfo').textContent = `Page ${assetPage} of ${pages}`;
        $('prevAssetPage').disabled = assetPage <= 1;
        $('nextAssetPage').disabled = assetPage >= pages;
        $('assetTableBody').innerHTML = visible.length ? visible.map(item => {
            const actions = [
                actionButton('view',item.id,'fa-eye','View complete history'),
                actionButton('edit',item.id,'fa-pen','Edit asset details',!can('can_edit')),
                actionButton('ADD_QUANTITY',item.id,'fa-plus','Add quantity',!can('can_create')),
                actionButton('TRANSFER',item.id,'fa-right-left','Transfer',!can('can_edit')),
                actionButton('DAMAGE',item.id,'fa-burst','Mark damaged',item.state.working<1||!can('can_edit')),
                actionButton('SEND_REPAIR',item.id,'fa-screwdriver-wrench','Send damaged unit for repair',item.state.damaged<1||!can('can_edit')),
                actionButton('REPAIR_COMPLETED',item.id,'fa-check','Mark repaired',item.state.repair<1||!can('can_edit')),
                actionButton('REPAIR_UNREPAIRABLE',item.id,'fa-xmark','Mark unrepairable',item.state.repair<1||!can('can_edit')),
                actionButton('LOST',item.id,'fa-question','Mark lost',item.liveUnits<1||!can('can_edit')),
                actionButton('DISPOSAL',item.id,'fa-trash-can','Dispose',item.liveUnits<1||!can('can_edit')),
                actionButton('delete',item.id,'fa-ban','Soft delete asset',!can('can_delete'))
            ].join('');
            return `<tr><td><strong>${esc(item.asset_code || `AST-${item.id.slice(0,8).toUpperCase()}`)}</strong>${item.serial_number?`<span class="sub">S/N ${esc(item.serial_number)}</span>`:''}</td><td><span class="asset-name">${esc(item.asset_name)}</span><span class="sub">${esc(item.tracking_type)}</span></td><td>${esc(item.categoryName)}</td><td class="num">${item.originalQuantity}</td><td class="num">${item.state.working}</td><td class="num">${item.state.damaged}</td><td class="num">${item.state.repair}</td><td class="num">${item.state.lost}</td><td class="num">${item.state.disposed}</td><td class="num">${money(item.totalPurchaseCost)}</td><td>${formatDate(item.purchase_date)}<span class="sub">${item.ageYears.toFixed(1)} years</span></td><td class="num">${money(item.accumulatedDepreciation)}<span class="sub">${Number(item.depreciation_percentage||0)}% yearly</span></td><td class="num"><strong>${money(item.currentBookValue)}</strong></td><td>${esc(item.locationName)}</td><td><span class="badge ${String(item.asset_condition).toLowerCase()}">${esc(item.asset_condition)}</span></td><td><span class="badge ${item.calculatedStatus.toLowerCase()}">${item.calculatedStatus}</span></td><td><div class="actions">${actions}</div></td></tr>`;
        }).join('') : '<tr><td colspan="17" class="empty">No assets match the selected filters.</td></tr>';
    }

    function renderDamageLoss() {
        const rows = transactions.filter(row => ['DAMAGE','LOST','DISPOSAL'].includes(row.transaction_type)).sort((a,b) => String(b.transaction_date).localeCompare(String(a.transaction_date)) || String(b.created_at).localeCompare(String(a.created_at)));
        $('damageTableBody').innerHTML = rows.length ? rows.map(row => { const asset = enrichedAssets.find(item => item.id === row.asset_id); return `<tr><td>${formatDate(row.transaction_date)}</td><td><span class="asset-name">${esc(asset?.asset_name||'Unknown')}</span></td><td><span class="badge ${row.transaction_type==='DAMAGE'?'damaged':'lost'}">${esc(row.incident_type||row.transaction_type)}</span></td><td class="num">${row.quantity}</td><td>${esc(row.reason||'—')}</td><td>${row.repairable===null?'—':row.repairable?'Yes':'No'}</td><td>${esc(row.responsible_person||'—')}</td><td class="num">${money(row.estimated_loss)}</td><td class="num">${money(row.loss_amount)}</td><td>${esc(row.created_by_name||'—')}</td></tr>`; }).join('') : '<tr><td colspan="10" class="empty">No damage, loss or disposal transactions.</td></tr>';
    }

    function renderRepairs() {
        const rows = transactions.filter(row => ['SEND_REPAIR','REPAIR_COMPLETED','REPAIR_UNREPAIRABLE'].includes(row.transaction_type)).sort((a,b) => String(b.transaction_date).localeCompare(String(a.transaction_date)) || String(b.created_at).localeCompare(String(a.created_at)));
        $('repairTableBody').innerHTML = rows.length ? rows.map(row => { const asset = enrichedAssets.find(item => item.id === row.asset_id); return `<tr><td>${formatDate(row.transaction_date)}</td><td><span class="asset-name">${esc(asset?.asset_name||'Unknown')}</span></td><td><span class="badge repair">${esc(row.repair_status||row.transaction_type.replaceAll('_',' '))}</span></td><td class="num">${row.quantity}</td><td>${esc(row.vendor||'—')}</td><td>${formatDate(row.expected_return_date)}</td><td class="num">${money(row.repair_cost)}</td><td>${esc(row.notes||'—')}</td><td>${esc(row.created_by_name||'—')}</td></tr>`; }).join('') : '<tr><td colspan="9" class="empty">No repair transactions.</td></tr>';
    }

    function renderManagers() {
        $('categoryChips').innerHTML = categories.length ? categories.map(item => `<span class="chip"><i class="fas fa-tag"></i> ${esc(item.name)}</span>`).join('') : '<span class="sub">No saved categories yet. You can also type one while adding an asset.</span>';
        $('locationChips').innerHTML = locations.length ? locations.map(item => `<span class="chip"><i class="fas fa-location-dot"></i> ${esc(item.name)}${item.room?` — ${esc(item.room)}`:''}</span>`).join('') : '<span class="sub">No locations saved yet.</span>';
    }

    function calculateTotalValue() {
        $('assetTotalValue').textContent = money(numberValue('assetQuantity') * numberValue('assetUnitPrice'));
    }

    function resetAssetForm() {
        $('assetForm').reset();
        $('assetCondition').value = 'Good';
        $('trackingType').value = 'quantity';
        $('assetQuantity').disabled = false;
        $('assetQuantity').closest('.form-group').style.display = '';
        editingAssetId = null;
        $('assetModalTitle').textContent = 'Add Asset';
        calculateTotalValue();
    }

    async function ensureCategory(name) {
        if (!name) return null;
        let found = categories.find(item => item.name.toLowerCase() === name.toLowerCase());
        if (found) return found.id;
        const payload = { school_id:schoolId, name };
        const { data, error } = await db.from('asset_categories').insert(payload).select('id,name').single();
        if (error) throw error;
        categories.push(data);
        return data.id;
    }

    function assetPayload(categoryId) {
        const payload = {
            school_id:schoolId,
            asset_code:value('assetCode') || null,
            asset_name:value('assetName'),
            category_id:categoryId,
            description:value('assetDescription') || null,
            tracking_type:value('trackingType') || 'quantity',
            serial_number:value('assetSerial') || null,
            model_number:value('assetModel') || null,
            barcode:value('assetBarcode') || null,
            purchase_date:value('assetPurchaseDate') || null,
            purchase_price_per_unit:numberValue('assetUnitPrice'),
            supplier:value('assetSupplier') || null,
            invoice_number:value('assetInvoice') || null,
            location_id:value('assetLocation') || null,
            building:value('assetBuilding') || null,
            floor:value('assetFloor') || null,
            room:value('assetRoom') || null,
            asset_condition:value('assetCondition') || 'Good',
            useful_life_years:numberValue('assetLife') || null,
            depreciation_percentage:numberValue('assetDepPercent') || null,
            depreciation_method:'Straight Line',
            warranty_expiry_date:value('assetWarranty') || null,
            notes:value('assetNotes') || null
        };
        if (window.campusFeatureReady && window.currentCampusId) payload.campus_id = window.currentCampusId;
        if (!editingAssetId) payload.created_by = window.currentUser?.id || null;
        return payload;
    }

    async function recordTransaction(params) {
        const defaults = {
            p_asset_id:null,p_transaction_type:null,p_quantity:0,p_transaction_date:today(),p_source_bucket:null,p_destination_bucket:null,p_unit_cost:0,
            p_from_location_id:null,p_to_location_id:null,p_incident_type:null,p_reason:null,p_repairable:null,p_estimated_repair_cost:0,p_estimated_loss:0,
            p_responsible_person:null,p_vendor:null,p_expected_return_date:null,p_repair_status:null,p_repair_cost:0,p_recovery_amount:0,p_loss_amount:0,
            p_notes:null,p_created_by_name:window.currentUserFullName || window.currentUser?.email || null
        };
        const { data, error } = await db.rpc('record_asset_transaction', { ...defaults, ...params });
        if (error) throw error;
        return data;
    }

    async function saveAsset(event) {
        event.preventDefault();
        if (!can(editingAssetId ? 'can_edit' : 'can_create')) return toast('You do not have permission for this action.', true);
        const name = value('assetName');
        const quantity = Math.floor(numberValue('assetQuantity'));
        if (!name) return toast('Asset Name is required.', true);
        if (!editingAssetId && quantity < 1) return toast('Quantity must be at least 1.', true);
        const button = $('saveAssetBtn');
        button.disabled = true;
        try {
            const categoryId = await ensureCategory(value('assetCategory'));
            const payload = assetPayload(categoryId);
            if (editingAssetId) {
                const { error } = await db.from('assets').update(payload).eq('id', editingAssetId).eq('school_id', schoolId);
                if (error) throw error;
                toast('Asset details updated. Quantity history was unchanged.');
            } else {
                const { data:asset, error } = await db.from('assets').insert(payload).select('id').single();
                if (error) throw error;
                try {
                    await recordTransaction({ p_asset_id:asset.id, p_transaction_type:'PURCHASE', p_quantity:quantity, p_transaction_date:value('assetPurchaseDate')||today(), p_destination_bucket:'working', p_unit_cost:numberValue('assetUnitPrice'), p_to_location_id:value('assetLocation')||null, p_reason:'Initial asset purchase', p_notes:value('assetNotes')||null });
                } catch (transactionError) {
                    await db.from('assets').update({ status:'Deleted', deleted_at:new Date().toISOString() }).eq('id', asset.id).eq('school_id',schoolId);
                    throw transactionError;
                }
                toast('Asset and purchase transaction saved.');
            }
            closeModal('assetModal');
            await loadData();
        } catch (error) {
            console.error(error);
            toast(`Could not save asset: ${error.message}`, true);
        } finally { button.disabled = false; }
    }

    function editAsset(id) {
        const item = enrichedAssets.find(asset => asset.id === id);
        if (!item) return;
        resetAssetForm();
        editingAssetId = id;
        $('assetModalTitle').textContent = 'Edit Asset Details';
        const fields = { assetName:item.asset_name,assetCategory:item.categoryName==='Uncategorized'?'':item.categoryName,trackingType:item.tracking_type,assetDescription:item.description,assetPurchaseDate:item.purchase_date,assetUnitPrice:item.purchase_price_per_unit,assetSupplier:item.supplier,assetInvoice:item.invoice_number,assetLocation:item.location_id,assetBuilding:item.building,assetFloor:item.floor,assetRoom:item.room,assetCondition:item.asset_condition,assetLife:item.useful_life_years,assetDepPercent:item.depreciation_percentage,assetWarranty:item.warranty_expiry_date,assetCode:item.asset_code,assetSerial:item.serial_number,assetModel:item.model_number,assetBarcode:item.barcode,assetNotes:item.notes };
        Object.entries(fields).forEach(([id,val]) => { if ($(id)) $(id).value = val ?? ''; });
        $('assetQuantity').value = item.originalQuantity;
        $('assetQuantity').disabled = true;
        $('assetQuantity').closest('.form-group').style.display = 'none';
        calculateTotalValue();
        openModal('assetModal');
    }

    const modeConfig = {
        ADD_QUANTITY:{ title:'Add Asset Quantity',source:null,dest:'working',show:['unitCostGroup','toLocationGroup'] },
        TRANSFER:{ title:'Transfer Asset',source:'working',dest:'working',show:['fromLocationGroup','toLocationGroup'] },
        DAMAGE:{ title:'Mark Asset Damaged',source:'working',dest:'damaged',show:['incidentTypeGroup','repairableGroup','reasonGroup','responsibleGroup','estimatedRepairGroup','estimatedLossGroup'] },
        SEND_REPAIR:{ title:'Send Asset for Repair',source:'damaged',dest:'repair',show:['vendorGroup','expectedReturnGroup','estimatedRepairGroup','reasonGroup'] },
        REPAIR_COMPLETED:{ title:'Mark Asset Repaired',source:'repair',dest:'working',show:['vendorGroup','repairCostGroup','reasonGroup'] },
        REPAIR_UNREPAIRABLE:{ title:'Mark Repair Unrepairable',source:'repair',dest:'damaged',show:['vendorGroup','repairCostGroup','reasonGroup'] },
        LOST:{ title:'Mark Asset Lost',source:'working',dest:'lost',show:['incidentTypeGroup','reasonGroup','responsibleGroup','bookValueGroup','lossGroup'] },
        DISPOSAL:{ title:'Dispose Asset',source:'working',dest:'disposed',show:['disposalReasonGroup','bookValueGroup','recoveryGroup','lossGroup','reasonGroup'] }
    };

    function openTransaction(mode, assetId = '') {
        transactionMode = mode;
        $('transactionForm').reset();
        $('transactionDate').value = today();
        $('transactionTitle').textContent = modeConfig[mode].title;
        $('transactionAsset').value = assetId;
        document.querySelectorAll('#transactionForm .conditional').forEach(element => element.classList.remove('show'));
        modeConfig[mode].show.forEach(id => $(id)?.classList.add('show'));
        $('sourceBucketGroup').style.display = ['LOST','DISPOSAL'].includes(mode) ? '' : 'none';
        $('transactionSource').value = modeConfig[mode].source || 'working';
        if (mode === 'LOST') $('transactionIncident').value = 'Missing';
        const item = enrichedAssets.find(asset => asset.id === assetId);
        if (item) {
            $('transactionFromLocation').value = item.location_id || '';
            if (mode === 'ADD_QUANTITY') $('transactionToLocation').value = item.location_id || '';
            if (['LOST','DISPOSAL'].includes(mode) && item.state.working < 1) $('transactionSource').value = item.state.damaged > 0 ? 'damaged' : 'repair';
        }
        updateTransactionAvailability();
        openModal('transactionModal');
    }

    function updateTransactionAvailability() {
        const item = enrichedAssets.find(asset => asset.id === value('transactionAsset'));
        if (!item) { $('transactionAvailability').textContent = 'Select an asset'; return; }
        const source = transactionMode === 'TRANSFER' ? 'working' : (modeConfig[transactionMode].source || value('transactionSource'));
        $('transactionAvailability').textContent = `Working ${item.state.working} · Damaged ${item.state.damaged} · Under Repair ${item.state.repair} · Lost ${item.state.lost} · Disposed ${item.state.disposed}${source ? ` · Available for this action: ${item.state[source] || 0}` : ''}`;
        recalcTransactionLoss();
    }

    function recalcTransactionLoss() {
        const item = enrichedAssets.find(asset => asset.id === value('transactionAsset'));
        const qty = Math.floor(numberValue('transactionQuantity'));
        const bookValue = (item?.bookValuePerUnit || 0) * qty;
        const recovery = numberValue('transactionRecovery');
        $('transactionBookValue').textContent = money(bookValue);
        $('transactionLoss').textContent = money(Math.max(0, bookValue - recovery));
    }

    async function saveTransaction(event) {
        event.preventDefault();
        if (!can(transactionMode === 'ADD_QUANTITY' ? 'can_create' : 'can_edit')) return toast('You do not have permission for this action.', true);
        const item = enrichedAssets.find(asset => asset.id === value('transactionAsset'));
        const qty = Math.floor(numberValue('transactionQuantity'));
        if (!item || qty < 1) return toast('Select an asset and enter a valid quantity.', true);
        const config = modeConfig[transactionMode];
        let source = config.source;
        if (['LOST','DISPOSAL'].includes(transactionMode)) source = value('transactionSource') || 'working';
        const available = source ? Number(item.state[source] || 0) : Infinity;
        if (qty > available) return toast(`Only ${available} unit(s) are available in ${source}.`, true);
        if (transactionMode === 'TRANSFER' && (!value('transactionFromLocation') || !value('transactionToLocation') || value('transactionFromLocation') === value('transactionToLocation'))) return toast('Choose two different locations.', true);
        const bookValue = item.bookValuePerUnit * qty;
        const recovery = numberValue('transactionRecovery');
        const button = $('saveTransactionBtn');
        button.disabled = true;
        try {
            const repairStatus = transactionMode === 'SEND_REPAIR' ? 'Under Repair' : transactionMode === 'REPAIR_COMPLETED' ? 'Repaired' : transactionMode === 'REPAIR_UNREPAIRABLE' ? 'Unrepairable' : null;
            await recordTransaction({
                p_asset_id:item.id,p_transaction_type:transactionMode,p_quantity:qty,p_transaction_date:value('transactionDate')||today(),p_source_bucket:source,p_destination_bucket:config.dest,
                p_unit_cost:numberValue('transactionUnitCost'),p_from_location_id:value('transactionFromLocation')||null,p_to_location_id:value('transactionToLocation')||null,
                p_incident_type:transactionMode==='DISPOSAL'?value('transactionDisposalReason'):value('transactionIncident')||null,p_reason:value('transactionReason')||null,
                p_repairable:transactionMode==='DAMAGE'?value('transactionRepairable')==='true':null,p_estimated_repair_cost:numberValue('transactionEstimatedRepair'),p_estimated_loss:numberValue('transactionEstimatedLoss'),
                p_responsible_person:value('transactionResponsible')||null,p_vendor:value('transactionVendor')||null,p_expected_return_date:value('transactionExpectedReturn')||null,
                p_repair_status:repairStatus,p_repair_cost:numberValue('transactionRepairCost'),p_recovery_amount:recovery,p_loss_amount:['LOST','DISPOSAL'].includes(transactionMode)?Math.max(0,bookValue-recovery):0,p_notes:value('transactionNotes')||null
            });
            if (transactionMode === 'TRANSFER' && qty === item.liveUnits) await db.from('assets').update({ location_id:value('transactionToLocation') }).eq('id',item.id).eq('school_id',schoolId);
            closeModal('transactionModal');
            toast(`${config.title} saved to permanent history.`);
            await loadData();
        } catch (error) {
            console.error(error);
            toast(`Transaction failed: ${error.message}`, true);
        } finally { button.disabled = false; }
    }

    function transactionDescription(row) {
        const labels = {PURCHASE:'Purchased',ADD_QUANTITY:'Quantity added',DAMAGE:'Marked damaged',SEND_REPAIR:'Sent for repair',REPAIR_COMPLETED:'Repaired',REPAIR_UNREPAIRABLE:'Marked unrepairable',LOST:'Marked lost',DISPOSAL:'Disposed',TRANSFER:'Transferred',ADJUSTMENT_IN:'Adjustment added',ADJUSTMENT_OUT:'Adjustment removed'};
        const from = locations.find(item => item.id === row.from_location_id)?.name;
        const to = locations.find(item => item.id === row.to_location_id)?.name;
        const details = [row.incident_type,row.reason,from&&to?`${from} → ${to}`:null,row.vendor,row.repair_cost?`Repair ${money(row.repair_cost)}`:null,row.loss_amount?`Loss ${money(row.loss_amount)}`:null,row.notes].filter(Boolean).join(' · ');
        return { label:labels[row.transaction_type]||row.transaction_type, details };
    }

    function viewAsset(id) {
        const item = enrichedAssets.find(asset => asset.id === id);
        if (!item) return;
        $('detailTitle').textContent = `${item.asset_name} — Complete History`;
        const cards = [['Asset Code',item.asset_code||`AST-${item.id.slice(0,8).toUpperCase()}`],['Category',item.categoryName],['Purchase Date',formatDate(item.purchase_date)],['Location',item.locationName],['Total Units',item.originalQuantity],['Working',item.state.working],['Damaged',item.state.damaged],['Under Repair',item.state.repair],['Lost',item.state.lost],['Disposed',item.state.disposed],['Original Value',money(item.totalPurchaseCost)],['Annual Depreciation',money(item.annualPerUnit*item.liveUnits)],['Accumulated Depreciation',money(item.accumulatedDepreciation)],['Current Book Value',money(item.currentBookValue)],['Repair Expenses',money(item.repairExpenses)],['Recorded Loss',money(item.recordedLoss)]];
        const timeline = [...item.rows].reverse().map(row => { const info=transactionDescription(row); return `<div class="timeline-item"><h4>${esc(info.label)} — ${row.quantity} unit(s)</h4><p>${formatDate(row.transaction_date)}${row.created_by_name?` · ${esc(row.created_by_name)}`:''}</p>${info.details?`<p>${esc(info.details)}</p>`:''}</div>`; }).join('');
        $('detailBody').innerHTML = `<div class="detail-grid">${cards.map(([label,val])=>`<div class="detail-card"><span>${label}</span><strong>${esc(val)}</strong></div>`).join('')}</div><div class="panel-head"><h3>Permanent Transaction Timeline</h3><span class="badge">${item.rows.length} events</span></div><div class="timeline">${timeline||'<p class="empty">No history found.</p>'}</div>`;
        openModal('detailModal');
    }

    async function softDeleteAsset(id) {
        if (!can('can_delete')) return toast('You do not have delete permission.', true);
        const item = enrichedAssets.find(asset => asset.id === id);
        if (!item || !confirm(`Hide ${item.asset_name} from active assets? Its complete transaction history will be preserved.`)) return;
        const { error } = await db.from('assets').update({ status:'Deleted', deleted_at:new Date().toISOString() }).eq('id',id).eq('school_id',schoolId);
        if (error) return toast(error.message,true);
        toast('Asset soft-deleted. Its audit history was preserved.');
        await loadData();
    }

    async function addCategory(event) {
        event.preventDefault();
        if (!can('can_create')) return toast('You do not have create permission.',true);
        try { await ensureCategory(value('newCategoryName')); $('categoryForm').reset(); toast('Category added.'); await loadData(); } catch(error){ toast(error.message,true); }
    }

    async function addLocation(event) {
        event.preventDefault();
        if (!can('can_create')) return toast('You do not have create permission.',true);
        const name=value('newLocationName'); if(!name)return;
        const { error } = await db.from('asset_locations').insert({school_id:schoolId,name,room:value('newLocationRoom')||null});
        if(error)return toast(error.message,true); $('locationForm').reset(); toast('Location added.'); await loadData();
    }

    function generateReport() {
        if (!$('reportType')) return;
        const type=value('reportType')||'all';
        const previousGroup=value('reportGroup');
        const groupValues=type==='category'?[...new Set(enrichedAssets.map(item=>item.categoryName))]:type==='location'?[...new Set(enrichedAssets.map(item=>item.locationName))]:[];
        $('reportGroup').innerHTML='<option value="">All</option>'+groupValues.sort().map(item=>`<option>${esc(item)}</option>`).join('');
        if(groupValues.includes(previousGroup))$('reportGroup').value=previousGroup;
        const group=value('reportGroup');
        let rows=enrichedAssets.filter(item=>item.calculatedStatus!=='Deleted');
        if(type==='category'&&group)rows=rows.filter(item=>item.categoryName===group);
        if(type==='location'&&group)rows=rows.filter(item=>item.locationName===group);
        if(type==='damaged')rows=rows.filter(item=>item.state.damaged>0);
        if(type==='lost')rows=rows.filter(item=>item.state.lost>0);
        if(type==='repair')rows=rows.filter(item=>item.state.repair>0);
        if(type==='disposed')rows=rows.filter(item=>item.state.disposed>0);
        if(type==='repair_expenses')rows=rows.filter(item=>item.repairExpenses>0);
        if(type==='loss')rows=rows.filter(item=>item.recordedLoss>0);
        const titles={all:'Complete Asset Register',category:'Assets by Category',location:'Assets by Location',damaged:'Damaged Assets',lost:'Lost Assets',repair:'Assets Under Repair',disposed:'Disposed Assets',depreciation:'Depreciation Report',repair_expenses:'Repair Expenses',loss:'Asset Loss Report'};
        $('reportTitle').textContent=`${titles[type]}${group?` — ${group}`:''}`;
        const headers=['Asset ID','Asset Name','Category','Location','Original','Working','Damaged','Repair','Lost','Disposed','Purchase Value','Depreciation','Book Value','Repair Expenses','Recorded Loss'];
        currentReportHeaders=headers;
        currentReportRows=rows.map(item=>[item.asset_code||`AST-${item.id.slice(0,8).toUpperCase()}`,item.asset_name,item.categoryName,item.locationName,item.originalQuantity,item.state.working,item.state.damaged,item.state.repair,item.state.lost,item.state.disposed,Math.round(item.totalPurchaseCost),Math.round(item.accumulatedDepreciation),Math.round(item.currentBookValue),Math.round(item.repairExpenses),Math.round(item.recordedLoss)]);
        $('reportHead').innerHTML='<tr>'+headers.map(header=>`<th>${header}</th>`).join('')+'</tr>';
        $('reportBody').innerHTML=currentReportRows.length?currentReportRows.map(row=>'<tr>'+row.map((cell,index)=>`<td${index>=4?' class="num"':''}>${index>=10?money(cell):esc(cell)}</td>`).join('')+'</tr>').join(''):'<tr><td colspan="15" class="empty">No records for this report.</td></tr>';
        $('reportSummary').textContent=`${rows.length} asset types · Book Value ${money(rows.reduce((sum,item)=>sum+item.currentBookValue,0))}`;
    }

    function exportCsv() {
        const quote = cell => `"${String(cell??'').replaceAll('"','""')}"`;
        const csv='\uFEFF'+[currentReportHeaders,...currentReportRows].map(row=>row.map(quote).join(',')).join('\r\n');
        const url=URL.createObjectURL(new Blob([csv],{type:'text/csv;charset=utf-8'}));
        const link=document.createElement('a');link.href=url;link.download=`Assets-Report-${today()}.csv`;link.click();URL.revokeObjectURL(url);
    }

    document.querySelectorAll('.tab-btn').forEach(button=>button.addEventListener('click',()=>{document.querySelectorAll('.tab-btn').forEach(item=>item.classList.toggle('active',item===button));document.querySelectorAll('.tab-panel').forEach(panel=>panel.classList.toggle('active',panel.id===button.dataset.tab));if(button.dataset.tab==='reportsPanel')generateReport();}));
    document.querySelectorAll('[data-close]').forEach(button=>button.addEventListener('click',()=>closeModal(button.dataset.close)));
    document.querySelectorAll('.modal').forEach(modal=>modal.addEventListener('click',event=>{if(event.target===modal)closeModal(modal.id);}));
    $('addAssetBtn').addEventListener('click',()=>{resetAssetForm();openModal('assetModal');});
    $('assetForm').addEventListener('submit',saveAsset);
    $('transactionForm').addEventListener('submit',saveTransaction);
    $('assetQuantity').addEventListener('input',calculateTotalValue);$('assetUnitPrice').addEventListener('input',calculateTotalValue);
    ['transactionAsset','transactionSource'].forEach(id=>$(id).addEventListener('change',updateTransactionAvailability));
    ['transactionQuantity','transactionRecovery'].forEach(id=>$(id).addEventListener('input',recalcTransactionLoss));
    document.querySelectorAll('[data-new-transaction]').forEach(button=>button.addEventListener('click',()=>openTransaction(button.dataset.newTransaction)));
    $('assetTableBody').addEventListener('click',event=>{const button=event.target.closest('[data-action]');if(!button||button.disabled)return;const {action,id}=button.dataset;if(action==='view')viewAsset(id);else if(action==='edit')editAsset(id);else if(action==='delete')softDeleteAsset(id);else openTransaction(action,id);});
    ['assetSearch','categoryFilter','locationFilter','conditionFilter','statusFilter','sortAssets'].forEach(id=>$(id).addEventListener(id==='assetSearch'?'input':'change',()=>{assetPage=1;renderRegister();}));
    $('prevAssetPage').addEventListener('click',()=>{if(assetPage>1){assetPage--;renderRegister();}});$('nextAssetPage').addEventListener('click',()=>{assetPage++;renderRegister();});
    $('categoryForm').addEventListener('submit',addCategory);$('locationForm').addEventListener('submit',addLocation);
    $('reportType').addEventListener('change',generateReport);$('reportGroup').addEventListener('change',generateReport);$('generateReport').addEventListener('click',generateReport);$('printReport').addEventListener('click',()=>window.print());$('exportCsv').addEventListener('click',exportCsv);

    if (!can('can_create')) $('addAssetBtn').disabled = true;
    try { await loadData(); } catch (error) { toast(`Assets could not load: ${error.message}`, true); }
});
