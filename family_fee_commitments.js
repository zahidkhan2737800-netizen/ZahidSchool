let commitmentsForDate = [];
let nextCommitmentSourceId = null;
let commitmentWaTemplates = [];
let commitmentWaSourceId = null;
let commitmentWaBillDetails = '';
let commitmentWaGrandTotal = 0;
let allCommitmentsTotal = 0;
let commitmentBalancesById = {};
let commitmentTotalAmount = 0;
let commitmentBalancesLoaded = false;

window.onAppReady(async () => {
    await waitForCommitmentAuth();

    const params = new URLSearchParams(window.location.search);
    const requestedDate = params.get('date');
    document.getElementById('commitmentDate').value = /^\d{4}-\d{2}-\d{2}$/.test(requestedDate || '') ? requestedDate : karachiCommitmentToday();

    document.getElementById('previousDate').addEventListener('click', () => moveCommitmentDate(-1));
    document.getElementById('nextDate').addEventListener('click', () => moveCommitmentDate(1));
    document.getElementById('todayDate').addEventListener('click', () => setCommitmentDate(karachiCommitmentToday()));
    document.getElementById('commitmentDate').addEventListener('change', loadCommitmentsForDate);
    document.getElementById('commitmentStatus').addEventListener('change', renderCommitments);
    document.getElementById('commitmentSearch').addEventListener('input', renderCommitments);
    document.getElementById('commitmentsBody').addEventListener('click', handleCommitmentAction);
    setupNextCommitmentModal();
    setupCommitmentWhatsApp();
    await loadCommitmentWhatsAppTemplates();

    await loadCommitmentsForDate();
});

async function waitForCommitmentAuth(timeoutMs = 10000) {
    const started = Date.now();
    while (Date.now() - started < timeoutMs) {
        if (window.authReady === true && window.supabaseClient) return;
        await new Promise(resolve => setTimeout(resolve, 80));
    }
}

function karachiCommitmentToday(date = new Date()) {
    const parts = new Intl.DateTimeFormat('en-GB', {
        timeZone: 'Asia/Karachi', year: 'numeric', month: '2-digit', day: '2-digit'
    }).formatToParts(date);
    const values = Object.fromEntries(parts.map(part => [part.type, part.value]));
    return `${values.year}-${values.month}-${values.day}`;
}

function addCommitmentDays(ymd, amount) {
    const [year, month, day] = ymd.split('-').map(Number);
    const date = new Date(Date.UTC(year, month - 1, day));
    date.setUTCDate(date.getUTCDate() + amount);
    return date.toISOString().slice(0, 10);
}

function displayCommitmentDate(ymd) {
    if (!ymd) return '—';
    return new Date(`${ymd}T00:00:00Z`).toLocaleDateString('en-GB', {
        weekday: 'short', day: '2-digit', month: 'short', year: 'numeric', timeZone: 'UTC'
    });
}

function setCommitmentDate(ymd) {
    document.getElementById('commitmentDate').value = ymd;
    loadCommitmentsForDate();
}

function moveCommitmentDate(amount) {
    const current = document.getElementById('commitmentDate').value || karachiCommitmentToday();
    setCommitmentDate(addCommitmentDays(current, amount));
}

async function loadCommitmentsForDate() {
    const tbody = document.getElementById('commitmentsBody');
    const selectedDate = document.getElementById('commitmentDate').value || karachiCommitmentToday();
    commitmentBalancesById = {};
    commitmentTotalAmount = 0;
    commitmentBalancesLoaded = false;
    tbody.innerHTML = '<tr><td colspan="10" class="empty">Loading commitments...</td></tr>';
    updateCommitmentDateHeading(selectedDate);

    try {
        await refreshAllCommitmentsTotal();
        let query = window.supabaseClient
            .from('family_fee_commitments')
            .select('*')
            .eq('due_date', selectedDate)
            .order('status', { ascending: false })
            .order('family_name', { ascending: true });
        if (window.currentSchoolId) query = query.eq('school_id', window.currentSchoolId);

        const { data, error } = await query;
        if (error) throw error;
        commitmentsForDate = data || [];
        try {
            await loadCommitmentBalances();
        } catch (balanceError) {
            commitmentBalancesById = {};
            commitmentTotalAmount = 0;
            commitmentBalancesLoaded = false;
            console.error('Could not load commitment balances:', balanceError);
        }
        renderCommitments();
    } catch (error) {
        console.error('Could not load family commitments:', error);
        commitmentsForDate = [];
        updateCommitmentSummary();
        const missingTable = error?.code === '42P01' || String(error?.message || '').includes('schema cache');
        tbody.innerHTML = `<tr><td colspan="10" class="empty"><div class="setup-error">${missingTable ? 'Commitment storage is not installed yet. Run <strong>family_fee_commitments_setup.sql</strong> in the Supabase SQL Editor.' : `Could not load commitments: ${escapeCommitmentHtml(error.message || 'Unknown error')}`}</div></td></tr>`;
    }
}

async function loadCommitmentBalances() {
    commitmentBalancesById = {};
    commitmentTotalAmount = 0;
    commitmentBalancesLoaded = false;

    const studentIds = [...new Set(commitmentsForDate.flatMap(item => {
        const members = Array.isArray(item.members) ? item.members : [];
        return members.map(member => member.student_id).filter(Boolean);
    }))];

    if (!studentIds.length) {
        commitmentBalancesLoaded = true;
        return;
    }

    const challans = [];
    for (let index = 0; index < studentIds.length; index += 40) {
        const batch = studentIds.slice(index, index + 40);
        const { data, error } = await window.supabaseClient
            .from('challans')
            .select('student_id, amount, paid_amount')
            .in('student_id', batch)
            .in('status', ['Unpaid', 'Partially Paid'])
            .limit(2000);
        if (error) throw error;
        if (data) challans.push(...data);
    }

    const balancesByStudent = {};
    challans.forEach(challan => {
        const remaining = Math.max(0, Number(challan.amount || 0) - Number(challan.paid_amount || 0));
        balancesByStudent[challan.student_id] = (balancesByStudent[challan.student_id] || 0) + remaining;
    });

    commitmentsForDate.forEach(item => {
        const memberIds = [...new Set((Array.isArray(item.members) ? item.members : [])
            .map(member => member.student_id)
            .filter(Boolean))];
        commitmentBalancesById[item.id] = memberIds.reduce((sum, studentId) => sum + (balancesByStudent[studentId] || 0), 0);
    });

    // Count each student only once, even if duplicate commitments exist for the date.
    commitmentTotalAmount = studentIds.reduce((sum, studentId) => sum + (balancesByStudent[studentId] || 0), 0);
    commitmentBalancesLoaded = true;
}

function updateCommitmentDateHeading(selectedDate) {
    document.getElementById('selectedDateTitle').textContent = `Commitments due ${displayCommitmentDate(selectedDate)}`;
    document.getElementById('todayPill').classList.toggle('show', selectedDate === karachiCommitmentToday());
    const url = new URL(window.location.href);
    url.searchParams.set('date', selectedDate);
    window.history.replaceState({}, '', url);
}

function updateCommitmentSummary() {
    document.getElementById('allCommitments').textContent = allCommitmentsTotal.toLocaleString();
    document.getElementById('totalCommitments').textContent = commitmentsForDate.length.toLocaleString();
    document.getElementById('pendingCommitments').textContent = commitmentsForDate.filter(item => effectiveCommitmentStatus(item) === 'Pending').length.toLocaleString();
    document.getElementById('defaultedCommitments').textContent = commitmentsForDate.filter(item => effectiveCommitmentStatus(item) === 'PD').length.toLocaleString();
    document.getElementById('completedCommitments').textContent = commitmentsForDate.filter(item => effectiveCommitmentStatus(item) === 'Completed').length.toLocaleString();
    document.getElementById('committedAmount').textContent = commitmentBalancesLoaded ? `Rs ${commitmentTotalAmount.toLocaleString()}` : '—';
}

async function refreshAllCommitmentsTotal() {
    let query = window.supabaseClient
        .from('family_fee_commitments')
        .select('*', { count: 'exact', head: true });
    if (window.currentSchoolId) query = query.eq('school_id', window.currentSchoolId);
    const { count, error } = await query;
    if (error) throw error;
    allCommitmentsTotal = count || 0;
    const total = document.getElementById('allCommitments');
    if (total) total.textContent = allCommitmentsTotal.toLocaleString();
}

function effectiveCommitmentStatus(item) {
    if (item.status === 'Pending' && item.due_date && item.due_date < karachiCommitmentToday()) return 'PD';
    return item.status;
}

function renderCommitments() {
    updateCommitmentSummary();
    const status = document.getElementById('commitmentStatus').value;
    const search = document.getElementById('commitmentSearch').value.trim().toLowerCase();
    const rows = commitmentsForDate.filter(item => {
        if (status !== 'All' && effectiveCommitmentStatus(item) !== status) return false;
        if (!search) return true;
        const members = Array.isArray(item.members) ? item.members : [];
        const haystack = [item.family_name, item.family_no, item.family_mobile, item.created_by]
            .concat(members.flatMap(member => [member.name, member.roll, member.class_name]))
            .filter(Boolean).join(' ').toLowerCase();
        return haystack.includes(search);
    });

    const tbody = document.getElementById('commitmentsBody');
    if (!rows.length) {
        tbody.innerHTML = '<tr><td colspan="10" class="empty">No commitments match this date and filter.</td></tr>';
        return;
    }

    tbody.innerHTML = rows.map(item => {
        const displayStatus = effectiveCommitmentStatus(item);
        const members = Array.isArray(item.members) ? item.members : [];
        const isStudentRecord = members.length === 1;
        const membersHtml = members.length ? members.map(member => `
            <div class="member"><strong>${escapeCommitmentHtml(member.name || 'Student')}</strong>
            ${isStudentRecord ? `<small><strong>Father:</strong> ${escapeCommitmentHtml(member.father_name || item.family_name || '—')}</small>` : ''}
            <small>Roll ${escapeCommitmentHtml(member.roll || '—')}${member.class_name ? ` · ${escapeCommitmentHtml(member.class_name)}` : ''}</small></div>
        `).join('') : '<span class="member">No member snapshot</span>';
        const contactHeading = isStudentRecord
            ? 'Student'
            : `${escapeCommitmentHtml(item.family_name || '—')}<span class="record-type">Family</span>`;
        const actionLabel = item.status === 'Pending' ? 'Mark Done' : 'Reopen';
        const actionClass = item.status === 'Pending' ? '' : ' reopen';
        const balance = commitmentBalancesById[item.id] || 0;
        const balanceText = commitmentBalancesLoaded ? `Rs ${balance.toLocaleString()}` : '—';
        return `
            <tr>
                <td><strong>${escapeCommitmentHtml(displayCommitmentDate(item.due_date))}</strong></td>
                <td>${escapeCommitmentHtml(item.family_no || '—')}</td>
                <td><div class="family-name">${contactHeading}</div><a class="family-mobile" href="https://wa.me/${whatsAppNumber(item.family_mobile)}" target="_blank" rel="noopener">${escapeCommitmentHtml(item.family_mobile || '—')}</a></td>
                <td><div class="members">${membersHtml}</div></td>
                <td class="commitment-balance">${balanceText}</td>
                <td><strong>${Number(item.days_promised || 0).toLocaleString()}</strong> day${Number(item.days_promised) === 1 ? '' : 's'}</td>
                <td>${escapeCommitmentHtml(displayCommitmentDate(item.commitment_made_on))}</td>
                <td>${escapeCommitmentHtml(item.created_by || '—')}</td>
                <td><span class="badge ${escapeCommitmentHtml(displayStatus)}" title="${displayStatus === 'PD' ? 'Payment Default: commitment date expired without completion' : escapeCommitmentHtml(displayStatus)}">${escapeCommitmentHtml(displayStatus)}</span></td>
                <td><div class="action-buttons">
                    <button type="button" class="row-action${actionClass}" data-id="${escapeCommitmentHtml(item.id)}" data-status="${escapeCommitmentHtml(item.status)}">${actionLabel}</button>
                    <button type="button" class="next-action" data-id="${escapeCommitmentHtml(item.id)}"><i class="fas fa-calendar-plus"></i> Next Commitment</button>
                    <button type="button" class="whatsapp-action" data-id="${escapeCommitmentHtml(item.id)}"><i class="fab fa-whatsapp"></i> WhatsApp</button>
                    <button type="button" class="delete-action" data-id="${escapeCommitmentHtml(item.id)}" data-family="${escapeCommitmentHtml(item.family_name || 'this family')}"><i class="fas fa-trash"></i> Delete</button>
                </div></td>
            </tr>`;
    }).join('');
}

async function handleCommitmentAction(event) {
    const whatsappButton = event.target.closest('.whatsapp-action');
    if (whatsappButton) {
        openCommitmentWhatsApp(whatsappButton.dataset.id);
        return;
    }

    const nextButton = event.target.closest('.next-action');
    if (nextButton) {
        openNextCommitmentModal(nextButton.dataset.id);
        return;
    }

    const deleteButton = event.target.closest('.delete-action');
    if (deleteButton) {
        await deleteCommitment(deleteButton);
        return;
    }

    const button = event.target.closest('.row-action');
    if (!button) return;
    const nextStatus = button.dataset.status === 'Pending' ? 'Completed' : 'Pending';
    button.disabled = true;
    button.textContent = 'Saving...';

    const payload = {
        status: nextStatus,
        completed_at: nextStatus === 'Completed' ? new Date().toISOString() : null,
        completed_by: nextStatus === 'Completed' ? (window.currentUserFullName || window.currentUser?.email || 'Unknown User') : null,
        updated_at: new Date().toISOString()
    };
    try {
        let query = window.supabaseClient.from('family_fee_commitments').update(payload).eq('id', button.dataset.id);
        if (window.currentSchoolId) query = query.eq('school_id', window.currentSchoolId);
        const { error } = await query;
        if (error) throw error;
        showCommitmentToast(nextStatus === 'Completed' ? 'Commitment marked completed.' : 'Commitment reopened.');
        await loadCommitmentsForDate();
    } catch (error) {
        console.error('Could not update commitment:', error);
        showCommitmentToast(`Could not update commitment: ${error.message || 'Unknown error'}`, true);
        button.disabled = false;
        button.textContent = button.dataset.status === 'Pending' ? 'Mark Done' : 'Reopen';
    }
}

function setupCommitmentWhatsApp() {
    const modal = document.getElementById('commitmentWaModal');
    const template = document.getElementById('commitmentWaTemplate');
    const cancel = document.getElementById('commitmentWaCancel');
    const send = document.getElementById('commitmentWaSend');
    if (!modal || !template || !cancel || !send) return;

    template.addEventListener('change', applyCommitmentWhatsAppTemplate);
    cancel.addEventListener('click', closeCommitmentWhatsApp);
    send.addEventListener('click', sendCommitmentWhatsApp);
    modal.addEventListener('click', event => {
        if (event.target === modal) closeCommitmentWhatsApp();
    });
    document.addEventListener('keydown', event => {
        if (event.key === 'Escape' && modal.classList.contains('open')) closeCommitmentWhatsApp();
    });
}

async function loadCommitmentWhatsAppTemplates() {
    const select = document.getElementById('commitmentWaTemplate');
    if (!select) return;
    try {
        const { data, error } = await window.supabaseClient
            .from('wa_templates')
            .select('id, title, message_text, is_default')
            .order('created_at', { ascending: true });
        if (error) throw error;
        commitmentWaTemplates = data || [];
        select.innerHTML = '<option value="">Custom commitment message</option>';
        commitmentWaTemplates.forEach(template => {
            const option = document.createElement('option');
            option.value = template.id;
            option.textContent = template.title;
            select.appendChild(option);
        });
    } catch (error) {
        console.warn('Could not load WhatsApp templates:', error);
        commitmentWaTemplates = [];
    }
}

async function openCommitmentWhatsApp(commitmentId) {
    const source = commitmentsForDate.find(item => item.id === commitmentId);
    if (!source) {
        showCommitmentToast('The selected family could not be found.', true);
        return;
    }

    commitmentWaSourceId = commitmentId;
    commitmentWaBillDetails = buildCommitmentMemberLines(source);
    commitmentWaGrandTotal = 0;
    const modal = document.getElementById('commitmentWaModal');
    const template = document.getElementById('commitmentWaTemplate');
    document.getElementById('commitmentWaFamily').textContent = `${source.family_name || 'Family'} (${source.family_mobile || 'No mobile'})`;
    document.getElementById('commitmentWaDetailStatus').textContent = 'Loading current unpaid fee details...';
    template.value = '';
    document.getElementById('commitmentWaMessage').value = buildDefaultCommitmentWhatsApp(source);
    modal.classList.add('open');
    modal.setAttribute('aria-hidden', 'false');

    try {
        const details = await fetchCommitmentFeeDetails(source);
        commitmentWaBillDetails = details.billDetails;
        commitmentWaGrandTotal = details.grandTotal;
        document.getElementById('commitmentWaDetailStatus').textContent = details.grandTotal > 0
            ? `Current unpaid family balance: Rs ${details.grandTotal.toLocaleString()}`
            : 'No unpaid family balance found. You can still send or edit the message.';
        if (template.value) applyCommitmentWhatsAppTemplate();
    } catch (error) {
        console.warn('Could not load commitment fee details:', error);
        document.getElementById('commitmentWaDetailStatus').textContent = 'Fee details could not be loaded. The message can still be edited and sent.';
    }
}

function closeCommitmentWhatsApp() {
    const modal = document.getElementById('commitmentWaModal');
    if (modal) {
        modal.classList.remove('open');
        modal.setAttribute('aria-hidden', 'true');
    }
    commitmentWaSourceId = null;
}

function buildCommitmentMemberLines(source) {
    const members = Array.isArray(source.members) ? source.members : [];
    if (!members.length) return 'Family students';
    return members.map(member => `• ${member.name || 'Student'}${member.roll ? ` (Roll ${member.roll})` : ''}`).join('\n');
}

function buildDefaultCommitmentWhatsApp(source) {
    return `Zahid School\nDear ${source.family_name || 'Parent'},\n\nThis is a reminder that your fee payment commitment is due on ${longCommitmentDate(source.due_date)}.\n\nStudents:\n${buildCommitmentMemberLines(source)}\n\nThank you.`;
}

async function fetchCommitmentFeeDetails(source) {
    const members = Array.isArray(source.members) ? source.members : [];
    const studentIds = members.map(member => member.student_id).filter(Boolean);
    if (!studentIds.length) return { billDetails: buildCommitmentMemberLines(source), grandTotal: 0 };

    const { data, error } = await window.supabaseClient
        .from('challans')
        .select('student_id, fee_type, fee_month, amount, paid_amount')
        .in('student_id', studentIds)
        .in('status', ['Unpaid', 'Partially Paid']);
    if (error) throw error;

    let grandTotal = 0;
    const lines = [];
    members.forEach(member => {
        const unpaid = (data || []).filter(challan => challan.student_id === member.student_id).map(challan => ({
            label: [challan.fee_month, challan.fee_type].filter(Boolean).join(' '),
            remaining: Math.max(0, Number(challan.amount || 0) - Number(challan.paid_amount || 0))
        })).filter(item => item.remaining > 0);
        if (!unpaid.length) return;
        lines.push(`*${member.name || 'Student'}${member.roll ? ` (${member.roll})` : ''}*`);
        unpaid.forEach(item => {
            grandTotal += item.remaining;
            lines.push(`${item.label || 'Fee'}: Rs ${item.remaining.toLocaleString()}`);
        });
        lines.push('');
    });

    return {
        billDetails: lines.length ? lines.join('\n').trim() : buildCommitmentMemberLines(source),
        grandTotal
    };
}

function applyCommitmentWhatsAppTemplate() {
    const source = commitmentsForDate.find(item => item.id === commitmentWaSourceId);
    const selectedId = document.getElementById('commitmentWaTemplate').value;
    const selected = commitmentWaTemplates.find(template => template.id === selectedId);
    if (!source) return;
    if (!selected) {
        document.getElementById('commitmentWaMessage').value = buildDefaultCommitmentWhatsApp(source);
        return;
    }

    const members = buildCommitmentMemberLines(source);
    const message = selected.message_text
        .replace(/{{TODAY_DATE}}/g, longCommitmentDate(karachiCommitmentToday()))
        .replace(/{{FATHER_NAME}}/g, source.family_name || 'Parent')
        .replace(/{{FAMILY_NAME}}/g, source.family_name || 'Family')
        .replace(/{{MOBILE}}/g, source.family_mobile || '')
        .replace(/{{DUE_DATE}}/g, longCommitmentDate(source.due_date))
        .replace(/{{DAYS_PROMISED}}/g, String(source.days_promised ?? ''))
        .replace(/{{MEMBERS}}/g, members)
        .replace(/{{BILL_DETAILS}}/g, commitmentWaBillDetails || members)
        .replace(/{{GRAND_TOTAL}}/g, commitmentWaGrandTotal.toLocaleString());
    document.getElementById('commitmentWaMessage').value = message;
}

function sendCommitmentWhatsApp() {
    const source = commitmentsForDate.find(item => item.id === commitmentWaSourceId);
    const message = document.getElementById('commitmentWaMessage').value.trim();
    if (!source || !message) {
        showCommitmentToast('Enter a WhatsApp message first.', true);
        return;
    }

    const phone = whatsAppNumber(source.family_mobile);
    if (phone.length < 10 || phone.length > 15) {
        showCommitmentToast('This family does not have a valid WhatsApp number.', true);
        return;
    }

    const opened = window.open(`https://wa.me/${phone}?text=${encodeURIComponent(message)}`, '_blank');
    if (!opened) {
        showCommitmentToast('WhatsApp was blocked by the browser. Allow pop-ups and try again.', true);
        return;
    }
    closeCommitmentWhatsApp();
    showCommitmentToast('WhatsApp message opened.');
}

function setupNextCommitmentModal() {
    const modal = document.getElementById('nextCommitmentModal');
    const input = document.getElementById('nextCommitmentDays');
    const cancelButton = document.getElementById('nextCommitmentCancel');
    const saveButton = document.getElementById('nextCommitmentSave');
    if (!modal || !input || !cancelButton || !saveButton) return;

    input.addEventListener('keydown', event => {
        if (['e', 'E', '+', '-', '.', ','].includes(event.key)) event.preventDefault();
        if (event.key === 'Enter') saveNextCommitment();
        if (event.key === 'Escape') closeNextCommitmentModal();
    });
    input.addEventListener('input', () => {
        input.value = input.value.replace(/\D/g, '');
        updateNextCommitmentPreview();
    });
    input.addEventListener('wheel', event => {
        event.preventDefault();
        input.blur();
    }, { passive: false });
    cancelButton.addEventListener('click', closeNextCommitmentModal);
    saveButton.addEventListener('click', saveNextCommitment);
    modal.addEventListener('click', event => {
        if (event.target === modal) closeNextCommitmentModal();
    });
    document.addEventListener('keydown', event => {
        if (event.key === 'Escape' && modal.classList.contains('open')) closeNextCommitmentModal();
    });
}

function openNextCommitmentModal(commitmentId) {
    const source = commitmentsForDate.find(item => item.id === commitmentId);
    if (!source) {
        showCommitmentToast('The selected commitment could not be found.', true);
        return;
    }

    nextCommitmentSourceId = commitmentId;
    const modal = document.getElementById('nextCommitmentModal');
    const input = document.getElementById('nextCommitmentDays');
    document.getElementById('nextCommitmentFamily').textContent = `${source.family_name || 'Family'} (${source.family_mobile || 'No mobile'})`;
    input.value = '';
    updateNextCommitmentPreview();
    modal.classList.add('open');
    modal.setAttribute('aria-hidden', 'false');
    setTimeout(() => input.focus(), 30);
}

function closeNextCommitmentModal() {
    const modal = document.getElementById('nextCommitmentModal');
    if (modal) {
        modal.classList.remove('open');
        modal.setAttribute('aria-hidden', 'true');
    }
    nextCommitmentSourceId = null;
}

function longCommitmentDate(ymd) {
    return new Date(`${ymd}T00:00:00Z`).toLocaleDateString('en-GB', {
        weekday: 'long', day: '2-digit', month: 'short', year: 'numeric', timeZone: 'UTC'
    });
}

function updateNextCommitmentPreview() {
    const input = document.getElementById('nextCommitmentDays');
    const preview = document.getElementById('nextCommitmentPreview');
    if (!input || !preview || !/^\d+$/.test(input.value)) {
        if (preview) preview.textContent = 'Enter the number of days.';
        return;
    }

    const madeOn = karachiCommitmentToday();
    const dueDate = addCommitmentDays(madeOn, Number(input.value));
    preview.innerHTML = `Made on <strong>${longCommitmentDate(madeOn)}</strong><br>Payment due <strong>${longCommitmentDate(dueDate)}</strong>`;
}

async function saveNextCommitment() {
    const input = document.getElementById('nextCommitmentDays');
    const saveButton = document.getElementById('nextCommitmentSave');
    const rawDays = input ? input.value.trim() : '';
    if (!/^\d+$/.test(rawDays)) {
        showCommitmentToast('Enter a whole number: 0, 1, 2, 3...', true);
        if (input) input.focus();
        return;
    }

    const days = Number(rawDays);
    const source = commitmentsForDate.find(item => item.id === nextCommitmentSourceId);
    if (!Number.isSafeInteger(days) || days < 0 || !source) {
        showCommitmentToast('Enter a valid number of days.', true);
        return;
    }

    const madeOn = karachiCommitmentToday();
    const dueDate = addCommitmentDays(madeOn, days);
    const payload = {
        school_id: source.school_id || window.currentSchoolId,
        family_mobile: source.family_mobile,
        family_no: source.family_no || null,
        family_name: source.family_name,
        members: Array.isArray(source.members) ? source.members : [],
        days_promised: days,
        month_key: source.month_key || madeOn.slice(0, 7),
        commitment_made_on: madeOn,
        due_date: dueDate,
        created_by_user_id: window.currentUser?.id || null,
        created_by: window.currentUserFullName || window.currentUser?.email || 'Unknown User',
        status: 'Pending'
    };

    saveButton.disabled = true;
    saveButton.textContent = 'Saving...';
    try {
        const { error } = await window.supabaseClient.from('family_fee_commitments').insert(payload);
        if (error) throw error;
        closeNextCommitmentModal();
        showCommitmentToast(`Next commitment saved for ${longCommitmentDate(dueDate)}. Existing commitment remains unchanged.`);
        if (document.getElementById('commitmentDate').value === dueDate) await loadCommitmentsForDate();
        else await refreshAllCommitmentsTotal();
    } catch (error) {
        console.error('Could not save next commitment:', error);
        showCommitmentToast(`Could not save next commitment: ${error.message || 'Unknown error'}`, true);
    } finally {
        saveButton.disabled = false;
        saveButton.textContent = 'Save Next';
    }
}

async function deleteCommitment(button) {
    const familyName = button.dataset.family || 'this family';
    const confirmed = window.confirm(`Delete the commitment for ${familyName}? This cannot be undone.`);
    if (!confirmed) return;

    button.disabled = true;
    button.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Deleting...';
    try {
        let query = window.supabaseClient
            .from('family_fee_commitments')
            .delete()
            .eq('id', button.dataset.id);
        if (window.currentSchoolId) query = query.eq('school_id', window.currentSchoolId);
        const { data, error } = await query.select('id');
        if (error) throw error;
        if (!data || data.length === 0) throw new Error('The commitment was not found or could not be deleted.');
        showCommitmentToast('Commitment deleted.');
        await loadCommitmentsForDate();
    } catch (error) {
        console.error('Could not delete commitment:', error);
        showCommitmentToast(`Could not delete commitment: ${error.message || 'Unknown error'}`, true);
        button.disabled = false;
        button.innerHTML = '<i class="fas fa-trash"></i> Delete';
    }
}

function whatsAppNumber(mobile) {
    let number = String(mobile || '').replace(/\D/g, '');
    if (number.startsWith('0') && number.length === 11) number = `92${number.slice(1)}`;
    return number;
}

function escapeCommitmentHtml(value) {
    return String(value ?? '').replace(/[&<>'"]/g, char => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;'
    }[char]));
}

function showCommitmentToast(message, isError = false) {
    const toast = document.getElementById('toast');
    toast.textContent = message;
    toast.className = isError ? 'error' : '';
    toast.style.display = 'block';
    clearTimeout(showCommitmentToast.timer);
    showCommitmentToast.timer = setTimeout(() => { toast.style.display = 'none'; }, 3200);
}
