document.addEventListener('DOMContentLoaded', () => {
  const monthPicker = document.getElementById('monthPicker');
  const classFilter = document.getElementById('classFilter');
  const absentCriteria = document.getElementById('absentCriteria');
  const templateText = document.getElementById('templateText');
  const generateBtn = document.getElementById('generateBtn');
  const previewArea = document.getElementById('previewArea');
  const statusText = document.getElementById('statusText');

  let students = [];

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
    const now = new Date();
    monthPicker.value = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

    generateBtn.addEventListener('click', generateCertificates);
    classFilter.addEventListener('change', () => {
      if (previewArea.innerHTML && !previewArea.classList.contains('empty')) {
        generateCertificates();
      }
    });

    await loadCoreData();
  }

  async function loadCoreData() {
    statusText.textContent = 'Loading students...';

    try {
      let stuQ = window.supabaseClient
        .from('admissions')
        .select('id, roll_number, full_name, father_name, applying_for_class, status')
        .in('status', ['Active', 'active'])
        .order('roll_number', { ascending: true });

      if (window.currentSchoolId) {
        stuQ = stuQ.eq('school_id', window.currentSchoolId);
      }

      const { data: stuData, error: stuErr } = await stuQ;
      if (stuErr) throw stuErr;

      students = Array.isArray(stuData) ? stuData : [];

      buildClassFilter();
      statusText.textContent = `Loaded ${students.length} active students.`;
    } catch (err) {
      console.error(err);
      statusText.textContent = `Error: ${err.message || err}`;
      previewArea.className = 'empty';
      previewArea.textContent = 'Could not load data.';
    }
  }

  async function fetchMonthAttendance(startDate, endDate) {
    const PAGE = 1000;
    let allRows = [];
    let from = 0;

    while (true) {
      let attQ = window.supabaseClient
        .from('attendance')
        .select('student_id, status')
        .gte('date', startDate)
        .lte('date', endDate)
        .range(from, from + PAGE - 1);

      if (window.currentSchoolId) {
        attQ = attQ.eq('school_id', window.currentSchoolId);
      }

      const { data, error } = await attQ;
      if (error) throw error;

      const batch = data || [];
      allRows = allRows.concat(batch);

      if (batch.length < PAGE) break; // last page
      from += PAGE;
    }

    const map = new Map();
    allRows.forEach(r => {
      if (String(r.status || '').toLowerCase() !== 'absent') return;
      const key = String(r.student_id || '');
      if (key) map.set(key, (map.get(key) || 0) + 1);
    });
    return map;
  }

  function buildClassFilter() {
    const prev = classFilter.value;
    const classes = [...new Set(students.map(s => String(s.applying_for_class || '').trim()).filter(Boolean))]
      .sort((a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' }));

    classFilter.innerHTML = '<option value="__ALL__">All Classes</option>';
    classes.forEach(c => {
      const opt = document.createElement('option');
      opt.value = c;
      opt.textContent = c;
      classFilter.appendChild(opt);
    });

    if ([...classFilter.options].some(o => o.value === prev)) {
      classFilter.value = prev;
    }
  }

  function parseEligibleValues(raw) {
    return new Set(
      String(raw || '')
        .split(',')
        .map(v => v.trim())
        .filter(v => /^\d+$/.test(v))
        .map(v => Number(v))
    );
  }

  function getMonthRange(yyyyMm) {
    const [yy, mm] = String(yyyyMm || '').split('-').map(Number);
    const start = new Date(yy, (mm || 1) - 1, 1);
    const end = new Date(yy, (mm || 1), 0);
    return {
      start: start.toISOString().slice(0, 10),
      end: end.toISOString().slice(0, 10),
      label: start.toLocaleString('en-US', { month: 'long', year: 'numeric' })
    };
  }

  function buildCertificateHtml(s, absentCount, monthLabel, template) {
    const appText = String(template || '')
      .replaceAll('{NAME}', s.full_name || 'Student')
      .replaceAll('{MONTH_LABEL}', monthLabel)
      .replaceAll('{ABSENT_DAYS}', String(absentCount));

    return `
      <div class="certificate">
        <div class="cert-content">
          <h2 class="cert-title">Certificate of Appreciation</h2>
          <div class="cert-sub">Presented for Attendance Excellence</div>
          <div class="student-name">${escapeHtml(s.full_name || '—')}</div>
          <div class="app-text">${escapeHtml(appText)}</div>

          <div class="meta-grid">
            <div><b>Father Name:</b> ${escapeHtml(s.father_name || '—')}</div>
            <div><b>Roll No:</b> ${escapeHtml(String(s.roll_number || '—'))}</div>
            <div><b>Class:</b> ${escapeHtml(s.applying_for_class || '—')}</div>
            <div><b>Month:</b> ${escapeHtml(monthLabel)}</div>
            <div><b>Absent Days:</b> ${absentCount}</div>
            <div><b>Status:</b> Appreciated</div>
          </div>
        </div>
      </div>
    `;
  }

  async function generateCertificates() {
    const monthVal = monthPicker.value;
    if (!monthVal) {
      statusText.textContent = 'Please choose a month first.';
      return;
    }

    const eligible = parseEligibleValues(absentCriteria.value);
    if (eligible.size === 0) {
      statusText.textContent = 'Please enter absent day values, e.g. 0,1,2.';
      return;
    }

    const classVal = classFilter.value;
    const { start, end, label } = getMonthRange(monthVal);

    statusText.textContent = 'Counting absents for selected month...';
    let absMap;
    try {
      absMap = await fetchMonthAttendance(start, end);
    } catch (err) {
      console.error(err);
      statusText.textContent = `Error loading attendance: ${err.message || err}`;
      return;
    }

    const selectedStudents = students.filter(s => {
      if (classVal !== '__ALL__' && String(s.applying_for_class || '') !== classVal) return false;
      const absentCount = absMap.get(String(s.id)) || 0;
      return eligible.has(absentCount);
    });

    selectedStudents.sort((a, b) => {
      const aClass = String(a.applying_for_class || '');
      const bClass = String(b.applying_for_class || '');
      const cc = aClass.localeCompare(bClass, undefined, { numeric: true, sensitivity: 'base' });
      if (cc !== 0) return cc;
      return String(a.roll_number || '').localeCompare(String(b.roll_number || ''), undefined, { numeric: true, sensitivity: 'base' });
    });

    if (!selectedStudents.length) {
      previewArea.className = 'empty';
      previewArea.textContent = 'No students matched these criteria for selected month.';
      statusText.textContent = 'No certificates generated.';
      return;
    }

    const tpl = templateText.value || '';
    const blocks = [];

    for (let i = 0; i < selectedStudents.length; i += 2) {
      const s1 = selectedStudents[i];
      const s2 = selectedStudents[i + 1];
      const c1 = buildCertificateHtml(s1, absMap.get(String(s1.id)) || 0, label, tpl);
      let c2 = '';

      if (s2) {
        c2 = buildCertificateHtml(s2, absMap.get(String(s2.id)) || 0, label, tpl);
      } else {
        c2 = '';
      }

      blocks.push(`
        <div class="print-sheet">
          ${c1}
          ${c2}
        </div>
      `);
    }

    previewArea.className = '';
    previewArea.innerHTML = blocks.join('');
    statusText.textContent = `Generated ${selectedStudents.length} certificate(s) for ${label}.`;
  }

  function escapeHtml(str) {
    return String(str || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }
});