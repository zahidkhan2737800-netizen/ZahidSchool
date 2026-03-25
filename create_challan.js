// Supabase client is now provided by auth.js (supabaseClient)

// Global Caches
let cache = {
    admissions: [],
    classes: [],
    feeHeads: [],
    challans: []
};
let isInitializing = true;

document.addEventListener('DOMContentLoaded', async () => {
    // Basic DOM elements
    const uiLoading = document.getElementById('loadingOverlay');
    const uiMain = document.getElementById('mainUI');
    
    // Scopes
    const scopeRadios = document.getElementsByName('scope');
    const studentFields = document.getElementById('studentFields');
    const classFields = document.getElementById('classFields');
    
    // Inputs
    const rollNoInput = document.getElementById('rollNo');
    const studentNameInput = document.getElementById('studentName');
    const fatherNameInput = document.getElementById('fatherName');
    const studentClassInput = document.getElementById('studentClass');
    const targetClassSelect = document.getElementById('targetClass');
    const feeTypeSelect = document.getElementById('feeType');
    const monthPickerGroup = document.getElementById('monthPickerGroup');
    const feeMonthName = document.getElementById('feeMonthName');
    const feeMonthYear = document.getElementById('feeMonthYear');
    const amountGroup = document.getElementById('amountGroup');
    const customAmountInput = document.getElementById('customAmount');
    const dueDateInput = document.getElementById('dueDate');
    const generateBtn = document.getElementById('generateBtn');
    const formAlert = document.getElementById('formAlert');
    const filterTextInput = document.getElementById('filterText');
    const challanBody = document.getElementById('challanBody');
    const rollStatus = document.getElementById('rollStatus');

    // Default Due Date to +7 days
    const nextWeek = new Date();
    nextWeek.setDate(nextWeek.getDate() + 7);
    dueDateInput.value = nextWeek.toISOString().split('T')[0];

    // Load Data into Cache
    await initializeCaches();

    uiLoading.style.display = 'none';
    uiMain.style.display = 'flex';

    // ====== EVENT LISTENERS ======

    // 1. Radio Scope Change
    scopeRadios.forEach(radio => {
        radio.addEventListener('change', (e) => {
            const scope = e.target.value;
            studentFields.style.display = scope === 'student' ? 'block' : 'none';
            classFields.style.display = scope === 'class' ? 'block' : 'none';
            
            // If class or school, amount becomes fully calculated, gray out amount box unless overriding
            if(scope === 'class' || scope === 'school') {
                customAmountInput.placeholder = 'Auto-calculated per class formula';
                customAmountInput.value = '';
                // Clear selected student
                rollNoInput.value = '';
                studentNameInput.value = '';
                fatherNameInput.value = '';
                studentClassInput.value = '';
                rollStatus.textContent = 'Type to search cache...';
            } else {
                customAmountInput.placeholder = 'Auto-calculated or custom';
                lookupRollNumber(); // re-trigger fetch if they go back to Student
            }
        });
    });

    // 2. Roll Number Auto-Fill (Smart Caching)
    rollNoInput.addEventListener('input', () => {
        lookupRollNumber();
    });

    function lookupRollNumber() {
        const val = rollNoInput.value.trim().toLowerCase();
        if(!val) {
            studentNameInput.value = '';
            studentClassInput.value = '';
            rollStatus.textContent = 'Type to search cache...';
            customAmountInput.value = '';
            return;
        }

        const match = cache.admissions.find(s => String(s.roll_number).toLowerCase() === val);
        if(match) {
            studentNameInput.value = match.full_name;
            fatherNameInput.value = match.father_name || 'N/A';
            studentClassInput.value = match.applying_for_class;
            rollStatus.textContent = '✅ Found active student';
            rollStatus.style.color = 'var(--success)';
            
            // Auto calculate amount if fee type is already chosen
            updateAmountEstimate(match);
        } else {
            studentNameInput.value = '';
            fatherNameInput.value = '';
            studentClassInput.value = '';
            rollStatus.textContent = '❌ Not found or entirely inactive';
            rollStatus.style.color = 'var(--error)';
        }
    }

    // Helper: Auto-set Due Date for Monthly Fees to the 1st of the month
    function updateDueDateForMonth() {
        const monthStr = feeMonthName.value;
        const yearStr = feeMonthYear.value;
        const monthIndex = [
            "January", "February", "March", "April", "May", "June", 
            "July", "August", "September", "October", "November", "December"
        ].indexOf(monthStr);
        
        if (monthIndex !== -1 && yearStr) {
            const yyyy = yearStr;
            const mm = String(monthIndex + 1).padStart(2, '0');
            const dd = '01'; // 1st of the selected month
            dueDateInput.value = `${yyyy}-${mm}-${dd}`;
        }
    }

    // 3. Fee Type Selection logic (Fee Head Sensitivity)
    feeTypeSelect.addEventListener('change', () => {
        const type = feeTypeSelect.value;
        const isMonthlyType = cache.feeHeads.some(f => f.fee_type === type && f.is_monthly);
        
        if (isMonthlyType) {
            monthPickerGroup.style.display = 'block';
            amountGroup.style.display = 'block'; // ALWAYS show amount box so they can edit it
            updateDueDateForMonth(); // instantly snap the due date to the 1st
        } else {
            monthPickerGroup.style.display = 'none';
            amountGroup.style.display = 'block'; // force user to see amount box
            customAmountInput.value = ''; // clear any old generic auto-fill
            
            // Snap to today's date for one-off fees
            const today = new Date();
            const yyyy = today.getFullYear();
            const mm = String(today.getMonth() + 1).padStart(2, '0');
            const dd = String(today.getDate()).padStart(2, '0');
            dueDateInput.value = `${yyyy}-${mm}-${dd}`;
        }

        // Auto update amount if specific student scope is active
        if(document.querySelector('input[name="scope"]:checked').value === 'student') {
            const match = cache.admissions.find(s => String(s.roll_number).toLowerCase() === rollNoInput.value.trim().toLowerCase());
            if(match) updateAmountEstimate(match);
        }
    });

    function updateAmountEstimate(student) {
        if(!student || !student.applying_for_class) return;
        const type = feeTypeSelect.value;
        if(!type) return;

        // Try to find the fee amount matching this student's class and selected type
        let foundAmount = null;
        const isMonthlyType = cache.feeHeads.some(f => f.fee_type === type && f.is_monthly);

        // Prioritize student's specific monthly fee if configured
        if (isMonthlyType && student.monthly_fee) {
            foundAmount = student.monthly_fee;
        } else {
            // 1. Convert applying_for_class ("Class 1 A") to a class_id
            const matchedClass = cache.classes.find(c => `${c.class_name} ${c.section}`.trim().toLowerCase() === student.applying_for_class.trim().toLowerCase());
            
            if(matchedClass) {
                const matchedFee = cache.feeHeads.find(f => f.fee_type === type && f.class_id === matchedClass.id);
                if(matchedFee) foundAmount = matchedFee.amount;
            }
        }
        
        if(foundAmount !== null) {
            customAmountInput.value = foundAmount;
        } else {
            customAmountInput.value = ''; // they must enter manually
            console.log('No configured fee head found for class: ' + student.applying_for_class);
        }
    }

    // Auto-update the Due Date if they change the dropdowns while Monthly is active
    feeMonthName.addEventListener('change', updateDueDateForMonth);
    feeMonthYear.addEventListener('input', updateDueDateForMonth);

    // 4. Submit logic
    generateBtn.addEventListener('click', async () => {
        const scope = document.querySelector('input[name="scope"]:checked').value;
        const feeType = feeTypeSelect.value;
        const dueDate = dueDateInput.value;
        const feeMonth = monthPickerGroup.style.display === 'block' 
            ? `${feeMonthName.value} ${feeMonthYear.value}` 
            : 'N/A';
        const overrideAmount = customAmountInput.value ? parseFloat(customAmountInput.value) : null;

        if(!feeType || !dueDate) {
            return showAlert('Fee Type and Due Date are mandatory.', true);
        }

        let targetStudents = [];

        if (scope === 'student') {
            const val = rollNoInput.value.trim().toLowerCase();
            const match = cache.admissions.find(s => String(s.roll_number).toLowerCase() === val);
            if(!match) return showAlert('Valid student roll number is required.', true);
            if(!overrideAmount) return showAlert('Amount could not be retrieved and is not provided.', true);
            
            targetStudents.push({ student: match, amount: overrideAmount });
        } 
        else if (scope === 'class') {
            const selClassStr = targetClassSelect.value; // e.g., "Class 1 A"
            if(!selClassStr) return showAlert('Target class selection required.', true);
            
            const classAdmissions = cache.admissions.filter(s => s.applying_for_class === selClassStr);
            if(classAdmissions.length === 0) return showAlert(`No active students found in ${selClassStr}.`, true);
            
            targetStudents = await calculateBulkPayload(classAdmissions, feeType, overrideAmount);
        }
        else if (scope === 'school') {
            if(cache.admissions.length === 0) return showAlert('No active students in school.', true);
            targetStudents = await calculateBulkPayload(cache.admissions, feeType, overrideAmount);
        }

        if(targetStudents.length === 0) {
            return showAlert('No applicable students found with valid fee configurations for this type.', true);
        }

        // PREPARE SUPABASE PAYLOAD (AND CHECK DUPLICATES)
        let payload = [];
        let duplicateCount = 0;

        for (let t of targetStudents) {
            // Check cache for existing challan with same student, fee type, and fee month
            const exists = cache.challans.some(c => 
                c.student_id === t.student.id && 
                c.fee_type === feeType && 
                c.fee_month === feeMonth
            );

            if (exists) {
                duplicateCount++;
            } else {
                payload.push({
                    student_id: t.student.id,
                    roll_number: t.student.roll_number,
                    student_name: t.student.full_name,
                    father_name: t.student.father_name || 'N/A',
                    class_name: t.student.applying_for_class,
                    fee_type: feeType,
                    amount: t.amount,
                    paid_amount: 0,
                    fee_month: feeMonth,
                    due_date: dueDate,
                    status: 'Unpaid'
                });
            }
        }

        if (payload.length === 0) {
            const msg = duplicateCount > 0 
                ? `❌ All selected students already have a '${feeType}' challan ${feeMonth !== 'N/A' ? 'for ' + feeMonth : ''}!`
                : 'No valid students found to generate challans.';
            return showAlert(msg, true);
        }

        const confirmMsg = duplicateCount > 0 
            ? `Found ${duplicateCount} duplicate(s) which will be skipped.\n\nYou are about to generate ${payload.length} NEW challan(s). Proceed?`
            : `You are about to generate ${payload.length} challan(s). Proceed?`;

        // CONFIRM
        if(!confirm(confirmMsg)) return;

        generateBtn.innerHTML = '⏳ Generating...';
        generateBtn.disabled = true;

        try {
            const { data, error } = await supabaseClient.from('challans').insert(payload).select('*');
            if(error) throw error;
            
            showAlert(`✅ Successfully generated ${payload.length} challans!`, false);
            
            // Synchorize local cache securely
            if(data) cache.challans.unshift(...data);
            
            renderChallans();
        } catch(e) {
            showAlert('❌ Generator Error: ' + e.message, true);
        } finally {
            generateBtn.innerHTML = 'Generate Challan(s)';
            generateBtn.disabled = false;
        }
    });

    // Helpers for Bulk payload mapping
    async function calculateBulkPayload(studentsArray, feeType, manualOverrideBase) {
        let validPayloads = [];
        const isMonthlyType = cache.feeHeads.some(f => f.fee_type === feeType && f.is_monthly);
        
        for(let s of studentsArray) {
            let assignedAmt = manualOverrideBase;
            
            // If manual amount isn't globally provided, we compute per-class dynamically or per-student if monthly
            if(assignedAmt === null || isNaN(assignedAmt)) {
                if (isMonthlyType && s.monthly_fee) {
                    assignedAmt = s.monthly_fee;
                } else {
                    const matchedClass = cache.classes.find(c => `${c.class_name} ${c.section}`.trim().toLowerCase() === s.applying_for_class.trim().toLowerCase());
                    if(matchedClass) {
                        const matchedFee = cache.feeHeads.find(f => f.fee_type === feeType && f.class_id === matchedClass.id);
                        if(matchedFee) assignedAmt = matchedFee.amount;
                    }
                }
            }
            
            if(assignedAmt !== null && !isNaN(assignedAmt)) {
                validPayloads.push({ student: s, amount: assignedAmt });
            }
        }
        return validPayloads;
    }

    // 5. Live Filtering of Challan List Table without extra DB reads
    filterTextInput.addEventListener('input', () => {
        renderChallans(filterTextInput.value.trim().toLowerCase());
    });


    // ===================================
    // INITIALIZATION & RENDER FUNCTIONS
    // ===================================
    async function initializeCaches() {
        try {
            const [classesRes, feeHeadsRes, admissionsRes, challansRes] = await Promise.all([
                supabaseClient.from('classes').select('id, class_name, section').order('class_name'),
                supabaseClient.from('fee_heads').select('id, class_id, fee_type, amount, is_monthly'),
                supabaseClient.from('admissions').select('id, roll_number, full_name, father_name, applying_for_class, monthly_fee').eq('status', 'Active'),
                supabaseClient.from('challans').select('*').order('created_at', { ascending: false }).limit(200) // caching top 200
            ]);

            if (classesRes.error) throw new Error("Classes Table: " + classesRes.error.message);
            if (feeHeadsRes.error) throw new Error("Fee Heads Table: " + feeHeadsRes.error.message);
            if (admissionsRes.error) throw new Error("Admissions Table: " + admissionsRes.error.message);
            if (challansRes.error) throw new Error("Challans Table: " + challansRes.error.message);

            cache.classes = classesRes.data || [];
            cache.feeHeads = feeHeadsRes.data || [];
            cache.admissions = admissionsRes.data || [];
            cache.challans = challansRes.data || [];
            
            populateSelects();
            renderChallans();
            
        } catch(e) {
            console.error('Cache INIT Failed:', e);
            document.getElementById('loadingOverlay').innerHTML = `<span style="color:var(--error); font-weight:700;">Initialization Failed</span><br><br>${e.message}<br><br><small>Did you forget to run the most recent Database Setup script?</small>`;
            throw e; // prevent uiMain from showing
        }
    }

    function populateSelects() {
        // Unique fee Types
        const uniqueFeeTypes = [...new Set(cache.feeHeads.map(f => f.fee_type))];
        feeTypeSelect.innerHTML = '<option value="" disabled selected>Select configured fee</option>';
        uniqueFeeTypes.forEach(type => {
            const opt = document.createElement('option');
            opt.value = opt.textContent = type;
            feeTypeSelect.appendChild(opt);
        });

        // Target Classes (for bulk)
        targetClassSelect.innerHTML = '<option value="" disabled selected>Select class scope...</option>';
        cache.classes.forEach(c => {
            const str = `${c.class_name} ${c.section}`;
            const opt = document.createElement('option');
            opt.value = opt.textContent = str;
            targetClassSelect.appendChild(opt);
        });
    }

    function renderChallans(filterTerm = '') {
        challanBody.innerHTML = '';
        
        let displayList = cache.challans;
        if(filterTerm) {
            displayList = displayList.filter(c => 
                String(c.roll_number).toLowerCase().includes(filterTerm) || 
                String(c.student_name).toLowerCase().includes(filterTerm)
            );
        }

        if(displayList.length === 0) {
            challanBody.innerHTML = `<tr><td colspan="7" style="text-align:center; padding:2rem; color:var(--text-muted);">No challans found.</td></tr>`;
            return;
        }

        displayList.forEach(c => {
            const tr = document.createElement('tr');
            
            let badgeClass = 'unpaid';
            if(c.status === 'Paid') badgeClass = 'paid';
            if(c.status === 'Partially Paid') badgeClass = 'pending'; // yellow badge
            
            const feeDesc = c.fee_month && c.fee_month !== 'N/A' 
                ? `${c.fee_type} <br><small style="color:var(--text-muted);">${c.fee_month}</small>`
                : `${c.fee_type}`;

            const paidAmt = c.paid_amount || 0;
            const remAmt = c.amount - paidAmt;
            const paidDesc = `<span style="color:var(--success); font-weight:600;">Rs ${paidAmt}</span><br><small style="color:var(--error);">Rs ${remAmt}</small>`;

            // Hide pay button if fully paid
            const payButtonHTML = remAmt > 0 
                ? `<button class="pay-btn" data-id="${c.id}" style="background:var(--success); color:white; border:none; padding:0.3rem 0.6rem; border-radius:6px; font-size:0.8rem; cursor:pointer; margin-right:0.3rem;">Pay</button>` 
                : `<span style="color:var(--success); font-size:0.85rem; font-weight:700; margin-right:0.5rem;">Fully Paid via ${c.payment_method || 'Unknown'}</span>`;

            tr.innerHTML = `
                <td><strong>${c.roll_number}</strong></td>
                <td>${c.student_name}</td>
                <td>${c.father_name || 'N/A'}</td>
                <td>${c.class_name}</td>
                <td>${feeDesc}</td>
                <td>Rs ${c.amount}</td>
                <td>${paidDesc}</td>
                <td><span class="badge ${badgeClass}">${c.status}</span></td>
                <td>
                    ${payButtonHTML}
                    <button class="del-btn" data-id="${c.id}">Delete</button>
                </td>
            `;
            challanBody.appendChild(tr);
        });

        attachActionListeners();
    }

    // Payment Modal State
    let currentPayChallanId = null;
    let currentRemaining = 0;

    function attachActionListeners() {
        // Delete listenrs
        document.querySelectorAll('.del-btn').forEach(btn => {
            btn.addEventListener('click', async (e) => {
                const id = e.target.getAttribute('data-id');
                // Password prompt for client-side delete restriction config logic
                const pwd = prompt("Admin override required to delete issued challan. Enter admin password:", "");
                
                // Hardcoded local fallback matching app behavior
                if(pwd === "admin123" || pwd === "zahid123") {
                    e.target.disabled = true;
                    e.target.innerHTML = '...';
                    try {
                        const {error} = await supabaseClient.from('challans').delete().eq('id', id);
                        if(error) throw error;
                        
                        // Synchronize cache filter
                        cache.challans = cache.challans.filter(c => c.id !== id);
                        renderChallans(filterTextInput.value.trim().toLowerCase());
                    } catch(err) {
                        alert('Delete failed: ' + err.message);
                        renderChallans(filterTextInput.value.trim().toLowerCase());
                    }
                } else if(pwd !== null) {
                    alert("Incorrect Admin Password.");
                }
            });
        });

        // Pay listeners map directly to the POS Master Module
        document.querySelectorAll('.pay-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const id = e.target.getAttribute('data-id');
                const challan = cache.challans.find(c => c.id === id);
                if(challan && challan.roll_number) {
                    window.location.href = 'collect_fee.html?roll=' + encodeURIComponent(challan.roll_number);
                }
            });
        });
    }

    function showAlert(msg, isError) {
        formAlert.textContent = msg;
        formAlert.style.background = isError ? 'var(--error)' : 'var(--success)';
        formAlert.style.display = 'block';
        setTimeout(() => { formAlert.style.display = 'none'; }, 6000);
    }
});
