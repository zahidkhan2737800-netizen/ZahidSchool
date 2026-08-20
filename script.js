// Supabase client is now provided by auth.js (supabaseClient)

document.addEventListener('DOMContentLoaded', () => {
    const checkAuth = setInterval(() => {
        if (window.supabaseClient && window.authReady) {
            clearInterval(checkAuth);
    const form = document.getElementById('admissionForm');
    const successMessage = document.getElementById('successMessage');
    const formAlert = document.getElementById('formAlert');
    const getAdmissionSchoolId = () => window.currentSchoolId || null;
    const applySchoolScope = (query) => {
        const schoolId = getAdmissionSchoolId();
        return schoolId ? query.eq('school_id', schoolId) : query;
    };
    
    let editingStudentRecordId = null;
    let originalSubmitBtnHtml = '';
    let admissionSearchRequestId = 0;

    const CONTACT_SOURCE_DEFAULTS = {
        primary_mobile_source: 'fatherMobile',
        whatsapp_source: 'fatherWhatsapp'
    };

    function parseContactPreferences(value) {
        try {
            const parsed = JSON.parse(String(value || ''));
            if (parsed && parsed.type === 'admission_contacts_v1') return parsed;
        } catch (_) {}
        return { type: 'admission_contacts_v1', ...CONTACT_SOURCE_DEFAULTS };
    }

    function setContactChoice(groupName, source, fallback) {
        const wanted = source || fallback;
        const selected = form.querySelector(`input[name="${groupName}"][value="${wanted}"]`)
            || form.querySelector(`input[name="${groupName}"][value="${fallback}"]`);
        if (selected) selected.checked = true;
    }

    function resetContactChoices() {
        setContactChoice('primaryMobileSource', CONTACT_SOURCE_DEFAULTS.primary_mobile_source, 'fatherMobile');
        setContactChoice('whatsappSource', CONTACT_SOURCE_DEFAULTS.whatsapp_source, 'fatherWhatsapp');
    }

    function getSelectedContactSource(groupName, fallback) {
        return form.querySelector(`input[name="${groupName}"]:checked`)?.value || fallback;
    }
    
    // Fetch and populate classes dynamically
    const classSelect = document.getElementById('admissionClass');
    async function loadClasses() {
        if(!classSelect) return;
        try {
            const { data, error } = await applySchoolScope(supabaseClient
                .from('classes')
                .select('*')
                .eq('is_active', true)
                .order('display_order', { ascending: true, nullsFirst: false })
                .order('class_name', { ascending: true })
                .order('section', { ascending: true }));
                
            if (error) throw error;
            
            classSelect.innerHTML = '<option value="" disabled selected>Select class</option>';
            if(data && data.length > 0) {
                const nameCounts = {};
                data.forEach(cls => {
                    const val = `${cls.class_name} ${cls.section}`.trim();
                    nameCounts[val] = (nameCounts[val] || 0) + 1;
                });

                data.forEach(cls => {
                    const opt = document.createElement('option');
                    let val = `${cls.class_name} ${cls.section}`.trim();
                    
                    if (nameCounts[val] > 1) {
                        val = `${val} (Duplicate, ID: ${cls.id.substring(0, 4)})`;
                    }
                    
                    // We must keep the option value as the clean name so old students match,
                    // but if it's a duplicate, the value will be the modified string so the user sees it's broken.
                    opt.value = `${cls.class_name} ${cls.section}`.trim();
                    opt.textContent = val;
                    opt.dataset.classId = cls.id;
                    classSelect.appendChild(opt);
                });
            } else {
                classSelect.innerHTML = '<option value="" disabled selected>No classes available</option>';
            }
        } catch(err) {
            console.error('Error loading classes:', err);
            classSelect.innerHTML = '<option value="" disabled selected>Error loading classes</option>';
        }
    }
    loadClasses();

    // Load only sessions belonging to the signed-in school. The newest saved
    // session is treated as the current session for new admissions.
    const sessionSelect = document.getElementById('session');
    async function loadSchoolSessions() {
        if (!sessionSelect) return;
        const schoolId = getAdmissionSchoolId();
        if (!schoolId) {
            sessionSelect.innerHTML = '<option value="" disabled selected>School session unavailable</option>';
            return;
        }
        try {
            const { data, error } = await supabaseClient
                .from('session')
                .select('id, session_value, created_at')
                .eq('school_id', schoolId)
                .order('created_at', { ascending: false });
            if (error) throw error;

            const sessions = data || [];
            sessionSelect.innerHTML = '';
            if (!sessions.length) {
                sessionSelect.innerHTML = '<option value="" disabled selected>No school sessions configured</option>';
                return;
            }
            sessions.forEach((item, index) => {
                const option = document.createElement('option');
                option.value = item.session_value;
                option.textContent = `${item.session_value}${index === 0 ? ' (Current)' : ''}`;
                option.selected = index === 0;
                option.defaultSelected = index === 0;
                sessionSelect.appendChild(option);
            });
        } catch (error) {
            console.error('Could not load school sessions:', error);
            sessionSelect.innerHTML = '<option value="" disabled selected>Could not load school sessions</option>';
        }
    }
    loadSchoolSessions();
    
    let baseMonthlyFee = 0;
    let admissionFeeHeadTypes = [];
    let admissionFeeHeadConfigs = [];
    let admissionFeeHeadTypeRules = new Map();
    const admissionChallanRows = document.getElementById('admissionChallanRows');
    const addAdmissionChallanBtn = document.getElementById('addAdmissionChallanBtn');
    const admissionChallanSummary = document.getElementById('admissionChallanSummary');
    const admissionChallanCount = document.getElementById('admissionChallanCount');
    const admissionChallanTotal = document.getElementById('admissionChallanTotal');
    const admissionChallanDiscountTotal = document.getElementById('admissionChallanDiscountTotal');

    function karachiDateParts() {
        const parts = new Intl.DateTimeFormat('en-CA', {
            timeZone: 'Asia/Karachi', year: 'numeric', month: '2-digit', day: '2-digit'
        }).formatToParts(new Date());
        const value = type => parts.find(part => part.type === type)?.value || '';
        return { year: value('year'), month: value('month'), day: value('day') };
    }

    function karachiIsoDate() {
        const { year, month, day } = karachiDateParts();
        return `${year}-${month}-${day}`;
    }

    function karachiMonthValue() {
        const { year, month } = karachiDateParts();
        return `${year}-${month}`;
    }

    function formatFeeMonth(value) {
        const match = String(value || '').match(/^(\d{4})-(\d{2})$/);
        if (!match) return null;
        return new Intl.DateTimeFormat('en-US', {
            month: 'long', year: 'numeric', timeZone: 'UTC'
        }).format(new Date(`${match[1]}-${match[2]}-01T00:00:00Z`));
    }

    function selectedAdmissionClassId() {
        return classSelect?.options[classSelect.selectedIndex]?.dataset?.classId || null;
    }

    function applicableFeeHeadConfig(feeType) {
        const classId = selectedAdmissionClassId();
        return admissionFeeHeadConfigs.find(item => item.fee_type === feeType && item.class_id === classId)
            || admissionFeeHeadConfigs.find(item => item.fee_type === feeType && !item.class_id)
            || null;
    }

    function populateAdmissionFeeHeadSelect(select, selectedValue = '') {
        select.innerHTML = '<option value="">-- Select Fee Head --</option>';
        if (selectedValue && !admissionFeeHeadTypes.includes(selectedValue)) {
            const preserved = document.createElement('option');
            preserved.value = selectedValue;
            preserved.textContent = `${selectedValue} — assigned service`;
            select.appendChild(preserved);
        }
        admissionFeeHeadTypes.forEach(type => {
            const option = document.createElement('option');
            option.value = type;
            const assignedOnly = admissionFeeHeadTypeRules.get(type)?.requiresStudentAssignment;
            option.textContent = `${type}${assignedOnly ? ' — assigned service' : ''}`;
            option.selected = type === selectedValue;
            select.appendChild(option);
        });
    }

    function updateAdmissionChallanSummary() {
        if (!admissionChallanRows) return;
        const completeRows = [...admissionChallanRows.querySelectorAll('.admission-challan-row')]
            .filter(row => row.querySelector('.admission-challan-type')?.value);
        let total = 0;
        let discountTotal = 0;
        completeRows.forEach(row => {
            const baseAmount = Math.max(0, Number(row.querySelector('.admission-challan-amount')?.value) || 0);
            const requestedDiscount = Math.max(0, Number(row.querySelector('.admission-challan-discount')?.value) || 0);
            const discount = Math.min(baseAmount, requestedDiscount);
            const payable = Math.max(0, baseAmount - discount);
            const payableInput = row.querySelector('.admission-challan-payable');
            if (payableInput) payableInput.value = payable;
            discountTotal += discount;
            total += payable;
        });
        if (admissionChallanCount) admissionChallanCount.textContent = completeRows.length;
        if (admissionChallanTotal) admissionChallanTotal.textContent = total.toLocaleString('en-PK');
        if (admissionChallanDiscountTotal) admissionChallanDiscountTotal.textContent = discountTotal.toLocaleString('en-PK');
        if (admissionChallanSummary) admissionChallanSummary.style.display = completeRows.length ? 'flex' : 'none';
    }

    function applyAdmissionChallanType(row, keepUserAmount = false) {
        const select = row.querySelector('.admission-challan-type');
        const amountInput = row.querySelector('.admission-challan-amount');
        const monthGroup = row.querySelector('.admission-challan-month-group');
        const monthInput = row.querySelector('.admission-challan-month');
        const config = applicableFeeHeadConfig(select?.value || '');
        const requiresStudentAssignment = Boolean(admissionFeeHeadTypeRules.get(select?.value || '')?.requiresStudentAssignment);
        const isMonthly = requiresStudentAssignment || Boolean(config?.is_monthly) || /monthly/i.test(select?.value || '');
        row.dataset.requiresStudentAssignment = requiresStudentAssignment ? 'true' : 'false';
        row.dataset.isMonthly = isMonthly ? 'true' : 'false';
        if (monthGroup) monthGroup.style.display = isMonthly ? 'flex' : 'none';
        if (isMonthly && monthInput && !monthInput.value) monthInput.value = karachiMonthValue();
        if (!isMonthly && monthInput) monthInput.value = '';
        if (amountInput && !keepUserAmount) {
            amountInput.value = config?.amount !== null && config?.amount !== undefined
                ? Number(config.amount)
                : '';
        }
        updateAdmissionChallanSummary();
    }

    function addAdmissionChallanRow(initial = {}) {
        if (!admissionChallanRows) return;
        const row = document.createElement('div');
        row.className = 'admission-challan-row';
        row.dataset.existingAssignment = initial.existingAssignment ? 'true' : 'false';
        row.innerHTML = `
            <div class="input-group">
                <label>Fee Head * ${initial.existingAssignment ? '<span style="color:#15803d;font-size:0.72rem;">Assigned</span>' : ''}</label>
                <select class="admission-challan-type"></select>
            </div>
            <div class="input-group">
                <label>Base Amount (Rs) *</label>
                <input type="number" min="0.01" step="0.01" class="admission-challan-amount" placeholder="e.g. 3000">
            </div>
            <div class="input-group">
                <label>Discount (Rs)</label>
                <input type="number" min="0" step="0.01" class="admission-challan-discount" value="0" placeholder="0">
            </div>
            <div class="input-group">
                <label>Payable (Rs)</label>
                <input type="number" class="admission-challan-payable" value="0" readonly tabindex="-1" style="background:#ecfdf5;color:#166534;font-weight:800;">
            </div>
            <div class="input-group admission-challan-month-group" style="display:none;">
                <label>Fee Month *</label>
                <input type="month" class="admission-challan-month">
            </div>
            <div class="input-group">
                <label>Due Date *</label>
                <input type="date" class="admission-challan-due-date">
            </div>
            <button type="button" class="remove-admission-challan" title="Remove this challan">✕</button>
        `;
        const typeSelect = row.querySelector('.admission-challan-type');
        const amountInput = row.querySelector('.admission-challan-amount');
        const discountInput = row.querySelector('.admission-challan-discount');
        const monthInput = row.querySelector('.admission-challan-month');
        const dueDateInput = row.querySelector('.admission-challan-due-date');
        populateAdmissionFeeHeadSelect(typeSelect, initial.feeType || '');
        if (initial.existingAssignment) {
            typeSelect.disabled = true;
            typeSelect.title = 'Remove this row and add a new one to change the assigned service.';
        }
        if (initial.amount !== undefined) amountInput.value = initial.amount;
        discountInput.value = Math.max(0, Number(initial.discount) || 0);
        monthInput.value = initial.monthValue || '';
        dueDateInput.value = initial.dueDate || document.getElementById('admissionDate')?.value || karachiIsoDate();

        typeSelect.addEventListener('change', () => applyAdmissionChallanType(row, false));
        amountInput.addEventListener('input', updateAdmissionChallanSummary);
        discountInput.addEventListener('input', updateAdmissionChallanSummary);
        [amountInput, discountInput].forEach(input => input.addEventListener('wheel', event => input.blur(), { passive: true }));
        row.querySelector('.remove-admission-challan').addEventListener('click', () => {
            row.remove();
            updateAdmissionChallanSummary();
        });
        admissionChallanRows.appendChild(row);
        if (initial.feeType) applyAdmissionChallanType(row, initial.amount !== undefined);
        updateAdmissionChallanSummary();
    }

    function resetAdmissionChallanRows() {
        if (admissionChallanRows) admissionChallanRows.innerHTML = '';
        updateAdmissionChallanSummary();
    }

    function readAdmissionChallanSelections(validate = true) {
        if (!admissionChallanRows) return [];
        const selections = [];
        const seenMonthly = new Set();
        const rows = [...admissionChallanRows.querySelectorAll('.admission-challan-row')];
        rows.forEach((row, index) => {
            const feeType = String(row.querySelector('.admission-challan-type')?.value || '').trim();
            const baseAmount = Number(row.querySelector('.admission-challan-amount')?.value);
            const discount = Number(row.querySelector('.admission-challan-discount')?.value) || 0;
            const amount = baseAmount - discount;
            const dueDate = row.querySelector('.admission-challan-due-date')?.value || '';
            const isMonthly = row.dataset.isMonthly === 'true';
            const monthValue = row.querySelector('.admission-challan-month')?.value || '';
            const feeMonth = isMonthly ? formatFeeMonth(monthValue) : null;

            if (!feeType && !baseAmount) {
                if (validate) throw new Error(`Select a Fee Head in additional challan row ${index + 1}, or remove that row.`);
                return;
            }
            if (!feeType) {
                if (validate) throw new Error(`Select a Fee Head in additional challan row ${index + 1}.`);
                return;
            }
            if (!Number.isFinite(baseAmount) || baseAmount <= 0) {
                if (validate) throw new Error(`Enter a valid amount for ${feeType}.`);
                return;
            }
            if (!Number.isFinite(discount) || discount < 0) {
                if (validate) throw new Error(`Enter a valid discount for ${feeType}.`);
                return;
            }
            if (discount > baseAmount) {
                if (validate) throw new Error(`${feeType} discount cannot be greater than its base amount.`);
                return;
            }
            if (!dueDate) {
                if (validate) throw new Error(`Select a due date for ${feeType}.`);
                return;
            }
            if (isMonthly && !feeMonth) {
                if (validate) throw new Error(`Select a fee month for ${feeType}.`);
                return;
            }
            if (isMonthly) {
                const duplicateKey = `${feeType.toLowerCase()}|${feeMonth}`;
                if (seenMonthly.has(duplicateKey)) {
                    if (validate) throw new Error(`${feeType} for ${feeMonth} was added more than once.`);
                    return;
                }
                seenMonthly.add(duplicateKey);
            }
            selections.push({
                feeType,
                amount,
                baseAmount,
                discount,
                dueDate,
                isMonthly,
                feeMonth,
                monthValue,
                requiresStudentAssignment: row.dataset.requiresStudentAssignment === 'true',
                createChallan: row.dataset.existingAssignment !== 'true'
            });
        });
        return selections;
    }

    async function loadAdmissionFeeHeadCatalog() {
        try {
            const [typesResult, configsResult] = await Promise.all([
                applySchoolScope(supabaseClient.from('fee_head_types').select('name, requires_student_assignment').order('name')),
                applySchoolScope(supabaseClient.from('fee_heads').select('class_id, fee_type, amount, is_monthly'))
            ]);
            if (typesResult.error) throw typesResult.error;
            if (configsResult.error) throw configsResult.error;
            admissionFeeHeadConfigs = configsResult.data || [];
            admissionFeeHeadTypeRules = new Map((typesResult.data || []).map(item => [item.name, {
                requiresStudentAssignment: Boolean(item.requires_student_assignment)
            }]));
            admissionFeeHeadTypes = [...new Set([
                ...(typesResult.data || []).map(item => item.name),
                ...admissionFeeHeadConfigs.map(item => item.fee_type)
            ].filter(Boolean))].sort((a, b) => a.localeCompare(b));
        } catch (error) {
            console.error('Could not load admission fee-head catalog:', error);
            admissionFeeHeadTypes = [];
            admissionFeeHeadConfigs = [];
            admissionFeeHeadTypeRules = new Map();
        }
    }

    async function createAdmissionChallans(studentDbId, formData, selections) {
        let challanSelections = selections.filter(item => item.createChallan !== false);
        if (!studentDbId || !challanSelections.length) return 0;

        const monthlySelections = challanSelections.filter(item => item.isMonthly);
        if (monthlySelections.length) {
            const { data: existing, error: existingError } = await applySchoolScope(supabaseClient
                .from('challans')
                .select('fee_type, fee_month')
                .eq('student_id', studentDbId));
            if (existingError) throw existingError;
            const existingKeys = new Set((existing || []).map(item => `${String(item.fee_type).toLowerCase()}|${item.fee_month || ''}`));
            challanSelections = challanSelections.filter(item => !item.isMonthly
                || !existingKeys.has(`${item.feeType.toLowerCase()}|${item.feeMonth}`));
        }

        if (!challanSelections.length) return 0;

        const issueDate = formData.admission_date || karachiIsoDate();
        const payload = challanSelections.map(item => ({
            student_id: studentDbId,
            roll_number: formData.roll_number,
            student_name: formData.full_name,
            father_name: formData.father_name || 'N/A',
            class_name: formData.applying_for_class,
            fee_type: item.feeType,
            amount: item.amount,
            base_amount: item.baseAmount,
            assigned_discount: item.discount,
            paid_amount: 0,
            fee_month: item.isMonthly ? item.feeMonth : null,
            issue_date: issueDate,
            due_date: item.dueDate,
            status: item.amount <= 0 ? 'Paid' : 'Unpaid',
            school_id: getAdmissionSchoolId(),
            ...(window.campusFeatureReady && window.currentCampusId ? { campus_id: window.currentCampusId } : {})
        }));

        const { error } = await supabaseClient.from('challans').insert(payload);
        if (error) throw error;
        return payload.length;
    }

    async function syncStudentFeeHeadAssignments(studentDbId, selections) {
        if (!studentDbId) return;
        const schoolId = getAdmissionSchoolId();
        if (!schoolId) throw new Error('School could not be identified for fee service assignments.');

        const selectedServiceMap = new Map();
        selections.filter(item => item.requiresStudentAssignment).forEach(item => {
            selectedServiceMap.set(item.feeType.toLowerCase(), item);
        });
        const selectedServices = [...selectedServiceMap.values()];
        const selectedKeys = new Set(selectedServices.map(item => item.feeType.toLowerCase()));
        const { data: existing, error: existingError } = await applySchoolScope(supabaseClient
            .from('student_fee_head_assignments')
            .select('id, fee_type, is_active')
            .eq('student_id', studentDbId));
        if (existingError) {
            throw new Error(`Fee service assignments are not installed. Run student_fee_head_assignments_setup.sql first. (${existingError.message})`);
        }

        const deactivateIds = (existing || [])
            .filter(item => item.is_active && !selectedKeys.has(String(item.fee_type || '').toLowerCase()))
            .map(item => item.id);
        if (deactivateIds.length) {
            const { error } = await applySchoolScope(supabaseClient
                .from('student_fee_head_assignments')
                .update({ is_active: false })
                .in('id', deactivateIds));
            if (error) throw error;
        }

        if (!selectedServices.length) return;
        const payload = selectedServices.map(item => ({
            ...(function () {
                const configuredAmount = applicableFeeHeadConfig(item.feeType)?.amount;
                const useConfiguredAmount = configuredAmount !== null
                    && configuredAmount !== undefined
                    && Number(configuredAmount) === Number(item.baseAmount);
                return {
                    amount_override: useConfiguredAmount ? null : item.baseAmount,
                    discount_amount: item.discount
                };
            })(),
            school_id: schoolId,
            ...(window.campusFeatureReady && window.currentCampusId ? { campus_id: window.currentCampusId } : {}),
            student_id: studentDbId,
            fee_type: item.feeType,
            is_active: true,
            created_by: window.currentUser?.id || null
        }));
        const { error } = await supabaseClient
            .from('student_fee_head_assignments')
            .upsert(payload, { onConflict: 'school_id,student_id,fee_type' });
        if (error) throw error;
    }

    async function loadStudentFeeHeadAssignments(studentDbId) {
        resetAdmissionChallanRows();
        if (!studentDbId) return;
        const { data, error } = await applySchoolScope(supabaseClient
            .from('student_fee_head_assignments')
            .select('fee_type, amount_override, discount_amount')
            .eq('student_id', studentDbId)
            .eq('is_active', true)
            .order('created_at'));
        if (error) {
            console.error('Could not load student fee service assignments:', error);
            return;
        }
        (data || []).forEach(item => {
            if (!admissionFeeHeadTypes.includes(item.fee_type)) admissionFeeHeadTypes.push(item.fee_type);
            admissionFeeHeadTypeRules.set(item.fee_type, { requiresStudentAssignment: true });
            addAdmissionChallanRow({
                feeType: item.fee_type,
                amount: item.amount_override != null
                    ? item.amount_override
                    : applicableFeeHeadConfig(item.fee_type)?.amount,
                discount: item.discount_amount,
                monthValue: karachiMonthValue(),
                dueDate: document.getElementById('admissionDate')?.value || karachiIsoDate(),
                existingAssignment: true
            });
        });
    }

    if (addAdmissionChallanBtn) {
        addAdmissionChallanBtn.addEventListener('click', () => {
            if (!admissionFeeHeadTypes.length) {
                alert('No fee-head types are available. Add them in Fee Heads Management first.');
                return;
            }
            addAdmissionChallanRow();
        });
    }
    loadAdmissionFeeHeadCatalog();

    // Auto-fetch fees when class is selected
    window.isPopulatingForm = false; // Flag to prevent auto-fetch during population

    async function updateFeesForClass(classId, updateInputs = true) {
        try {
            const monthlyFeeInput = document.getElementById('monthlyFee');
            const admissionFeeInput = document.getElementById('admissionFee');
            if (updateInputs) {
                if (monthlyFeeInput) monthlyFeeInput.placeholder = "Loading...";
                if (admissionFeeInput) admissionFeeInput.placeholder = "Loading...";
            }

            let feeQuery = applySchoolScope(supabaseClient
                .from('fee_heads')
                .select('*'));
            const { data, error } = await feeQuery.or(`class_id.eq.${classId},class_id.is.null`);
                
            if (error) throw error;
            
            let monthlyTotal = 0;
            let admissionTotal = 0;

            if (data && data.length > 0) {
                const feesByType = new Map();
                data.filter(fee => !fee.class_id).forEach(fee => feesByType.set(fee.fee_type, fee));
                data.filter(fee => fee.class_id === classId).forEach(fee => feesByType.set(fee.fee_type, fee));
                feesByType.forEach(fee => {
                    const normalizedFeeType = String(fee.fee_type || '').trim().toLowerCase();
                    if (normalizedFeeType === 'monthly fee') {
                        monthlyTotal += Number(fee.amount || 0);
                    } else if (normalizedFeeType === 'admission fee') {
                        // Optional one-time heads such as Transport, Hostel and
                        // Books are added explicitly below, not forced on everyone.
                        admissionTotal += Number(fee.amount || 0);
                    }
                });
            }
            
            baseMonthlyFee = monthlyTotal;
            
            if (updateInputs) {
                if (monthlyFeeInput) {
                    monthlyFeeInput.value = monthlyTotal > 0 ? monthlyTotal : '';
                    monthlyFeeInput.placeholder = "";
                }
                if (admissionFeeInput) {
                    admissionFeeInput.value = admissionTotal > 0 ? admissionTotal : '';
                    admissionFeeInput.placeholder = "";
                }
                
                // Apply any existing discount immediately
                applyDiscount();
            }

        } catch (err) {
            console.error('Error fetching class fee heads:', err);
        }
    }

    classSelect.addEventListener('change', async () => {
        if (window.isPopulatingForm) return;
        const selectedOption = classSelect.options[classSelect.selectedIndex];
        const classId = selectedOption?.dataset?.classId;
        if (!classId) return;
        
        await updateFeesForClass(classId, true);
        admissionChallanRows?.querySelectorAll('.admission-challan-row').forEach(row => {
            applyAdmissionChallanType(row, Boolean(row.querySelector('.admission-challan-amount')?.value));
        });
    });

    const btnLoadClassFees = document.getElementById('btnLoadClassFees');
    if (btnLoadClassFees) {
        btnLoadClassFees.addEventListener('click', async () => {
            const selectedOption = classSelect.options[classSelect.selectedIndex];
            const classId = selectedOption?.dataset?.classId;
            if (!classId) {
                alert("Please select a class first.");
                return;
            }
            await updateFeesForClass(classId, true);
        });
    }

    const discountInput = document.getElementById('discount');
    if (discountInput) {
        discountInput.addEventListener('input', applyDiscount);
    }

    function applyDiscount() {
        const monthlyFeeInput = document.getElementById('monthlyFee');
        if (!monthlyFeeInput || baseMonthlyFee === 0) return;
        
        const disc = parseFloat(discountInput ? discountInput.value : 0) || 0;
        let finalFee = baseMonthlyFee - disc;
        if (finalFee < 0) finalFee = 0;
        
        monthlyFeeInput.value = finalFee;
    }

    // Only fetch elements that have 'required' attribute
    const getRequiredInputs = () => form.querySelectorAll('input[required], select[required], textarea[required]');
    
    // Auto-generate Student ID
    const studentIdInput = document.getElementById('studentId');

    /**
     * Generates a highly unique student ID using timestamp + random suffix.
     * Format: ZSM-YYYY-TTTRRR  (T = last 4 digits of ms timestamp, R = 3-digit random)
     * Gives ~10 million unique combinations per year — collisions are virtually impossible.
     * Also verifies against the DB and retries if the ID somehow already exists.
     */
    async function generateUniqueStudentId() {
        const year = new Date().getFullYear();
        for (let attempt = 0; attempt < 5; attempt++) {
            const ts  = Date.now().toString().slice(-4);          // last 4 ms digits
            const rnd = Math.floor(100 + Math.random() * 900);   // 3-digit random
            const id  = `ZSM-${year}-${ts}${rnd}`;

            // Verify the ID doesn't already exist in the DB
            try {
                const { data } = await applySchoolScope(supabaseClient
                    .from('admissions')
                    .select('id')
                    .eq('student_id', id)
                    .limit(1));
                if (!data || data.length === 0) return id; // ✅ unique
            } catch (_) {
                return id; // On network error, use it anyway — constraint will catch true dup
            }
        }
        // Fallback: full timestamp ensures global uniqueness
        return `ZSM-${year}-${Date.now()}`;
    }

    // Set ID on page load
    generateUniqueStudentId().then(id => { studentIdInput.value = id; });
    
    // Fetch last admitted roll number
    async function fetchLastAdmittedRoll() {
        try {
            const { data, error } = await applySchoolScope(supabaseClient
                .from('admissions')
                .select('roll_number')
                .order('created_at', { ascending: false })
                .limit(1));
            
            const label = document.getElementById('lastAdmittedRoll');
            const rollInput = document.getElementById('rollNumber');
            if (label) {
                if (!error && data && data.length > 0) {
                    const lastRollStr = data[0].roll_number;
                    label.innerHTML = `Last admitted roll no: <span style="background-color: #fef08a; padding: 2px 6px; border-radius: 4px; color: #854d0e; font-weight: 600;">${lastRollStr}</span>`;
                    
                    if (rollInput && !rollInput.value && typeof editingStudentRecordId !== 'undefined' && !editingStudentRecordId) {
                        const lastRollNum = parseInt(lastRollStr, 10);
                        if (!isNaN(lastRollNum)) {
                            rollInput.value = lastRollNum + 1;
                        }
                    }
                } else {
                    label.textContent = `No previous admissions found.`;
                }
            }
        } catch (e) {
            console.error('Error fetching last roll number:', e);
        }
    }
    fetchLastAdmittedRoll();
    
    // Auto age calculation (uses date parts instead of UTC date parsing)
    const dobInput = document.getElementById('dob');
    const ageInput = document.getElementById('age');

    function getKarachiDateParts() {
        const parts = new Intl.DateTimeFormat('en-CA', {
            timeZone: 'Asia/Karachi', year: 'numeric', month: '2-digit', day: '2-digit'
        }).formatToParts(new Date());
        const values = Object.fromEntries(parts.map(part => [part.type, part.value]));
        return { year: Number(values.year), month: Number(values.month), day: Number(values.day) };
    }

    function calculateStudentAge() {
        const match = String(dobInput?.value || '').match(/^(\d{4})-(\d{2})-(\d{2})$/);
        if (!match) {
            if (ageInput) ageInput.value = '';
            return;
        }
        const birth = { year: Number(match[1]), month: Number(match[2]), day: Number(match[3]) };
        const today = getKarachiDateParts();
        const isFuture = birth.year > today.year
            || (birth.year === today.year && birth.month > today.month)
            || (birth.year === today.year && birth.month === today.month && birth.day > today.day);
        if (isFuture) {
            ageInput.value = 'Invalid future date';
            return;
        }

        let years = today.year - birth.year;
        let months = today.month - birth.month;
        if (today.day < birth.day) months--;
        if (months < 0) {
            years--;
            months += 12;
        }
        ageInput.value = `${years} year${years === 1 ? '' : 's'}, ${months} month${months === 1 ? '' : 's'}`;
    }

    if (dobInput && ageInput) {
        const today = getKarachiDateParts();
        dobInput.max = `${today.year}-${String(today.month).padStart(2, '0')}-${String(today.day).padStart(2, '0')}`;
        dobInput.addEventListener('input', calculateStudentAge);
        dobInput.addEventListener('change', calculateStudentAge);
    }
    // Set admission date to today by default (Asia/Karachi timezone)
    const admissionDateInput = document.getElementById('admissionDate');
    function setAdmissionDateToToday() {
        if (!admissionDateInput) return;
        const parts = new Intl.DateTimeFormat('en-US', { 
            timeZone: 'Asia/Karachi', 
            year: 'numeric', 
            month: '2-digit', 
            day: '2-digit' 
        }).formatToParts(new Date());
        
        const y = parts.find(p => p.type === 'year').value;
        const m = parts.find(p => p.type === 'month').value;
        const d = parts.find(p => p.type === 'day').value;
        admissionDateInput.value = `${y}-${m}-${d}`;
    }
    setAdmissionDateToToday();

    // Photo Preview + Compression
    const photoInput       = document.getElementById('studentPhoto');
    const photoPreviewImg  = document.getElementById('studentPhotoPreviewImg');
    const photoPlaceholder = document.getElementById('photoPlaceholder');
    const photoPreviewBox  = document.getElementById('photoPreviewBox');
    const photoEditOverlay = document.getElementById('photoEditOverlay');

    // Stores the last cropped dataUrl so "Edit / Recrop" can re-open it
    let currentCroppedDataUrl = null;

    function showPhotoPreview(dataUrl) {
        currentCroppedDataUrl = dataUrl;
        if (photoPreviewImg) {
            photoPreviewImg.src = dataUrl;
            photoPreviewImg.style.display = 'block';
        }
        if (photoPlaceholder) photoPlaceholder.style.display = 'none';
        if (photoEditOverlay) photoEditOverlay.style.display = 'block';
        if (photoPreviewBox)  photoPreviewBox.classList.add('has-photo');
    }

    function resetPhotoPreview() {
        currentCroppedDataUrl = null;
        if (photoPreviewImg) {
            photoPreviewImg.src = '';
            photoPreviewImg.style.display = 'none';
        }
        if (photoPlaceholder) photoPlaceholder.style.display = 'flex';
        if (photoEditOverlay) photoEditOverlay.style.display = 'none';
        if (photoPreviewBox)  photoPreviewBox.classList.remove('has-photo');
    }

    // Box click: open file picker only when no photo is set
    if (photoPreviewBox) {
        photoPreviewBox.addEventListener('click', (e) => {
            // If the overlay was clicked, don't also trigger file input
            if (e.target.closest('#photoEditOverlay')) return;
            if (!photoPreviewBox.classList.contains('has-photo')) {
                photoInput.click();
            }
        });
    }

    // Overlay "Edit / Recrop" click: re-open crop modal with current cropped image
    if (photoEditOverlay) {
        photoEditOverlay.addEventListener('click', (e) => {
            e.stopPropagation();
            if (currentCroppedDataUrl) {
                openCropModal(currentCroppedDataUrl, true); // true = re-cropping existing photo
            } else {
                photoInput.click();
            }
        });
    }

    // Compress image to ≤ targetKB using Canvas (iterative quality reduction)
    function compressImageToMaxKB(file, targetKB = 30) {
        return new Promise((resolve) => {
            const img = new Image();
            const reader = new FileReader();
            reader.onload = (e) => {
                img.onload = () => {
                    const canvas = document.createElement('canvas');
                    let W = img.width, H = img.height;
                    const maxDim = 400;
                    if (W > maxDim || H > maxDim) {
                        const ratio = Math.min(maxDim / W, maxDim / H);
                        W = Math.round(W * ratio);
                        H = Math.round(H * ratio);
                    }
                    canvas.width = W;
                    canvas.height = H;
                    canvas.getContext('2d').drawImage(img, 0, 0, W, H);
                    let quality = 0.9;
                    let dataUrl;
                    do {
                        dataUrl = canvas.toDataURL('image/jpeg', quality);
                        quality -= 0.07;
                    } while (dataUrl.length * 0.75 > targetKB * 1024 && quality > 0.1);
                    const byteStr = atob(dataUrl.split(',')[1]);
                    const arr = new Uint8Array(byteStr.length);
                    for (let i = 0; i < byteStr.length; i++) arr[i] = byteStr.charCodeAt(i);
                    const blob = new Blob([arr], { type: 'image/jpeg' });
                    resolve({ blob, dataUrl });
                };
                img.src = e.target.result;
            };
            reader.readAsDataURL(file);
        });
    }

    // Compress a dataUrl string (used after cropping)
    function compressDataUrlToMaxKB(srcDataUrl, targetKB = 50) {
        return new Promise((resolve) => {
            const img = new Image();
            img.onload = () => {
                const canvas = document.createElement('canvas');
                let W = img.width, H = img.height;
                const maxDim = 600;
                if (W > maxDim || H > maxDim) {
                    const ratio = Math.min(maxDim / W, maxDim / H);
                    W = Math.round(W * ratio);
                    H = Math.round(H * ratio);
                }
                canvas.width = W;
                canvas.height = H;
                canvas.getContext('2d').drawImage(img, 0, 0, W, H);
                let quality = 0.92;
                let out;
                do {
                    out = canvas.toDataURL('image/jpeg', quality);
                    quality -= 0.07;
                } while (out.length * 0.75 > targetKB * 1024 && quality > 0.1);
                const byteStr = atob(out.split(',')[1]);
                const arr = new Uint8Array(byteStr.length);
                for (let i = 0; i < byteStr.length; i++) arr[i] = byteStr.charCodeAt(i);
                const blob = new Blob([arr], { type: 'image/jpeg' });
                resolve({ blob, dataUrl: out });
            };
            img.src = srcDataUrl;
        });
    }

    let compressedPhotoBlob = null;

    // ── Crop Modal logic ─────────────────────────────────────────────
    const cropModal        = document.getElementById('cropModal');
    const cropperImage     = document.getElementById('cropperImage');
    const applyCropBtn     = document.getElementById('applyCropBtn');
    const cancelCropBtn    = document.getElementById('cancelCropBtn');
    const cancelCropBtn2   = document.getElementById('cancelCropBtn2');
    const cropAspectToggle = document.getElementById('cropAspectToggle');
    const cropAspectLabel  = document.getElementById('cropAspectLabel');

    let cropperInstance = null;
    const aspectCycles  = [
        { label: 'Free',  ratio: NaN,     text: 'Aspect: Free — drag corners to resize crop box' },
        { label: '1 : 1', ratio: 1,       text: 'Aspect: 1:1 (Square)' },
        { label: '3 : 4', ratio: 3/4,     text: 'Aspect: 3:4 (Portrait passport)' },
    ];
    let aspectIdx = 0;

    let isReCropping = false; // true when crop modal opened from overlay (existing photo)

    function openCropModal(imageSrc, reCrop = false) {
        isReCropping = reCrop;
        cropperImage.src = imageSrc;
        cropModal.classList.add('open');
        // Wait for image to load then init cropper
        cropperImage.onload = () => {
            if (cropperInstance) { cropperInstance.destroy(); cropperInstance = null; }
            cropperInstance = new Cropper(cropperImage, {
                viewMode: 1,
                dragMode: 'move',
                aspectRatio: NaN,
                autoCropArea: 0.85,
                restore: false,
                guides: true,
                center: true,
                highlight: false,
                cropBoxMovable: true,
                cropBoxResizable: true,
                toggleDragModeOnDblclick: false,
                background: true,
            });
        };
        // reset aspect
        aspectIdx = 0;
        cropAspectToggle.textContent = '📐 ' + aspectCycles[0].label;
        if (cropAspectLabel) cropAspectLabel.textContent = aspectCycles[0].text;
    }

    function closeCropModal(applyResult) {
        cropModal.classList.remove('open');
        if (cropperInstance) { cropperInstance.destroy(); cropperInstance = null; }
        if (!applyResult && !isReCropping) {
            // Fresh file was picked but user cancelled → clear everything
            if (photoInput) photoInput.value = '';
            resetPhotoPreview();
            compressedPhotoBlob = null;
        }
        // If re-cropping and cancelled → existing photo stays unchanged (no action needed)
        isReCropping = false;
    }

    if (cancelCropBtn)  cancelCropBtn.addEventListener('click',  () => closeCropModal(false));
    if (cancelCropBtn2) cancelCropBtn2.addEventListener('click', () => closeCropModal(false));

    // Keyboard: Escape closes
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && cropModal && cropModal.classList.contains('open')) {
            closeCropModal(false);
        }
    });

    // Apply crop → compress → show in preview box
    if (applyCropBtn) {
        applyCropBtn.addEventListener('click', async () => {
            if (!cropperInstance) return;
            applyCropBtn.textContent = '⏳ Processing...';
            applyCropBtn.disabled = true;
            try {
                const croppedDataUrl = cropperInstance.getCroppedCanvas({
                    maxWidth: 800,
                    maxHeight: 800,
                    imageSmoothingQuality: 'high',
                }).toDataURL('image/jpeg', 0.95);

                const { blob, dataUrl } = await compressDataUrlToMaxKB(croppedDataUrl, 50);
                compressedPhotoBlob = blob;
                showPhotoPreview(dataUrl);
                closeCropModal(true);
            } catch (err) {
                console.error('Crop error:', err);
            } finally {
                applyCropBtn.textContent = '✅ Apply Crop';
                applyCropBtn.disabled = false;
            }
        });
    }

    // Crop control buttons
    document.getElementById('cropZoomIn')   ?.addEventListener('click', () => cropperInstance?.zoom(0.1));
    document.getElementById('cropZoomOut')  ?.addEventListener('click', () => cropperInstance?.zoom(-0.1));
    document.getElementById('cropRotateL')  ?.addEventListener('click', () => cropperInstance?.rotate(-90));
    document.getElementById('cropRotateR')  ?.addEventListener('click', () => cropperInstance?.rotate(90));
    document.getElementById('cropReset')    ?.addEventListener('click', () => cropperInstance?.reset());
    document.getElementById('cropFlipH')    ?.addEventListener('click', () => {
        if (!cropperInstance) return;
        const d = cropperInstance.getData();
        cropperInstance.scaleX(d.scaleX === -1 ? 1 : -1);
    });
    document.getElementById('cropFlipV')    ?.addEventListener('click', () => {
        if (!cropperInstance) return;
        const d = cropperInstance.getData();
        cropperInstance.scaleY(d.scaleY === -1 ? 1 : -1);
    });
    
    document.getElementById('cropChangePhoto')?.addEventListener('click', () => {
        if (photoInput) photoInput.click();
    });

    if (cropAspectToggle) {
        cropAspectToggle.addEventListener('click', () => {
            aspectIdx = (aspectIdx + 1) % aspectCycles.length;
            const { label, ratio, text } = aspectCycles[aspectIdx];
            cropperInstance?.setAspectRatio(ratio);
            cropAspectToggle.textContent = '📐 ' + label;
            if (cropAspectLabel) cropAspectLabel.textContent = text;
        });
    }

    // When a file is chosen — open crop modal instead of compressing directly
    if(photoInput) {
        photoInput.addEventListener('change', function() {
            const file = this.files[0];
            if(file) {
                const reader = new FileReader();
                reader.onload = (e) => openCropModal(e.target.result);
                reader.readAsDataURL(file);
            } else {
                compressedPhotoBlob = null;
                resetPhotoPreview();
            }
        });
    }

    // Upload compressed blob to Supabase Storage and return the public URL
    async function uploadStudentPhoto(studentId) {
        if (!compressedPhotoBlob) return null;
        try {
            const path = `student-photos/${studentId}.jpg`;
            const { error: upErr } = await supabaseClient.storage
                .from('school-assets')
                .upload(path, compressedPhotoBlob, { upsert: true, contentType: 'image/jpeg' });
            if (upErr) {
                console.error('Photo upload error:', upErr);
                formAlert.textContent = `⚠️ Photo could not be saved: ${upErr.message}. Make sure the "school-assets" Storage bucket exists in Supabase.`;
                formAlert.style.display = 'block';
                return null;
            }
            const { data } = supabaseClient.storage.from('school-assets').getPublicUrl(path);
            return data?.publicUrl || null;
        } catch(e) {
            console.error('Photo upload failed:', e);
            formAlert.textContent = `⚠️ Photo upload failed: ${e.message}`;
            formAlert.style.display = 'block';
            return null;
        }
    }

    // Print Form
    const printBtn = document.getElementById('printBtn');
    const admissionPrintSheet = document.getElementById('admissionPrintSheet');

    function escapePrintHtml(value) {
        return String(value ?? '').replace(/[&<>"']/g, character => ({
            '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
        }[character]));
    }

    function printValue(id, fallback = '\u2014') {
        const element = document.getElementById(id);
        const value = String(element?.value || '').trim();
        return escapePrintHtml(value || fallback);
    }

    function printDateValue(id) {
        const value = String(document.getElementById(id)?.value || '').trim();
        const match = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
        return match ? `${match[3]}/${match[2]}/${match[1]}` : escapePrintHtml(value || '\u2014');
    }

    function selectedContactValue(groupName, fallbackSource) {
        const source = getSelectedContactSource(groupName, fallbackSource);
        return String(document.getElementById(source)?.value || '').trim() || '\u2014';
    }

    function buildAdmissionPrintSheet() {
        if (!admissionPrintSheet) return;
        const photo = document.getElementById('studentPhotoPreviewImg');
        const hasPhoto = Boolean(photo?.src && document.getElementById('photoPreviewBox')?.classList.contains('has-photo'));
        const schoolName = escapePrintHtml(window.currentSchoolName || 'Zahid School');
        const printedOn = new Date().toLocaleString('en-PK', {
            dateStyle: 'medium', timeStyle: 'short', hour12: true, timeZone: 'Asia/Karachi'
        });
        const money = id => {
            const value = String(document.getElementById(id)?.value || '').trim();
            return value ? `Rs ${Number(value).toLocaleString('en-PK')}` : '\u2014';
        };
        const selectedChallans = readAdmissionChallanSelections(false);
        const additionalChallansPrint = selectedChallans.length ? `
            <div class="admission-print-section">Student-Specific Fee Head Challans</div>
            <table class="admission-print-table">
                <tr><th>Fee Head</th><th>Base</th><th>Discount</th><th>Payable</th><th>Fee Month</th><th>Due Date</th></tr>
                ${selectedChallans.map(item => `
                    <tr>
                        <td>${escapePrintHtml(item.feeType)}</td>
                        <td>Rs ${Number(item.baseAmount).toLocaleString('en-PK')}</td>
                        <td>Rs ${Number(item.discount).toLocaleString('en-PK')}</td>
                        <td>Rs ${Number(item.amount).toLocaleString('en-PK')}</td>
                        <td>${escapePrintHtml(item.feeMonth || '\u2014')}</td>
                        <td>${escapePrintHtml(item.dueDate)}</td>
                    </tr>
                `).join('')}
                <tr>
                    <th colspan="5">Additional Challan Payable Total</th>
                    <td><strong>Rs ${selectedChallans.reduce((sum, item) => sum + item.amount, 0).toLocaleString('en-PK')}</strong></td>
                </tr>
            </table>
        ` : '';

        admissionPrintSheet.innerHTML = `
            <div class="admission-print-head">
                <div style="width:72px;flex:0 0 72px;"></div>
                <div class="admission-print-title">
                    <h1>${schoolName}</h1>
                    <h2>Student Admission Form</h2>
                    <p>Printed: ${escapePrintHtml(printedOn)}</p>
                </div>
                <div class="admission-print-photo">${hasPhoto ? `<img src="${escapePrintHtml(photo.src)}" alt="Student Photo">` : 'Student<br>Photo'}</div>
            </div>

            <div class="admission-print-section">Student and Admission Details</div>
            <table class="admission-print-table">
                <tr><th>Student ID</th><td>${printValue('studentId')}</td><th>Roll Number</th><td>${printValue('rollNumber')}</td></tr>
                <tr><th>Student Name</th><td colspan="3"><strong>${printValue('fullName')}</strong></td></tr>
                <tr><th>Date of Birth</th><td>${printDateValue('dob')}</td><th>Age</th><td>${printValue('age')}</td></tr>
                <tr><th>Gender</th><td>${printValue('gender')}</td><th>Place of Birth</th><td>${printValue('placeOfBirth')}</td></tr>
                <tr><th>Class</th><td>${printValue('admissionClass')}</td><th>Session</th><td>${printValue('session')}</td></tr>
                <tr><th>Admission Date</th><td>${printDateValue('admissionDate')}</td><th>Status</th><td>${printValue('status')}</td></tr>
            </table>

            <div class="admission-print-section">Parent, Guardian and Contact Details</div>
            <table class="admission-print-table">
                <tr><th>Father Name</th><td>${printValue('fatherName')}</td><th>Father CNIC</th><td>${printValue('fatherCnic')}</td></tr>
                <tr><th>Occupation</th><td>${printValue('fatherOcc')}</td><th>Mobile 1</th><td>${printValue('fatherMobile')}</td></tr>
                <tr><th>Mobile 2</th><td>${printValue('fatherMobile2')}</td><th>Father WhatsApp</th><td>${printValue('fatherWhatsapp')}</td></tr>
                <tr><th>Mother Name</th><td>${printValue('motherName')}</td><th>Mother CNIC</th><td>${printValue('motherCnic')}</td></tr>
                <tr><th>Occupation</th><td>${printValue('motherOcc')}</td><th>Mother Mobile 1</th><td>${printValue('motherMobile')}</td></tr>
                <tr><th>Mother Mobile 2</th><td>${printValue('motherMobile2')}</td><th>Primary Mobile</th><td><strong>${escapePrintHtml(selectedContactValue('primaryMobileSource', 'fatherMobile'))}</strong></td></tr>
                <tr><th>Guardian</th><td>${printValue('guardianName')}</td><th>Relationship</th><td>${printValue('guardianRel')}</td></tr>
                <tr><th>Guardian Contact</th><td>${printValue('guardianContact')}</td><th>Selected WhatsApp</th><td><strong>${escapePrintHtml(selectedContactValue('whatsappSource', 'fatherWhatsapp'))}</strong></td></tr>
                <tr><th>Home Address</th><td colspan="3">${printValue('address')}</td></tr>
            </table>

            <div class="admission-print-section">Academic, Medical, Note and Fees</div>
            <table class="admission-print-table">
                <tr><th>Last School</th><td>${printValue('lastSchool')}</td><th>Class Passed</th><td>${printValue('classPassed')}</td></tr>
                <tr><th>Transfer Certificate</th><td>${printValue('transferCert')}</td><th>Medical Condition</th><td>${printValue('medicalCondition')}</td></tr>
                <tr><th>Admission Note</th><td colspan="3">${printValue('admissionNote')}</td></tr>
                <tr><th>Admission Fee</th><td>${escapePrintHtml(money('admissionFee'))}</td><th>Monthly Fee</th><td>${escapePrintHtml(money('monthlyFee'))}</td></tr>
                <tr><th>Discount</th><td>${escapePrintHtml(money('discount'))}</td><th>Final Monthly Fee</th><td>${escapePrintHtml(money('monthlyFee'))}</td></tr>
            </table>
            ${additionalChallansPrint}

            <div class="admission-print-signatures">
                <div>Parent / Guardian Signature</div>
                <div>Admission Officer</div>
                <div>Principal Signature</div>
            </div>
            <div class="admission-print-footer">This admission record belongs to ${schoolName}.</div>
        `;
    }

    if(printBtn) {
        printBtn.addEventListener('click', () => {
            buildAdmissionPrintSheet();
            window.print();
        });
    }

    // Lively interaction for form inputs
    form.addEventListener('input', (e) => {
        const input = e.target;
        const group = input.closest('.input-group');
        if (group && group.classList.contains('invalid')) {
            group.classList.remove('invalid');
        }
    });
    
    form.addEventListener('focusin', (e) => {
        const group = e.target.closest('.input-group');
        if(group) {
            const label = group.querySelector('label');
            if(label) label.style.color = 'var(--primary)';
        }
    });
    
    form.addEventListener('focusout', (e) => {
        const input = e.target;
        const group = input.closest('.input-group');
        if(group) {
            const label = group.querySelector('label');
            if(label) label.style.color = 'var(--text-main)';
        }
        
        if (input.hasAttribute('required') && input.value.trim() !== '') {
            validateInput(input);
        }
    });

    // Roll Number Uniqueness Check Logic
    const rollNumberInput = document.getElementById('rollNumber');
    
    async function isRollNumberDuplicate(roll, excludeId = null) {
        if (!roll) return false;
        try {
            let query = applySchoolScope(supabaseClient
                .from('admissions')
                .select('id')
                .eq('roll_number', roll));
                
            if (excludeId) {
                query = query.neq('id', excludeId);
            }
                
            const { data, error } = await query.limit(1);
            if (error) throw error;
            return data && data.length > 0;
        } catch (err) {
            console.error("Error checking roll number duplicate:", err);
            return false; // Fail open to not block UI completely on network drop, but DB RLS/constraints usually catch it anyway.
        }
    }

    if (rollNumberInput) {
        rollNumberInput.addEventListener('blur', async () => {
            const val = rollNumberInput.value.trim();
            if (val) {
                const group = rollNumberInput.closest('.input-group');
                const isDup = await isRollNumberDuplicate(val, editingStudentRecordId);
                if (isDup) {
                    group.classList.add('invalid');
                    let errorSpan = group.querySelector('.error-msg');
                    if (!errorSpan) {
                        errorSpan = document.createElement('span');
                        errorSpan.className = 'error-msg';
                        group.appendChild(errorSpan);
                    }
                    errorSpan.textContent = 'Roll number already exists in this school.';
                    errorSpan.style.display = 'block';
                } else {
                    // if it was invalid just because of the dup check, remove it (re-run standard validation)
                    validateInput(rollNumberInput);
                }
            }
        });
    }

    // Search and Load Student for Editing
    const searchStudentBtn = document.getElementById('searchStudentBtn');
    const searchQueryInput = document.getElementById('searchQuery');
    const searchResultsContainer = document.getElementById('searchResults');
    
    let searchTimeout;
    if (searchQueryInput) {
        searchQueryInput.addEventListener('input', () => {
            // Invalidate any result still returning for the previous text.
            admissionSearchRequestId++;
            clearTimeout(searchTimeout);
            searchTimeout = setTimeout(() => {
                if (searchStudentBtn) searchStudentBtn.click();
            }, 300);
        });
        searchQueryInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault(); // Prevent form submission
                clearTimeout(searchTimeout);
                if (searchStudentBtn) searchStudentBtn.click();
            }
        });
    }

    if (searchStudentBtn) {
        searchStudentBtn.addEventListener('click', async () => {
            const query = searchQueryInput.value.trim();
            const requestId = ++admissionSearchRequestId;
            if (!query) {
                searchResultsContainer.style.display = 'none';
                searchResultsContainer.innerHTML = '';
                searchStudentBtn.textContent = 'Search';
                return;
            }
            
            searchStudentBtn.textContent = 'Searching...';
            searchResultsContainer.style.display = 'none';
            searchResultsContainer.innerHTML = '';
            
            // Remove characters that might break PostgREST .or() syntax like commas
            const safeQuery = query.replace(/[,\(\)]/g, ' ').trim();
            
            try {
                let studentQuery = applySchoolScope(supabaseClient
                    .from('admissions')
                    .select('*'));
                studentQuery = /^\d+$/.test(safeQuery)
                    ? studentQuery.eq('roll_number', safeQuery)
                    : studentQuery.ilike('full_name', `%${safeQuery}%`);
                const { data, error } = await studentQuery;

                // Ignore an older request that completed after a newer search.
                if (requestId !== admissionSearchRequestId) return;
                    
                if (error) throw error;
                
                if (data && data.length > 0) {
                    searchResultsContainer.style.display = 'flex';
                    searchResultsContainer.innerHTML = `<p style="margin:0; font-weight:500;">Found ${data.length} student(s):</p>`;
                    
                    data.forEach(student => {
                        const row = document.createElement('div');
                        row.style.cssText = 'display:flex; justify-content:space-between; align-items:center; background:white; padding:0.5rem 1rem; border-radius:6px; border:1px solid #e2e8f0;';
                        row.innerHTML = `
                            <div>
                                <strong style="color:var(--primary);">${student.full_name}</strong>
                                <span style="color:#64748b; font-size:0.9rem; margin-left:0.5rem;">Roll No: ${student.roll_number} | Class: ${student.applying_for_class || 'N/A'}</span>
                            </div>
                            <button type="button" class="edit-btn" style="background:#10b981; color:white; border:none; padding:0.3rem 0.8rem; border-radius:4px; cursor:pointer;" data-id="${student.id}">Edit</button>
                        `;
                        searchResultsContainer.appendChild(row);
                        
                        row.querySelector('.edit-btn').addEventListener('click', () => {
                            populateFormForEditing(student);
                            searchResultsContainer.style.display = 'none';
                            searchQueryInput.value = '';
                        });
                    });
                } else {
                    searchResultsContainer.style.display = 'flex';
                    searchResultsContainer.innerHTML = `<p style="margin:0; color:#ef4444;">No students found matching "${query}".</p>`;
                }
            } catch (err) {
                if (requestId !== admissionSearchRequestId) return;
                console.error('Error searching students:', err);
                alert('Error searching students. See console for details.');
            } finally {
                if (requestId === admissionSearchRequestId) {
                    searchStudentBtn.textContent = 'Search';
                }
            }
        });
    }

    async function populateFormForEditing(student) {
        window.isPopulatingForm = true;
        editingStudentRecordId = student.id;
        // Existing paid/unpaid challans remain unchanged. Persistent optional
        // services are loaded below so they can be kept, edited, or removed.
        resetAdmissionChallanRows();
        
        const setVal = (id, val) => {
            const el = document.getElementById(id);
            if (el) {
                el.value = val !== null && val !== undefined ? val : '';
                // Trigger change to update validation states or cascaded queries
                if (id !== 'admissionClass') {
                    el.dispatchEvent(new Event('change', { bubbles: true }));
                }
            }
        };
        
        setVal('studentId', student.student_id);
        setVal('rollNumber', student.roll_number);
        setVal('status', student.status);
        setVal('fullName', student.full_name);
        setVal('dob', student.dob);
        setVal('gender', student.gender);
        setVal('placeOfBirth', student.place_of_birth);
        setVal('admissionNote', student.bform_number);
        setVal('address', student.home_address);
        
        setVal('fatherName', student.father_name);
        setVal('fatherCnic', student.father_cnic);
        setVal('fatherOcc', student.father_occ);
        setVal('fatherMobile', student.father_mobile);
        setVal('fatherWhatsapp', student.father_whatsapp);
        
        setVal('motherName', student.mother_name);
        setVal('motherCnic', student.mother_cnic);
        setVal('motherOcc', student.mother_occ);
        setVal('motherMobile', student.mother_mobile);
        
        setVal('guardianName', student.guardian_name);
        setVal('guardianRel', student.guardian_rel);
        setVal('guardianContact', student.guardian_contact);

        const contactPreferences = parseContactPreferences(student.campus);
        setVal('fatherMobile2', contactPreferences.father_mobile_2);
        setVal('motherMobile2', contactPreferences.mother_mobile_2);
        setContactChoice('primaryMobileSource', contactPreferences.primary_mobile_source, 'fatherMobile');
        setContactChoice('whatsappSource', contactPreferences.whatsapp_source, 'fatherWhatsapp');
        
        setVal('lastSchool', student.last_school);
        setVal('classPassed', student.class_passed);
        setVal('transferCert', student.transfer_cert);
        
        if (student.applying_for_class) {
            const el = document.getElementById('admissionClass');
            if (el) {
                el.value = student.applying_for_class;
                if (el.selectedIndex >= 0) {
                    const selectedOption = el.options[el.selectedIndex];
                    if (selectedOption && selectedOption.dataset.classId) {
                        await updateFeesForClass(selectedOption.dataset.classId, false);
                    }
                }
            }
        }
        setVal('session', student.session);
        setVal('admissionDate', student.admission_date);
        setVal('medicalCondition', student.medical_condition);
        
        // Set fee fields after class defaults are loaded safely
        setVal('admissionFee', student.admission_fee);
        setVal('monthlyFee', student.monthly_fee);
        setVal('discount', student.discount);

        await loadAdmissionFeeHeadCatalog();
        await loadStudentFeeHeadAssignments(student.id);
        
        window.isPopulatingForm = false;

        // Show saved photo if exists
        if (student.photo_url) {
            showPhotoPreview(student.photo_url);
            compressedPhotoBlob = null; // no new upload unless user picks a new file
        }
        
        const submitBtn = document.getElementById('submitBtn');
        if (submitBtn) {
            if (!originalSubmitBtnHtml) originalSubmitBtnHtml = submitBtn.innerHTML;
            submitBtn.innerHTML = `
                <span>Update Application</span>
                <svg viewBox="0 0 24 24" width="20" height="20" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round" class="btn-icon">
                    <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
                    <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path>
                </svg>
            `;
            submitBtn.style.background = '#10b981'; // Green for update
            submitBtn.style.boxShadow = '0 4px 14px rgba(16, 185, 129, 0.4)';
        }
        
        // Scroll back to form top
        document.querySelector('.admin-section').scrollIntoView({ behavior: 'smooth', block: 'start' });
    }

    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        const continueWithSibling = e.submitter?.id === 'saveSiblingBtn';
        
        formAlert.style.display = 'none';
        
        // Re-query required inputs in case they change
        const requiredInputs = getRequiredInputs();
        let isValid = true;
        
        requiredInputs.forEach(input => {
            if (!validateInput(input)) {
                isValid = false;
            }
        });
        
        if (isValid) {
            const submitBtn = document.getElementById('submitBtn');
            const siblingSubmitBtn = document.getElementById('saveSiblingBtn');
            const originalText = submitBtn.innerHTML;
            const originalSiblingText = siblingSubmitBtn?.innerHTML || '';
            
            submitBtn.innerHTML = '<span style="display:inline-block; animation: spin 1s linear infinite;">⏳</span> Saving to Database...';
            submitBtn.style.opacity = '0.8';
            submitBtn.style.pointerEvents = 'none';
            if (siblingSubmitBtn) {
                siblingSubmitBtn.disabled = true;
                siblingSubmitBtn.style.opacity = '0.65';
            }
            
            try {
                // Helper to return null if empty, preventing type errors for Supabase dates/numbers
                const getVal = (id) => {
                    const el = document.getElementById(id);
                    if (!el) return null;
                    const val = el.value.trim();
                    return val === '' ? null : val;
                };

                const getMobileVal = (id) => {
                    const val = getVal(id);
                    return val ? val.replace(/[\s\-]/g, '') : null;
                };

                const contactPreferences = {
                    type: 'admission_contacts_v1',
                    father_mobile_2: getMobileVal('fatherMobile2'),
                    mother_mobile_2: getMobileVal('motherMobile2'),
                    primary_mobile_source: getSelectedContactSource('primaryMobileSource', 'fatherMobile'),
                    whatsapp_source: getSelectedContactSource('whatsappSource', 'fatherWhatsapp')
                };

                // Prepare data object based on SQL schema
                const formData = {
                    student_id: studentIdInput.value,
                    roll_number: document.getElementById('rollNumber').value,
                    full_name: document.getElementById('fullName').value,
                    
                    dob: getVal('dob'),
                    age_extracted: getVal('age'),
                    gender: getVal('gender'),
                    place_of_birth: getVal('placeOfBirth'),
                    // The retired B-Form storage column now holds the admission note.
                    bform_number: getVal('admissionNote'),
                    home_address: getVal('address'),
                    
                    father_name: getVal('fatherName'),
                    father_cnic: getVal('fatherCnic'),
                    father_occ: getVal('fatherOcc'),
                    father_mobile: getMobileVal('fatherMobile'),
                    father_whatsapp: getMobileVal('fatherWhatsapp'),
                    
                    mother_name: getVal('motherName'),
                    mother_cnic: getVal('motherCnic'),
                    mother_occ: getVal('motherOcc'),
                    mother_mobile: getMobileVal('motherMobile'),
                    
                    guardian_name: getVal('guardianName'),
                    guardian_rel: getVal('guardianRel'),
                    guardian_contact: getMobileVal('guardianContact'),
                    
                    last_school: getVal('lastSchool'),
                    class_passed: getVal('classPassed'),
                    transfer_cert: getVal('transferCert'),
                    
                    applying_for_class: getVal('admissionClass'),
                    session: getVal('session'),
                    admission_date: getVal('admissionDate'),
                    campus: JSON.stringify(contactPreferences),
                    medical_condition: getVal('medicalCondition'),
                    
                    admission_fee: getVal('admissionFee'),
                    monthly_fee: getVal('monthlyFee'),
                    discount: getVal('discount'),
                    
                    status: getVal('status') || 'Pending'
                };
                const formSchoolId = getAdmissionSchoolId();
                if (!formSchoolId) throw new Error('School could not be identified. Refresh and try again.');
                formData.school_id = formSchoolId;
                if (window.campusFeatureReady && window.currentCampusId) formData.campus_id = window.currentCampusId;
                // Validate these before saving the admission so an incomplete
                // optional challan row never creates a partially-finished record.
                const admissionChallanSelections = readAdmissionChallanSelections(true);

                // Upload photo if a new one was selected
                const studentUid = editingStudentRecordId || formData.student_id;
                const photoUrl = await uploadStudentPhoto(studentUid);
                if (photoUrl) {
                    formData.photo_url = photoUrl;
                }

                // Final Duplicate Check Before Save
                const isDuplicate = await isRollNumberDuplicate(formData.roll_number, editingStudentRecordId);
                if (isDuplicate) {
                    formAlert.textContent = '❌ Cannot save student: Roll number already exists in this school.';
                    formAlert.style.display = 'block';
                    formAlert.scrollIntoView({ behavior: 'smooth', block: 'center' });
                    
                    const group = rollNumberInput.closest('.input-group');
                    if (group) {
                        group.classList.add('invalid');
                        let errorSpan = group.querySelector('.error-msg');
                        if (!errorSpan) {
                            errorSpan = document.createElement('span');
                            errorSpan.className = 'error-msg';
                            group.appendChild(errorSpan);
                        }
                        errorSpan.textContent = 'Roll number already exists in this school.';
                        errorSpan.style.display = 'block';
                    }
                    
                    // Reset button state and abort submission
                    submitBtn.innerHTML = originalText;
                    submitBtn.style.opacity = '1';
                    submitBtn.style.pointerEvents = 'all';
                    return;
                }

                let actionResult;
                if (editingStudentRecordId) {
                    // UPDATE existing student — student_id stays the same
                    actionResult = await supabaseClient
                        .from('admissions')
                        .update(formData)
                        .eq('id', editingStudentRecordId)
                        .select('id')
                        .single();
                } else {
                    // INSERT new student — retry up to 3 times if student_id collides
                    let insertError = null;
                    for (let attempt = 0; attempt < 3; attempt++) {
                        if (attempt > 0) {
                            // Regenerate a fresh ID on retry
                            formData.student_id = await generateUniqueStudentId();
                            studentIdInput.value = formData.student_id;
                        }
                        actionResult = await supabaseClient
                            .from('admissions')
                            .insert([formData])
                            .select('id')
                            .single();
                        insertError = actionResult.error;

                        // Only retry on student_id unique constraint violation
                        if (!insertError || !/admissions_(?:school_)?student_id_key/.test(insertError.message)) break;
                    }
                }
                const { error } = actionResult;

                if (error) {
                    console.error('Supabase Error details:', error);
                    throw new Error(error.message || 'Failed to save to database. Make sure you ran the SQL setup script.');
                }

                const savedStudentDbId = actionResult.data?.id || editingStudentRecordId;
                const createdChallanCount = await createAdmissionChallans(
                    savedStudentDbId,
                    formData,
                    admissionChallanSelections
                );
                await syncStudentFeeHeadAssignments(savedStudentDbId, admissionChallanSelections);

                document.getElementById('successStudentId').textContent = studentIdInput.value;
                document.getElementById('successRollNo').textContent = formData.roll_number;
                
                const smText = successMessage.querySelector('h3');
                if (smText) {
                    smText.textContent = continueWithSibling
                        ? `Child Saved${createdChallanCount ? ` with ${createdChallanCount} Challan(s)` : ''} — Ready for Next Child!`
                        : `${editingStudentRecordId ? 'Application Updated' : 'Application Saved'}${createdChallanCount ? ` with ${createdChallanCount} Challan(s)` : ''}!`;
                }
                
                showSuccessMessage();

                editingStudentRecordId = null;
                searchQueryInput.value = '';
                searchResultsContainer.innerHTML = '';
                searchResultsContainer.style.display = 'none';
                form.querySelectorAll('.input-group.invalid').forEach(group => group.classList.remove('invalid'));
                form.querySelectorAll('.error-msg').forEach(message => { message.style.display = 'none'; });

                if (continueWithSibling) {
                    // Keep shared family/admission values and clear only details that
                    // belong specifically to the child who was just saved.
                    ['fullName', 'dob', 'age', 'gender', 'placeOfBirth', 'lastSchool', 'classPassed', 'transferCert', 'medicalCondition']
                        .forEach(id => {
                            const element = document.getElementById(id);
                            if (element) element.value = '';
                        });
                    resetPhotoPreview();
                    compressedPhotoBlob = null;
                    resetAdmissionChallanRows();
                    studentIdInput.value = await generateUniqueStudentId();

                    const previousRoll = Number.parseInt(String(formData.roll_number || ''), 10);
                    let nextRoll = Number.isFinite(previousRoll) ? previousRoll + 1 : null;
                    while (nextRoll !== null && await isRollNumberDuplicate(String(nextRoll))) nextRoll++;
                    document.getElementById('rollNumber').value = nextRoll === null ? '' : String(nextRoll);
                    document.getElementById('fullName')?.focus();
                } else {
                    form.reset();
                    resetAdmissionChallanRows();
                    resetContactChoices();
                    setAdmissionDateToToday();
                    resetPhotoPreview();
                    compressedPhotoBlob = null;
                    ageInput.value = '';
                    generateUniqueStudentId().then(id => { studentIdInput.value = id; });
                    fetchLastAdmittedRoll();
                }

                if (originalSubmitBtnHtml) {
                    submitBtn.innerHTML = originalSubmitBtnHtml;
                    submitBtn.style.background = '';
                    submitBtn.style.boxShadow = '';
                }
                
            } catch (error) {
                formAlert.textContent = '❌ Error submitting form: ' + error.message;
                formAlert.style.display = 'block';
                formAlert.scrollIntoView({ behavior: 'smooth', block: 'center' });
            } finally {
                submitBtn.innerHTML = editingStudentRecordId
                    ? originalText
                    : (originalSubmitBtnHtml || originalText);
                submitBtn.style.opacity = '1';
                submitBtn.style.pointerEvents = 'all';
                if (siblingSubmitBtn) {
                    siblingSubmitBtn.innerHTML = originalSiblingText;
                    siblingSubmitBtn.disabled = false;
                    siblingSubmitBtn.style.opacity = '1';
                }
            }
        } else {
            const firstError = document.querySelector('.input-group.invalid');
            if (firstError) {
                firstError.scrollIntoView({ behavior: 'smooth', block: 'center' });
            }
        }
    });

    function validateInput(input) {
        // We only validate inputs that have the "required" attribute
        if (!input.hasAttribute('required')) return true;

        const value = input.value.trim();
        const group = input.closest('.input-group');
        if(!group) return true;
        
        let isValid = true;
        let errorMessage = 'This field is required';

        if (value === '') {
            isValid = false;
        }

        let errorSpan = group.querySelector('.error-msg');
        if (!isValid) {
            group.classList.add('invalid');
            if (!errorSpan) {
                errorSpan = document.createElement('span');
                errorSpan.className = 'error-msg';
                group.appendChild(errorSpan);
            }
            errorSpan.textContent = errorMessage;
            errorSpan.style.display = 'block';
        } else {
            group.classList.remove('invalid');
            if (errorSpan) {
                errorSpan.style.display = 'none';
            }
        }

        return isValid;
    }

    function showSuccessMessage() {
        successMessage.classList.remove('hidden');
        setTimeout(() => {
            successMessage.classList.add('hidden');
        }, 3500);
    }
        }
    }, 50);
});
