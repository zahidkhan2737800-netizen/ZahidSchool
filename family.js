// Uses supabaseClient from auth.js

window.onAppReady(async () => {
    const gridContainer = document.getElementById('familiesTableContainer');
    const tbody = document.getElementById('familiesTbody');
    const spinner = document.getElementById('spinner');
    const searchBar = document.getElementById('searchFamilies');
    
    // Modal Elements
    const modal = document.getElementById('addMemberModal');
    const btnCloseModal = document.getElementById('btnCloseModal');
    const studentSearchInput = document.getElementById('studentSearchInput');
    const studentSearchResults = document.getElementById('studentSearchResults');
    const targetMobileDisplay = document.getElementById('targetMobileDisplay');
    
    let allStudents = [];
    let familiesData = []; // Array of grouped families
    let familyDisplayNames = new Map(); // normalized mobile -> selected family name
    
    // Variables to track modal state
    let targetFamilyMobile = '';
    let targetFamilyName = '';

    // Authentication must finish before reading the user's school.
    while (window.authReady !== true) {
        await new Promise(resolve => setTimeout(resolve, 80));
    }

    // Initialization
    loadFamilies();

    async function loadFamilies() {
        gridContainer.style.display = 'none';
        spinner.style.display = 'block';
        
        try {
            let studentsQuery = supabaseClient
                .from('admissions')
                .select('id, roll_number, full_name, father_name, father_mobile, family_id_manual')
                .eq('status', 'Active')
                .order('roll_number', { ascending: true });
            let namesQuery = supabaseClient
                .from('family_display_names')
                .select('mobile_number, family_name');
            if (window.currentSchoolId) {
                studentsQuery = studentsQuery.eq('school_id', window.currentSchoolId);
                namesQuery = namesQuery.eq('school_id', window.currentSchoolId);
            }

            const [studentsResult, namesResult] = await Promise.all([studentsQuery, namesQuery]);
            if (studentsResult.error) throw studentsResult.error;
            if (namesResult.error) throw namesResult.error;
            
            allStudents = studentsResult.data || [];
            familyDisplayNames = new Map((namesResult.data || []).map(row => [normalizeMobile(row.mobile_number), row.family_name]));
            processFamilies(allStudents);
            renderFamilies();
            
        } catch(err) {
            spinner.innerHTML = `<span style="color:red">Failed to load data: ${err.message}</span>`;
            console.error(err);
        }
    }

    function normalizeMobile(value) {
        return String(value || '').replace(/[\s\-]/g, '').trim();
    }

    async function saveFamilyDisplayName(mobile, familyName) {
        const schoolId = window.currentSchoolId;
        if (!schoolId) throw new Error('School could not be identified. Refresh and try again.');
        const normalizedMobile = normalizeMobile(mobile);
        const { error } = await supabaseClient
            .from('family_display_names')
            .upsert({
                school_id: schoolId,
                mobile_number: normalizedMobile,
                family_name: familyName,
                selected_by: window.currentUser?.id || null,
                updated_at: new Date().toISOString()
            }, { onConflict: 'school_id,mobile_number' });
        if (error) throw error;
        familyDisplayNames.set(normalizedMobile, familyName);
    }

    function processFamilies(students) {
        const groups = {};
        
        // Group by mobile number
        students.forEach(s => {
            const mob = normalizeMobile(s.father_mobile);
            if(!mob) return; // Skip those with no mobile
            
            // Reassign normalized mobile so child components don't misbehave
            s.father_mobile = mob;
            
            if(!groups[mob]) {
                groups[mob] = [];
            }
            groups[mob].push(s);
        });

        familiesData = [];

        Object.keys(groups).forEach(mobile => {
            const members = groups[mobile];
            if (members.length < 2) return;
            
            const uniqueFatherNames = [...new Set(members.map(m => m.father_name).filter(n => n && n.trim() !== ''))];
            const familyNos = [...new Set(members.map(m => m.family_id_manual).filter(n => n && n.trim() !== ''))];
            const savedFamilyName = familyDisplayNames.get(mobile) || '';
            
            familiesData.push({
                mobile,
                members,
                familyNo: familyNos.length > 0 ? familyNos[0] : '',
                conflict: !savedFamilyName && uniqueFatherNames.length > 1,
                uniqueFatherNames,
                primaryName: savedFamilyName || (uniqueFatherNames.length === 1 ? uniqueFatherNames[0] : (uniqueFatherNames.length > 0 ? 'Conflict Detected' : 'Unknown Family'))
            });
        });
        
        // Sort: conflicts first, then largest families, then alphabetically
        familiesData.sort((a, b) => {
            if (a.conflict && !b.conflict) return -1;
            if (!a.conflict && b.conflict) return 1;
            if (b.members.length !== a.members.length) return b.members.length - a.members.length;
            return a.primaryName.localeCompare(b.primaryName);
        });
    }

    function renderFamilies(filterText = '') {
        tbody.innerHTML = '';
        spinner.style.display = 'none';
        gridContainer.style.display = 'block';

        const flatFilter = filterText.toLowerCase().trim();

        const filtered = familiesData.filter(fam => {
            if(!flatFilter) return true;
            if(fam.mobile.toLowerCase().includes(flatFilter)) return true;
            if(fam.primaryName.toLowerCase().includes(flatFilter)) return true;
            if(fam.familyNo && fam.familyNo.toLowerCase().includes(flatFilter)) return true;
            return fam.members.some(m => 
                m.full_name.toLowerCase().includes(flatFilter) || 
                String(m.roll_number).includes(flatFilter)
            );
        });

        if (filtered.length === 0) {
            tbody.innerHTML = `<tr><td colspan="6" style="text-align:center; padding:3rem; color:#64748b; font-size:1.2rem;">No valid families found. A family appears only when 2 or more active students share the same mobile number.</td></tr>`;
            return;
        }

        filtered.forEach(fam => {
            const tr = document.createElement('tr');
            if(fam.conflict) tr.className = 'conflict-row';

            let fatherCell = '';
            if(fam.conflict) {
                let optionsHtml = fam.uniqueFatherNames.map(name => `
                    <button class="conflict-btn" data-mobile="${fam.mobile}" data-choose="${name}" style="display:block; width:100%; margin-bottom:0.3rem; padding:0.4rem; font-size:0.85rem;">
                        Choose "${name}"
                    </button>
                `).join('');
                fatherCell = `
                    <div style="color: #b45309; font-weight: 600; font-size: 0.9rem; margin-bottom: 0.3rem;">⚠️ Conflict Detected</div>
                    <div style="font-size: 0.85rem; color: #475569; margin-bottom: 0.5rem;">Choose correct name:</div>
                    ${optionsHtml}
                `;
            } else {
                fatherCell = `<input type="text" class="family-name-input" data-mobile="${fam.mobile}" value="${fam.primaryName}" style="width:100%; padding:0.4rem; border-radius:6px; border:1px solid #cbd5e1; font-size:1.1rem; font-weight:700; outline:none; transition:0.2s; color:#0f172a; background:transparent;" title="Edit family name and click away to save">`;
            }

            let membersHtml = `<div style="display: flex; flex-wrap: wrap; gap: 0.4rem;">` + fam.members.map(m => `
                <span class="member-pill">
                    ${m.roll_number} - ${m.full_name.split(' ')[0]}
                    <button class="btn-remove-small remove-member-btn" title="Remove from family" data-id="${m.id}" data-name="${m.full_name}">×</button>
                </span>
            `).join('') + `</div>`;

            tr.innerHTML = `
                <td>
                    <input type="text" class="family-no-input" data-mobile="${fam.mobile}" value="${fam.familyNo}" placeholder="Type # & click out" title="Type a custom family number and click anywhere else to auto-save" style="width:100px; padding:0.4rem; border-radius:6px; border:1px solid #cbd5e1; font-size:1rem; font-weight:600; outline:none; transition:0.2s; color:#0f172a;">
                </td>
                <td style="font-size:1.1rem; color:#0f172a;">${fatherCell}</td>
                <td style="font-weight: 700; color: var(--primary); font-size:1.1rem; white-space: nowrap;">${fam.mobile}</td>
                <td style="text-align: center;">
                    <span style="background: #e0e7ff; color: var(--primary); padding: 0.3rem 0.8rem; border-radius: 12px; font-weight: 700; font-size: 1rem;">
                        ${fam.members.length}
                    </span>
                </td>
                <td>${membersHtml}</td>
                <td style="text-align: center;">
                    <button class="btn-add-member add-member-prompt" data-mobile="${fam.mobile}" data-fname="${fam.primaryName}" title="Add existing student to this family">
                        + Add
                    </button>
                </td>
            `;

            tbody.appendChild(tr);
        });

        attachCardListeners();
    }

    function attachCardListeners() {
        // Handle Auto-Save for Family Number
        document.querySelectorAll('.family-no-input').forEach(input => {
            input.addEventListener('blur', async (e) => {
                const mobile = e.target.getAttribute('data-mobile');
                const newNo = e.target.value.trim();
                
                // Visual feedback
                const origBg = e.target.style.background;
                e.target.style.background = '#fef3c7'; // yellow parsing
                
                try {
                    // Update all students sharing this mobile with the new family number
                    const { error } = await supabaseClient
                        .from('admissions')
                        .update({ family_id_manual: newNo })
                        .eq('father_mobile', mobile);
                        
                    if(error) throw error;
                    e.target.style.background = '#d1fae5'; // success green
                    setTimeout(() => e.target.style.background = origBg, 1500);
                } catch(err) {
                    alert('Error saving family number: ' + err.message);
                    e.target.style.background = '#fee2e2'; // red error
                }
            });
            
            // Allow Enter key to trigger blur
            input.addEventListener('keydown', (e) => {
                if(e.key === 'Enter') e.target.blur();
            });
        });

        // Handle Editable Family Name (auto-save on blur)
        document.querySelectorAll('.family-name-input').forEach(input => {
            input.addEventListener('focus', (e) => {
                e.target.dataset.original = e.target.value;
                e.target.style.background = '#fff';
                e.target.style.borderColor = '#2563eb';
            });

            input.addEventListener('blur', async (e) => {
                const mobile = e.target.getAttribute('data-mobile');
                const newName = e.target.value.trim();
                const originalName = e.target.dataset.original || '';

                e.target.style.borderColor = '#cbd5e1';

                if (!newName) {
                    e.target.value = originalName;
                    e.target.style.background = 'transparent';
                    return;
                }

                if (newName === originalName) {
                    e.target.style.background = 'transparent';
                    return;
                }

                e.target.style.background = '#fef3c7';

                try {
                    await saveFamilyDisplayName(mobile, newName);

                    e.target.style.background = '#d1fae5';
                    setTimeout(() => { e.target.style.background = 'transparent'; }, 1500);

                    // Update local data so search/filter stays consistent
                    const fam = familiesData.find(f => f.mobile === mobile);
                    if (fam) {
                        fam.primaryName = newName;
                        fam.uniqueFatherNames = [newName];
                    }
                } catch (err) {
                    alert('Error saving family name: ' + err.message);
                    e.target.value = originalName;
                    e.target.style.background = '#fee2e2';
                    setTimeout(() => { e.target.style.background = 'transparent'; }, 1500);
                }
            });

            input.addEventListener('keydown', (e) => {
                if (e.key === 'Enter') e.target.blur();
            });
        });

        // Handle Conflict Resolution
        document.querySelectorAll('.conflict-btn').forEach(btn => {
            btn.addEventListener('click', async (e) => {
                const mobile = e.target.getAttribute('data-mobile');
                const chosenName = e.target.getAttribute('data-choose');
                
                if(confirm(`Use "${chosenName}" as this family's name?\n\nEach student's father name will remain unchanged.`)) {
                    e.target.innerText = 'Updating...';
                    try {
                        await saveFamilyDisplayName(mobile, chosenName);
                        await loadFamilies(); // Reload
                    } catch(err) {
                        alert('Error resolving conflict: ' + err.message);
                        e.target.innerText = `Choose "${chosenName}"`;
                    }
                }
            });
        });

        // Handle Remove Member
        document.querySelectorAll('.remove-member-btn').forEach(btn => {
            btn.addEventListener('click', async (e) => {
                const id = e.target.getAttribute('data-id');
                const name = e.target.getAttribute('data-name');
                
                if(confirm(`Remove ${name} from this family?\n\nThis will clear their Father Mobile number entirely.`)) {
                    e.target.disabled = true;
                    try {
                        const { error } = await supabaseClient
                            .from('admissions')
                            .update({ father_mobile: '' })
                            .eq('id', id);
                            
                        if(error) throw error;
                        await loadFamilies(); // Reload
                    } catch(err) {
                        alert('Error removing member: ' + err.message);
                        e.target.disabled = false;
                    }
                }
            });
        });

        // Handle Add Member Prompt
        document.querySelectorAll('.add-member-prompt').forEach(btn => {
            btn.addEventListener('click', (e) => {
                targetFamilyMobile = e.target.getAttribute('data-mobile');
                targetFamilyName = e.target.getAttribute('data-fname');
                
                targetMobileDisplay.innerText = `${targetFamilyMobile} (${targetFamilyName})`;
                studentSearchInput.value = '';
                studentSearchResults.innerHTML = '<div style="padding:1rem; text-align:center; color:#94a3b8;">Type above to search active students...</div>';
                
                modal.classList.add('active');
                setTimeout(() => studentSearchInput.focus(), 100);
            });
        });
    }

    // Modal Search Logic
    studentSearchInput.addEventListener('input', (e) => {
        const query = e.target.value.toLowerCase().trim();
        if(!query) {
            studentSearchResults.innerHTML = '<div style="padding:1rem; text-align:center; color:#94a3b8;">Type above to search active students...</div>';
            return;
        }

        // Search in allStudents, excluding the ones already in this family
        const results = allStudents.filter(s => {
            if(s.father_mobile === targetFamilyMobile) return false; // Already in current target family
            
            return s.full_name.toLowerCase().includes(query) || 
                   String(s.roll_number).includes(query) ||
                   (s.father_name && s.father_name.toLowerCase().includes(query));
        }).slice(0, 10); // Limit to 10 results

        if(results.length === 0) {
            studentSearchResults.innerHTML = '<div style="padding:1rem; text-align:center; color:#94a3b8;">No unlinked students matched your search.</div>';
            return;
        }

        studentSearchResults.innerHTML = results.map(s => `
            <div class="result-item">
                <div>
                    <strong>${s.roll_number}</strong> - ${s.full_name} <br>
                    <span style="font-size:0.85rem; color:#64748b;">Current Father: ${s.father_name || 'N/A'}, Mobile: ${s.father_mobile || 'None'}</span>
                </div>
                <button class="btn-link-student link-btn" data-id="${s.id}" data-name="${s.full_name}">Link & Add</button>
            </div>
        `).join('');

        // Attach listeners to newly created Link buttons
        document.querySelectorAll('.link-btn').forEach(btn => {
            btn.addEventListener('click', async (e) => {
                const sId = e.target.getAttribute('data-id');
                const sName = e.target.getAttribute('data-name');
                
                if(confirm(`Move ${sName} into ${targetFamilyName}'s family?\n\nOnly the family mobile will change. The student's father name will remain unchanged.`)) {
                    e.target.innerText = 'Linking...';
                    e.target.disabled = true;
                    
                    try {
                        const { error } = await supabaseClient
                            .from('admissions')
                            .update({ 
                                father_mobile: targetFamilyMobile
                            })
                            .eq('id', sId);
                        
                        if(error) throw error;
                        
                        // Close modal and reload
                        modal.classList.remove('active');
                        await loadFamilies();
                        
                    } catch(err) {
                        alert('Error linking student: ' + err.message);
                        e.target.innerText = 'Link & Add';
                        e.target.disabled = false;
                    }
                }
            });
        });
    });

    btnCloseModal.addEventListener('click', () => {
        modal.classList.remove('active');
    });

    // Close modal if clicking outside
    modal.addEventListener('click', (e) => {
        if(e.target === modal) modal.classList.remove('active');
    });

    // Main search bar
    searchBar.addEventListener('input', (e) => {
        renderFamilies(e.target.value);
    });
});
