const supabaseUrl = 'https://dkscydwftycubvwxondi.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRrc2N5ZHdmdHljdWJ2d3hvbmRpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQyNTMxOTQsImV4cCI6MjA4OTgyOTE5NH0.U84KKtJV2Lzz_FXbnXqlstvzzTW-FWBBtJTxbGlNYIE';
const supabaseClient = window.supabase.createClient(supabaseUrl, supabaseKey);

document.addEventListener('DOMContentLoaded', () => {
    const feeForm = document.getElementById('feeForm');
    const classIdSelect = document.getElementById('classId');
    const feeBody = document.getElementById('feeBody');
    const formAlert = document.getElementById('formAlert');
    const submitBtn = document.getElementById('submitBtn');

    // Load necessary data on startup
    loadClasses();
    fetchFeeHeads();

    feeForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        formAlert.style.display = 'none';

        const classId = classIdSelect.value;
        const feeType = document.getElementById('feeType').value.trim();
        const amount = document.getElementById('amount').value.trim();
        const isMonthly = document.getElementById('isMonthly').checked;

        if(!classId || !feeType || !amount) {
            showAlert('All fields are required.', true);
            return;
        }

        const originalText = submitBtn.innerHTML;
        submitBtn.innerHTML = '<span style="display:inline-block; animation: spin 1s linear infinite;">⏳</span> Saving...';
        submitBtn.style.opacity = '0.8';
        submitBtn.style.pointerEvents = 'none';

        try {
            const { data, error } = await supabaseClient
                .from('fee_heads')
                .insert([{ 
                    class_id: classId, 
                    fee_type: feeType, 
                    amount: parseFloat(amount),
                    is_monthly: isMonthly
                }]);

            if (error) throw new Error(error.message);

            // Successfully added
            document.getElementById('feeType').value = '';
            document.getElementById('amount').value = '';
            document.getElementById('isMonthly').checked = false;
            classIdSelect.value = ''; // Reset select
            
            showAlert('✅ Fee Head added successfully!', false);
            
            // Refresh list
            fetchFeeHeads();
            
        } catch (error) {
            console.error('Error:', error);
            showAlert('❌ Failed to add fee head: ' + error.message, true);
        } finally {
            submitBtn.innerHTML = originalText;
            submitBtn.style.opacity = '1';
            submitBtn.style.pointerEvents = 'all';
        }
    });

    // Populate dropdown with classes from DB
    async function loadClasses() {
        try {
            const { data, error } = await supabaseClient
                .from('classes')
                .select('id, class_name, section')
                .order('class_name', { ascending: true })
                .order('section', { ascending: true });
                
            if (error) throw error;
            
            classIdSelect.innerHTML = '<option value="" disabled selected>Select Target Class</option>';
            if(data && data.length > 0) {
                data.forEach(cls => {
                    const opt = document.createElement('option');
                    opt.value = cls.id;
                    opt.textContent = `${cls.class_name} (${cls.section})`;
                    classIdSelect.appendChild(opt);
                });
            } else {
                classIdSelect.innerHTML = '<option value="" disabled selected>No classes available</option>';
            }
        } catch(err) {
            console.error('Error loading classes:', err);
            classIdSelect.innerHTML = '<option value="" disabled selected>Error loading classes</option>';
        }
    }

    // Fetch and display existing fee heads
    async function fetchFeeHeads() {
        try {
            // Using Supabase relation query to get class name directly!
            const { data, error } = await supabaseClient
                .from('fee_heads')
                .select(`
                    id, 
                    fee_type, 
                    amount, 
                    is_monthly,
                    created_at,
                    classes ( class_name, section )
                `)
                .order('created_at', { ascending: false });

            if (error) throw error;

            feeBody.innerHTML = ''; // Clear loading text

            if (data.length === 0) {
                feeBody.innerHTML = '<tr><td colspan="4" style="text-align: center;">No fee heads configured yet. Add one above!</td></tr>';
                return;
            }

            data.forEach(fee => {
                const tr = document.createElement('tr');
                const addedDate = new Date(fee.created_at).toLocaleDateString();
                const className = fee.classes ? `${fee.classes.class_name} (${fee.classes.section})` : 'Unknown Class';
                
                const typeBadge = fee.is_monthly 
                    ? '<span style="color:var(--secondary); font-size:0.75rem; border:1px solid currentColor; padding:0.1rem 0.4rem; border-radius:12px; margin-left:0.5rem; vertical-align:middle;">Monthly</span>' 
                    : '<span style="color:var(--text-muted); font-size:0.75rem; border:1px solid currentColor; padding:0.1rem 0.4rem; border-radius:12px; margin-left:0.5rem; vertical-align:middle;">One-time</span>';
                
                tr.innerHTML = `
                    <td><strong>${className}</strong></td>
                    <td>${fee.fee_type} ${typeBadge}</td>
                    <td><span class="fee-badge">Rs ${fee.amount}</span></td>
                    <td>${addedDate}</td>
                `;
                feeBody.appendChild(tr);
            });
            
        } catch (error) {
            console.error('Error fetching fee heads:', error);
            feeBody.innerHTML = '<tr><td colspan="4" style="text-align: center; color: red;">Failed to load fee heads. (Did you run the SQL script for fee_heads table?)</td></tr>';
        }
    }

    function showAlert(msg, isError) {
        formAlert.textContent = msg;
        formAlert.style.background = isError ? 'var(--error)' : 'var(--success)';
        formAlert.style.display = 'block';
        setTimeout(() => { formAlert.style.display = 'none'; }, 5000);
    }
    
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
