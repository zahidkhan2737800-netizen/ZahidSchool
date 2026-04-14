document.addEventListener('DOMContentLoaded', async () => {
  const currForm = document.getElementById('currForm');
  const currName = document.getElementById('currName');
  const currDesc = document.getElementById('currDesc');
  const currStatus = document.getElementById('currStatus');
  const curriculaList = document.getElementById('curriculaList');

  const subjForm = document.getElementById('subjForm');
  const subjCurr = document.getElementById('subjCurr');
  const subjName = document.getElementById('subjName');
  const subjDesc = document.getElementById('subjDesc');
  const subjStatus = document.getElementById('subjStatus');

  const sessForm = document.getElementById('sessForm');
  const sessValue = document.getElementById('sessValue');
  const sessDesc = document.getElementById('sessDesc');
  const sessStatus = document.getElementById('sessStatus');

  let curricula = [];
  let subjects = [];
  let sessions = [];

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
    currForm.addEventListener('submit', onAddCurriculum);
    subjForm.addEventListener('submit', onAddSubject);
    sessForm.addEventListener('submit', onAddSession);
    await loadData();
  }

  async function loadData() {
    try {
      let currQ = window.supabaseClient.from('curriculum').select('*').order('created_at', { ascending: false });
      let subjQ = window.supabaseClient.from('subject').select('*').order('created_at', { ascending: false });
      let sessQ = window.supabaseClient.from('session').select('*').order('created_at', { ascending: false });

      if (window.currentSchoolId) {
        currQ = currQ.eq('school_id', window.currentSchoolId);
        subjQ = subjQ.eq('school_id', window.currentSchoolId);
        sessQ = sessQ.eq('school_id', window.currentSchoolId);
      }

      const [{ data: currData, error: currErr }, { data: subjData, error: subjErr }, { data: sessData, error: sessErr }] = await Promise.all([
        currQ,
        subjQ,
        sessQ
      ]);

      if (currErr) throw currErr;
      if (subjErr) throw subjErr;
      if (sessErr) throw sessErr;

      curricula = Array.isArray(currData) ? currData : [];
      subjects = Array.isArray(subjData) ? subjData : [];
      sessions = Array.isArray(sessData) ? sessData : [];

      renderCurricula();
      populateCurriculumDropdown();
      renderSessions();
    } catch (err) {
      console.error('Load failed:', err);
      curriculaList.innerHTML = `<div class="empty-msg">Error: ${err.message}</div>`;
    }
  }

  function populateCurriculumDropdown() {
    subjCurr.innerHTML = '<option value="">-- Choose Curriculum --</option>';
    curricula.forEach(c => {
      const opt = document.createElement('option');
      opt.value = c.id;
      opt.textContent = c.name;
      subjCurr.appendChild(opt);
    });
  }

  function formatDate(dateStr) {
    if (!dateStr) return '';
    try {
      const d = new Date(dateStr);
      return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
    } catch {
      return dateStr;
    }
  }

  function renderCurricula() {
    if (!curricula.length) {
      curriculaList.innerHTML = '<div class="empty-msg">No curricula yet. Add one to get started.</div>';
      return;
    }

    curriculaList.innerHTML = curricula.map(c => {
      const currSubjects = subjects.filter(s => s.curriculum_id === c.id);
      const itemId = `curr-${c.id}`;
      return `
        <div class="curriculum-item">
          <div class="curriculum-header" onclick="toggleCurriculum('${itemId}')">
            <div>
              <span class="curriculum-caret">▶</span> 
              <strong>${escapeHtml(c.name)}</strong>
              <span style="font-size: 0.8rem; color: var(--muted); margin-left: 8px;">${currSubjects.length} subject${currSubjects.length !== 1 ? 's' : ''}</span>
            </div>
            <button class="btn danger" style="padding: 4px 8px; font-size: 0.75rem; min-height: auto;" onclick="event.stopPropagation(); deleteCurriculum('${c.id}')">Delete</button>
          </div>
          <div class="curriculum-content" id="${itemId}">
            <ul class="subject-list">
              ${currSubjects.length ? currSubjects.map(s => `
                <li class="subject-item">
                  <div>
                    <strong>${escapeHtml(s.name)}</strong>
                    ${s.description ? `<div style="font-size: 0.8rem; color: var(--muted);">${escapeHtml(s.description)}</div>` : ''}
                  </div>
                  <button class="btn danger" style="padding: 4px 8px; font-size: 0.75rem; min-height: auto;" onclick="deleteSubject('${s.id}')">Delete</button>
                </li>
              `).join('') : '<li class="empty-subj">No subjects yet. Add one above.</li>'}
            </ul>
          </div>
        </div>
      `;
    }).join('');
  }

  function renderSessions() {
    const sessBody = document.getElementById('sessBody');
    if (!sessBody) return; // Session table may not exist anymore
    
    if (!sessions.length) {
      sessBody.innerHTML = '<tr><td colspan="4" class="empty-msg">No sessions yet. Add one to get started.</td></tr>';
      return;
    }

    sessBody.innerHTML = sessions.map(s => `
      <tr>
        <td><strong>${escapeHtml(s.session_value)}</strong></td>
        <td>${escapeHtml(s.description || '')}</td>
        <td>${formatDate(s.created_at)}</td>
        <td>
          <div class="action-btns">
            <button class="btn danger" onclick="deleteSession('${s.id}')">Delete</button>
          </div>
        </td>
      </tr>
    `).join('');
  }

  async function onAddCurriculum(e) {
    e.preventDefault();
    const name = (currName.value || '').trim();
    const description = (currDesc.value || '').trim();

    if (!name) {
      currStatus.textContent = 'Please enter curriculum name.';
      return;
    }

    currStatus.textContent = 'Adding...';

    try {
      const { error } = await window.supabaseClient.from('curriculum').insert({
        school_id: window.currentSchoolId || null,
        name,
        description: description || null
      });

      if (error) throw error;

      currName.value = '';
      currDesc.value = '';
      currStatus.textContent = 'Curriculum added successfully.';
      setTimeout(() => { currStatus.textContent = ''; }, 3000);
      await loadData();
    } catch (err) {
      console.error('Add failed:', err);
      currStatus.textContent = `Error: ${err.message || err}`;
    }
  }

  async function onAddSubject(e) {
    e.preventDefault();
    const curriculumId = (subjCurr.value || '').trim();
    const name = (subjName.value || '').trim();
    const description = (subjDesc.value || '').trim();

    if (!curriculumId) {
      subjStatus.textContent = 'Please select a curriculum.';
      return;
    }

    if (!name) {
      subjStatus.textContent = 'Please enter subject name.';
      return;
    }

    subjStatus.textContent = 'Adding...';

    try {
      const { error } = await window.supabaseClient.from('subject').insert({
        school_id: window.currentSchoolId || null,
        curriculum_id: curriculumId,
        name,
        description: description || null
      });

      if (error) throw error;

      subjCurr.value = '';
      subjName.value = '';
      subjDesc.value = '';
      subjStatus.textContent = 'Subject added successfully.';
      setTimeout(() => { subjStatus.textContent = ''; }, 3000);
      await loadData();
    } catch (err) {
      console.error('Add failed:', err);
      subjStatus.textContent = `Error: ${err.message || err}`;
    }
  }

  async function onAddSession(e) {
    e.preventDefault();
    const sessionValue = (sessValue.value || '').trim();
    const description = (sessDesc.value || '').trim();

    if (!sessionValue) {
      sessStatus.textContent = 'Please enter session value.';
      return;
    }

    sessStatus.textContent = 'Adding...';

    try {
      const { error } = await window.supabaseClient.from('session').insert({
        school_id: window.currentSchoolId || null,
        session_value: sessionValue,
        description: description || null
      });

      if (error) throw error;

      sessValue.value = '';
      sessDesc.value = '';
      sessStatus.textContent = 'Session added successfully.';
      setTimeout(() => { sessStatus.textContent = ''; }, 3000);
      await loadData();
    } catch (err) {
      console.error('Add failed:', err);
      sessStatus.textContent = `Error: ${err.message || err}`;
    }
  }

  window.deleteCurriculum = async function(id) {
    if (!confirm('Are you sure? This will delete the curriculum and all its subjects.')) return;

    try {
      const { error } = await window.supabaseClient.from('curriculum').delete().eq('id', id);
      if (error) throw error;
      await loadData();
    } catch (err) {
      alert(`Delete failed: ${err.message || err}`);
    }
  };

  window.deleteSubject = async function(id) {
    if (!confirm('Are you sure you want to delete this subject?')) return;

    try {
      const { error } = await window.supabaseClient.from('subject').delete().eq('id', id);
      if (error) throw error;
      await loadData();
    } catch (err) {
      alert(`Delete failed: ${err.message || err}`);
    }
  };

  window.deleteSession = async function(id) {
    if (!confirm('Are you sure you want to delete this session?')) return;

    try {
      const { error } = await window.supabaseClient.from('session').delete().eq('id', id);
      if (error) throw error;
      await loadData();
    } catch (err) {
      alert(`Delete failed: ${err.message || err}`);
    }
  };

  window.toggleCurriculum = function(itemId) {
    const content = document.getElementById(itemId);
    const header = content.previousElementSibling;
    const caret = header.querySelector('.curriculum-caret');
    
    if (content.classList.contains('open')) {
      content.classList.remove('open');
      header.classList.remove('expanded');
      caret.classList.remove('open');
    } else {
      content.classList.add('open');
      header.classList.add('expanded');
      caret.classList.add('open');
    }
  };

  function escapeHtml(str) {
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/\"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }
});
