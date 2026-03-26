// ─── Constants ────────────────────────────────────────────────────────────────
const STUDENTS_PER_PAGE = 27;
const SCHOOL_NAME = 'Zahid School';

// ─── DOM References ────────────────────────────────────────────────────────────
const classSelect  = document.getElementById('classSelect');
const fontSlider   = document.getElementById('fontSlider');
const fontValue    = document.getElementById('fontValue');
const generateBtn  = document.getElementById('generateBtn');
const printBtn     = document.getElementById('printBtn');
const previewArea  = document.getElementById('reportPreviewArea');

// ─── Font Slider ──────────────────────────────────────────────────────────────
fontSlider.addEventListener('input', () => {
    const size = fontSlider.value;
    fontValue.textContent = size + 'px';
    // Apply to all existing report pages immediately
    document.querySelectorAll('.report-page').forEach(page => {
        page.style.setProperty('--report-font-size', size + 'px');
    });
});

// ─── Wait for Auth Before Loading ─────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
    const checkAuth = setInterval(() => {
        if (window.authReady && window.supabaseClient) {
            clearInterval(checkAuth);
            loadClasses();
        }
    }, 100);
});

// ─── Load Classes into Dropdown ───────────────────────────────────────────────
async function loadClasses() {
    try {
        const { data, error } = await supabaseClient
            .from('classes')
            .select('class_name, section')
            .order('class_name', { ascending: true });

        if (error) throw error;

        classSelect.innerHTML = '<option value="ALL">📚 All Classes (School-Wide)</option>';
        (data || []).forEach(c => {
            const label = `${c.class_name} ${c.section}`.trim();
            const opt = document.createElement('option');
            opt.value = label;
            opt.textContent = label;
            classSelect.appendChild(opt);
        });
    } catch (err) {
        console.error('Failed to load classes:', err.message);
    }
}

// ─── Generate Button ──────────────────────────────────────────────────────────
generateBtn.addEventListener('click', async () => {
    const scope = classSelect.value;

    generateBtn.disabled = true;
    generateBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Loading...';
    previewArea.innerHTML = '<div style="padding:4rem; color:var(--text-muted); text-align:center;">Loading student data...</div>';
    printBtn.disabled = true;

    try {
        let query = supabaseClient
            .from('admissions')
            .select('roll_number, full_name, father_name, class_name:applying_for_class, gender, status')
            .eq('status', 'Active')
            .order('applying_for_class', { ascending: true })
            .order('roll_number', { ascending: true });

        if (scope !== 'ALL') {
            query = query.eq('applying_for_class', scope);
        }

        const { data, error } = await query;
        if (error) throw error;

        if (!data || data.length === 0) {
            previewArea.innerHTML = '<div style="padding:4rem; color:var(--text-muted); text-align:center;">No active students found for the selected scope.</div>';
            return;
        }

        buildPages(data, scope);
        printBtn.disabled = false;

    } catch (err) {
        previewArea.innerHTML = `<div style="padding:4rem; color:red; text-align:center;">Error: ${err.message}</div>`;
    } finally {
        generateBtn.disabled = false;
        generateBtn.innerHTML = '<i class="fas fa-magic"></i> Generate Layout';
    }
});

// ─── Print Button ─────────────────────────────────────────────────────────────
printBtn.addEventListener('click', () => {
    window.print();
});

// ─── Build A4 Pages ───────────────────────────────────────────────────────────
function buildPages(students, scope) {
    previewArea.innerHTML = '';
    const fontSize = fontSlider.value + 'px';
    const now = new Date();
    const dateStr = now.toLocaleDateString('en-PK', { year: 'numeric', month: 'long', day: 'numeric' });
    const totalStudents = students.length;

    // If school-wide, group by class and print class-by-class
    if (scope === 'ALL') {
        // Group students by class
        const classMap = {};
        students.forEach(s => {
            const cls = s.class_name || 'Unknown';
            if (!classMap[cls]) classMap[cls] = [];
            classMap[cls].push(s);
        });

        // For each class, chunk into pages of STUDENTS_PER_PAGE
        Object.entries(classMap).forEach(([className, classStudents]) => {
            const chunks = chunkArray(classStudents, STUDENTS_PER_PAGE);
            chunks.forEach((chunk, pageIdx) => {
                const totalPages = chunks.length;
                previewArea.appendChild(
                    buildSinglePage(chunk, className, dateStr, pageIdx + 1, totalPages, fontSize, classStudents.length)
                );
            });
        });
    } else {
        // Single class, just chunk
        const chunks = chunkArray(students, STUDENTS_PER_PAGE);
        chunks.forEach((chunk, pageIdx) => {
            const totalPages = chunks.length;
            previewArea.appendChild(
                buildSinglePage(chunk, scope, dateStr, pageIdx + 1, totalPages, fontSize, totalStudents)
            );
        });
    }
}

// ─── Build a Single Page DOM Element ─────────────────────────────────────────
function buildSinglePage(students, className, dateStr, pageNum, totalPages, fontSize, classTotal) {
    const page = document.createElement('div');
    page.className = 'report-page';
    page.style.setProperty('--report-font-size', fontSize);

    const rows = students.map((s, i) => {
        // Compute absolute serial number (using index in the page chunk)
        const serial = (pageNum - 1) * STUDENTS_PER_PAGE + (i + 1);
        return `
            <tr>
                <td class="center">${serial}</td>
                <td class="center">${s.roll_number || '—'}</td>
                <td>${s.full_name || '—'}</td>
                <td>${s.father_name || '—'}</td>
                <td class="center">${s.class_name || '—'}</td>
                <td class="center">${s.gender || '—'}</td>
            </tr>
        `;
    }).join('');

    page.innerHTML = `
        <div class="report-header">
            <h2>${SCHOOL_NAME}</h2>
            <p>Student Report — ${className} &nbsp;|&nbsp; Total Students: ${classTotal}</p>
            <p style="font-size:0.9em; color:#555;">Generated: ${dateStr} &nbsp;|&nbsp; Page ${pageNum} of ${totalPages}</p>
        </div>

        <table class="report-table">
            <thead>
                <tr>
                    <th class="center" style="width:5%">#</th>
                    <th class="center" style="width:10%">Roll No.</th>
                    <th style="width:28%">Student Name</th>
                    <th style="width:28%">Father Name</th>
                    <th class="center" style="width:18%">Class</th>
                    <th class="center" style="width:11%">Gender</th>
                </tr>
            </thead>
            <tbody>
                ${rows}
            </tbody>
        </table>

        <div class="report-footer">
            <span>🖨️ ${SCHOOL_NAME} — ${new Date().getFullYear()}</span>
            <span>Page ${pageNum} / ${totalPages}</span>
        </div>
    `;

    return page;
}

// ─── Utility: Chunk Array ─────────────────────────────────────────────────────
function chunkArray(arr, size) {
    const chunks = [];
    for (let i = 0; i < arr.length; i += size) {
        chunks.push(arr.slice(i, i + size));
    }
    return chunks;
}
