// Uses supabaseClient from auth.js

document.addEventListener('DOMContentLoaded', () => {
    const grid = document.getElementById('familiesGrid');
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
    
    // Variables to track modal state
    let targetFamilyMobile = '';
    let targetFamilyName = '';

    // Initialization
    loadFamilies();

    async function loadFamilies() {
        grid.style.display = 'none';
        spinner.style.display = 'block';
        
        try {
            const { data, error } = await supabaseClient
                .from('admissions')
                .select('id, roll_number, full_name, father_name, father_mobile, family_id_manual')
                .eq('status', 'Active')
                .order('roll_number', { ascending: true });
                
            if (error) throw error;
            
            allStudents = data;
            processFamilies(allStudents);
            renderFamilies();
            
        } catch(err) {
            spinner.innerHTML = `<span style="color:red">Failed to load data: ${err.message}</span>`;
            console.error(err);
        }
    }

    function processFamilies(students) {
        const groups = {};
        
        // Group by mobile number
        students.forEach(s => {
            const mob = (s.father_mobile || '').trim();
            if(!mob) return; // Skip those with no mobile
            
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
            
            familiesData.push({
                mobile,
                members,
                familyNo: familyNos.length > 0 ? familyNos[0] : '',
                conflict: uniqueFatherNames.length > 1,
                uniqueFatherNames,
                primaryName: uniqueFatherNames.length === 1 ? uniqueFatherNames[0] : (uniqueFatherNames.length > 0 ? 'Conflict Detected' : 'Unknown Father')
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
        grid.innerHTML = '';
        spinner.style.display = 'none';
        grid.style.display = 'grid';

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
            grid.innerHTML = `<div style="grid-column: 1/-1; text-align:center; padding:3rem; color:#64748b; font-size:1.2rem;">No valid families found. A family appears only when 2 or more active students share the same mobile number.</div>`;
            return;
        }

        filtered.forEach(fam => {
            const card = document.createElement('div');
            card.className = `family-card ${fam.conflict ? 'conflict-card' : ''}`;

            if(fam.conflict) {
                // Render Conflict Resolution UI
                let optionsHtml = fam.uniqueFatherNames.map(name => `
                    <button class="conflict-btn" data-mobile="${fam.mobile}" data-choose="${name}">
                        Choose "${name}"
                    </button>
                `).join('');

                card.innerHTML = `
                    <div class="conflict-alert">⚠️ Naming Conflict Detected</div>
                    <p style="font-size:0.9rem; color:#475569; margin-bottom:1rem;">
                        Mobile <strong>${fam.mobile}</strong> has students with different father names. Please choose the correct family name:
                    </p>
                    <div class="conflict-options">
                        ${optionsHtml}
                    </div>
                `;
            } else {
                // Render Normal Family UI
                card.innerHTML = `
                    <div class="fc-header">
                        <div>
                            <h3 class="fc-head-name">👨🏻 ${fam.primaryName}</h3>
                            <p class="fc-mobile">📞 ${fam.mobile}</p>
                            <p class="fc-mobile" style="margin-top:0.4rem; font-size:0.95rem; color:#475569;">
                                🔢 Family #: 
                                <input type="text" class="family-no-input" data-mobile="${fam.mobile}" value="${fam.familyNo}" placeholder="Type # & click out" title="Type a custom family number and click anywhere else to auto-save" style="width:130px; padding:0.3rem 0.5rem; border-radius:6px; border:1px solid #cbd5e1; font-size:0.9rem; outline:none; transition:0.2s;">
                            </p>
                        </div>
                        <span style="font-size:0.85rem; background:#e0e7ff; color:var(--primary); padding:0.3rem 0.6rem; border-radius:12px; font-weight:700;">
                            ${fam.members.length} Members
                        </span>
                    </div>
                    
                    <ul class="fc-members-list">
                        ${fam.members.map(m => `
                            <li class="fc-member">
                                <div><strong>${m.roll_number}</strong> - ${m.full_name}</div>
                                <button class="btn-remove remove-member-btn" title="Remove from family" data-id="${m.id}" data-name="${m.full_name}">×</button>
                            </li>
                        `).join('')}
                    </ul>

                    <div class="fc-actions">
                        <button class="btn-add-member add-member-prompt" data-mobile="${fam.mobile}" data-fname="${fam.primaryName}">
                            + Add Exisiting Student to Family
                        </button>
                    </div>
                `;
            }

            grid.appendChild(card);
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
        // Handle Conflict Resolution
        document.querySelectorAll('.conflict-btn').forEach(btn => {
            btn.addEventListener('click', async (e) => {
                const mobile = e.target.getAttribute('data-mobile');
                const chosenName = e.target.getAttribute('data-choose');
                
                if(confirm(`Apply the father name "${chosenName}" to all students with mobile ${mobile}?`)) {
                    e.target.innerText = 'Updating...';
                    try {
                        // Bulk update all admissions with this mobile
                        const { error } = await supabaseClient
                            .from('admissions')
                            .update({ father_name: chosenName })
                            .eq('father_mobile', mobile);
                            
                        if(error) throw error;
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
                
                if(confirm(`Move ${sName} into ${targetFamilyName}'s family?\n\nThis will change their Father Name to "${targetFamilyName}" and Mobile to "${targetFamilyMobile}".`)) {
                    e.target.innerText = 'Linking...';
                    e.target.disabled = true;
                    
                    try {
                        const { error } = await supabaseClient
                            .from('admissions')
                            .update({ 
                                father_mobile: targetFamilyMobile,
                                father_name: targetFamilyName
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
