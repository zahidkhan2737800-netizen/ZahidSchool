const supabaseUrl = 'https://dkscydwftycubvwxondi.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRrc2N5ZHdmdHljdWJ2d3hvbmRpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQyNTMxOTQsImV4cCI6MjA4OTgyOTE5NH0.U84KKtJV2Lzz_FXbnXqlstvzzTW-FWBBtJTxbGlNYIE';
const supabaseClient = window.supabase.createClient(supabaseUrl, supabaseKey);

document.addEventListener('DOMContentLoaded', async () => {
    const totalActiveCount = document.getElementById('totalActiveCount');
    const withdrawnMonthCount = document.getElementById('withdrawnMonthCount');
    const monthNameLabel = document.getElementById('monthNameLabel');
    const pageLoader = document.getElementById('pageLoader');

    // Display current month name
    const monthNames = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
    const d = new Date();
    const currentMonthIndex = d.getMonth();
    const currentYear = d.getFullYear();
    monthNameLabel.innerHTML = `📅 During ${monthNames[currentMonthIndex]} ${currentYear}`;

    try {
        // Fetch all students (Status, Updated_at, Admission_Date) to calculate metrics locally
        const { data, error } = await supabaseClient
            .from('admissions')
            .select('status, updated_at, admission_date');

        if (error) throw error;

        // Metric 1: Total Active
        const activeStudents = data.filter(student => student.status === 'Active');
        
        // Metric 2: Withdrawn This Month
        const withdrawnThisMonth = data.filter(student => {
            if (student.status !== 'Withdrawn') return false;
            
            // Priority: updated_at -> admission_date -> current_date fallback
            let dateTarget = student.updated_at || student.admission_date;
            if(!dateTarget) return false;

            const targetObj = new Date(dateTarget);
            return targetObj.getMonth() === currentMonthIndex && targetObj.getFullYear() === currentYear;
        });

        // Animate counter upwards
        animateValue(totalActiveCount, 0, activeStudents.length, 1000);
        animateValue(withdrawnMonthCount, 0, withdrawnThisMonth.length, 1000);

    } catch(err) {
        console.error("Dashboard Fetch Error:", err);
        totalActiveCount.innerHTML = "Error";
        withdrawnMonthCount.innerHTML = "Error";
        totalActiveCount.style.fontSize = "1rem";
        totalActiveCount.style.color = "var(--error)";
    } finally {
        // Fade out loader
        pageLoader.style.opacity = '0';
        setTimeout(() => pageLoader.style.display = 'none', 300);
    }

    // Helper: Counter animation
    function animateValue(obj, start, end, duration) {
        let startTimestamp = null;
        const step = (timestamp) => {
            if (!startTimestamp) startTimestamp = timestamp;
            const progress = Math.min((timestamp - startTimestamp) / duration, 1);
            obj.innerHTML = Math.floor(progress * (end - start) + start);
            if (progress < 1) {
                window.requestAnimationFrame(step);
            } else {
                obj.innerHTML = end; // Ensure exact final value
            }
        };
        window.requestAnimationFrame(step);
    }
});
