// Supabase client is now provided by auth.js (supabaseClient)

document.addEventListener('DOMContentLoaded', () => {
    const form = document.getElementById('admissionForm');
    const successMessage = document.getElementById('successMessage');
    const formAlert = document.getElementById('formAlert');
    
    // Fetch and populate classes dynamically
    const classSelect = document.getElementById('admissionClass');
    async function loadClasses() {
        if(!classSelect) return;
        try {
            const { data, error } = await supabaseClient
                .from('classes')
                .select('*')
                .order('class_name', { ascending: true })
                .order('section', { ascending: true });
                
            if (error) throw error;
            
            classSelect.innerHTML = '<option value="" disabled selected>Select class</option>';
            if(data && data.length > 0) {
                data.forEach(cls => {
                    const opt = document.createElement('option');
                    const val = `${cls.class_name} ${cls.section}`;
                    opt.value = val;
                    opt.textContent = val;
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

                const { data, error } = await supabaseClient
                    .from('admissions')
                    .insert([formData]);

                if (error) {
                    console.error('Supabase Error details:', error);
                    throw new Error(error.message || 'Failed to save to database. Make sure you ran the SQL setup script.');
                }

                document.getElementById('successStudentId').textContent = studentIdInput.value;
                document.getElementById('successRollNo').textContent = formData.roll_number;
                showSuccessMessage();
                
                // Reset form
                form.reset();
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
