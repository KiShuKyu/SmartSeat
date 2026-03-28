let currentFilter = 'all';
let allBorrowsData = [];

// Load 

async function loadAdminData() {
    try {
        const [reservations, borrows] = await Promise.all([
            apiFetch('/api/reservations'),
            apiFetch('/api/borrows'),
        ]);

        allBorrowsData = borrows;

        const total   = borrows.length;
        const active  = borrows.filter(b => !b.returned).length;
        const returned = total - active;

        setText('admin-total-borrows',    total);
        setText('admin-active-borrows',   active);
        setText('admin-total-returns',    returned);
        setText('admin-total-reservations', reservations.length);

        renderReservations(reservations);
        renderBorrowHistory(borrows, currentFilter);
        renderReturnableBooks(borrows);
    } catch (err) {
        console.error('Admin load error:', err);
        showToast('Error loading admin data');
    }
}

// Reservations table 

function renderReservations(reservations) {
    const tbody = document.getElementById('admin-res-body');
    if (!tbody) return;

    if (!reservations.length) {
        tbody.innerHTML = `<tr><td colspan="6" class="table-empty">No active seat reservations</td></tr>`;
        return;
    }

    const now = new Date();

    tbody.innerHTML = reservations.map(res => {
        const end      = res.end_time ? new Date(res.end_time) : null;
        const isActive = res.active && end && end > now;
        const timeLeft = isActive ? fmtTimeLeft(end) : 'Expired';

        return `
            <tr>
                <td class="mono"><strong>${escapeHtml(res.seat_id)}</strong></td>
                <td class="mono">${res.urn}</td>
                <td>${escapeHtml(res.student_name)}</td>
                <td>${end ? end.toLocaleString() : '—'}</td>
                <td>
                    <span class="status-badge ${isActive ? 'status-active' : 'status-returned'}">
                        ${isActive ? `● ${timeLeft}` : '○ Expired'}
                    </span>
                </td>
                <td>
                    ${isActive
                        ? `<button class="action-btn-small"
                               onclick="forceReleaseSeat('${res.seat_id}', ${res.urn})">
                               Force Release
                           </button>`
                        : '—'}
                </td>
            </tr>`;
    }).join('');
}

// Borrow history table 

function renderBorrowHistory(borrows, filter) {
    const filtered = filter === 'active'   ? borrows.filter(b => !b.returned)
                   : filter === 'returned' ? borrows.filter(b =>  b.returned)
                   : borrows;

    const tbody = document.getElementById('admin-borrow-body');
    setText('borrow-count', filtered.length);

    if (!filtered.length) {
        tbody.innerHTML = `<tr><td colspan="8" class="table-empty">No records found</td></tr>`;
        return;
    }

    tbody.innerHTML = filtered.map(b => `
        <tr>
            <td class="mono">#${b.id}</td>
            <td class="mono">${b.urn}</td>
            <td>${escapeHtml(b.student_name)}</td>
            <td><strong>${escapeHtml(b.book_title)}</strong></td>
            <td>${b.author ? escapeHtml(b.author) : '—'}</td>
            <td>${fmtDate(b.borrow_time)}</td>
            <td>${b.return_time ? fmtDate(b.return_time) : '—'}</td>
            <td>
                <span class="status-badge ${b.returned ? 'status-returned' : 'status-active'}">
                    ${b.returned ? '✓ Returned' : '● Active'}
                </span>
            </td>
        </tr>
    `).join('');
}

// Quick return table 

function renderReturnableBooks(borrows, filterFn = b => !b.returned) {
    const active = borrows.filter(filterFn);
    const tbody  = document.getElementById('return-borrows-body');

    if (!active.length) {
        tbody.innerHTML = `<tr><td colspan="7" class="table-empty">All books are returned</td></tr>`;
        return;
    }

    tbody.innerHTML = active.map(b => `
        <tr>
            <td class="mono">${b.id}</td>
            <td class="mono">${b.urn}</td>
            <td>${escapeHtml(b.student_name)}</td>
            <td><strong>${escapeHtml(b.book_title)}</strong></td>
            <td>${b.author ? escapeHtml(b.author) : '—'}</td>
            <td>${fmtDate(b.borrow_time)}</td>
            <td>
                <button class="action-btn-small"
                    onclick="returnBookFromAdmin(${b.id}, '${escapeHtml(b.book_title)}')">
                    Return
                </button>
            </td>
        </tr>
    `).join('');
}

// Actions 

async function returnBookFromAdmin(recordId, bookTitle) {
    if (!confirm(`Return "${bookTitle}"?`)) return;
    try {
        await apiFetch('/api/return', 'POST', { record_id: recordId });
        showToast(`"${bookTitle}" returned`);
        loadAdminData();
        if (typeof loadBorrows === 'function') loadBorrows();
        if (typeof loadStats   === 'function') loadStats();
    } catch (err) {
        showToast(`✗ ${err.message}`);
    }
}

async function forceReleaseSeat(seatId, urn) {
    if (!confirm(`Force-release seat ${seatId}? This frees it for other students.`)) return;
    try {
        await apiFetch('/api/release', 'POST', { seat_id: seatId, urn });
        showToast(`Seat ${seatId} released`);
        loadAdminData();
        if (typeof loadSeats === 'function') loadSeats();
    } catch (err) {
        showToast(`✗ ${err.message}`);
    }
}

async function clearReturnedBooks() {
    if (!confirm('Permanently delete all returned book records?\n\nActive borrows are kept. This cannot be undone.')) return;
    try {
        const res = await apiFetch('/api/admin/clear-returned', 'POST');
        showToast(`🧹 ${res.message}`);
        loadAdminData();
        if (typeof loadBorrows === 'function') loadBorrows();
    } catch (err) {
        showToast(`✗ ${err.message}`);
    }
}

async function clearExpiredReservations() {
    if (!confirm('Clear all expired seat reservations?\n\nThis releases seats that were not freed properly.')) return;
    try {
        const res = await apiFetch('/api/admin/clear-expired', 'POST');
        showToast(`${res.message}`);
        loadAdminData();
        if (typeof loadSeats === 'function') loadSeats();
    } catch (err) {
        showToast(`✗ ${err.message}`);
    }
}

async function resetDemoData() {
    const confirmed = confirm(
        'RESET ALL DATA\n\n' +
        'This will:\n' +
        '• Delete ALL borrow records\n' +
        '• Delete ALL entry logs\n' +
        '• Reset every seat to vacant\n\n' +
        'This action is permanent and cannot be undone. Continue?'
    );
    if (!confirmed) return;
    try {
        await apiFetch('/api/admin/reset-demo', 'POST');
        showToast('All data reset. Reloading…');
        setTimeout(() => location.reload(), 1200);
    } catch (err) {
        showToast(`✗ ${err.message}`);
    }
}

async function exportData() {
    try {
        const [borrows, reservations] = await Promise.all([
            apiFetch('/api/borrows'),
            apiFetch('/api/reservations'),
        ]);

        let csv = 'BORROW RECORDS\n';
        csv += 'ID,URN,Student Name,Book Title,Author,Borrowed,Returned,Status\n';
        borrows.forEach(b => {
            csv += `${b.id},${b.urn},"${esc(b.student_name)}","${esc(b.book_title)}","${esc(b.author || '')}","${b.borrow_time}","${b.return_time || ''}","${b.returned ? 'Returned' : 'Active'}"\n`;
        });

        csv += '\nACTIVE SEAT RESERVATIONS\n';
        csv += 'Seat,URN,Student Name,Reserved Until\n';
        reservations.forEach(r => {
            csv += `${r.seat_id},${r.urn},"${esc(r.student_name)}","${r.end_time}"\n`;
        });

        const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
        const url  = URL.createObjectURL(blob);
        const a    = Object.assign(document.createElement('a'), {
            href:     url,
            download: `smartseat_export_${new Date().toISOString().slice(0, 19).replace(/:/g, '-')}.csv`,
        });
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);

        showToast('CSV exported successfully');
    } catch (err) {
        showToast(`Export failed: ${err.message}`);
    }
}

// Search 

function searchBorrows() {
    const term = document.getElementById('return-search').value.toLowerCase().trim();
    if (!term) {
        renderReturnableBooks(allBorrowsData);
        return;
    }

    renderReturnableBooks(
        allBorrowsData,
        b => !b.returned && (
            String(b.urn).includes(term) ||
            b.book_title.toLowerCase().includes(term) ||
            b.student_name.toLowerCase().includes(term)
        )
    );
}

// Helpers 

function setText(id, val) {
    const el = document.getElementById(id);
    if (el) el.textContent = val;
}

function fmtDate(ts) {
    if (!ts) return '—';
    return new Date(ts).toLocaleDateString(undefined, {
        day: 'numeric', month: 'short', year: 'numeric',
    });
}

function fmtTimeLeft(end) {
    const diff = end - new Date();
    if (diff <= 0) return 'Expired';
    const h = Math.floor(diff / 3_600_000);
    const m = Math.floor((diff % 3_600_000) / 60_000);
    return h > 0 ? `${h}h ${m}m left` : `${m}m left`;
}

function escapeHtml(str) {
    if (!str) return '';
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

const esc = s => String(s || '').replace(/"/g, '""');  // CSV-safe quoting

// Init 

document.addEventListener('DOMContentLoaded', () => {
    // Filter buttons
    document.querySelectorAll('.filter-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            currentFilter = btn.dataset.filter;
            renderBorrowHistory(allBorrowsData, currentFilter);
        });
    });

    // Search
    document.getElementById('search-borrows-btn')
        ?.addEventListener('click', searchBorrows);
    document.getElementById('show-all-borrows-btn')
        ?.addEventListener('click', () => {
            document.getElementById('return-search').value = '';
            renderReturnableBooks(allBorrowsData);
        });
    document.getElementById('return-search')
        ?.addEventListener('keydown', e => { if (e.key === 'Enter') searchBorrows(); });

    // Admin action buttons
    document.getElementById('clear-returned-books-btn')
        ?.addEventListener('click', clearReturnedBooks);
    document.getElementById('clear-old-reservations-btn')
        ?.addEventListener('click', clearExpiredReservations);
    document.getElementById('export-data-btn')
        ?.addEventListener('click', exportData);
    document.getElementById('reset-demo-data-btn')
        ?.addEventListener('click', resetDemoData);
    document.getElementById('admin-login-btn')
        ?.addEventListener('click', adminLogin);
    document.getElementById('admin-password')
        ?.addEventListener('keydown', e => { if (e.key === 'Enter') adminLogin(); });
    document.getElementById('close-admin-login-modal')
        ?.addEventListener('click', () => hideModal?.('admin-login-modal'));
});

async function adminLogin() {
    const input = document.getElementById('admin-password');
    const errEl = document.getElementById('admin-login-error');
    if (!input) return;
    const password = input.value.trim();
    if (!password) {
        if (errEl) { errEl.textContent = 'Please enter password'; errEl.style.display = 'block'; }
        return;
    }
    if (errEl) errEl.style.display = 'none';
    try {
        const res = await apiFetch('/api/admin/login', 'POST', { password });
        if (res && res.token) {
            setAdminToken(res.token);
            hideModal?.('admin-login-modal');
            switchTab?.('admin');
        } else {
            if (errEl) { errEl.textContent = 'Invalid response'; errEl.style.display = 'block'; }
        }
    } catch (err) {
        if (errEl) { errEl.textContent = err.message; errEl.style.display = 'block'; }
    }
}
