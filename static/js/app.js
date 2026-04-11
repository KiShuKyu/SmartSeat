const POLL_INTERVAL = 10_000; // 10 seconds

// Tab switching

function switchTab(tabName) {
    document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
    document.querySelectorAll('.nav-btn').forEach(b => {
        b.classList.toggle('active', b.dataset.tab === tabName);
    });

    const page = document.getElementById(`page-${tabName}`);
    if (page) page.classList.add('active');

    // Lock admin when navigating away — require re-auth on return
    if (tabName !== 'admin' && typeof clearAdminToken === 'function') {
        clearAdminToken();
    }

    // Eagerly refresh data for the newly visible tab
    switch (tabName) {
        case 'seats': loadSeats?.();     break;
        case 'books': loadBorrows?.();   break;
        case 'browse': loadBrowse?.();   break;
        case 'admin':
            // Always show login on entering admin — session-only
            if (typeof getAdminToken === 'function' && getAdminToken()) {
                loadAdminData?.();
            } else {
                showModal?.('admin-login-modal');
            }
            break;
    }
}

// Polling

function startPolling() {
    setInterval(() => {
        const active = document.querySelector('.page.active');
        if (!active) return;

        switch (active.id) {
            case 'page-seats': loadSeats?.();     break;
            case 'page-books': loadBorrows?.();   break;
            case 'page-browse': loadBrowse?.();   break;
            case 'page-admin':
                if (typeof getAdminToken === 'function' && getAdminToken()) {
                    loadAdminData?.();
                }
                break;
        }
    }, POLL_INTERVAL);
}

// Init

document.addEventListener('DOMContentLoaded', () => {
    // Wire nav buttons
    document.querySelectorAll('.nav-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const tab = btn.dataset.tab;
            if (tab) switchTab(tab);
        });
    });

    switchTab('seats');
    clearAdminToken();

    // Initial load
    loadSeats?.();
    loadBorrows?.();

    // Start background refresh
    startPolling();
});
