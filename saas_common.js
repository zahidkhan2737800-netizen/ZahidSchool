(function () {
    'use strict';

    function waitForAuth() {
        return new Promise(resolve => {
            if (window.authReady) return resolve();
            window.addEventListener('authready', resolve, { once: true });
        });
    }

    async function ready(activePage) {
        await waitForAuth();
        if (window.userRoleName !== 'super_admin') {
            window.location.href = 'dashboard.html?denied=1';
            return false;
        }
        document.querySelectorAll('.saas-nav a').forEach(link => {
            link.classList.toggle('active', link.dataset.page === activePage);
        });
        return true;
    }

    function escapeHtml(value) {
        return String(value ?? '').replace(/[&<>"']/g, char => ({
            '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
        })[char]);
    }

    function toast(message, type = 'success') {
        const element = document.getElementById('saasToast');
        if (!element) return;
        element.textContent = message;
        element.className = `saas-toast show ${type}`;
        window.clearTimeout(element._timer);
        element._timer = window.setTimeout(() => element.classList.remove('show'), 4200);
    }

    window.SaasAdmin = { ready, escapeHtml, toast };
})();
