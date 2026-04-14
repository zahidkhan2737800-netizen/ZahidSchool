document.addEventListener('DOMContentLoaded', () => {
  const examForm = document.getElementById('examForm');
  const examName = document.getElementById('examName');
  const examSession = document.getElementById('examSession');
  const startDate = document.getElementById('startDate');
  const endDate = document.getElementById('endDate');
  const resultDate = document.getElementById('resultDate');
  const examFee = document.getElementById('examFee');
  const examStatus = document.getElementById('examStatus');
  const examBody = document.getElementById('examBody');
  const formTitle = document.getElementById('formTitle');
  const saveBtn = document.getElementById('saveBtn');
  const cancelEditBtn = document.getElementById('cancelEditBtn');

  let sessions = [];
  let examinations = [];
  let editingExamId = null;

  waitForAuth();

  function waitForAuth() {
    const timer = setInterval(() => {
      if (window.authReady && window.supabaseClient) {
        clearInterval(timer);
        init();
      }
    }, 100);
  }

  async function init() {
    examForm.addEventListener('submit', onSaveExamination);
    cancelEditBtn.addEventListener('click', resetFormState);
    await loadData();
  }

  async function loadData() {
    try {
      let sessionQuery = window.supabaseClient
        .from('session')
        .select('id, session_value')
        .order('session_value', { ascending: false });

      let examinationQuery = window.supabaseClient
        .from('examination')
        .select('id, name, session_id, start_date, end_date, result_announcement_date, fee, created_at, session:session_id(session_value)')
        .order('start_date', { ascending: false });

      if (window.currentSchoolId) {
        sessionQuery = sessionQuery.eq('school_id', window.currentSchoolId);
        examinationQuery = examinationQuery.eq('school_id', window.currentSchoolId);
      }

      const [{ data: sessionData, error: sessionError }, { data: examinationData, error: examinationError }] = await Promise.all([
        sessionQuery,
        examinationQuery
      ]);

      if (sessionError) throw sessionError;
      if (examinationError) throw examinationError;

      sessions = Array.isArray(sessionData) ? sessionData : [];
      examinations = Array.isArray(examinationData) ? examinationData : [];

      renderSessionOptions(examSession.value || '');
      renderExaminations();
    } catch (err) {
      console.error('Load failed:', err);
      examBody.innerHTML = `<tr><td colspan="7" class="empty-msg">Error: ${escapeHtml(err.message || String(err))}</td></tr>`;
      examStatus.textContent = `Error: ${err.message || err}`;
    }
  }

  function renderSessionOptions(selectedValue) {
    examSession.innerHTML = '<option value="">-- Choose Session --</option>';

    if (!sessions.length) {
      const opt = document.createElement('option');
      opt.value = '';
      opt.textContent = 'No sessions found';
      examSession.appendChild(opt);
      return;
    }

    sessions.forEach(session => {
      const opt = document.createElement('option');
      opt.value = session.id;
      opt.textContent = session.session_value;
      examSession.appendChild(opt);
    });

    if (selectedValue) {
      examSession.value = selectedValue;
    }
  }

  function renderExaminations() {
    if (!examinations.length) {
      examBody.innerHTML = '<tr><td colspan="7" class="empty-msg">No examinations yet. Add one to get started.</td></tr>';
      return;
    }

    examBody.innerHTML = examinations.map(exam => `
      <tr>
        <td><strong>${escapeHtml(exam.name)}</strong></td>
        <td>${escapeHtml(exam.session?.session_value || '')}</td>
        <td>${formatDate(exam.start_date)}</td>
        <td>${formatDate(exam.end_date)}</td>
        <td>${formatDate(exam.result_announcement_date)}</td>
        <td class="fee-cell">${formatFee(exam.fee)}</td>
        <td>
          <div class="action-btns">
            <button class="btn secondary" onclick="editExamination('${exam.id}')">Edit</button>
            <button class="btn danger" onclick="deleteExamination('${exam.id}')">Delete</button>
          </div>
        </td>
      </tr>
    `).join('');
  }

  async function onSaveExamination(event) {
    event.preventDefault();

    const name = (examName.value || '').trim();
    const sessionId = (examSession.value || '').trim();
    const start = startDate.value;
    const end = endDate.value;
    const result = resultDate.value;
    const feeValue = (examFee.value || '').trim();

    if (!name) {
      examStatus.textContent = 'Please enter examination name.';
      return;
    }

    if (!sessionId) {
      examStatus.textContent = 'Please select academic session.';
      return;
    }

    if (!start) {
      examStatus.textContent = 'Please enter start date.';
      return;
    }

    if (end && end < start) {
      examStatus.textContent = 'End date must be on or after start date.';
      return;
    }

    if (result && end && result < end) {
      examStatus.textContent = 'Result date should be on or after end date.';
      return;
    }

    examStatus.textContent = editingExamId ? 'Updating...' : 'Saving...';

    try {
      const isEditMode = Boolean(editingExamId);
      const payload = {
        school_id: window.currentSchoolId || null,
        name,
        session_id: sessionId,
        start_date: start,
        end_date: end || null,
        result_announcement_date: result || null,
        fee: feeValue ? Number(feeValue) : null
      };

      let response;
      if (editingExamId) {
        response = await window.supabaseClient
          .from('examination')
          .update(payload)
          .eq('id', editingExamId);
      } else {
        response = await window.supabaseClient
          .from('examination')
          .insert(payload);
      }

      if (response.error) throw response.error;

      resetFormState();
      examStatus.textContent = isEditMode ? 'Examination updated successfully.' : 'Examination saved successfully.';
      setTimeout(() => {
        examStatus.textContent = '';
      }, 3000);
      await loadData();
    } catch (err) {
      console.error('Save failed:', err);
      examStatus.textContent = `Error: ${err.message || err}`;
    }
  }

  window.editExamination = function(id) {
    const exam = examinations.find(item => String(item.id) === String(id));
    if (!exam) {
      examStatus.textContent = 'Could not load examination for editing.';
      return;
    }

    editingExamId = exam.id;
    formTitle.textContent = 'Edit Examination';
    saveBtn.textContent = 'Update Examination';
    cancelEditBtn.style.display = 'inline-flex';

    examName.value = exam.name || '';
    renderSessionOptions(exam.session_id || '');
    startDate.value = exam.start_date || '';
    endDate.value = exam.end_date || '';
    resultDate.value = exam.result_announcement_date || '';
    examFee.value = exam.fee ?? '';
    examStatus.textContent = 'Editing examination. You can add end date and result date later here.';
    examName.focus();
  };

  window.deleteExamination = async function(id) {
    if (!confirm('Delete this examination?')) return;

    try {
      const { error } = await window.supabaseClient
        .from('examination')
        .delete()
        .eq('id', id);

      if (error) throw error;

      await loadData();
    } catch (err) {
      console.error('Delete failed:', err);
      examStatus.textContent = `Error: ${err.message || err}`;
    }
  };

  function resetFormState() {
    editingExamId = null;
    examForm.reset();
    formTitle.textContent = 'Add Examination';
    saveBtn.textContent = 'Save Examination';
    cancelEditBtn.style.display = 'none';
    renderSessionOptions('');
  }

  function formatDate(value) {
    if (!value) return '—';
    try {
      return new Date(value).toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric'
      });
    } catch {
      return value;
    }
  }

  function formatFee(value) {
    if (value === null || value === undefined || value === '') return '—';
    const numeric = Number(value);
    if (Number.isNaN(numeric)) return String(value);
    return numeric.toLocaleString('en-PK', {
      minimumFractionDigits: 0,
      maximumFractionDigits: 2
    });
  }

  function escapeHtml(str) {
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }
});