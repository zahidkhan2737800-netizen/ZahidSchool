const db = window.supabaseClient;
const DEFAULT_FOOTER = 'Thank you! — Zahid School System';
const REFUND_FOOTER = 'Fee once paid is not refundable.';

const footerText = document.getElementById('footerText');
const charCount = document.getElementById('charCount');
const previewFooter = document.getElementById('previewFooter');
const saveBtn = document.getElementById('saveBtn');
const statusText = document.getElementById('statusText');
const installNotice = document.getElementById('installNotice');

function updatePreview() {
    const value = footerText.value;
    charCount.textContent = `${value.length} / 200`;
    previewFooter.textContent = value || DEFAULT_FOOTER;
}

function showStatus(message, isError = false) {
    statusText.textContent = message;
    statusText.className = `status ${isError ? 'error' : 'ok'}`;
}

function isMissingTableError(error) {
    const text = String(error?.message || '').toLowerCase();
    return error?.code === '42P01' || error?.code === 'PGRST205' || text.includes('school_receipt_settings');
}

async function loadFooter() {
    const schoolId = window.currentSchoolId;
    document.getElementById('previewSchool').textContent =
        window.currentSchoolName && window.currentSchoolName !== 'System' ? window.currentSchoolName : 'Zahid School';

    if (!schoolId) {
        footerText.value = DEFAULT_FOOTER;
        updatePreview();
        showStatus('No school is assigned to this account.', true);
        return;
    }

    const { data, error } = await db
        .from('school_receipt_settings')
        .select('footer_text')
        .eq('school_id', schoolId)
        .maybeSingle();

    if (error) {
        footerText.value = DEFAULT_FOOTER;
        updatePreview();
        if (isMissingTableError(error)) installNotice.style.display = 'block';
        showStatus(`Could not load the saved footer: ${error.message}`, true);
        return;
    }

    footerText.value = data?.footer_text || DEFAULT_FOOTER;
    updatePreview();
}

async function saveFooter() {
    const schoolId = window.currentSchoolId;
    const value = footerText.value.trim();
    if (!schoolId) return showStatus('No school is assigned to this account.', true);
    if (!value) return showStatus('Write a receipt message before saving.', true);

    saveBtn.disabled = true;
    saveBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Saving';
    installNotice.style.display = 'none';

    const { error } = await db.from('school_receipt_settings').upsert({
        school_id: schoolId,
        footer_text: value,
        updated_at: new Date().toISOString(),
        updated_by: window.currentUser?.id || null
    }, { onConflict: 'school_id' });

    saveBtn.disabled = false;
    saveBtn.innerHTML = '<i class="fas fa-save"></i> Save Footer';

    if (error) {
        if (isMissingTableError(error)) installNotice.style.display = 'block';
        showStatus(`Could not save: ${error.message}`, true);
        return;
    }

    footerText.value = value;
    updatePreview();
    showStatus('Receipt footer saved for this school.');
}

window.onAppReady(() => {
    footerText.addEventListener('input', updatePreview);
    saveBtn.addEventListener('click', saveFooter);
    document.getElementById('exampleBtn').addEventListener('click', () => {
        footerText.value = REFUND_FOOTER;
        updatePreview();
        footerText.focus();
    });
    document.getElementById('defaultBtn').addEventListener('click', () => {
        footerText.value = DEFAULT_FOOTER;
        updatePreview();
        footerText.focus();
    });
    loadFooter();
});
