const supabaseUrl = 'https://dkscydwftycubvwxondi.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRrc2N5ZHdmdHljdWJ2d3hvbmRpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQyNTMxOTQsImV4cCI6MjA4OTgyOTE5NH0.U84KKtJV2Lzz_FXbnXqlstvzzTW-FWBBtJTxbGlNYIE';
const supabaseClient = window.supabase.createClient(supabaseUrl, supabaseKey);

document.addEventListener('DOMContentLoaded', () => {
    const classForm = document.getElementById('classForm');
    const classesBody = document.getElementById('classesBody');
    const formAlert = document.getElementById('formAlert');
    const submitBtn = document.getElementById('submitBtn');

    // Fetch and display existing classes on load
    fetchClasses();

    classForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        formAlert.style.display = 'none';

        const classNameInput = document.getElementById('className');
        const classSectionInput = document.getElementById('classSection');
        
        const className = classNameInput.value.trim();
        const section = classSectionInput.value.trim();

        if(!className || !section) {
            showAlert('Both Class Name and Section are required.', true);
            return;
        }

        const originalText = submitBtn.innerHTML;
        submitBtn.innerHTML = '<span style="display:inline-block; animation: spin 1s linear infinite;">⏳</span> Saving...';
        submitBtn.style.opacity = '0.8';
        submitBtn.style.pointerEvents = 'none';

        try {
            const { data, error } = await supabaseClient
                .from('classes')
                .insert([{ class_name: className, section: section }]);

            if (error) throw new Error(error.message);

            // Successfully added
            classNameInput.value = '';
            classSectionInput.value = '';
            
            showAlert('✅ Class added successfully to the database!', false);
            
            // Refresh list
            fetchClasses();
            
        } catch (error) {
            console.error('Error:', error);
            showAlert('❌ Failed to add class: ' + error.message, true);
        } finally {
            submitBtn.innerHTML = originalText;
            submitBtn.style.opacity = '1';
            submitBtn.style.pointerEvents = 'all';
        }
    });

    async function fetchClasses() {
        try {
            const { data, error } = await supabaseClient
                .from('classes')
                .select('*')
                .order('class_name', { ascending: true })
                .order('section', { ascending: true });

            if (error) throw error;

            classesBody.innerHTML = ''; // Clear loading text

            if (data.length === 0) {
                classesBody.innerHTML = '<tr><td colspan="3" style="text-align: center;">No classes found. Add one above!</td></tr>';
                return;
            }

            data.forEach(cls => {
                const tr = document.createElement('tr');
                const addedDate = new Date(cls.created_at).toLocaleDateString();
                
                tr.innerHTML = `
                    <td><strong>${cls.class_name}</strong></td>
                    <td><span class="class-badge">${cls.section}</span></td>
                    <td>${addedDate}</td>
                `;
                classesBody.appendChild(tr);
            });
            
        } catch (error) {
            console.error('Error fetching classes:', error);
            classesBody.innerHTML = '<tr><td colspan="3" style="text-align: center; color: red;">Failed to load classes from database. Did you run the SQL script?</td></tr>';
        }
    }

    function showAlert(msg, isError) {
        formAlert.textContent = msg;
        formAlert.style.background = isError ? 'var(--error)' : 'var(--success)';
        formAlert.style.display = 'block';
        setTimeout(() => { formAlert.style.display = 'none'; }, 5000);
    }
    
    // Create simple keyframes for spinner locally
    if (!document.getElementById('spin-style')) {
        const style = document.createElement('style');
        style.id = 'spin-style';
        style.innerHTML = `
            @keyframes spin {
                100% { transform: rotate(360deg); }
            }
        `;
        document.head.appendChild(style);
    }
});
