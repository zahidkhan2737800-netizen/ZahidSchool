document.addEventListener('DOMContentLoaded', () => {
  const classSelect = document.getElementById('classSelect');
  const newColName = document.getElementById('newColName');
  const addColBtn = document.getElementById('addColBtn');
  const addRowBtn = document.getElementById('addRowBtn');
  const saveBtn = document.getElementById('saveBtn');
  const tableHead = document.getElementById('tableHead');
  const tableBody = document.getElementById('tableBody');
  const statusText = document.getElementById('statusText');

  let classes = [];
  let selectedClassId = '';
  let grid = {
    columns: ['Topic', 'Reading', 'Writing', 'Dictation'],
    rows: [
      ['Chapter 1', '', '', ''],
      ['', '', '', '']
    ]
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
    saveBtn.addEventListener('click', saveCurrentGrid);
    classSelect.addEventListener('change', onClassChange);

    await loadClasses();
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

      if (!classes.length) {
        statusText.textContent = 'No classes found. Add classes first in Manage Classes.';
        renderTable();
        return;
      }

      selectedClassId = classes[0].id;
      classSelect.value = selectedClassId;
      loadGridForClass(selectedClassId);
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
      return;
    }

    loadGridForClass(selectedClassId);
    statusText.textContent = 'Class changed. Data loaded.';
  }

  function onAddColumn() {
    const name = (newColName.value || '').trim();
    if (!name) {
      statusText.textContent = 'Enter a column name first.';
      return;
    }

    grid.columns.push(name);
    grid.rows = grid.rows.map(r => {
      const next = Array.isArray(r) ? r.slice() : [];
      next.push('');
      return next;
    });

    newColName.value = '';
    renderTable();
    statusText.textContent = `Column added: ${name}`;
  }

  function onAddRow() {
    const row = Array.from({ length: grid.columns.length }, () => '');
    grid.rows.push(row);
    renderTable();
    statusText.textContent = 'Row added.';
  }

  function onRemoveColumn(colIndex) {
    if (colIndex === 0) {
      statusText.textContent = 'Topic column cannot be removed.';
      return;
    }

    const name = grid.columns[colIndex];
    grid.columns.splice(colIndex, 1);
    grid.rows = grid.rows.map(r => r.filter((_, i) => i !== colIndex));
    renderTable();
    statusText.textContent = `Column removed: ${name}`;
  }

  function onRemoveRow(rowIndex) {
    if (grid.rows.length <= 1) {
      statusText.textContent = 'At least one row is required.';
      return;
    }

    grid.rows.splice(rowIndex, 1);
    renderTable();
    statusText.textContent = 'Row removed.';
  }

  function resetGrid() {
    grid = {
      columns: ['Topic', 'Reading', 'Writing', 'Dictation'],
      rows: [
        ['Chapter 1', '', '', ''],
        ['', '', '', '']
      ]
    };
  }

  function storageKey(classId) {
    const sid = window.currentSchoolId ? String(window.currentSchoolId) : 'global';
    return `syllabus_progress_${sid}_${classId}`;
  }

  function loadGridForClass(classId) {
    const key = storageKey(classId);
    const raw = localStorage.getItem(key);

    if (!raw) {
      resetGrid();
      renderTable();
      return;
    }

    try {
      const parsed = JSON.parse(raw);
      if (!parsed || !Array.isArray(parsed.columns) || !Array.isArray(parsed.rows)) {
        throw new Error('Invalid data format');
      }

      const columns = parsed.columns.filter(c => String(c || '').trim());
      const normalizedCols = columns.length ? columns : ['Topic', 'Reading', 'Writing', 'Dictation'];
      const rows = parsed.rows.map(r => {
        const next = Array.isArray(r) ? r.slice(0, normalizedCols.length) : [];
        while (next.length < normalizedCols.length) next.push('');
        return next.map(v => String(v ?? ''));
      });

      grid = {
        columns: normalizedCols,
        rows: rows.length ? rows : [Array.from({ length: normalizedCols.length }, () => '')]
      };
    } catch (e) {
      console.warn('Invalid saved grid, reset.', e);
      resetGrid();
    }

    renderTable();
  }

  function saveCurrentGrid() {
    if (!selectedClassId) {
      statusText.textContent = 'Select class before saving.';
      return;
    }

    syncTableIntoGrid();

    try {
      const key = storageKey(selectedClassId);
      localStorage.setItem(key, JSON.stringify(grid));
      statusText.textContent = 'Saved successfully.';
    } catch (e) {
      console.error('Save failed', e);
      statusText.textContent = `Save failed: ${e.message || e}`;
    }
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
  }

  function renderHeader() {
    const tr = document.createElement('tr');

    grid.columns.forEach((name, i) => {
      const th = document.createElement('th');
      if (i === 0) th.classList.add('col-sticky');

      const canDelete = i > 0;
      th.innerHTML = `
        <div>
          <span class="th-label">${escapeHtml(name)}</span>
          <span class="th-actions">
            ${canDelete ? `<button class="mini-btn danger" data-remove-col="${i}" type="button">x</button>` : ''}
          </span>
        </div>
      `;
      tr.appendChild(th);
    });

    const thAction = document.createElement('th');
    thAction.innerHTML = '<div><span class="th-label">Row</span></div>';
    tr.appendChild(thAction);

    tableHead.innerHTML = '';
    tableHead.appendChild(tr);

    tableHead.querySelectorAll('button[data-remove-col]').forEach(btn => {
      btn.addEventListener('click', () => onRemoveColumn(Number(btn.dataset.removeCol)));
    });
  }

  function renderBody() {
    tableBody.innerHTML = '';

    grid.rows.forEach((row, rowIndex) => {
      const tr = document.createElement('tr');

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

      const tdAction = document.createElement('td');
      tdAction.style.padding = '6px';
      tdAction.innerHTML = `<button type="button" class="mini-btn danger" data-remove-row="${rowIndex}">Delete</button>`;
      tr.appendChild(tdAction);

      tableBody.appendChild(tr);
    });

    tableBody.querySelectorAll('button[data-remove-row]').forEach(btn => {
      btn.addEventListener('click', () => onRemoveRow(Number(btn.dataset.removeRow)));
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
    saveTimer = setTimeout(() => {
      if (!selectedClassId) return;
      syncTableIntoGrid();
      try {
        localStorage.setItem(storageKey(selectedClassId), JSON.stringify(grid));
        statusText.textContent = 'Auto-saved.';
      } catch (e) {
        statusText.textContent = 'Auto-save failed.';
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
