const db = window.supabaseClient;
let allStudents = [];
let waTemplates = [];
let currentSchoolId = null;

let currentStudentId = null; // Store for WA sending

document.addEventListener('DOMContentLoaded', async () => {
    await waitForAuthContext();
    await loadWaTemplates();
    await loadClassesAndStudents();
});

async function waitForAuthContext(timeoutMs = 10000) {
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
        if (window.authReady === true && window.supabaseClient) {
            currentSchoolId = window.currentSchoolId || null;
            return;
        }
        await new Promise(r => setTimeout(r, 80));
    }
}

// Convert YYYY-MM-DD to DD-MM-YYYY
function formatDateToDDMMYYYY(dateStr) {
    if (!dateStr) return '';
    const parts = dateStr.split('-');
    if (parts.length === 3) {
        return `${parts[2]}-${parts[1]}-${parts[0]}`; // DD-MM-YYYY
    }
    return dateStr;
}

function getTodayRaw() {
    const d = new Date();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${d.getFullYear()}-${m}-${day}`;
}

function setGlobalToday() {
    const raw = getTodayRaw();
    document.getElementById('globalDateRaw').value = raw;
    updateAllDates(raw);
}

function setRowToday(studentId) {
    const raw = getTodayRaw();
    const rawInput = document.getElementById(`dateRaw_${studentId}`);
    if (rawInput) {
        rawInput.value = raw;
        updateRowDate(rawInput, `dateText_${studentId}`, studentId);
    }
}

// Global update handlers
function updateAllSurveyNames() {
    const globalName = document.getElementById('globalSurveyName').value;
    const inputs = document.querySelectorAll('.row-survey-name');
    inputs.forEach(input => {
        input.value = globalName;
        // Optionally auto-save here, but better to let them save individually
    });
}

function updateAllStatuses() {
    const globalStatus = document.getElementById('globalStatus').value;
    const inputs = document.querySelectorAll('.row-status');
    inputs.forEach(input => {
        input.value = globalStatus;
    });
}

function updateAllDates(rawDateStr) {
    const formatted = formatDateToDDMMYYYY(rawDateStr);
    document.getElementById('globalDateText').value = formatted;
    
    const rawInputs = document.querySelectorAll('.row-date-raw');
    const textInputs = document.querySelectorAll('.row-date-text');
    
    for(let i=0; i<rawInputs.length; i++){
        rawInputs[i].value = rawDateStr;
        textInputs[i].value = formatted;
    }
}

function updateRowDate(rawInput, formattedInputId, studentId) {
    const formatted = formatDateToDDMMYYYY(rawInput.value);
    document.getElementById(formattedInputId).value = formatted;
    saveSurvey(studentId);
}

function clearFilters() {
    document.getElementById('classFilter').value = '';
    document.getElementById('globalSurveyName').value = 'Book Survey';
    document.getElementById('globalStatus').value = 'Pending';
    document.getElementById('globalDateText').value = '';
    document.getElementById('globalDateRaw').value = '';
    document.getElementById('studentsBody').innerHTML = `<tr><td colspan="7" style="text-align:center; padding: 30px; color: #64748b;">Select a class to load students</td></tr>`;
}

// Map to store existing survey records
let existingSurveys = {};

async function loadClassesAndStudents() {
    try {
        let q = db.from('admissions').select('id, roll_number, full_name, father_name, father_whatsapp, applying_for_class, status');
        if (currentSchoolId) q = q.eq('school_id', currentSchoolId);

        const { data, error } = await q;
        if (error) throw error;
        
        allStudents = data.filter(s => s.status !== 'Left');
        
        const classes = [...new Set(allStudents.map(s => s.applying_for_class).filter(Boolean))].sort();
        const sel = document.getElementById('classFilter');
        sel.innerHTML = '<option value="">- Select Class -</option>';
        classes.forEach(c => {
            const opt = document.createElement('option');
            opt.value = c; opt.textContent = c;
            sel.appendChild(opt);
        });
        
    } catch (err) {
        console.error('Error loading students:', err);
    }
}

async function loadStudents() {
    const classVal = document.getElementById('classFilter').value;
    const tbody = document.getElementById('studentsBody');
    
    if (!classVal) {
        tbody.innerHTML = `<tr><td colspan="7" style="text-align:center; padding: 30px; color: #64748b;">Select a class to load students</td></tr>`;
        return;
    }
    
    let filtered = allStudents.filter(s => s.applying_for_class === classVal);
    filtered.sort((a, b) => parseInt(a.roll_number) - parseInt(b.roll_number));
    
    if (filtered.length === 0) {
        tbody.innerHTML = `<tr><td colspan="7" style="text-align:center; padding: 30px; color: #64748b;">No active students found in this class</td></tr>`;
        return;
    }
    
    tbody.innerHTML = `<tr><td colspan="7" style="text-align:center; padding: 10px;">Loading survey data...</td></tr>`;

    // Fetch existing surveys for these students
    existingSurveys = {};
    try {
        const studentIds = filtered.map(s => s.id);
        const { data: surveysData } = await db.from('student_surveys').select('*').in('student_id', studentIds);
        
        if (surveysData) {
            surveysData.forEach(row => {
                existingSurveys[row.student_id] = row;
            });
        }
    } catch(e) {
        console.warn("Could not load surveys, table might not exist yet.", e);
    }
    
    const globalName = document.getElementById('globalSurveyName').value;
    const globalStatus = document.getElementById('globalStatus').value;
    const globalDateText = document.getElementById('globalDateText').value;
    const globalDateRaw = document.getElementById('globalDateRaw').value;

    tbody.innerHTML = filtered.map(student => {
        const existing = existingSurveys[student.id];
        const sName = existing ? existing.survey_name : globalName;
        const sStatus = existing ? existing.status : globalStatus;
        
        // Handling dates correctly
        let sDateText = globalDateText;
        let sDateRaw = globalDateRaw;
        
        if (existing && existing.survey_date) {
            sDateRaw = existing.survey_date;
            sDateText = formatDateToDDMMYYYY(sDateRaw);
        }

        return `
        <tr>
            <td style="font-weight: 600;">${student.roll_number || 'N/A'}</td>
            <td style="font-weight: 500;">${student.full_name}</td>
            <td style="color: #475569;">${student.father_name || 'N/A'}</td>
            <td>
                <input type="text" id="surveyName_${student.id}" list="surveyNamesList" class="control-input row-survey-name" style="width: 100%; box-sizing: border-box; padding: 6px;" value="${sName}" onchange="saveSurvey('${student.id}')">
            </td>
            <td>
                <div class="date-picker-wrapper" style="width: 100%; display:flex; align-items:center; gap:4px;">
                    <div style="position:relative; flex:1;">
                        <input type="text" id="dateText_${student.id}" class="control-input row-date-text" style="width: 100%; box-sizing: border-box; padding: 6px; cursor: pointer; text-align: center;" value="${sDateText}" placeholder="DD-MM-YYYY" readonly>
                        <input type="date" id="dateRaw_${student.id}" class="hidden-date row-date-raw" value="${sDateRaw}" onchange="updateRowDate(this, 'dateText_${student.id}', '${student.id}')">
                    </div>
                    <button type="button" class="btn" onclick="setRowToday('${student.id}')" title="Set to Today" style="padding:4px 8px; font-weight:bold; font-size:12px; border:1px solid #cbd5e1; border-radius:6px; background:#f8fafc; cursor:pointer; color:#3b82f6;">T</button>
                </div>
            </td>
            <td>
                <select id="status_${student.id}" class="control-input row-status" style="width: 100%; box-sizing: border-box; padding: 6px;" onchange="saveSurvey('${student.id}')">
                    <option value="Pending" ${sStatus === 'Pending' ? 'selected' : ''}>Pending</option>
                    <option value="Sent" ${sStatus === 'Sent' ? 'selected' : ''}>WA Sent</option>
                    <option value="Confirmed" ${sStatus === 'Confirmed' ? 'selected' : ''}>Confirmed</option>
                    <option value="Declined" ${sStatus === 'Declined' ? 'selected' : ''}>Declined</option>
                </select>
            </td>
            <td style="text-align: center;">
                <button class="wa-btn" onclick="openWaModal('${student.id}')" title="Send WhatsApp">
                    <i class="fab fa-whatsapp" style="font-size: 1.2rem;"></i>
                </button>
            </td>
        </tr>
    `}).join('');
}

// Auto-save logic
async function saveSurvey(studentId) {
    try {
        const sName = document.getElementById(`surveyName_${studentId}`).value;
        const sStatus = document.getElementById(`status_${studentId}`).value;
        const sDateRaw = document.getElementById(`dateRaw_${studentId}`).value;

        const payload = {
            student_id: studentId,
            survey_name: sName,
            status: sStatus,
            updated_at: new Date().toISOString()
        };
        
        if (sDateRaw) payload.survey_date = sDateRaw;
        if (currentSchoolId) payload.school_id = currentSchoolId;

        // Uses an upsert (so if they change name, it creates a new record or updates if we include ID)
        // Actually, to make it simple without an ID, let's match on student_id and survey_name
        const { error } = await db.from('student_surveys')
            .upsert(payload, { onConflict: 'student_id, survey_name' });
            
        if (error) {
            console.error("Auto-save failed: ", error);
        }
    } catch(err) {
        console.error("Auto-save error: ", err);
    }
}

async function loadWaTemplates() {
    try {
        const { data, error } = await db.from('wa_templates').select('*').order('created_at', { ascending: false });
        if (error) throw error;
        waTemplates = data || [];
        
        const sel = document.getElementById('waTemplateDropdown');
        sel.innerHTML = '<option value="">- Select Saved Template -</option>';
        waTemplates.forEach(t => {
            const opt = document.createElement('option');
            opt.value = t.id; 
            opt.textContent = t.title + (t.is_default ? ' (Default)' : '');
            sel.appendChild(opt);
        });
    } catch (err) {
        console.error("Failed to load WA templates", err);
    }
}

function openWaModal(studentId) {
    currentStudentId = studentId;
    document.getElementById('waMessageText').value = '';
    document.getElementById('waTemplateDropdown').value = '';
    
    // Auto-select first template if available
    if (waTemplates.length > 0) {
        const def = waTemplates.find(x => x.is_default);
        document.getElementById('waTemplateDropdown').value = def ? def.id : waTemplates[0].id;
        applyTemplate();
    }
    
    document.getElementById('waModal').style.display = 'flex';
}

function closeWaModal() {
    document.getElementById('waModal').style.display = 'none';
    currentStudentId = null;
}

function applyTemplate() {
    if (!currentStudentId) return;
    
    const tId = document.getElementById('waTemplateDropdown').value;
    if (!tId) {
        document.getElementById('waMessageText').value = '';
        return;
    }
    
    const tmpl = waTemplates.find(x => x.id === tId);
    if (!tmpl) return;
    
    const student = allStudents.find(s => s.id === currentStudentId);
    
    // Get the specific survey name and date for THIS student from the DOM
    const rowRawDateInput = document.querySelector(`input[onchange="updateRowDate(this, 'dateText_${currentStudentId}')"]`);
    const surveyNameInput = rowRawDateInput ? rowRawDateInput.closest('tr').querySelector('.row-survey-name') : null;
    const surveyDateText = rowRawDateInput ? rowRawDateInput.closest('tr').querySelector('.row-date-text').value : '';
    const surveyName = surveyNameInput ? surveyNameInput.value.trim() : '';

    let text = tmpl.message_text;
    text = text.replace(/{{STUDENT_NAME}}/g, student.full_name || '');
    text = text.replace(/{{FATHER_NAME}}/g, student.father_name || '');
    text = text.replace(/{{TODAY_DATE}}/g, new Date().toLocaleDateString());
    text = text.replace(/{{SURVEY_NAME}}/g, surveyName || '(Survey Name)');
    text = text.replace(/{{SURVEY_DATE}}/g, surveyDateText || '(Date)');

    document.getElementById('waMessageText').value = text;
}

function sendWaMessage() {
    if (!currentStudentId) return;
    const student = allStudents.find(s => s.id === currentStudentId);
    
    let mobile = student.father_whatsapp || student.father_mobile;
    if (!mobile) {
        alert("This student doesn't have a Father's Mobile or WhatsApp number saved.");
        return;
    }
    
    // Clean number for WhatsApp URL
    mobile = mobile.replace(/[^0-9]/g, '');
    if (mobile.startsWith('0')) mobile = '92' + mobile.substring(1);
    
    const msg = document.getElementById('waMessageText').value;
    if (!msg.trim()) {
        alert("Message cannot be empty.");
        return;
    }
    
    const encoded = encodeURIComponent(msg);
    const url = `https://wa.me/${mobile}?text=${encoded}`;
    
    window.open(url, '_blank');
    closeWaModal();
}
