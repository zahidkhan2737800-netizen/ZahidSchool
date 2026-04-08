// ═══════════════════════════════════════════════════════════════════════════════
// family_contacts.js — High-Density Interactive Follow-up Grid for Families
// ═══════════════════════════════════════════════════════════════════════════════

let currentMonth = '';
let allFamilies = [];
let monthData = {}; // keyed by family_mobile
let familyBalances = {}; // Cache for live balance calculations
let studentBalancesMap = {}; // Cache for individual student balances for WA bill
let allPendingChallans = []; // Full details for bill breakdown
let waTemplates = []; // User templates for WhatsApp
let currentOpenMobile = null; // Track who is opened in modal

const STATUS_COLORS = {
    'C': 'status-C',
    'CN': 'status-CN',
    'W': 'status-W',
    'NO': 'status-NO',
    'NN': 'status-NN'
};

document.addEventListener('DOMContentLoaded', async () => {
    await waitForAuthContext();

    // 1. Initialize Month Picker
    const today = new Date();
    currentMonth = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}`;
    document.getElementById('monthPicker').value = currentMonth;

    // 2. Table Column Toggles
    document.getElementById('toggleC7').addEventListener('change', e => {
        document.getElementById('contactsTable').classList.toggle('show-c7', e.target.checked);
    });
    document.getElementById('toggleC8').addEventListener('change', e => {
        document.getElementById('contactsTable').classList.toggle('show-c8', e.target.checked);
    });

    // 3. Month Navigation
    document.getElementById('btnPrevMonth').addEventListener('click', () => changeMonth(-1));
    document.getElementById('btnNextMonth').addEventListener('click', () => changeMonth(1));
    document.getElementById('monthPicker').addEventListener('change', e => {
        currentMonth = e.target.value;
        loadData();
    });

    // 4. Filters
    document.getElementById('statusFilter').addEventListener('change', renderTable);
    document.getElementById('searchTerm').addEventListener('input', renderTable);
    document.getElementById('btnClearFilters').addEventListener('click', () => {
        document.getElementById('statusFilter').value = 'All';
        document.getElementById('searchTerm').value = '';
        renderTable();
    });

    // Initial Load
    await loadBaseData();
    await loadData();
});

async function waitForAuthContext(timeoutMs = 10000) {
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
        if (window.authReady === true && window.supabaseClient) return;
        await new Promise(r => setTimeout(r, 80));
    }
}

function changeMonth(offset) {
    if (!currentMonth) return;
    const [year, month] = currentMonth.split('-').map(Number);
    let d = new Date(year, month - 1 + offset, 1);
    currentMonth = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    document.getElementById('monthPicker').value = currentMonth;
    loadData();
}

// ─── Fetch Base Data (Students grouped into Families) ──────────────────────────
async function loadBaseData() {
    try {
        // Fetch specific columns for speed
        let schoolId = window.currentSchoolId;
        if ((schoolId === null || schoolId === undefined) && window.currentUser?.id) {
            const { data: roleData } = await window.supabaseClient
                .from('user_roles')
                .select('school_id')
                .eq('user_id', window.currentUser.id)
                .single();
            schoolId = roleData?.school_id ?? null;
            window.currentSchoolId = schoolId;
        }
        let studentsQ = window.supabaseClient
            .from('admissions')
            .select('id, roll_number, full_name, father_name, father_mobile, applying_for_class, family_id_manual')
            .eq('status', 'Active')
            .order('roll_number', { ascending: true });
        if (schoolId) studentsQ = studentsQ.eq('school_id', schoolId);
        const { data: students, error: sErr } = await studentsQ;

        if (sErr) throw sErr;
        
        // Group students into families (similar to collect_family_fee)
        const groups = {};
        (students || []).forEach(s => {
            const mob = (s.father_mobile || '').trim();
            if(!mob) return; 
            if(!groups[mob]) groups[mob] = [];
            groups[mob].push(s);
        });

        allFamilies = [];
        Object.keys(groups).forEach(mobile => {
            const members = groups[mobile];
            // Only include as a family if 2+ active students share the same mobile
            if (members.length < 2) return;
            const names = [...new Set(members.map(m => m.father_name).filter(n => n && n.trim() !== ''))];
            const primaryName = names.length > 0 ? names[0] : 'Unknown Father';
            const familyNos = [...new Set(members.map(m => m.family_id_manual).filter(n => n && n.trim() !== ''))];
            const familyNo = familyNos.length > 0 ? familyNos[0] : '';
            
            allFamilies.push({
                mobile,
                members,
                primaryName,
                familyNo
            });
        });

        // Fetch Real Unpaid Balances with FULL DETAILS
        const { data: challans, error: bErr } = await window.supabaseClient
            .from('challans')
            .select('*')
            .in('status', ['Unpaid', 'Partially Paid']);
            
        allPendingChallans = challans || [];

        // First map by student ID
        studentBalancesMap = {};
        if (challans && !bErr) {
            challans.forEach(c => {
                const rem = parseFloat(c.amount || 0) - parseFloat(c.paid_amount || 0);
                studentBalancesMap[c.student_id] = (studentBalancesMap[c.student_id] || 0) + rem;
            });
        }

        // Aggregate student balances into family balances
        familyBalances = {};
        allFamilies.forEach(fam => {
            let famTotal = 0;
            fam.members.forEach(m => { famTotal += (studentBalancesMap[m.id] || 0); });
            familyBalances[fam.mobile] = famTotal;
        });

        // Load Templates
        await loadWaTemplates();

    } catch (err) {
        console.error("Error loading family base data:", err);
    }
}

async function loadWaTemplates() {
    try {
        const { data, error } = await window.supabaseClient.from('wa_templates').select('*').order('created_at', { ascending: true });
        if (!error && data) {
            waTemplates = data;
            
            // Refresh dropdown
            const dropdown = document.getElementById('waTemplateDropdown');
            if(dropdown) {
                dropdown.innerHTML = '';
                const lastUsed = localStorage.getItem('lastWaTemplate');
                let selectedId = null;
                
                // Determine which ID should be selected
                if (lastUsed && waTemplates.find(t => t.id === lastUsed)) {
                    selectedId = lastUsed;
                } else if (waTemplates.find(t => t.is_default)) {
                    selectedId = waTemplates.find(t => t.is_default).id;
                } else if (waTemplates.length > 0) {
                    selectedId = waTemplates[0].id;
                }

                waTemplates.forEach(t => {
                    const opt = document.createElement('option');
                    opt.value = t.id;
                    opt.textContent = t.title;
                    if(t.id === selectedId) {
                        opt.selected = true;
                    }
                    dropdown.appendChild(opt);
                });
            }
            if(window.renderWaTemplatesList) window.renderWaTemplatesList();
        }
    } catch(e) { console.error("Error loading WA templates", e); }
}

// ─── Fetch Month Data ────────────────────────────────────────────────────────
async function loadData() {
    document.getElementById('loader').style.display = 'block';
    const tbody = document.getElementById('contactsBody');
    tbody.innerHTML = '';
    
    try {
        const { data: contacts, error } = await window.supabaseClient
            .from('family_contacts')
            .select('*')
            .eq('month_key', currentMonth);

        // Map to lookup dictionary
        monthData = {};
        if (contacts && !error) {
            contacts.forEach(c => monthData[c.family_mobile] = c);
        }
    } catch (err) {
        console.warn("family_contacts table might not exist yet. Using empty state.", err);
        monthData = {};
    }

    document.getElementById('loader').style.display = 'none';
    renderTable();
}

// ─── Render Table ────────────────────────────────────────────────────────────
function renderTable() {
    const tbody = document.getElementById('contactsBody');
    tbody.innerHTML = '';

    const statusF = document.getElementById('statusFilter').value;
    const searchT = document.getElementById('searchTerm').value.toLowerCase().trim();

    let totalBalance = 0;
    let pendingCount = 0;
    let solvedCount = 0;
    let totalStudentsVisible = 0;
    let pendingBalance = 0;
    let solvedBalance = 0;
    
    // Convert to rich objects with pinned state to allow sorting
    let rowsToRender = allFamilies.map(fam => {
        const data = monthData[fam.mobile] || getEmptyContactState(fam.mobile);
        return { fam, data };
    });

    // 1. Filter
    rowsToRender = rowsToRender.filter(row => {
        if (searchT) {
            const matchesMob = row.fam.mobile.toLowerCase().includes(searchT);
            const matchesName = row.fam.primaryName.toLowerCase().includes(searchT);
            const matchesNo = row.fam.familyNo && String(row.fam.familyNo).toLowerCase().includes(searchT);
            if (!matchesMob && !matchesName && !matchesNo) return false;
        }
        if (statusF !== 'All' && row.data.row_status !== statusF) return false;
        return true;
    });

    // 2. Sort (Pinned first, then by Family Name)
    rowsToRender.sort((a, b) => {
        if (a.data.pinned && !b.data.pinned) return -1;
        if (!a.data.pinned && b.data.pinned) return 1;
        return a.fam.primaryName.localeCompare(b.fam.primaryName); 
    });

    // 3. Render
    rowsToRender.forEach(({ fam, data }) => {
        const balance = familyBalances[fam.mobile] || 0;
        totalBalance += balance;
        totalStudentsVisible += (fam.members || []).length;

        if (data.row_status === 'Solved') {
            solvedCount++;
            solvedBalance += balance;
        } else {
            pendingCount++;
            pendingBalance += balance;
        }

        const tr = document.createElement('tr');
        if (data.pinned) tr.classList.add('pinned');
        if (data.row_status === 'Solved') tr.classList.add('solved');

        // Fetch true balance from cached family balances

        // Build member list HTML
        const membersHtml = fam.members.map(m => `<div style="font-size:0.85rem; color:#475569; padding:2px 0;">• ${m.full_name} <b>(${m.roll_number})</b></div>`).join('');

        tr.innerHTML = `
            <td class="col-roll">${fam.familyNo || '—'}</td>
            <td class="col-name" style="padding-left:0.5rem; vertical-align: top;">
                <strong style="color:#0f172a; font-size:1.05rem;">${fam.primaryName}</strong><br>
                <small style="color:#64748b;font-weight:600;">${fam.mobile}</small>
                <div style="margin-top: 6px; border-top: 1px dashed #cbd5e1; padding-top: 4px;">
                    ${membersHtml}
                </div>
            </td>
            ${[1,2,3,4,5,6,7,8].map(idx => generateContactCell(fam.mobile, idx, data)).join('')}
            <td class="col-balance ${balance === 0 ? 'zero' : ''}">${balance.toLocaleString()}</td>
            <td><button class="action-btn-cell" data-mobile="${fam.mobile}" title="Send Voice Message / Open Chat" onclick="openAudioChat('${fam.mobile}')">🎙️</button></td>
            <td><button class="action-btn-cell wa-btn" data-mobile="${fam.mobile}" title="Send WhatsApp Bill" onclick="openWaModal('${fam.mobile}')"><i class="fab fa-whatsapp" style="color:#25D366; font-size:1.3rem;"></i></button></td>
            <td><button class="action-btn-cell cd-btn ${data.complaint ? 'active' : ''}" data-id="${fam.mobile}" title="Complaint">C</button></td>
            <td><button class="action-btn-cell pin-btn ${data.pinned ? 'active' : ''}" data-id="${fam.mobile}" title="Pin to top">📌</button></td>
            <td><input type="text" class="commit-input" value="${data.commitment_notes || ''}" placeholder="Add notes..." data-id="${fam.mobile}"></td>
            <td>
                <select class="row-status-select ${data.row_status}" data-id="${fam.mobile}">
                    <option value="Pending" ${data.row_status === 'Pending' ? 'selected' : ''}>Pending</option>
                    <option value="Solved" ${data.row_status === 'Solved' ? 'selected' : ''}>Solved</option>
                </select>
            </td>
        `;

        // Attach Cell Events
        attachCellEvents(tr, fam.mobile);
        tbody.appendChild(tr);
    });

    if (rowsToRender.length === 0) {
        tbody.innerHTML = '<tr><td colspan="15" style="padding: 3rem; color: #94a3b8;">No family records match your filters.</td></tr>';
    }

    // Update Counter
    document.getElementById('totalBalanceBadge').textContent = `Rs. ${totalBalance.toLocaleString()}`;

    const totalEl = document.getElementById('cardTotalFamilies');
    const pendingEl = document.getElementById('cardPendingFamilies');
    const solvedEl = document.getElementById('cardSolvedFamilies');
    const studentsEl = document.getElementById('cardTotalStudents');
    const totalBalEl = document.getElementById('cardTotalFamiliesBalance');
    const pendingBalEl = document.getElementById('cardPendingBalance');
    const solvedBalEl = document.getElementById('cardSolvedBalance');

    const allFamiliesStudents = allFamilies.reduce((s, f) => s + (f.members || []).length, 0);
    if (totalEl) totalEl.textContent = allFamilies.length.toLocaleString();
    if (pendingEl) pendingEl.textContent = pendingCount.toLocaleString();
    if (solvedEl) solvedEl.textContent = solvedCount.toLocaleString();
    if (studentsEl) studentsEl.textContent = allFamiliesStudents.toLocaleString();
    if (totalBalEl) totalBalEl.textContent = `Rs ${totalBalance.toLocaleString()}`;
    if (pendingBalEl) pendingBalEl.textContent = `Rs ${pendingBalance.toLocaleString()}`;
    if (solvedBalEl) solvedBalEl.textContent = `Rs ${solvedBalance.toLocaleString()}`;
}

// ─── Generators & Helpers ────────────────────────────────────────────────────
function getEmptyContactState(familyMobile) {
    return { family_mobile: familyMobile, month_key: currentMonth, pinned: false, complaint: false, row_status: 'Pending' };
}

function generateContactCell(familyMobile, idx, data) {
    const status = data[`c${idx}_status`] || '';
    const dateLine = data[`c${idx}_date`] ? new Date(data[`c${idx}_date`]).toLocaleDateString('en-GB', {day:'numeric', month:'short'}) : '';
    
    return `
        <td class="${idx >= 7 ? `col-c${idx}` : ''}">
            <div class="contact-cell">
                <select class="c-select" data-id="${familyMobile}" data-idx="${idx}">
                    <option value=""></option>
                    <option value="C" ${status === 'C' ? 'selected' : ''}>C</option>
                    <option value="CN" ${status === 'CN' ? 'selected' : ''}>CN</option>
                    <option value="W" ${status === 'W' ? 'selected' : ''}>W</option>
                    <option value="NO" ${status === 'NO' ? 'selected' : ''}>NO</option>
                    <option value="NN" ${status === 'NN' ? 'selected' : ''}>NN</option>
                </select>
                <button class="c-btn ${STATUS_COLORS[status] || ''}" title="Status Indicator"></button>
                <span class="c-date ${!dateLine ? 'hidden' : ''}">${dateLine || '---'}</span>
            </div>
        </td>
    `;
}

function attachCellEvents(tr, familyMobile) {
    // Status Selects
    tr.querySelectorAll('.c-select').forEach(sel => {
        sel.addEventListener('change', async (e) => {
            const val = e.target.value;
            const idx = e.target.dataset.idx;
            const btn = e.target.nextElementSibling;
            const dateSpan = btn.nextElementSibling;
            
            // Visual shift
            btn.className = `c-btn ${STATUS_COLORS[val] || ''}`;
            const now = new Date();
            dateSpan.textContent = val ? now.toLocaleDateString('en-GB', {day:'numeric', month:'short'}) : '---';
            dateSpan.classList.toggle('hidden', !val);

            // DB Update Map
            const updateField = {};
            updateField[`c${idx}_status`] = val;
            updateField[`c${idx}_date`] = val ? now.toISOString() : null;

            await saveContactState(familyMobile, updateField);
        });
    });

    // Complaint Button
    const cdBtn = tr.querySelector('.cd-btn');
    if (cdBtn) {
        cdBtn.addEventListener('click', async () => {
            const isActive = cdBtn.classList.toggle('active');
            await saveContactState(familyMobile, { complaint: isActive });
        });
    }

    // Pin Button
    const pinBtn = tr.querySelector('.pin-btn');
    if (pinBtn) {
        pinBtn.addEventListener('click', async () => {
            const isActive = pinBtn.classList.toggle('active');
            await saveContactState(familyMobile, { pinned: isActive });
            renderTable(); // Re-sort immediately
        });
    }

    // Commit Input
    const commitIn = tr.querySelector('.commit-input');
    if (commitIn) {
        commitIn.addEventListener('blur', async (e) => {
            await saveContactState(familyMobile, { commitment_notes: e.target.value });
        });
    }

    // Row Status
    const rowStatusSel = tr.querySelector('.row-status-select');
    if (rowStatusSel) {
        rowStatusSel.addEventListener('change', async (e) => {
            const val = e.target.value;
            rowStatusSel.className = `row-status-select ${val}`;
            await saveContactState(familyMobile, { row_status: val });
            renderTable(); // Might filter it out!
        });
    }
}

// ─── WhatsApp Bill Modal ──────────────────────────────────────────────────────
window.openAudioChat = function(mobile) {
    let phone = mobile.replace(/[^0-9]/g, '');
    if (phone.startsWith('0') && phone.length === 11) phone = '92' + phone.substring(1);
    window.open(`https://wa.me/${phone}`, '_blank');
};

window.openWaModal = function(mobile) {
    currentOpenMobile = mobile;
    applySelectedWaTemplate();
    document.getElementById('waModal').style.display = 'flex';
};

window.applySelectedWaTemplate = function() {
    if(!currentOpenMobile) return;
    const mobile = currentOpenMobile;
    const fam = allFamilies.find(f => f.mobile === mobile);
    if (!fam) return;

    let templateText = "";
    const dropdown = document.getElementById('waTemplateDropdown');
    
    if (dropdown && dropdown.value) {
        const t = waTemplates.find(x => x.id === dropdown.value);
        if(t) {
            templateText = t.message_text;
            localStorage.setItem('lastWaTemplate', t.id); // Remember choice
        }
    }

    // Hardcoded fallback if nothing in DB
    if (!templateText) {
        templateText = "Zahid School System\nDear Family of {{FATHER_NAME}},\n\n{{BILL_DETAILS}}\nTotal: Rs {{GRAND_TOTAL}}";
    }

    const todayDate = new Date().toLocaleDateString('en-GB', {day: 'numeric', month: 'short', year: 'numeric'});
    let famTotal = 0;
    
    // Generate Highly Detailed Bill lines purely tabular looking
    let billDetailsLines = [];
    fam.members.forEach(m => {
        const stuChallans = allPendingChallans.filter(c => c.student_id === m.id);
        
        let hasUnpaid = false;
        let stuLines = [];

        stuChallans.forEach(c => {
            const rem = parseFloat(c.amount || 0) - parseFloat(c.paid_amount || 0);
            if(rem > 0) {
                let desc = "";
                if(c.fee_month && c.fee_month !== 'N/A') {
                    const cleanMonth = c.fee_month.replace(/\s*\d{4}\s*/g, '').trim();
                    if(cleanMonth) desc += `${cleanMonth} `;
                }
                desc += c.fee_type;
                
                // Align column by padding standard spaces (will align perfectly inside monospace block)
                let spaces = 28 - desc.length;
                if(spaces < 3) spaces = 3;
                desc += ' '.repeat(spaces) + rem.toLocaleString();
                
                stuLines.push(desc);
                famTotal += rem;
                hasUnpaid = true;
            }
        });

        if (hasUnpaid) {
            billDetailsLines.push(`*${m.full_name.trim()}*`);
            billDetailsLines.push('```\n' + stuLines.join('\n') + '\n```');
            billDetailsLines.push(''); // spacing between students
        }
    });
    
    let parsed = templateText.replace(/{{TODAY_DATE}}/g, todayDate)
                             .replace(/{{FATHER_NAME}}/g, fam.primaryName)
                             .replace(/{{GRAND_TOTAL}}/g, famTotal);
    
    if(famTotal === 0) {
        parsed = "All dues are clear! Thank you for your continued support.";
    } else {
        parsed = parsed.replace(/{{BILL_DETAILS}}/g, billDetailsLines.join('\n').trim());
    }

    document.getElementById('waMessageText').value = parsed;
    
    // Wire send button safely
    const btnSend = document.getElementById('btnSendWa');
    btnSend.onclick = function() {
        const text = document.getElementById('waMessageText').value;
        let phone = mobile.replace(/[^0-9]/g, '');
        if (phone.startsWith('0') && phone.length === 11) {
            phone = '92' + phone.substring(1);
        }
        window.open(`https://wa.me/${phone}?text=${encodeURIComponent(text)}`, '_blank');
        closeWaModal();
    };
};

window.closeWaModal = function() {
    document.getElementById('waModal').style.display = 'none';
};

// ─── Database Sync ───────────────────────────────────────────────────────────
async function saveContactState(familyMobile, fieldsToUpdate) {
    // 1. Locally update state for fast UI
    if (!monthData[familyMobile]) monthData[familyMobile] = getEmptyContactState(familyMobile);
    Object.assign(monthData[familyMobile], fieldsToUpdate);

    // 2. Perform DB Upsert
    const payload = Object.assign({}, monthData[familyMobile]);

    try {
        const { error } = await window.supabaseClient
            .from('family_contacts')
            .upsert(payload, { onConflict: 'family_mobile, month_key' });
        
        if (error) {
            console.error("Upsert failed:", error);
        }
    } catch (err) {
        console.error("Save error:", err);
    }
}
