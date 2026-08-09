(function () {
    'use strict';

    const STYLE_ID = 'school-access-manager-styles';

    function addStyles() {
        if (document.getElementById(STYLE_ID)) return;
        const style = document.createElement('style');
        style.id = STYLE_ID;
        style.textContent = `
            .sam-shell{font-family:Inter,system-ui,-apple-system,sans-serif;color:#0f172a}
            .sam-toolbar{display:grid;grid-template-columns:minmax(260px,1fr) auto;gap:16px;align-items:end;margin-bottom:16px}
            .sam-field label{display:block;font-size:.76rem;font-weight:800;color:#475569;text-transform:uppercase;letter-spacing:.04em;margin-bottom:6px}
            .sam-select{width:100%;min-height:44px;padding:9px 12px;border:1px solid #cbd5e1;border-radius:10px;background:#fff;color:#0f172a;font-weight:650}
            .sam-mode{display:flex;align-items:center;gap:10px;padding:10px 14px;border:1px solid #bfdbfe;background:#eff6ff;border-radius:11px;white-space:nowrap}
            .sam-switch{position:relative;width:46px;height:25px;display:inline-block;flex:0 0 auto}
            .sam-switch input{opacity:0;width:0;height:0}
            .sam-slider{position:absolute;inset:0;background:#94a3b8;border-radius:999px;cursor:pointer;transition:.2s}
            .sam-slider:before{content:'';position:absolute;width:19px;height:19px;left:3px;top:3px;background:#fff;border-radius:50%;transition:.2s;box-shadow:0 1px 4px #0003}
            .sam-switch input:checked+.sam-slider{background:#2563eb}
            .sam-switch input:checked+.sam-slider:before{transform:translateX(21px)}
            .sam-summary{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:12px 14px;border:1px solid #e2e8f0;background:#f8fafc;border-radius:11px;margin-bottom:16px}
            .sam-summary strong{display:block;font-size:.95rem}.sam-summary small{color:#64748b}
            .sam-badge{padding:5px 10px;border-radius:999px;font-size:.73rem;font-weight:800;background:#dcfce7;color:#166534}
            .sam-badge.custom{background:#dbeafe;color:#1d4ed8}
            .sam-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:13px}
            .sam-section{border:1px solid #dbe3ef;border-radius:13px;background:#fff;overflow:hidden;box-shadow:0 2px 8px rgba(15,23,42,.04)}
            .sam-section-head{display:flex;align-items:center;gap:10px;padding:12px 13px;background:linear-gradient(135deg,#eff6ff,#f8fafc);border-bottom:1px solid #e2e8f0}
            .sam-section-head i{width:26px;height:26px;display:grid;place-items:center;border-radius:8px;background:#2563eb;color:#fff;font-size:.78rem}
            .sam-section-title{min-width:0;flex:1}.sam-section-title strong{display:block;font-size:.88rem}.sam-section-title small{color:#64748b;font-size:.7rem}
            .sam-check{width:18px;height:18px;accent-color:#2563eb;cursor:pointer}
            .sam-pages{padding:6px 10px 9px}
            .sam-page{display:flex;align-items:center;gap:9px;padding:7px 3px;border-bottom:1px solid #f1f5f9;cursor:pointer;font-size:.8rem;color:#334155}
            .sam-page:last-child{border-bottom:0}.sam-page:hover{color:#1d4ed8}
            .sam-page i{width:18px;color:#64748b;text-align:center}
            .sam-actions{display:flex;align-items:center;gap:9px;margin-top:17px;padding-top:15px;border-top:1px solid #e2e8f0}
            .sam-btn{border:0;border-radius:9px;padding:9px 14px;font-weight:750;cursor:pointer;background:#e2e8f0;color:#334155}
            .sam-btn:hover{filter:brightness(.97)}.sam-btn.primary{background:#2563eb;color:#fff;margin-left:auto}.sam-btn:disabled{opacity:.55;cursor:not-allowed}
            .sam-message{display:none;margin-top:12px;padding:10px 12px;border-radius:9px;font-size:.82rem;font-weight:650}
            .sam-message.show{display:block}.sam-message.success{background:#dcfce7;color:#166534}.sam-message.error{background:#fee2e2;color:#991b1b}
            .sam-setup{padding:18px;border:1px solid #fecaca;border-radius:12px;background:#fff7ed;color:#9a3412;line-height:1.55}
            @media(max-width:1100px){.sam-grid{grid-template-columns:repeat(2,minmax(0,1fr))}}
            @media(max-width:700px){.sam-toolbar,.sam-grid{grid-template-columns:1fr}.sam-mode{white-space:normal}.sam-actions{flex-wrap:wrap}.sam-btn.primary{margin-left:0;width:100%}}
        `;
        document.head.appendChild(style);
    }

    function normalize(value) {
        return window.normalizeSchoolPageHref
            ? window.normalizeSchoolPageHref(value)
            : String(value || '').split('?')[0].split('#')[0].toLowerCase();
    }

    function escapeHtml(value) {
        return String(value ?? '').replace(/[&<>"']/g, char => ({
            '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
        })[char]);
    }

    function sellableSections() {
        return (window.SCHOOL_ACCESS_SECTIONS || []).map(section => {
            const seen = new Set();
            return {
                ...section,
                items: (section.items || []).filter(item => {
                    const key = normalize(item.href);
                    if (!key || item.superAdminOnly || seen.has(key)) return false;
                    seen.add(key);
                    return true;
                })
            };
        }).filter(section => section.items.length);
    }

    function allPageKeys(sections) {
        return [...new Set(sections.flatMap(section => section.items.map(item => normalize(item.href))))];
    }

    function isSetupError(error) {
        const message = String(error?.message || '').toLowerCase();
        return error?.code === '42P01' || error?.code === '42703' || message.includes('school_page_access') || message.includes('access_control_enabled');
    }

    async function mount(target) {
        addStyles();
        const root = typeof target === 'string' ? document.getElementById(target) : target;
        if (!root) return;

        const sections = sellableSections();
        const pageKeys = allPageKeys(sections);
        let schools = [];
        let selectedSchool = null;
        let allowed = new Set(pageKeys);
        let configured = false;

        root.innerHTML = `
            <div class="sam-shell">
                <div class="sam-toolbar">
                    <div class="sam-field"><label>Select school subscription</label><select class="sam-select" data-sam="school"><option>Loading schools...</option></select></div>
                    <div class="sam-mode">
                        <label class="sam-switch"><input type="checkbox" data-sam="mode"><span class="sam-slider"></span></label>
                        <div><strong>Custom access</strong><div style="font-size:.72rem;color:#64748b">Turn on to enforce selected pages</div></div>
                    </div>
                </div>
                <div class="sam-summary" data-sam="summary"></div>
                <div class="sam-grid" data-sam="grid"></div>
                <div class="sam-actions">
                    <button class="sam-btn" type="button" data-sam="all">Enable all</button>
                    <button class="sam-btn" type="button" data-sam="none">Disable all</button>
                    <button class="sam-btn primary" type="button" data-sam="save"><i class="fas fa-save"></i> Save School Access</button>
                </div>
                <div class="sam-message" data-sam="message"></div>
            </div>`;

        const el = name => root.querySelector(`[data-sam="${name}"]`);

        function message(text, type) {
            const box = el('message');
            box.textContent = text;
            box.className = `sam-message show ${type}`;
            window.clearTimeout(box._timer);
            box._timer = window.setTimeout(() => box.classList.remove('show'), 5000);
        }

        function renderSummary() {
            const enabledCount = allowed.size;
            const fee = Number(selectedSchool?.monthly_fee || 0).toLocaleString();
            el('summary').innerHTML = `
                <div><strong>${escapeHtml(selectedSchool?.school_name || 'No school selected')}</strong><small>Rs ${fee}/month · ${enabledCount} of ${pageKeys.length} pages selected</small></div>
                <span class="sam-badge ${configured ? 'custom' : ''}">${configured ? 'CUSTOM PACKAGE' : 'FULL ACCESS'}</span>`;
            el('mode').checked = configured;
        }

        function syncSectionCheckbox(sectionId) {
            const section = sections.find(row => row.id === sectionId);
            const box = root.querySelector(`[data-section="${sectionId}"]`);
            if (!section || !box) return;
            const count = section.items.filter(item => allowed.has(normalize(item.href))).length;
            box.checked = count === section.items.length;
            box.indeterminate = count > 0 && count < section.items.length;
            const countEl = root.querySelector(`[data-count="${sectionId}"]`);
            if (countEl) countEl.textContent = `${count}/${section.items.length} pages`;
        }

        function renderGrid() {
            el('grid').innerHTML = sections.map(section => `
                <section class="sam-section">
                    <div class="sam-section-head">
                        <i class="${section.icon}"></i>
                        <div class="sam-section-title"><strong>${section.label}</strong><small data-count="${section.id}"></small></div>
                        <input class="sam-check" type="checkbox" data-section="${section.id}" aria-label="Toggle ${section.label}">
                    </div>
                    <div class="sam-pages">
                        ${section.items.map(item => {
                            const pageKey = normalize(item.href);
                            return `<label class="sam-page"><input class="sam-check" type="checkbox" data-page="${pageKey}" ${allowed.has(pageKey) ? 'checked' : ''}><i class="${item.icon}"></i><span>${item.label}</span></label>`;
                        }).join('')}
                    </div>
                </section>`).join('');

            sections.forEach(section => syncSectionCheckbox(section.id));

            root.querySelectorAll('[data-page]').forEach(box => box.addEventListener('change', () => {
                if (box.checked) allowed.add(box.dataset.page); else allowed.delete(box.dataset.page);
                const sectionEl = box.closest('.sam-section').querySelector('[data-section]');
                syncSectionCheckbox(sectionEl.dataset.section);
                renderSummary();
            }));

            root.querySelectorAll('[data-section]').forEach(box => box.addEventListener('change', () => {
                const section = sections.find(row => row.id === box.dataset.section);
                section.items.forEach(item => {
                    const pageKey = normalize(item.href);
                    if (box.checked) allowed.add(pageKey); else allowed.delete(pageKey);
                });
                renderGrid();
                renderSummary();
            }));
        }

        async function loadSelectedSchool() {
            selectedSchool = schools.find(school => school.id === el('school').value) || null;
            if (!selectedSchool) return;
            configured = selectedSchool.access_control_enabled === true;

            const { data, error } = await window.supabaseClient
                .from('school_page_access')
                .select('page_key, is_enabled')
                .eq('school_id', selectedSchool.id);

            if (error) {
                if (isSetupError(error)) showSetup(error);
                else message('Could not load school access: ' + error.message, 'error');
                return;
            }

            if ((data || []).length) {
                allowed = new Set(data.filter(row => row.is_enabled).map(row => normalize(row.page_key)));
            } else {
                allowed = new Set(pageKeys);
            }
            renderGrid();
            renderSummary();
        }

        function showSetup() {
            root.innerHTML = `<div class="sam-setup"><strong>Database setup required</strong><br>Run <code>school_feature_access_setup.sql</code> in the Supabase SQL Editor, then refresh this page.</div>`;
        }

        async function loadSchools() {
            const { data, error } = await window.supabaseClient
                .from('schools')
                .select('id, school_name, is_active, monthly_fee, access_control_enabled')
                .order('school_name');
            if (error) {
                if (isSetupError(error)) showSetup(error);
                else message('Could not load schools: ' + error.message, 'error');
                return;
            }

            schools = data || [];
            const select = el('school');
            select.innerHTML = '';
            schools.forEach(school => {
                const option = document.createElement('option');
                option.value = school.id;
                option.textContent = `${school.school_name}${school.is_active ? '' : ' (Suspended)'}`;
                select.appendChild(option);
            });
            if (!schools.length) {
                select.innerHTML = '<option value="">No schools available</option>';
                el('save').disabled = true;
                return;
            }
            await loadSelectedSchool();
        }

        el('school').addEventListener('change', loadSelectedSchool);
        el('mode').addEventListener('change', event => {
            configured = event.target.checked;
            renderSummary();
        });
        el('all').addEventListener('click', () => {
            allowed = new Set(pageKeys);
            renderGrid();
            renderSummary();
        });
        el('none').addEventListener('click', () => {
            allowed = new Set();
            renderGrid();
            renderSummary();
        });
        el('save').addEventListener('click', async () => {
            if (!selectedSchool) return;
            if (configured && allowed.size === 0 && !window.confirm('This school will only be able to open the dashboard. Save this restriction?')) return;

            const button = el('save');
            button.disabled = true;
            button.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Saving...';
            try {
                const payload = pageKeys.map(pageKey => ({
                    school_id: selectedSchool.id,
                    page_key: pageKey,
                    is_enabled: allowed.has(pageKey),
                    updated_at: new Date().toISOString(),
                    updated_by: window.currentUser?.id || null
                }));
                const { error: pageError } = await window.supabaseClient
                    .from('school_page_access')
                    .upsert(payload, { onConflict: 'school_id,page_key' });
                if (pageError) throw pageError;

                const { error: schoolError } = await window.supabaseClient
                    .from('schools')
                    .update({ access_control_enabled: configured })
                    .eq('id', selectedSchool.id);
                if (schoolError) throw schoolError;

                selectedSchool.access_control_enabled = configured;
                message(`Access package saved for ${selectedSchool.school_name}.`, 'success');
                renderSummary();
            } catch (error) {
                message('Save failed: ' + (error.message || 'Unknown error'), 'error');
            } finally {
                button.disabled = false;
                button.innerHTML = '<i class="fas fa-save"></i> Save School Access';
            }
        });

        await loadSchools();
    }

    window.SchoolAccessManager = { mount };
})();
