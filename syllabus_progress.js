document.addEventListener('DOMContentLoaded', () => {
  const classSelect = document.getElementById('classSelect');
  const sessionInput = document.getElementById('sessionInput');
  const classButtons = document.getElementById('classButtons');
  const activeClassLabel = document.getElementById('activeClassLabel');
  const addColBtn = document.getElementById('addColBtn');
  const addRowBtn = document.getElementById('addRowBtn');
  const deleteModeBtn = document.getElementById('deleteModeBtn');
  const tableHead = document.getElementById('tableHead');
  const tableBody = document.getElementById('tableBody');
  const statusText = document.getElementById('statusText');

  let classes = [];
  let sessions = [];
  let selectedClassId = '';
  let currentSession = '2025-26';
  let deleteMode = false;
  let grid = {
    columns: [],
    rows: []
  };

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
    addColBtn.addEventListener('click', onAddColumn);
    addRowBtn.addEventListener('click', onAddRow);
    deleteModeBtn.addEventListener('click', toggleDeleteMode);
    classSelect.addEventListener('change', onClassChange);
    sessionInput.addEventListener('change', onSessionChange);

    await loadSessions();
    await loadClasses();
  }

  async function loadSessions() {
    try {
      let q = window.supabaseClient
        .from('session')
        .select('session_value')
        .order('session_value', { ascending: false });

      if (window.currentSchoolId) q = q.eq('school_id', window.currentSchoolId);

      const { data, error } = await q;
      if (error) throw error;

      sessions = Array.isArray(data) ? data.map(s => s.session_value) : [];
      sessionInput.innerHTML = '';

      if (sessions.length === 0) {
        const opt = document.createElement('option');
        opt.value = '2025-26';
        opt.textContent = '2025-26 (default)';
        sessionInput.appendChild(opt);
        sessions = ['2025-26'];
      } else {
        sessions.forEach(session => {
          const opt = document.createElement('option');
          opt.value = session;
          opt.textContent = session;
          sessionInput.appendChild(opt);
        });
      }

      // Set to first session
      sessionInput.value = sessions[0] || '2025-26';
      currentSession = sessionInput.value;
    } catch (err) {
      console.error('Sessions load failed:', err);
      const opt = document.createElement('option');
      opt.value = '2025-26';
      opt.textContent = '2025-26';
      sessionInput.appendChild(opt);
      currentSession = '2025-26';
    }
  }

  async function loadClasses() {
    statusText.textContent = 'Loading classes...';

    try {
      let q = window.supabaseClient
        .from('classes')
        .select('id, class_name, section')
        .order('class_name', { ascending: true })
        .order('section', { ascending: true });

      if (window.currentSchoolId) q = q.eq('school_id', window.currentSchoolId);

      const { data, error } = await q;
      if (error) throw error;

      classes = Array.isArray(data) ? data : [];
      classSelect.innerHTML = '<option value="">Select class...</option>';

      classes.forEach(c => {
        const opt = document.createElement('option');
        opt.value = c.id;
        opt.textContent = `${c.class_name} - ${c.section}`;
        classSelect.appendChild(opt);
      });

      renderClassButtons();

      if (!classes.length) {
        statusText.textContent = 'No classes found. Add classes first in Manage Classes.';
        renderTable();
        activeClassLabel.value = 'No class selected';
        return;
      }

      selectedClassId = classes[0].id;
      classSelect.value = selectedClassId;
      loadGridForClass(selectedClassId);
      syncActiveClassLabel();
      renderClassButtons();
      statusText.textContent = 'Ready. You can edit cells, add rows, and add columns.';
    } catch (err) {
      console.error('Classes load failed:', err);
      statusText.textContent = `Could not load classes: ${err.message || err}`;
      renderTable();
    }
  }

  function onClassChange() {
    selectedClassId = classSelect.value || '';
    if (!selectedClassId) {
      resetGrid();
      renderTable();
      statusText.textContent = 'Select a class to start tracking syllabus progress.';
      activeClassLabel.value = 'No class selected';
      renderClassButtons();
      return;
    }

    loadGridForClass(selectedClassId);
    syncActiveClassLabel();
    renderClassButtons();
    statusText.textContent = 'Class changed. Data loaded.';
  }

  function onSessionChange() {
    const newSession = (sessionInput.value || '').trim() || '2025-26';
    if (newSession === currentSession) return;
    
    currentSession = newSession;
    
    if (selectedClassId) {
      loadGridForClass(selectedClassId);
      statusText.textContent = `Session changed to ${currentSession}. Data loaded.`;
    }
  }

  function renderClassButtons() {
    classButtons.innerHTML = '';
    classes.forEach(c => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = `class-btn ${String(c.id) === String(selectedClassId) ? 'active' : ''}`;
      btn.textContent = `${c.class_name} ${c.section}`.trim();
      btn.addEventListener('click', () => {
        selectedClassId = c.id;
        classSelect.value = c.id;
        loadGridForClass(c.id);
        syncActiveClassLabel();
        renderClassButtons();
        statusText.textContent = `Class selected: ${btn.textContent}`;
      });
      classButtons.appendChild(btn);
    });
  }

  function syncActiveClassLabel() {
    const c = classes.find(x => String(x.id) === String(selectedClassId));
    activeClassLabel.value = c ? `Selected Class: ${c.class_name} - ${c.section}` : 'No class selected';
  }

  function onAddColumn() {
    if (!selectedClassId) {
      statusText.textContent = 'Select a class first.';
      return;
    }

    const name = `Column ${grid.columns.length + 1}`;

    grid.columns.push(name);
    grid.rows = grid.rows.map(r => {
      const next = Array.isArray(r) ? r.slice() : [];
      next.push('');
      return next;
    });

    renderTable();
    debounceAutoSave();
    statusText.textContent = `Column added: ${name}`;
  }

  function onAddRow() {
    if (!selectedClassId) {
      statusText.textContent = 'Select a class first.';
      return;
    }

    if (grid.columns.length === 0) {
      statusText.textContent = 'Add at least one column first.';
      return;
    }

    const row = Array.from({ length: grid.columns.length }, () => '');
    grid.rows.push(row);
    renderTable();
    debounceAutoSave();
    statusText.textContent = 'Row added.';
  }

  function onRemoveColumn(colIndex) {
    const name = grid.columns[colIndex];
    grid.columns.splice(colIndex, 1);
    grid.rows = grid.rows.map(r => r.filter((_, i) => i !== colIndex));
    renderTable();
    debounceAutoSave();
    statusText.textContent = `Column removed: ${name}`;
  }

  function onRemoveRow(rowIndex) {
    if (grid.rows.length <= 1) {
      statusText.textContent = 'At least one row is required.';
      return;
    }

    grid.rows.splice(rowIndex, 1);
    renderTable();
    debounceAutoSave();
    statusText.textContent = 'Row removed.';
  }

  function toggleDeleteMode() {
    deleteMode = !deleteMode;
    deleteModeBtn.classList.toggle('active', deleteMode);
    statusText.textContent = deleteMode
      ? 'Delete mode ON: click a column title to delete column, or click a row to delete row.'
      : 'Delete mode OFF.';
    renderTable();
  }

  function resetGrid() {
    grid = {
      columns: [],
      rows: []
    };
  }

  function storageKey(classId, session) {
    const sid = window.currentSchoolId ? String(window.currentSchoolId) : 'global';
    return `syllabus_progress_${sid}_${classId}_${session}`;
  }

  async function loadGridForClass(classId) {
    resetGrid();
    
    if (!window.currentSchoolId) {
      renderTable();
      return;
    }

    try {
      // Try to load from Supabase with current session
      const { data, error } = await window.supabaseClient
        .from('syllabus_progress')
        .select('columns_json, rows_json')
        .eq('school_id', window.currentSchoolId)
        .eq('class_id', classId)
        .eq('month_key', currentSession)
        .maybeSingle();

      if (error && error.code !== 'PGRST116') {
        throw error;
      }

      if (data) {
        const columns = Array.isArray(data.columns_json) ? data.columns_json : [];
        const rows = Array.isArray(data.rows_json) ? data.rows_json : [];

        const normalizedCols = columns.filter(c => String(c || '').trim());
        const normalizedRows = rows.map(r => {
          const next = Array.isArray(r) ? r.slice(0, normalizedCols.length) : [];
          while (next.length < normalizedCols.length) next.push('');
          return next.map(v => String(v ?? ''));
        });

        grid = {
          columns: normalizedCols.length ? normalizedCols : [],
          rows: normalizedRows.length ? normalizedRows : [Array.from({ length: normalizedCols.length }, () => '')]
        };
      } else {
        // Fallback: try localStorage
        const key = storageKey(classId, currentSession);
        const raw = localStorage.getItem(key);
        if (raw) {
          const parsed = JSON.parse(raw);
          if (parsed && Array.isArray(parsed.columns) && Array.isArray(parsed.rows)) {
            grid = parsed;
          }
        }
      }
    } catch (err) {
      console.warn('Load from Supabase failed, trying localStorage:', err);
      // Fallback to localStorage
      const key = storageKey(classId, currentSession);
      const raw = localStorage.getItem(key);
      if (raw) {
        try {
          const parsed = JSON.parse(raw);
          if (parsed && Array.isArray(parsed.columns) && Array.isArray(parsed.rows)) {
            grid = parsed;
          }
        } catch (e) {
          console.warn('Invalid saved grid, reset.', e);
        }
      }
    }

    renderTable();
  }

  function syncTableIntoGrid() {
    const rows = Array.from(tableBody.querySelectorAll('tr'));
    grid.rows = rows.map(tr => {
      const cells = Array.from(tr.querySelectorAll('td[data-col-index]'));
      return cells.map(td => {
        const box = td.querySelector('[contenteditable="true"]');
        return (box?.innerText || '').trim();
      });
    });

    if (!grid.rows.length) {
      grid.rows = [Array.from({ length: grid.columns.length }, () => '')];
    }
  }

  function renderTable() {
    renderHeader();
    renderBody();
    attachCellListeners();
    applyAutoColumnWidths();
  }

  function applyAutoColumnWidths() {
    if (!grid.columns.length) return;

    const headCells = Array.from(tableHead.querySelectorAll('th'));
    grid.columns.forEach((_, colIndex) => {
      const headEl = headCells[colIndex];
      if (!headEl) return;

      const headerText = String(grid.columns[colIndex] || '').trim();
      let maxChars = Math.max(4, headerText.length);

      const bodyCells = Array.from(tableBody.querySelectorAll(`td[data-col-index="${colIndex}"] [contenteditable="true"]`));
      bodyCells.forEach(cell => {
        const len = String(cell.textContent || '').trim().length;
        if (len > maxChars) maxChars = len;
      });

      // Ultra-compact width formula based on text size with tighter bounds.
      let px = Math.round(maxChars * 7 + 14);
      if (colIndex === 0) {
        px = Math.max(78, Math.min(170, px));
      } else {
        px = Math.max(34, Math.min(120, px));
      }

      headEl.style.width = `${px}px`;
      headEl.style.minWidth = `${px}px`;

      tableBody.querySelectorAll(`td[data-col-index="${colIndex}"]`).forEach(td => {
        td.style.width = `${px}px`;
        td.style.minWidth = `${px}px`;
      });
    });
  }

  function renderHeader() {
    const tr = document.createElement('tr');

    grid.columns.forEach((name, i) => {
      const th = document.createElement('th');
      if (i === 0) th.classList.add('col-sticky');

      th.innerHTML = `
        <div>
          <span class="th-label th-name-edit" contenteditable="true" data-col-name="${i}">${escapeHtml(name)}</span>
          <span class="th-actions"></span>
        </div>
      `;

      if (deleteMode) {
        th.classList.add('delete-armed');
        th.title = `Delete column: ${name}`;
        th.addEventListener('click', (ev) => {
          const target = ev.target;
          if (target && target.closest('[contenteditable="true"]')) return;
          onRemoveColumn(i);
        });
      }

      tr.appendChild(th);
    });

    tableHead.innerHTML = '';
    tableHead.appendChild(tr);

    tableHead.querySelectorAll('[data-col-name]').forEach(el => {
      el.addEventListener('blur', () => {
        const idx = Number(el.getAttribute('data-col-name'));
        const val = String(el.textContent || '').trim();
        if (!Number.isFinite(idx)) return;
        if (!val) {
          el.textContent = grid.columns[idx] || '';
          return;
        }
        grid.columns[idx] = val;
        debounceAutoSave();
      });
      el.addEventListener('keydown', (ev) => {
        if (ev.key === 'Enter') {
          ev.preventDefault();
          ev.target.blur();
        }
      });
    });
  }

  function renderBody() {
    tableBody.innerHTML = '';

    grid.rows.forEach((row, rowIndex) => {
      const tr = document.createElement('tr');
      if (deleteMode) {
        tr.classList.add('delete-armed');
        tr.title = `Delete row ${rowIndex + 1}`;
        tr.addEventListener('click', () => onRemoveRow(rowIndex));
      }

      grid.columns.forEach((_, colIndex) => {
        const td = document.createElement('td');
        td.dataset.colIndex = String(colIndex);
        if (colIndex === 0) td.classList.add('col-sticky');

        const cell = document.createElement('div');
        cell.contentEditable = 'true';
        cell.spellcheck = false;
        cell.textContent = row[colIndex] ?? '';

        td.appendChild(cell);
        tr.appendChild(td);
      });

      tableBody.appendChild(tr);
    });
  }

  function attachCellListeners() {
    tableBody.querySelectorAll('[contenteditable="true"]').forEach(cell => {
      cell.addEventListener('input', () => {
        if (!selectedClassId) return;
        debounceAutoSave();
      });
    });
  }

  let saveTimer = null;
  function debounceAutoSave() {
    if (saveTimer) clearTimeout(saveTimer);
    saveTimer = setTimeout(async () => {
      if (!selectedClassId) return;
      syncTableIntoGrid();
      try {
        // Save to localStorage first
        const key = storageKey(selectedClassId, currentSession);
        localStorage.setItem(key, JSON.stringify(grid));

        // Save to Supabase if school is set
        if (window.currentSchoolId) {
          await window.supabaseClient
            .from('syllabus_progress')
            .upsert({
              school_id: window.currentSchoolId,
              class_id: selectedClassId,
              month_key: currentSession,
              columns_json: grid.columns,
              rows_json: grid.rows,
              updated_by: window.currentUserId || null
            }, {
              onConflict: 'school_id,class_id,month_key'
            });
        }
        statusText.textContent = 'Auto-saved.';
      } catch (e) {
        console.error('Auto-save failed:', e);
        statusText.textContent = 'Auto-save failed (saved to browser backup).';
      }
    }, 450);
  }

  function escapeHtml(str) {
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/\"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }
});
