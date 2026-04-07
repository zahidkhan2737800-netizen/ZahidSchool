// Supabase client is now provided by auth.js (supabaseClient)

document.addEventListener('DOMContentLoaded', () => {
    const form = document.getElementById('admissionForm');
    const successMessage = document.getElementById('successMessage');
    const formAlert = document.getElementById('formAlert');
    const currentSchoolId = window.currentSchoolId || null;
    const applySchoolScope = (query) => currentSchoolId ? query.eq('school_id', currentSchoolId) : query;
    
    let editingStudentRecordId = null;
    let originalSubmitBtnHtml = '';
    
    // Fetch and populate classes dynamically
    const classSelect = document.getElementById('admissionClass');
    async function loadClasses() {
        if(!classSelect) return;
        try {
            const { data, error } = await applySchoolScope(supabaseClient
                .from('classes')
                .select('*')
                .order('class_name', { ascending: true })
                .order('section', { ascending: true }));
                
            if (error) throw error;
            
            classSelect.innerHTML = '<option value="" disabled selected>Select class</option>';
            if(data && data.length > 0) {
                data.forEach(cls => {
                    const opt = document.createElement('option');
                    const val = `${cls.class_name} ${cls.section}`;
                    opt.value = val;
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
    
    let baseMonthlyFee = 0;

    // Auto-fetch fees when class is selected
    classSelect.addEventListener('change', async () => {
        const selectedOption = classSelect.options[classSelect.selectedIndex];
        const classId = selectedOption.dataset.classId;
        if (!classId) return;

        try {
            const monthlyFeeInput = document.getElementById('monthlyFee');
            const admissionFeeInput = document.getElementById('admissionFee');
            if (monthlyFeeInput) monthlyFeeInput.placeholder = "Loading...";
            if (admissionFeeInput) admissionFeeInput.placeholder = "Loading...";

            const { data, error } = await supabaseClient
                .from('fee_heads')
                .select('*')
                .eq('class_id', classId);
                
            if (error) throw error;
            
            let monthlyTotal = 0;
            let admissionTotal = 0;

            if (data && data.length > 0) {
                data.forEach(fee => {
                    if (fee.is_monthly) {
                        monthlyTotal += fee.amount;
                    } else {
                        // All non-monthly fees added to Admission Fee
                        admissionTotal += fee.amount;
                    }
                });
            }
            
            baseMonthlyFee = monthlyTotal;
            
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

        } catch (err) {
            console.error('Error fetching class fee heads:', err);
        }
    });

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
    const year = new Date().getFullYear();
    const randomNum = Math.floor(1000 + Math.random() * 9000); // 4 digit
    studentIdInput.value = `ZSM-${year}-${randomNum}`;
    
    // Auto age calculation
    const dobInput = document.getElementById('dob');
    const ageInput = document.getElementById('age');
    
    dobInput.addEventListener('change', () => {
        if(dobInput.value) {
            const dob = new Date(dobInput.value);
            const today = new Date();
            let age = today.getFullYear() - dob.getFullYear();
            const m = today.getMonth() - dob.getMonth();
            if (m < 0 || (m === 0 && today.getDate() < dob.getDate())) {
                age--;
            }
            ageInput.value = `${age} years`;
        } else {
            ageInput.value = '';
        }
    });
    
    // Photo Preview
    const photoInput = document.getElementById('studentPhoto');
    const photoPreview = document.getElementById('studentPhotoPreview');
    
    if(photoInput) {
        photoInput.addEventListener('change', function() {
            const file = this.files[0];
            if(file) {
                const reader = new FileReader();
                reader.onload = function(e) {
                    photoPreview.innerHTML = `<img src="${e.target.result}" alt="Student Photo" style="width:100px; height:auto; border-radius:8px; border:2px solid var(--primary); margin-top:10px;">`;
                }
                reader.readAsDataURL(file);
            } else {
                photoPreview.innerHTML = 'No image selected';
            }
        });
    }

    // Print Form
    const printBtn = document.getElementById('printBtn');
    if(printBtn) {
        printBtn.addEventListener('click', () => {
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
                    errorSpan.textContent = 'Roll number already exists. Duplicates are not allowed.';
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
    
    if (searchQueryInput) {
        searchQueryInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault(); // Prevent form submission
                if (searchStudentBtn) searchStudentBtn.click();
            }
        });
    }

    if (searchStudentBtn) {
        searchStudentBtn.addEventListener('click', async () => {
            const query = searchQueryInput.value.trim();
            if (!query) {
                alert('Please enter a name or roll number to search.');
                return;
            }
            
            searchStudentBtn.textContent = 'Searching...';
            searchStudentBtn.disabled = true;
            searchResultsContainer.style.display = 'none';
            searchResultsContainer.innerHTML = '';
            
            // Remove characters that might break PostgREST .or() syntax like commas
            const safeQuery = query.replace(/[,\(\)]/g, ' ').trim();
            
            try {
                const { data, error } = await applySchoolScope(supabaseClient
                    .from('admissions')
                    .select('*')
                    .or(`full_name.ilike.%${safeQuery}%,roll_number.eq.${safeQuery}`));
                    
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
                console.error('Error searching students:', err);
                alert('Error searching students. See console for details.');
            } finally {
                searchStudentBtn.textContent = 'Search';
                searchStudentBtn.disabled = false;
            }
        });
    }

    function populateFormForEditing(student) {
        editingStudentRecordId = student.id;
        
        const setVal = (id, val) => {
            const el = document.getElementById(id);
            if (el) {
                el.value = val !== null && val !== undefined ? val : '';
                // Trigger change to update validation states or cascaded queries
                el.dispatchEvent(new Event('change', { bubbles: true }));
            }
        };
        
        setVal('studentId', student.student_id);
        setVal('rollNumber', student.roll_number);
        setVal('status', student.status);
        setVal('fullName', student.full_name);
        setVal('dob', student.dob);
        setVal('gender', student.gender);
        setVal('placeOfBirth', student.place_of_birth);
        setVal('bformNumber', student.bform_number);
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
        
        setVal('lastSchool', student.last_school);
        setVal('classPassed', student.class_passed);
        setVal('transferCert', student.transfer_cert);
        
        if (student.applying_for_class) setVal('admissionClass', student.applying_for_class);
        setVal('session', student.session);
        setVal('admissionDate', student.admission_date);
        setVal('campus', student.campus);
        setVal('medicalCondition', student.medical_condition);
        
        // Fee fields might be overwritten by the class Select trigger, wait a bit
        setTimeout(() => {
            setVal('admissionFee', student.admission_fee);
            setVal('monthlyFee', student.monthly_fee);
            setVal('discount', student.discount);
        }, 300);
        
        setVal('siblingInSchool', student.sibling_in_school);
        
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
            const originalText = submitBtn.innerHTML;
            
            submitBtn.innerHTML = '<span style="display:inline-block; animation: spin 1s linear infinite;">⏳</span> Saving to Database...';
            submitBtn.style.opacity = '0.8';
            submitBtn.style.pointerEvents = 'none';
            
            try {
                // Helper to return null if empty, preventing type errors for Supabase dates/numbers
                const getVal = (id) => {
                    const el = document.getElementById(id);
                    if (!el) return null;
                    const val = el.value.trim();
                    return val === '' ? null : val;
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
                    bform_number: getVal('bformNumber'),
                    home_address: getVal('address'),
                    
                    father_name: getVal('fatherName'),
                    father_cnic: getVal('fatherCnic'),
                    father_occ: getVal('fatherOcc'),
                    father_mobile: getVal('fatherMobile'),
                    father_whatsapp: getVal('fatherWhatsapp'),
                    
                    mother_name: getVal('motherName'),
                    mother_cnic: getVal('motherCnic'),
                    mother_occ: getVal('motherOcc'),
                    mother_mobile: getVal('motherMobile'),
                    
                    guardian_name: getVal('guardianName'),
                    guardian_rel: getVal('guardianRel'),
                    guardian_contact: getVal('guardianContact'),
                    
                    last_school: getVal('lastSchool'),
                    class_passed: getVal('classPassed'),
                    transfer_cert: getVal('transferCert'),
                    
                    applying_for_class: getVal('admissionClass'),
                    session: getVal('session'),
                    admission_date: getVal('admissionDate'),
                    campus: getVal('campus'),
                    
                    medical_condition: getVal('medicalCondition'),
                    
                    admission_fee: getVal('admissionFee'),
                    monthly_fee: getVal('monthlyFee'),
                    discount: getVal('discount'),
                    sibling_in_school: getVal('siblingInSchool'),
                    
                    status: getVal('status') || 'Pending'
                };
                if (currentSchoolId) formData.school_id = currentSchoolId;

                // Final Duplicate Check Before Save
                const isDuplicate = await isRollNumberDuplicate(formData.roll_number, editingStudentRecordId);
                if (isDuplicate) {
                    formAlert.textContent = '❌ Cannot save student: Roll number already exists in the system.';
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
                        errorSpan.textContent = 'Roll number already exists. Duplicates are not allowed.';
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
                    actionResult = await supabaseClient
                        .from('admissions')
                        .update(formData)
                        .eq('id', editingStudentRecordId);
                } else {
                    actionResult = await supabaseClient
                        .from('admissions')
                        .insert([formData]);
                }
                const { error } = actionResult;

                if (error) {
                    console.error('Supabase Error details:', error);
                    throw new Error(error.message || 'Failed to save to database. Make sure you ran the SQL setup script.');
                }

                document.getElementById('successStudentId').textContent = studentIdInput.value;
                document.getElementById('successRollNo').textContent = formData.roll_number;
                
                const smText = successMessage.querySelector('h3');
                if (smText) {
                    smText.textContent = editingStudentRecordId ? 'Application Updated!' : 'Application Saved!';
                }
                
                showSuccessMessage();
                
                // Reset form
                form.reset();
                editingStudentRecordId = null;
                if (originalSubmitBtnHtml) {
                    submitBtn.innerHTML = originalSubmitBtnHtml;
                    submitBtn.style.background = '';
                    submitBtn.style.boxShadow = '';
                }
                
                // Regenerate ID for next student
                studentIdInput.value = `ZSM-${new Date().getFullYear()}-${Math.floor(1000 + Math.random() * 9000)}`;
                if(photoPreview) photoPreview.innerHTML = 'No image selected';
                ageInput.value = '';
                
            } catch (error) {
                formAlert.textContent = '❌ Error submitting form: ' + error.message;
                formAlert.style.display = 'block';
                formAlert.scrollIntoView({ behavior: 'smooth', block: 'center' });
            } finally {
                submitBtn.innerHTML = originalText;
                submitBtn.style.opacity = '1';
                submitBtn.style.pointerEvents = 'all';
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
        }, 8000);
    }
});
