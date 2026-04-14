document.addEventListener('DOMContentLoaded', async () => {
  const classList = document.getElementById('classList');
  const classStatus = document.getElementById('classStatus');
  const currSelect = document.getElementById('currSelect');
  const currStatus = document.getElementById('currStatus');
  const subjectsContainer = document.getElementById('subjectsContainer');
  const subjectsTitle = document.getElementById('subjectsTitle');
  const saveBtn = document.getElementById('saveBtn');
  const saveStatus = document.getElementById('saveStatus');

  let classes = [];
  let curricula = [];
  let subjects = [];
  let allAssignments = {}; // Track current assignments
  let selectedClassId = null;
  let selectedCurriculumId = null;

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
    await loadClasses();
    await loadCurricula();
  }

  async function loadClasses() {
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
      renderClasses();
    } catch (err) {
      console.error('Load classes failed:', err);
      classStatus.textContent = `Error: ${err.message}`;
    }
  }

  async function loadCurricula() {
    try {
      let q = window.supabaseClient
        .from('curriculum')
        .select('id, name')
        .order('name', { ascending: true });

      if (window.currentSchoolId) q = q.eq('school_id', window.currentSchoolId);

      const { data, error } = await q;
      if (error) throw error;

      curricula = Array.isArray(data) ? data : [];
      
      currSelect.innerHTML = '<option value="">-- Choose Curriculum --</option>';
      curricula.forEach(c => {
        const opt = document.createElement('option');
        opt.value = c.id;
        opt.textContent = c.name;
        currSelect.appendChild(opt);
      });
    } catch (err) {
      console.error('Load curricula failed:', err);
      currStatus.textContent = `Error: ${err.message}`;
    }
  }

  function renderClasses() {
    if (!classes.length) {
      classList.innerHTML = '<div class="empty-msg">No classes found.</div>';
      return;
    }

    classList.innerHTML = classes.map(c => `
      <button class="class-btn" onclick="selectClass('${c.id}', '${escapeAttr(c.class_name)} - ${escapeAttr(c.section)}')">
        ${c.class_name} ${c.section}
      </button>
    `).join('');
  }

  window.selectClass = async function(classId, className) {
    selectedClassId = classId;
    selectedCurriculumId = null;
    currSelect.value = '';
    
    // Update active button
    document.querySelectorAll('.class-btn').forEach(btn => {
      btn.classList.remove('active');
    });
    event.target.classList.add('active');

    classStatus.textContent = `Class selected: ${className}`;
    subjectsContainer.innerHTML = '<div class="empty-msg">Select a curriculum to see its subjects</div>';
    saveBtn.style.display = 'none';

    // Load current assignments for this class
    await loadClassSubjectAssignments(classId);
    await displayAssignmentTable(classId);
  };

  async function loadClassSubjectAssignments(classId) {
    try {
      const { data, error } = await window.supabaseClient
        .from('class_subject')
        .select('subject_id')
        .eq('class_id', classId);

      if (error && error.code !== 'PGRST116') throw error;

      allAssignments[classId] = data ? data.map(row => row.subject_id) : [];
    } catch (err) {
      console.error('Load assignments failed:', err);
    }
  }

  async function displayAssignmentTable(classId) {
    const tableContainer = document.getElementById('assignmentTableContainer');
    
    try {
      // Fetch assignments with subject details
      const { data, error } = await window.supabaseClient
        .from('class_subject')
        .select('id, subject:subject_id(name)')
        .eq('class_id', classId)
        .order('created_at', { ascending: true });

      if (error && error.code !== 'PGRST116') throw error;

      const assignments = Array.isArray(data) ? data : [];

      if (assignments.length === 0) {
        tableContainer.innerHTML = '<div class="empty-msg">No subjects assigned to this class yet.</div>';
        return;
      }

      const html = `
        <table class="assignment-table">
          <thead>
            <tr>
              <th>Subject Name</th>
              <th style="width: 100px; text-align: center;">Action</th>
            </tr>
          </thead>
          <tbody>
            ${assignments.map(a => `
              <tr>
                <td>${escapeHtml(a.subject.name)}</td>
                <td style="text-align: center;">
                  <button class="delete-btn" onclick="deleteAssignment('${a.id}', '${classId}')">Delete</button>
                </td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      `;
      tableContainer.innerHTML = html;
    } catch (err) {
      console.error('Display assignments failed:', err);
      tableContainer.innerHTML = `<div class="empty-msg">Error loading assignments</div>`;
    }
  }

  window.deleteAssignment = async function(assignmentId, classId) {
    if (!confirm('Delete this subject assignment?')) return;

    try {
      const { error } = await window.supabaseClient
        .from('class_subject')
        .delete()
        .eq('id', assignmentId);

      if (error) throw error;

      await displayAssignmentTable(classId);
    } catch (err) {
      console.error('Delete failed:', err);
      alert('Error: ' + err.message);
    }
  }

  window.loadSubjectsForCurriculum = async function() {
    if (!selectedClassId) {
      currStatus.textContent = 'Please select a class first.';
      return;
    }

    const currId = currSelect.value;
    if (!currId) {
      currStatus.textContent = 'Please select a curriculum.';
      return;
    }

    selectedCurriculumId = currId;
    currStatus.textContent = 'Loading subjects...';

    try {
      let q = window.supabaseClient
        .from('subject')
        .select('id, name, description')
        .eq('curriculum_id', currId)
        .order('name', { ascending: true });

      if (window.currentSchoolId) q = q.eq('school_id', window.currentSchoolId);

      const { data, error } = await q;
      if (error) throw error;

      subjects = Array.isArray(data) ? data : [];
      renderSubjects();
      currStatus.textContent = '';
      saveBtn.style.display = 'inline-block';
    } catch (err) {
      console.error('Load subjects failed:', err);
      currStatus.textContent = `Error: ${err.message}`;
    }
  };

  function renderSubjects() {
    const currName = curricula.find(c => c.id === selectedCurriculumId)?.name || 'Curriculum';
    subjectsTitle.textContent = `Subjects from "${currName}" (Click to assign/unassign)`;

    if (!subjects.length) {
      subjectsContainer.innerHTML = '<div class="empty-msg">No subjects found for this curriculum.</div>';
      return;
    }

    const assignedIds = allAssignments[selectedClassId] || [];
    
    subjectsContainer.innerHTML = `<div class="subject-grid">
      ${subjects.map(s => `
        <div class="subject-card ${assignedIds.includes(s.id) ? 'assigned' : ''}" 
             onclick="toggleSubject('${s.id}')">
          <strong>${escapeHtml(s.name)}</strong>
          ${s.description ? `<small>${escapeHtml(s.description)}</small>` : ''}
          <input type="checkbox" class="checkbox" id="subj_${s.id}" 
                 ${assignedIds.includes(s.id) ? 'checked' : ''}>
        </div>
      `).join('')}
    </div>`;
  }

  window.toggleSubject = function(subjectId) {
    if (!allAssignments[selectedClassId]) {
      allAssignments[selectedClassId] = [];
    }

    const assigned = allAssignments[selectedClassId];
    const idx = assigned.indexOf(subjectId);

    if (idx > -1) {
      assigned.splice(idx, 1);
    } else {
      assigned.push(subjectId);
    }

    // Update UI
    const card = event.target.closest('.subject-card');
    const checkbox = card.querySelector('.checkbox');
    
    if (assigned.includes(subjectId)) {
      card.classList.add('assigned');
      checkbox.checked = true;
    } else {
      card.classList.remove('assigned');
      checkbox.checked = false;
    }
  };

  window.saveAssignments = async function() {
    if (!selectedClassId) {
      saveStatus.textContent = 'Please select a class.';
      return;
    }

    saveStatus.textContent = 'Saving...';
    saveBtn.disabled = true;

    try {
      // Delete old assignments for this class
      await window.supabaseClient
        .from('class_subject')
        .delete()
        .eq('class_id', selectedClassId);

      // Insert new assignments
      const assignedSubjects = allAssignments[selectedClassId] || [];
      if (assignedSubjects.length > 0) {
        const rows = assignedSubjects.map(subjectId => ({
          school_id: window.currentSchoolId || null,
          class_id: selectedClassId,
          subject_id: subjectId
        }));

        const { error } = await window.supabaseClient
          .from('class_subject')
          .insert(rows);

        if (error) throw error;
      }

      saveStatus.textContent = '✓ Assignments saved successfully!';
      await displayAssignmentTable(selectedClassId);
      setTimeout(() => { saveStatus.textContent = ''; }, 3000);
    } catch (err) {
      console.error('Save failed:', err);
      saveStatus.textContent = `Error: ${err.message || err}`;
    } finally {
      saveBtn.disabled = false;
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

  function escapeAttr(str) {
    return String(str).replace(/'/g, "\\'");
  }
});
