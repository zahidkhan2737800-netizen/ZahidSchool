// ═══════════════════════════════════════════════════════════════════════════════
// login.js — Login form handler for Zahid School System
// ═══════════════════════════════════════════════════════════════════════════════

const SUPABASE_URL = 'https://dkscydwftycubvwxondi.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRrc2N5ZHdmdHljdWJ2d3hvbmRpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQyNTMxOTQsImV4cCI6MjA4OTgyOTE5NH0.U84KKtJV2Lzz_FXbnXqlstvzzTW-FWBBtJTxbGlNYIE';
const supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

document.addEventListener('DOMContentLoaded', async () => {
    const form = document.getElementById('loginForm');
    const btn = document.getElementById('loginBtn');
    const errorMsg = document.getElementById('errorMsg');
    const infoMsg = document.getElementById('infoMsg');

    // Show info message from URL params (e.g., redirected from auth guard)
    const params = new URLSearchParams(window.location.search);
    const msg = params.get('msg');
    if (msg) {
        infoMsg.textContent = decodeURIComponent(msg);
        infoMsg.style.display = 'block';
    }

    // If already logged in, redirect to dashboard
    const { data: { session } } = await supabaseClient.auth.getSession();
    if (session) {
        window.location.href = 'dashboard.html';
        return;
    }

    // Handle login form
    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        errorMsg.style.display = 'none';
        infoMsg.style.display = 'none';

        const email = document.getElementById('email').value.trim();
        const password = document.getElementById('password').value;

        if (!email || !password) {
            showError('Please enter both email and password.');
            return;
        }

        // Show loading state
        btn.disabled = true;
        btn.classList.add('loading');

        try {
            const { data, error } = await supabaseClient.auth.signInWithPassword({
                email,
                password
            });

            if (error) {
                showError(error.message === 'Invalid login credentials'
                    ? '❌ Invalid email or password. Please try again.'
                    : `❌ ${error.message}`);
                return;
            }

            // Check if user has a role assigned
            const { data: roleData, error: roleError } = await supabaseClient
                .from('user_roles')
                .select('role_id, roles(role_name)')
                .eq('user_id', data.user.id)
                .single();

            if (roleError || !roleData) {
                await supabaseClient.auth.signOut();
                showError('⚠️ Your account has no role assigned. Please contact the administrator.');
                return;
            }

            // Success! Redirect to dashboard
            window.location.href = 'dashboard.html';

        } catch (err) {
            showError('❌ An unexpected error occurred. Please try again.');
            console.error('Login error:', err);
        } finally {
            btn.disabled = false;
            btn.classList.remove('loading');
        }
    });

    function showError(text) {
        errorMsg.textContent = text;
        errorMsg.style.display = 'block';
    }
});
