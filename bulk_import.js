window.onAppReady(async () => {
    const FIELD_OPTIONS = [
        { value:'', label:'Ignore this column' },
        { value:'roll_number', label:'Roll Number *' },
        { value:'full_name', label:'Student Name *' },
        { value:'father_name', label:"Father's Name" },
        { value:'applying_for_class', label:'Class *' },
        { value:'father_mobile', label:'Mobile Number' },
        { value:'father_whatsapp', label:'WhatsApp Number' }
    ];
    const HEADER_ALIASES = {
        roll_number:['roll','rollno','rollnumber','studentroll','studentrollno','studentrollnumber'],
        full_name:['name','student','studentname','fullname','studentfullname','nameofstudent'],
        father_name:['father','fathername','fathersname','parent','parentname','guardianfather'],
        applying_for_class:['class','classname','grade','gradename','standard','studentclass','admissionclass','applyingforclass'],
        father_mobile:['mobile','mobileno','mobilenumber','phone','phoneno','phonenumber','contact','contactno','contactnumber','fathermobile'],
        father_whatsapp:['whatsapp','whatsappno','whatsappnumber','wanumber','wa','whatsappphone','fatherwhatsapp']
    };

    const dropZone = document.getElementById('dropZone');
    const fileInput = document.getElementById('studentFile');
    const mappingPanel = document.getElementById('mappingPanel');
    const mappingGrid = document.getElementById('mappingGrid');
    const previewArea = document.getElementById('previewArea');
    const previewBody = document.getElementById('previewBody');
    const importButton = document.getElementById('importStudents');
    const confirmModal = document.getElementById('confirmModal');
    let rawHeaders = [];
    let rawRows = [];
    let previewRows = [];
    let existingStudents = [];
    let schoolClasses = [];
    let classFeeMap = new Map();
    let currentSession = null;
    let importInProgress = false;
    let sourceHeaderRow = 0;

    const esc = value => String(value ?? '').replace(/[&<>"']/g, character => ({
        '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;'
    }[character]));
    const clean = value => String(value ?? '').trim();
    const keyText = value => clean(value).toLowerCase().replace(/[^a-z0-9]/g, '');
    const identityText = value => clean(value).toLowerCase().replace(/\s+/g, ' ');

    function todayKarachi() {
        const parts = new Intl.DateTimeFormat('en-CA', { timeZone:'Asia/Karachi', year:'numeric', month:'2-digit', day:'2-digit' }).formatToParts(new Date());
        const values = Object.fromEntries(parts.map(part => [part.type, part.value]));
        return `${values.year}-${values.month}-${values.day}`;
    }

    function detectField(header) {
        const normalized = keyText(header);
        return Object.entries(HEADER_ALIASES).find(([, aliases]) => aliases.includes(normalized))?.[0] || '';
    }

    function readCell(row, index) {
        return clean(Array.isArray(row) ? row[index] : '');
    }

    async function fetchAllAdmissions() {
        const all = [];
        for (let from = 0; ; from += 1000) {
            const { data, error } = await window.supabaseClient.from('admissions')
                .select('id, roll_number, full_name, father_name, applying_for_class')
                .eq('school_id', window.currentSchoolId).range(from, from + 999);
            if (error) throw error;
            all.push(...(data || []));
            if (!data || data.length < 1000) break;
        }
        return all;
    }

    async function loadReferenceData() {
        if (!window.currentSchoolId) throw new Error('School could not be identified. Refresh and try again.');
        const [classesResult, sessionsResult, feeHeadsResult] = await Promise.all([
            window.supabaseClient.from('classes').select('id, class_name, section, display_order').eq('school_id', window.currentSchoolId).order('display_order', { ascending:true }),
            window.supabaseClient.from('session').select('session_value, created_at').eq('school_id', window.currentSchoolId).order('created_at', { ascending:false }).limit(1),
            window.supabaseClient.from('fee_heads').select('class_id, amount, fee_type, is_monthly').eq('school_id', window.currentSchoolId)
        ]);
        if (classesResult.error) throw classesResult.error;
        if (sessionsResult.error) console.warn('Could not load current session:', sessionsResult.error);
        if (feeHeadsResult.error) console.warn('Could not load class fees:', feeHeadsResult.error);
        schoolClasses = (classesResult.data || []).map(item => ({ ...item, name:`${item.class_name || ''} ${item.section || ''}`.trim() }));
        currentSession = sessionsResult.data?.[0]?.session_value || null;
        const feesByClassId = new Map();
        (feeHeadsResult.data || []).forEach(fee => {
            const values = feesByClassId.get(String(fee.class_id)) || { monthly:0, admission:0 };
            const amount = Number(fee.amount || 0);
            const monthly = fee.is_monthly === true || String(fee.fee_type || '').toLowerCase().includes('monthly');
            if (monthly) values.monthly += amount; else values.admission += amount;
            feesByClassId.set(String(fee.class_id), values);
        });
        classFeeMap = new Map(schoolClasses.map(item => [identityText(item.name), feesByClassId.get(String(item.id)) || { monthly:0, admission:0 }]));
        existingStudents = await fetchAllAdmissions();
    }

    function findHeaderRow(matrix) {
        let bestIndex = -1;
        let bestScore = -1;
        matrix.slice(0, 20).forEach((row, index) => {
            const values = (row || []).map(clean).filter(Boolean);
            const score = values.reduce((sum, value) => sum + (detectField(value) ? 1 : 0), 0);
            if (score > bestScore && values.length >= 2) { bestScore = score; bestIndex = index; }
        });
        if (bestScore > 0) return bestIndex;
        return matrix.findIndex(row => (row || []).some(value => clean(value)));
    }

    async function readWorkbook(file) {
        if (!window.XLSX) throw new Error('Excel reader could not load. Check the internet connection and refresh.');
        const extension = file.name.split('.').pop().toLowerCase();
        if (!['xlsx','xls','csv'].includes(extension)) throw new Error('Choose an .xlsx, .xls or .csv file.');
        const buffer = await file.arrayBuffer();
        const workbook = XLSX.read(buffer, { type:'array', cellDates:false, raw:false });
        const sheet = workbook.Sheets[workbook.SheetNames[0]];
        const matrix = XLSX.utils.sheet_to_json(sheet, { header:1, defval:'', raw:false, blankrows:false });
        const headerIndex = findHeaderRow(matrix);
        if (headerIndex < 0) throw new Error('No header row was found in this file.');
        sourceHeaderRow = headerIndex;
        const maxColumns = Math.max(...matrix.slice(headerIndex).map(row => row.length), 0);
        const usedNames = new Map();
        rawHeaders = Array.from({ length:maxColumns }, (_, index) => {
            const original = clean(matrix[headerIndex]?.[index]) || `Column ${index + 1}`;
            const count = (usedNames.get(original) || 0) + 1;
            usedNames.set(original, count);
            return { index, label:count === 1 ? original : `${original} (${count})`, original };
        });
        rawRows = matrix.slice(headerIndex + 1).filter(row => (row || []).some(value => clean(value)));
        if (!rawRows.length) throw new Error('The file contains no student rows.');
        renderMapping();
    }

    function renderMapping() {
        const autoUsed = new Set();
        mappingGrid.innerHTML = rawHeaders.map(header => {
            let detected = detectField(header.original);
            if (detected && autoUsed.has(detected)) detected = '';
            if (detected) autoUsed.add(detected);
            const options = FIELD_OPTIONS.map(option => `<option value="${option.value}"${option.value === detected ? ' selected' : ''}>${option.label}</option>`).join('');
            return `<div class="mapping-item"><label title="${esc(header.original)}">Excel: ${esc(header.label)}</label><select class="mapping-select" data-index="${header.index}">${options}</select></div>`;
        }).join('');
        mappingPanel.style.display = 'block';
        previewArea.style.display = 'none';
        document.getElementById('mappingStatus').textContent = `${rawRows.length.toLocaleString()} non-empty rows detected.`;
        mappingPanel.scrollIntoView({ behavior:'smooth', block:'start' });
    }

    function mappedRowsFromSelection() {
        const mappings = [...mappingGrid.querySelectorAll('.mapping-select')].map(select => ({ index:Number(select.dataset.index), field:select.value })).filter(item => item.field);
        const duplicateMappings = mappings.map(item => item.field).filter((field, index, values) => values.indexOf(field) !== index);
        if (duplicateMappings.length) throw new Error('Each School System field can only be mapped once.');
        if (!mappings.some(item => item.field === 'roll_number')) throw new Error('Roll Number must be mapped.');
        if (!mappings.some(item => item.field === 'full_name')) throw new Error('Student Name must be mapped.');
        if (!mappings.some(item => item.field === 'applying_for_class')) throw new Error('Class must be mapped.');
        return rawRows.map((rawRow, index) => {
            const row = { _id:`row-${index + 1}`, _sourceRow:sourceHeaderRow + index + 2, duplicateAction:'skip' };
            mappings.forEach(mapping => { row[mapping.field] = readCell(rawRow, mapping.index); });
            FIELD_OPTIONS.slice(1).forEach(option => { if (!(option.value in row)) row[option.value] = ''; });
            return row;
        });
    }

    function duplicateKeys(row) {
        const roll = identityText(row.roll_number);
        const name = identityText(row.full_name);
        const father = identityText(row.father_name);
        const cls = identityText(row.applying_for_class);
        return {
            rollClass:roll && cls ? `${roll}|${cls}` : '',
            roll,
            full:name && father && cls ? `${name}|${father}|${cls}` : '',
            fallback:name && cls ? `${name}|${cls}` : ''
        };
    }

    function validateRows() {
        const existingRolls = new Set(existingStudents.map(student => identityText(student.roll_number)).filter(Boolean));
        const existingFull = new Set();
        const existingFallback = new Set();
        existingStudents.forEach(student => {
            const keys = duplicateKeys(student);
            if (keys.full) existingFull.add(keys.full);
            if (keys.fallback) existingFallback.add(keys.fallback);
        });
        const fileRolls = new Set();
        const fileFull = new Set();
        const fileFallback = new Set();
        previewRows.forEach(row => {
            row.full_name = clean(row.full_name);
            row.applying_for_class = clean(row.applying_for_class);
            row.roll_number = clean(row.roll_number);
            row.father_name = clean(row.father_name);
            row.father_mobile = clean(row.father_mobile);
            row.father_whatsapp = clean(row.father_whatsapp);
            row.errors = [];
            row.optionalMissing = [];
            row.duplicateReasons = [];
            if (!row.roll_number) row.errors.push('Roll Number missing');
            if (!row.full_name) row.errors.push('Student Name missing');
            if (!row.applying_for_class) row.errors.push('Class missing');
            if (!row.father_name) row.optionalMissing.push("Father's Name");
            if (!row.father_mobile) row.optionalMissing.push('Mobile');
            if (!row.father_whatsapp) row.optionalMissing.push('WhatsApp');
            const keys = duplicateKeys(row);
            if (keys.roll && existingRolls.has(keys.roll)) row.errors.push('Roll number already exists in this school');
            if (keys.full && existingFull.has(keys.full)) row.duplicateReasons.push('Same student, father and class already exist');
            else if (!row.father_name && keys.fallback && existingFallback.has(keys.fallback)) row.duplicateReasons.push('Same student name and class already exist');
            if (keys.roll && fileRolls.has(keys.roll)) row.errors.push('Roll number is repeated in this file');
            if (keys.full && fileFull.has(keys.full)) row.duplicateReasons.push('Student is repeated in this file');
            else if (!row.father_name && keys.fallback && fileFallback.has(keys.fallback)) row.duplicateReasons.push('Student name and class repeat in this file');
            if (keys.roll) fileRolls.add(keys.roll);
            if (keys.full) fileFull.add(keys.full);
            if (keys.fallback) fileFallback.add(keys.fallback);
            row.isDuplicate = row.duplicateReasons.length > 0;
            row.isValid = row.errors.length === 0;
            row.status = !row.isValid ? 'invalid' : (row.isDuplicate ? 'duplicate' : (row.optionalMissing.length ? 'warning' : 'ready'));
        });
        updateSummary();
    }

    function importableRows() {
        return previewRows.filter(row => row.isValid && (!row.isDuplicate || row.duplicateAction === 'import'));
    }

    function updateSummary() {
        const importable = importableRows().length;
        document.getElementById('totalRows').textContent = previewRows.length.toLocaleString();
        document.getElementById('readyRows').textContent = importable.toLocaleString();
        document.getElementById('warningRows').textContent = previewRows.filter(row => row.isValid && row.optionalMissing.length).length.toLocaleString();
        document.getElementById('invalidRows').textContent = previewRows.filter(row => !row.isValid).length.toLocaleString();
        document.getElementById('duplicateRows').textContent = previewRows.filter(row => row.isDuplicate).length.toLocaleString();
        importButton.textContent = `Import ${importable.toLocaleString()} Students`;
        importButton.disabled = importable === 0 || importInProgress;
        populatePreviewClasses();
    }

    function statusHtml(row) {
        if (!row.isValid) return `<span class="status-pill status-invalid">✕ Cannot Import</span><span class="reason">${esc(row.errors.join('; '))}</span>`;
        if (row.isDuplicate) return `<span class="status-pill status-duplicate">⚠ Possible Duplicate</span><span class="reason">${esc(row.duplicateReasons.join('; '))}</span>`;
        if (row.optionalMissing.length) return `<span class="status-pill status-warning">⚠ Missing Optional</span><span class="reason">${esc(row.optionalMissing.join(', '))} — still importable</span>`;
        return '<span class="status-pill status-ready">✓ Ready</span>';
    }

    function populatePreviewClasses() {
        const select = document.getElementById('previewClass');
        const current = select.value;
        const classes = [...new Set(previewRows.map(row => row.applying_for_class).filter(Boolean))].sort((a,b) => a.localeCompare(b, undefined, { numeric:true, sensitivity:'base' }));
        select.innerHTML = '<option value="">All Classes</option>' + classes.map(name => `<option value="${esc(name)}">${esc(name)}</option>`).join('');
        if (classes.includes(current)) select.value = current;
    }

    function renderPreview() {
        const search = document.getElementById('previewSearch').value.trim().toLowerCase();
        const classFilter = document.getElementById('previewClass').value;
        const statusFilter = document.getElementById('previewStatus').value;
        const rows = previewRows.filter(row => {
            if (classFilter && row.applying_for_class !== classFilter) return false;
            if (statusFilter && row.status !== statusFilter) return false;
            if (!search) return true;
            return [row.roll_number,row.full_name,row.father_name,row.applying_for_class,row.father_mobile,row.father_whatsapp].join(' ').toLowerCase().includes(search);
        });
        if (!rows.length) {
            previewBody.innerHTML = '<tr><td colspan="8" class="empty">No rows match the preview filters.</td></tr>';
            return;
        }
        previewBody.innerHTML = rows.map(row => `<tr data-id="${row._id}">
            <td>${statusHtml(row)}</td>
            <td contenteditable="true" data-field="roll_number">${esc(row.roll_number)}</td>
            <td contenteditable="true" data-field="full_name">${esc(row.full_name)}</td>
            <td contenteditable="true" data-field="father_name">${esc(row.father_name)}</td>
            <td contenteditable="true" data-field="applying_for_class">${esc(row.applying_for_class)}</td>
            <td contenteditable="true" data-field="father_mobile">${esc(row.father_mobile)}</td>
            <td contenteditable="true" data-field="father_whatsapp">${esc(row.father_whatsapp)}</td>
            <td>${row.isDuplicate && row.isValid ? `<select class="duplicate-action" data-id="${row._id}"><option value="skip"${row.duplicateAction !== 'import' ? ' selected' : ''}>Skip</option><option value="import"${row.duplicateAction === 'import' ? ' selected' : ''}>Import Anyway</option></select>` : '—'}</td>
        </tr>`).join('');
    }

    function refreshValidationAndPreview() {
        validateRows();
        renderPreview();
    }

    function openConfirmation() {
        const count = importableRows().length;
        const invalid = previewRows.filter(row => !row.isValid).length;
        const duplicateSkipped = previewRows.filter(row => row.isDuplicate && row.duplicateAction !== 'import').length;
        document.getElementById('confirmMessage').innerHTML = `You are about to import <strong>${count.toLocaleString()} students</strong>.<br><br>${invalid.toLocaleString()} rows cannot be imported because Roll Number, Student Name or Class is missing or the roll is duplicated.<br>${duplicateSkipped.toLocaleString()} possible duplicates are set to Skip.<br><br>Do you want to continue?`;
        confirmModal.classList.add('open');
        confirmModal.setAttribute('aria-hidden','false');
    }

    function closeConfirmation() {
        confirmModal.classList.remove('open');
        confirmModal.setAttribute('aria-hidden','true');
    }

    function normalizeClassName(value) {
        const match = schoolClasses.find(item => identityText(item.name) === identityText(value));
        return match?.name || clean(value);
    }

    function buildAdmissionPayload(row, rollNumber) {
        const className = normalizeClassName(row.applying_for_class);
        const fees = classFeeMap.get(identityText(className)) || { monthly:0, admission:0 };
        const uniquePart = globalThis.crypto?.randomUUID
            ? globalThis.crypto.randomUUID().slice(0, 8)
            : `${Math.random().toString(36).slice(2, 10)}${Date.now().toString(36).slice(-4)}`;
        const payload = {
            student_id:`BULK-${Date.now()}-${uniquePart}`,
            roll_number:rollNumber,
            full_name:clean(row.full_name),
            father_name:clean(row.father_name) || null,
            father_mobile:clean(row.father_mobile) || null,
            father_whatsapp:clean(row.father_whatsapp) || null,
            applying_for_class:className,
            session:currentSession,
            admission_date:todayKarachi(),
            admission_fee:fees.admission || null,
            monthly_fee:fees.monthly || null,
            status:'Active',
            school_id:window.currentSchoolId,
            campus:JSON.stringify({ type:'admission_contacts_v1', father_mobile_2:null, mother_mobile_2:null, primary_mobile_source:'fatherMobile', whatsapp_source:'fatherWhatsapp' })
        };
        if (window.campusFeatureReady && window.currentCampusId) payload.campus_id = window.currentCampusId;
        return payload;
    }

    // Direct integration point for the existing Supabase admissions backend.
    async function importStudent(student) {
        return window.supabaseClient.from('admissions').insert([student]).select('id, student_id, roll_number').single();
    }

    async function runImport() {
        closeConfirmation();
        if (importInProgress) return;
        importInProgress = true;
        updateSummary();
        const candidates = importableRows();
        const invalidCount = previewRows.filter(row => !row.isValid).length;
        const duplicateSkipped = previewRows.filter(row => row.isDuplicate && row.duplicateAction !== 'import').length;
        const jobs = candidates.map(row => ({ row, payload:buildAdmissionPayload(row, clean(row.roll_number)) }));
        const progressPanel = document.getElementById('progressPanel');
        const resultPanel = document.getElementById('resultPanel');
        progressPanel.style.display = 'block';
        resultPanel.style.display = 'none';
        let completed = 0;
        const successes = [];
        const failures = [];

        function updateProgress() {
            const percent = jobs.length ? Math.round(completed / jobs.length * 100) : 100;
            document.getElementById('progressText').textContent = `Importing Students... ${completed.toLocaleString()} / ${jobs.length.toLocaleString()}`;
            document.getElementById('progressPercent').textContent = `${percent}%`;
            document.getElementById('progressBar').style.width = `${percent}%`;
        }
        updateProgress();

        for (let start = 0; start < jobs.length; start += 8) {
            const batch = jobs.slice(start, start + 8);
            const results = await Promise.all(batch.map(async job => {
                try {
                    const result = await importStudent(job.payload);
                    if (result.error) throw result.error;
                    return { ok:true, job, data:result.data };
                } catch (error) {
                    return { ok:false, job, error };
                }
            }));
            results.forEach(result => {
                completed++;
                if (result.ok) successes.push(result);
                else failures.push({ row:result.job.row, reason:result.error?.message || 'Unknown import error' });
            });
            updateProgress();
            await new Promise(resolve => setTimeout(resolve, 0));
        }

        document.getElementById('resultImported').textContent = successes.length.toLocaleString();
        document.getElementById('resultInvalid').textContent = invalidCount.toLocaleString();
        document.getElementById('resultDuplicates').textContent = duplicateSkipped.toLocaleString();
        document.getElementById('resultFailed').textContent = failures.length.toLocaleString();
        document.getElementById('failureList').innerHTML = failures.length
            ? failures.map(item => `<div class="failure-item">Row ${item.row._sourceRow}: ${esc(item.row.full_name || 'Unnamed student')} — ${esc(item.reason)}</div>`).join('')
            : '<div style="padding:.7rem;color:#166534;font-weight:700;">All selected students were imported successfully.</div>';
        resultPanel.style.display = 'block';
        progressPanel.style.display = 'none';
        const successIds = new Set(successes.map(item => item.job.row._id));
        previewRows = previewRows.filter(row => !successIds.has(row._id));
        existingStudents = await fetchAllAdmissions();
        importInProgress = false;
        refreshValidationAndPreview();
        resultPanel.scrollIntoView({ behavior:'smooth', block:'start' });
    }

    function downloadTemplate() {
        if (!window.XLSX) {
            alert('Excel tools could not load. Check the internet connection and refresh.');
            return;
        }
        const rows = [
            ['Roll Number','Student Name',"Father's Name",'Class','Mobile Number','WhatsApp Number'],
            ['1','Ali Khan','Ahmed Khan','Junior A','03001234567','03001234567'],
            ['2','Hassan Ali','','Junior A','',''],
            ['3','Ayesha Khan','Imran Khan','One A','','03011234567']
        ];
        const worksheet = XLSX.utils.aoa_to_sheet(rows);
        worksheet['!cols'] = [{wch:15},{wch:24},{wch:24},{wch:18},{wch:18},{wch:20}];
        const workbook = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(workbook, worksheet, 'Students');
        XLSX.writeFile(workbook, 'Student-Import-Template.xlsx');
    }

    async function handleFile(file) {
        if (!file) return;
        document.getElementById('fileName').textContent = `${file.name} — reading...`;
        try {
            await readWorkbook(file);
            document.getElementById('fileName').textContent = `${file.name} — ${rawRows.length.toLocaleString()} rows detected`;
        } catch (error) {
            document.getElementById('fileName').textContent = error.message;
            mappingPanel.style.display = 'none';
            previewArea.style.display = 'none';
        }
    }

    document.getElementById('chooseFile').addEventListener('click', event => { event.stopPropagation(); fileInput.click(); });
    dropZone.addEventListener('click', event => { if (event.target.id !== 'chooseFile') fileInput.click(); });
    dropZone.addEventListener('keydown', event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); fileInput.click(); } });
    fileInput.addEventListener('change', () => handleFile(fileInput.files[0]));
    ['dragenter','dragover'].forEach(type => dropZone.addEventListener(type, event => { event.preventDefault(); dropZone.classList.add('dragover'); }));
    ['dragleave','drop'].forEach(type => dropZone.addEventListener(type, event => { event.preventDefault(); dropZone.classList.remove('dragover'); }));
    dropZone.addEventListener('drop', event => handleFile(event.dataTransfer.files[0]));
    document.getElementById('downloadTemplate').addEventListener('click', downloadTemplate);
    document.getElementById('applyMapping').addEventListener('click', () => {
        try {
            previewRows = mappedRowsFromSelection();
            refreshValidationAndPreview();
            previewArea.style.display = 'block';
            document.getElementById('mappingStatus').textContent = 'Mapping applied successfully.';
            previewArea.scrollIntoView({ behavior:'smooth', block:'start' });
        } catch (error) {
            document.getElementById('mappingStatus').textContent = error.message;
        }
    });
    previewBody.addEventListener('focusin', event => { const cell = event.target.closest('[contenteditable="true"]'); if (cell) cell.dataset.original = cell.innerText; });
    previewBody.addEventListener('keydown', event => { const cell = event.target.closest('[contenteditable="true"]'); if (cell && event.key === 'Enter') { event.preventDefault(); cell.blur(); } });
    previewBody.addEventListener('focusout', event => {
        const cell = event.target.closest('[contenteditable="true"]');
        if (!cell) return;
        const row = previewRows.find(item => item._id === cell.closest('tr')?.dataset.id);
        if (!row) return;
        row[cell.dataset.field] = clean(cell.innerText);
        refreshValidationAndPreview();
    });
    previewBody.addEventListener('change', event => {
        const select = event.target.closest('.duplicate-action');
        if (!select) return;
        const row = previewRows.find(item => item._id === select.dataset.id);
        if (row) { row.duplicateAction = select.value; updateSummary(); renderPreview(); }
    });
    ['previewSearch','previewClass','previewStatus'].forEach(id => document.getElementById(id).addEventListener(id === 'previewSearch' ? 'input' : 'change', renderPreview));
    importButton.addEventListener('click', async () => {
        importButton.disabled = true;
        importButton.textContent = 'Checking duplicates...';
        try {
            existingStudents = await fetchAllAdmissions();
            refreshValidationAndPreview();
            if (importableRows().length) openConfirmation();
        } catch (error) {
            alert(`Could not check existing students: ${error.message}`);
        } finally {
            updateSummary();
        }
    });
    document.getElementById('confirmCancel').addEventListener('click', closeConfirmation);
    document.getElementById('confirmImport').addEventListener('click', runImport);
    confirmModal.addEventListener('click', event => { if (event.target === confirmModal) closeConfirmation(); });

    try {
        await loadReferenceData();
    } catch (error) {
        document.getElementById('fileName').textContent = `Setup error: ${error.message}`;
        document.getElementById('chooseFile').disabled = true;
    }
});
