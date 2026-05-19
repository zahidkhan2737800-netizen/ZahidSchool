// discount_report.js
// Supabase client provided by auth.js
const db = window.supabaseClient;

let currentMode = 'day';
let allRows     = [];    // raw transaction rows from DB
let members     = {};    // student_id → {full_name, father_name, applying_for_class, roll_number}

// ── Boot ──────────────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
    // Default dates
    const today = todayStr();
    document.getElementById('inputDay').value   = today;
    document.getElementById('inputFrom').value  = today;
    document.getElementById('inputTo').value    = today;

    const now = new Date();
    document.getElementById('inputMonth').value =
        now.getFullYear() + '-' + String(now.getMonth() + 1).padStart(2, '0');

    // Font-size slider
    const slider = document.getElementById('fontSizeRange');
    slider.addEventListener('input', () => {
        const v = parseFloat(slider.value);
        document.getElementById('fontSizeValue').textContent = v + 'px';
        document.documentElement.style.setProperty('--table-font-size', v + 'px');
        document.documentElement.style.setProperty('--table-td-pad', Math.round(v * 0.45) + 'px ' + Math.round(v * 0.7) + 'px');
        document.documentElement.style.setProperty('--table-th-pad', Math.round(v * 0.55) + 'px ' + Math.round(v * 0.7) + 'px');
    });

    // Search live filter
    document.getElementById('searchText').addEventListener('input', renderTable);

    // Wait for auth then pre-load student cache
    const tick = setInterval(() => {
        if (window.authReady && window.supabaseClient) {
            clearInterval(tick);
            preloadStudents();
        }
    }, 100);
});

// ── Mode switching ─────────────────────────────────────────────────────────────
function setMode(mode) {
    currentMode = mode;
    ['day', 'month', 'range'].forEach(m => {
        document.getElementById('tab' + cap(m)).classList.toggle('active', m === mode);
    });
    document.getElementById('fldDay').style.display   = mode === 'day'   ? '' : 'none';
    document.getElementById('fldMonth').style.display = mode === 'month' ? '' : 'none';
    document.getElementById('fldFrom').style.display  = mode === 'range' ? '' : 'none';
    document.getElementById('fldTo').style.display    = mode === 'range' ? '' : 'none';
}
window.setMode = setMode;

function cap(s) { return s.charAt(0).toUpperCase() + s.slice(1); }

// ── Preload student info ───────────────────────────────────────────────────────
async function preloadStudents() {
    try {
        const { data } = await db
            .from('admissions')
            .select('id, full_name, father_name, applying_for_class, roll_number');
        (data || []).forEach(s => { members[s.id] = s; });
    } catch(e) {
        console.warn('Student preload failed:', e.message);
    }
}

// ── Date helpers ──────────────────────────────────────────────────────────────
function todayStr() {
    const d = new Date();
    return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
}
function pad(n) { return String(n).padStart(2, '0'); }

function getDateRange() {
    if (currentMode === 'day') {
        const d = document.getElementById('inputDay').value || todayStr();
        return { from: d + 'T00:00:00', to: d + 'T23:59:59', label: formatDate(d) };
    }
    if (currentMode === 'month') {
        const m = document.getElementById('inputMonth').value;
        if (!m) return null;
        const [y, mo] = m.split('-').map(Number);
        const lastDay = new Date(y, mo, 0).getDate();
        const from = `${y}-${pad(mo)}` + `-01T00:00:00`;
        const to   = `${y}-${pad(mo)}-${pad(lastDay)}T23:59:59`;
        const monthNames = ['January','February','March','April','May','June','July','August','September','October','November','December'];
        return { from, to, label: monthNames[mo - 1] + ' ' + y };
    }
    if (currentMode === 'range') {
        const f = document.getElementById('inputFrom').value;
        const t = document.getElementById('inputTo').value;
        if (!f || !t) return null;
        return { from: f + 'T00:00:00', to: t + 'T23:59:59', label: formatDate(f) + ' → ' + formatDate(t) };
    }
    return null;
}

function formatDate(iso) {
    if (!iso) return '';
    const [y, m, d] = iso.split('-');
    const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    return parseInt(d) + ' ' + months[parseInt(m) - 1] + ' ' + y;
}

// ── Load from DB ──────────────────────────────────────────────────────────────
async function loadReport() {
    const range = getDateRange();
    if (!range) { alert('Please select a valid date/period.'); return; }

    const btn = document.getElementById('loadBtn');
    btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Loading…';
    btn.disabled = true;

    try {
        const schoolId = window.currentSchoolId;

        // Query transactions where discount_amount > 0
        let q = db
            .from('transactions')
            .select('created_at, student_id, roll_number, discount_amount, amount_paid, fee_details, payment_method, payment_reference, remarks')
            .gt('discount_amount', 0)
            .gte('created_at', range.from)
            .lte('created_at', range.to)
            .order('created_at', { ascending: true });

        if (schoolId) q = q.eq('school_id', schoolId);

        const { data, error } = await q;
        if (error) throw error;

        allRows = data || [];

        // Update summary
        const uniqueStudents = new Set(allRows.map(r => r.student_id));
        const totalDisc = allRows.reduce((s, r) => s + Number(r.discount_amount || 0), 0);

        document.getElementById('sumEntries').textContent  = allRows.length.toLocaleString();
        document.getElementById('sumStudents').textContent = uniqueStudents.size.toLocaleString();
        document.getElementById('sumTotal').textContent    = 'Rs ' + Math.round(totalDisc).toLocaleString();
        document.getElementById('sumPeriod').textContent   = range.label;

        // Print header
        document.getElementById('printPeriodLabel').textContent = range.label;
        document.getElementById('printGenTime').textContent     = new Date().toLocaleString();

        renderTable();

    } catch(e) {
        console.error(e);
        document.getElementById('reportBody').innerHTML =
            `<tr><td colspan="10" class="empty" style="color:red;">Error: ${e.message}</td></tr>`;
    } finally {
        btn.innerHTML = '<i class="fas fa-sync"></i> Load';
        btn.disabled = false;
    }
}
window.loadReport = loadReport;

// ── Render table ──────────────────────────────────────────────────────────────
function renderTable() {
    const q   = document.getElementById('searchText').value.trim().toLowerCase();
    const tbody = document.getElementById('reportBody');

    if (allRows.length === 0) {
        tbody.innerHTML = '<tr><td colspan="10" class="empty">No discount records found for this period.</td></tr>';
        return;
    }

    // Filter by search
    const filtered = allRows.filter(r => {
        if (!q) return true;
        const stu = members[r.student_id] || {};
        const name = (stu.full_name || '').toLowerCase();
        const roll = String(r.roll_number || stu.roll_number || '').toLowerCase();
        const father = (stu.father_name || '').toLowerCase();
        const details = (r.fee_details || '').toLowerCase();
        return name.includes(q) || roll.includes(q) || father.includes(q) || details.includes(q);
    });

    if (filtered.length === 0) {
        tbody.innerHTML = '<tr><td colspan="10" class="empty">No results match your search.</td></tr>';
        return;
    }

    let html = '';

    if (currentMode === 'month') {
        // Group by day within month
        html = renderGroupedByDay(filtered);
    } else if (currentMode === 'range') {
        // Group by month, then day
        html = renderGroupedByMonthDay(filtered);
    } else {
        // Day mode — flat list with running total at bottom
        html = renderFlat(filtered);
    }

    tbody.innerHTML = html;
}

// ── Flat render (day mode) ────────────────────────────────────────────────────
function renderFlat(rows) {
    let total = 0;
    const rowsHtml = rows.map(r => {
        total += Number(r.discount_amount || 0);
        return rowHtml(r);
    }).join('');

    return rowsHtml + `
    <tr class="subtotal-row">
        <td colspan="8" style="text-align:right; padding-right:8px;">Day Total:</td>
        <td class="disc-amt">Rs ${Math.round(total).toLocaleString()}</td>
        <td></td>
    </tr>`;
}

// ── Grouped by day (month mode) ───────────────────────────────────────────────
function renderGroupedByDay(rows) {
    const dayGroups = {};
    const dayOrder  = [];

    rows.forEach(r => {
        const d = r.created_at.slice(0, 10);
        if (!dayGroups[d]) { dayGroups[d] = []; dayOrder.push(d); }
        dayGroups[d].push(r);
    });

    let html = '';
    let grandTotal = 0;

    dayOrder.forEach(day => {
        const group = dayGroups[day];
        const dayTotal = group.reduce((s, r) => s + Number(r.discount_amount || 0), 0);
        grandTotal += dayTotal;

        html += `<tr class="day-header-row">
            <td colspan="10">📅 ${formatDate(day)} &nbsp;&nbsp; (${group.length} entr${group.length === 1 ? 'y' : 'ies'})</td>
        </tr>`;
        html += group.map(r => rowHtml(r)).join('');
        html += `<tr class="subtotal-row">
            <td colspan="8" style="text-align:right; padding-right:8px;">Day Subtotal:</td>
            <td class="disc-amt">Rs ${Math.round(dayTotal).toLocaleString()}</td>
            <td></td>
        </tr>`;
    });

    html += `<tr class="subtotal-row" style="font-size:calc(var(--table-font-size) + 1px);">
        <td colspan="8" style="text-align:right; padding-right:8px; color:#5b21b6;">Month Total:</td>
        <td class="disc-amt" style="color:#7c3aed; font-size:calc(var(--table-font-size) + 1px);">Rs ${Math.round(grandTotal).toLocaleString()}</td>
        <td></td>
    </tr>`;

    return html;
}

// ── Grouped by month → day (range mode) ───────────────────────────────────────
function renderGroupedByMonthDay(rows) {
    const monthGroups = {};
    const monthOrder  = [];

    rows.forEach(r => {
        const monthKey = r.created_at.slice(0, 7); // YYYY-MM
        const dayKey   = r.created_at.slice(0, 10);
        if (!monthGroups[monthKey]) { monthGroups[monthKey] = {}; monthOrder.push(monthKey); }
        if (!monthGroups[monthKey][dayKey]) monthGroups[monthKey][dayKey] = [];
        monthGroups[monthKey][dayKey].push(r);
    });

    const monthNames = ['January','February','March','April','May','June','July','August','September','October','November','December'];

    let html = '';
    let grandTotal = 0;

    monthOrder.forEach(mKey => {
        const [y, mo] = mKey.split('-').map(Number);
        const mLabel = monthNames[mo - 1] + ' ' + y;
        const dayGroups = monthGroups[mKey];
        const dayOrder  = Object.keys(dayGroups).sort();
        const mTotal    = dayOrder.reduce((s, d) => s + dayGroups[d].reduce((ss, r) => ss + Number(r.discount_amount || 0), 0), 0);
        grandTotal += mTotal;

        html += `<tr class="month-header-row">
            <td colspan="10">🗓️ ${mLabel} — Total Discount: Rs ${Math.round(mTotal).toLocaleString()}</td>
        </tr>`;

        dayOrder.forEach(day => {
            const group = dayGroups[day];
            const dayTotal = group.reduce((s, r) => s + Number(r.discount_amount || 0), 0);

            html += `<tr class="day-header-row">
                <td colspan="10">📅 ${formatDate(day)} &nbsp;&nbsp; (${group.length} entr${group.length === 1 ? 'y' : 'ies'})</td>
            </tr>`;
            html += group.map(r => rowHtml(r)).join('');
            html += `<tr class="subtotal-row">
                <td colspan="8" style="text-align:right; padding-right:8px;">Day Subtotal:</td>
                <td class="disc-amt">Rs ${Math.round(dayTotal).toLocaleString()}</td>
                <td></td>
            </tr>`;
        });
    });

    html += `<tr class="subtotal-row" style="font-size:calc(var(--table-font-size) + 1.5px);">
        <td colspan="8" style="text-align:right; padding-right:8px; color:#5b21b6;">Grand Total:</td>
        <td class="disc-amt" style="color:#7c3aed; font-size:calc(var(--table-font-size) + 1.5px);">Rs ${Math.round(grandTotal).toLocaleString()}</td>
        <td></td>
    </tr>`;

    return html;
}

// ── Single row HTML ───────────────────────────────────────────────────────────
function rowHtml(r) {
    const stu = members[r.student_id] || {};
    const name    = stu.full_name || '—';
    const father  = stu.father_name || '—';
    const cls     = stu.applying_for_class || '—';
    const roll    = r.roll_number || stu.roll_number || '—';
    const disc    = Number(r.discount_amount || 0);
    const paid    = Number(r.amount_paid || 0);

    const dt      = new Date(r.created_at);
    const dateStr = formatDate(r.created_at.slice(0, 10));
    const timeStr = dt.toLocaleTimeString('en-PK', { hour: '2-digit', minute: '2-digit', hour12: true });

    // Shorten fee_details to keep table compact
    let details = r.fee_details || r.remarks || '—';
    if (details.length > 55) details = details.slice(0, 55) + '…';

    const isDirectDisc = (r.payment_method || '').toLowerCase() === 'discount';
    const typeBadge = isDirectDisc
        ? '<span class="badge badge-disc">Direct</span>'
        : '<span class="badge badge-pay">On Payment</span>';

    return `<tr>
        <td class="mono">${dateStr}</td>
        <td class="mono">${timeStr}</td>
        <td class="mono" style="font-weight:700;">${roll}</td>
        <td style="font-weight:700;">${name}</td>
        <td style="color:#475569;">${father}</td>
        <td>${cls}</td>
        <td style="color:#475569; font-size:calc(var(--table-font-size) - 0.5px);">${details}</td>
        <td>${typeBadge}</td>
        <td class="disc-amt">Rs ${Math.round(disc).toLocaleString()}</td>
        <td style="color:#15803d; font-weight:600;">${paid > 0 ? 'Rs ' + Math.round(paid).toLocaleString() : '—'}</td>
    </tr>`;
}
