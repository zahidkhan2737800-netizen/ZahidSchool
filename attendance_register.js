const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

const classSelect = document.getElementById('classSelect');
const monthSelect = document.getElementById('monthSelect');
const yearSelect = document.getElementById('yearSelect');
const searchInput = document.getElementById('searchInput');
const loadBtn = document.getElementById('loadBtn');
const meta = document.getElementById('meta');
const tableHead = document.getElementById('tableHead');
const tableBody = document.getElementById('tableBody');

let currentSchoolId = null;
let students = [];
let attendanceByKey = new Map();

function applySchoolScope(query) {
  return currentSchoolId ? query.eq('school_id', currentSchoolId) : query;
}

async function waitForAuthContext(timeoutMs = 10000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (window.authReady === true && window.supabaseClient) {
      currentSchoolId = window.currentSchoolId || null;
      return;
    }
    await new Promise(r => setTimeout(r, 80));
  }
  currentSchoolId = window.currentSchoolId || null;
}

function daysInMonth(year, monthIdx) {
  return new Date(year, monthIdx + 1, 0).getDate();
}

function statusToCode(status) {
  const s = String(status || '').toLowerCase();
  if (s === 'present') return 'P';
  if (s === 'absent') return 'A';
  if (s === 'holiday') return 'H';
  if (s === 'late') return 'L';
  return '-';
}

function codeToStatus(code) {
  const c = String(code || '').toUpperCase();
  if (c === 'P') return 'Present';
  if (c === 'A') return 'Absent';
  if (c === 'H') return 'Holiday';
  if (c === 'L') return 'Late';
  return null;
}

function toneClassForCode(code) {
  const c = String(code || '').toUpperCase();
  if (c === 'P') return 'tone-p';
  if (c === 'A') return 'tone-a';
  if (c === 'H') return 'tone-h';
  if (c === 'L') return 'tone-l';
  return '';
}

function escapeHtml(str) {
  return String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/\"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

async function init() {
  await waitForAuthContext();

  const now = new Date();
  monthSelect.innerHTML = MONTHS.map((m, i) => `<option value="${i}">${m}</option>`).join('');
  monthSelect.value = String(now.getMonth());

  const ys = [];
  for (let y = now.getFullYear() - 3; y <= now.getFullYear() + 1; y++) ys.push(y);
  yearSelect.innerHTML = ys.map(y => `<option value="${y}">${y}</option>`).join('');
  yearSelect.value = String(now.getFullYear());

  loadBtn.addEventListener('click', loadRegister);
  monthSelect.addEventListener('change', loadRegister);
  yearSelect.addEventListener('change', loadRegister);
  classSelect.addEventListener('change', loadRegister);
  searchInput.addEventListener('input', renderTable);
  tableBody.addEventListener('change', onCellStatusChange);

  await loadClassOptions();
  await loadRegister();
}

async function loadClassOptions() {
  try {
    let q = applySchoolScope(
      window.supabaseClient
        .from('admissions')
        .select('applying_for_class, status')
        .in('status', ['Active', 'active'])
    );

    const { data, error } = await q;
    if (error) throw error;

    const classes = Array.from(new Set((data || [])
      .map(r => String(r.applying_for_class || '').trim())
      .filter(Boolean)))
      .sort((a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' }));

    classSelect.innerHTML = '<option value="">Select class...</option>' + classes.map(c => `<option value="${escapeHtml(c)}">${escapeHtml(c)}</option>`).join('');

    if (classes.length) classSelect.value = classes[0];
  } catch (e) {
    console.error('Failed to load classes', e);
    classSelect.innerHTML = '<option value="">Error loading classes</option>';
    meta.textContent = 'Could not load classes.';
  }
}

async function loadRegister() {
  const className = classSelect.value;
  if (!className) {
    students = [];
    attendanceByKey = new Map();
    renderTable();
    meta.textContent = 'Select a class to view attendance register.';
    return;
  }

  const monthIdx = Number(monthSelect.value);
  const year = Number(yearSelect.value);
  const monthDays = daysInMonth(year, monthIdx);
  const fromDate = `${year}-${String(monthIdx + 1).padStart(2, '0')}-01`;
  const toDate = `${year}-${String(monthIdx + 1).padStart(2, '0')}-${String(monthDays).padStart(2, '0')}`;

  meta.textContent = 'Loading register...';

  try {
    let sq = applySchoolScope(
      window.supabaseClient
        .from('admissions')
        .select('id, roll_number, full_name, father_name, applying_for_class, status')
        .eq('applying_for_class', className)
        .in('status', ['Active', 'active'])
    );

    const { data: sData, error: sErr } = await sq;
    if (sErr) throw sErr;

    students = (sData || []).sort((a, b) => String(a.roll_number || '').localeCompare(String(b.roll_number || ''), undefined, { numeric: true }));

    const ids = students.map(s => s.id);
    attendanceByKey = new Map();

    if (ids.length) {
      let aq = applySchoolScope(
        window.supabaseClient
          .from('attendance')
          .select('student_id, date, status')
          .in('student_id', ids)
          .gte('date', fromDate)
          .lte('date', toDate)
      );

      const { data: aData, error: aErr } = await aq;
      if (aErr) throw aErr;

      (aData || []).forEach(r => {
        const day = Number(String(r.date).slice(8, 10));
        if (!Number.isFinite(day)) return;
        const key = `${r.student_id}_${day}`;
        attendanceByKey.set(key, statusToCode(r.status));
      });
    }

    renderTable();
    meta.textContent = `Class: ${className} | Month: ${MONTHS[monthIdx]} ${year} | Students: ${students.length}`;
  } catch (e) {
    console.error('Load register failed', e);
    meta.textContent = `Load failed: ${e.message || e}`;
    students = [];
    attendanceByKey = new Map();
    renderTable();
  }
}

function renderTable() {
  const className = classSelect.value;
  const monthIdx = Number(monthSelect.value);
  const year = Number(yearSelect.value);
  const monthDays = daysInMonth(year, monthIdx);
  const q = String(searchInput.value || '').trim().toLowerCase();

  let filtered = students;
  if (q) {
    filtered = students.filter(s => {
      const roll = String(s.roll_number || '').toLowerCase();
      const name = String(s.full_name || '').toLowerCase();
      const father = String(s.father_name || '').toLowerCase();
      return roll.includes(q) || name.includes(q) || father.includes(q);
    });
  }

  let headHtml = '<tr>';
  headHtml += '<th class="sticky roll-col">Roll</th>';
  headHtml += '<th class="sticky-2">Name</th>';
  headHtml += '<th class="sticky-3">Father Name</th>';
  for (let d = 1; d <= monthDays; d++) {
    headHtml += `<th>${d}</th>`;
  }
  headHtml += '</tr>';
  tableHead.innerHTML = headHtml;

  if (!className || !filtered.length) {
    tableBody.innerHTML = `<tr><td colspan="${monthDays + 3}" style="padding:16px; text-align:center;">No students found for selected filters.</td></tr>`;
    return;
  }

  let bodyHtml = '';
  filtered.forEach(s => {
    bodyHtml += '<tr>';
    bodyHtml += `<td class="sticky roll-col">${escapeHtml(s.roll_number)}</td>`;
    bodyHtml += `<td class="sticky-2">${escapeHtml(s.full_name)}</td>`;
    bodyHtml += `<td class="sticky-3">${escapeHtml(s.father_name)}</td>`;

    for (let d = 1; d <= monthDays; d++) {
      const code = attendanceByKey.get(`${s.id}_${d}`) || '-';
      const toneClass = toneClassForCode(code);
      bodyHtml += `
        <td>
          <select class="att-dd ${toneClass}" data-sid="${s.id}" data-day="${d}">
            <option value="-" ${code === '-' ? 'selected' : ''}>-</option>
            <option value="P" ${code === 'P' ? 'selected' : ''}>P</option>
            <option value="A" ${code === 'A' ? 'selected' : ''}>A</option>
            <option value="H" ${code === 'H' ? 'selected' : ''}>H</option>
            <option value="L" ${code === 'L' ? 'selected' : ''}>L</option>
          </select>
        </td>`;
    }

    bodyHtml += '</tr>';
  });

  tableBody.innerHTML = bodyHtml;
}

async function onCellStatusChange(e) {
  const target = e.target;
  if (!(target instanceof HTMLSelectElement) || !target.classList.contains('att-dd')) return;

  const sid = target.getAttribute('data-sid');
  const day = Number(target.getAttribute('data-day'));
  const code = String(target.value || '-').toUpperCase();
  target.classList.remove('tone-p', 'tone-a', 'tone-h', 'tone-l');
  const tClass = toneClassForCode(code);
  if (tClass) target.classList.add(tClass);

  if (!sid || !Number.isFinite(day)) return;

  const monthIdx = Number(monthSelect.value);
  const year = Number(yearSelect.value);
  const date = `${year}-${String(monthIdx + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  const key = `${sid}_${day}`;

  target.disabled = true;
  try {
    if (code === '-') {
      let dq = window.supabaseClient
        .from('attendance')
        .delete()
        .eq('student_id', sid)
        .eq('date', date);
      if (currentSchoolId) dq = dq.eq('school_id', currentSchoolId);
      const { error } = await dq;
      if (error) throw error;
      attendanceByKey.delete(key);
    } else {
      const payload = {
        student_id: sid,
        date,
        status: codeToStatus(code)
      };
      if (currentSchoolId) payload.school_id = currentSchoolId;

      const { error } = await window.supabaseClient
        .from('attendance')
        .upsert(payload, { onConflict: 'student_id,date' });
      if (error) throw error;
      attendanceByKey.set(key, code);
    }

    meta.textContent = `Saved ${code} for day ${day}.`;
  } catch (err) {
    console.error('Attendance update failed', err);
    meta.textContent = `Save failed: ${err.message || err}`;
    target.value = attendanceByKey.get(key) || '-';
  } finally {
    target.disabled = false;
  }
}

init();
