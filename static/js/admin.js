let currentFilter = 'all';
let allBorrowsData = [];
let allLoansData = [];
let allInventoryData = [];

// Load

async function loadAdminData() {
    try {
        const [reservations, borrows, loans, inventory] = await Promise.all([
            apiFetch('/api/reservations'),
            apiFetch('/api/borrows'),
            apiFetch('/api/admin/loans'),
            apiFetch('/api/books'),
        ]);

        allBorrowsData = borrows;
        allLoansData = loans;
        allInventoryData = inventory;

        const total   = borrows.length;
        const active  = borrows.filter(b => !b.returned).length;
        const returned = total - active;
        const activeLoans = loans.filter(l => !l.returned).length;

        setText('admin-total-borrows',    total);
        setText('admin-active-borrows',   active);
        setText('admin-active-loans',     activeLoans);
        setText('admin-total-reservations', reservations.length);

        renderReservations(reservations);
        renderBorrowHistory(borrows, currentFilter);
        renderReturnableBooks(borrows);
        renderActiveLoans(loans);
        renderInventory(inventory);
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


// Quick return table (active book loans)

function renderReturnableBooks(loans, filterFn = l => !l.returned) {
    const active = loans.filter(filterFn);
    const tbody  = document.getElementById('return-borrows-body');

    if (!active.length) {
        tbody.innerHTML = `<tr><td colspan="7" class="table-empty">All books are returned</td></tr>`;
        return;
    }

    tbody.innerHTML = active.map(l => `
        <tr>
            <td class="mono">#${l.id}</td>
            <td class="mono">${l.urn}</td>
            <td>${escapeHtml(l.student_name)}</td>
            <td><strong>${escapeHtml(l.book_title)}</strong></td>
            <td>${l.borrow_date ? fmtDate(l.borrow_date) : '—'}</td>
            <td class="mono">${l.due_date ? new Date(l.due_date).toLocaleDateString() : '—'}</td>
            <td>
                <button class="action-btn-small"
                    onclick="window.returnLoanFromQuick(${l.id}, '${escapeHtml(l.book_title)}')">
                    Return
                </button>
            </td>
        </tr>
    `).join('');
}

// Global helper for onclick attribute
window.returnLoanFromQuick = function(loanId, bookTitle) {
    const loan = allLoansData.find(l => l.id === loanId);
    if (!loan) { showToast('Loan not found'); return; }
    openReturnConfirmModal({
        id: loan.id, title: loan.title || loan.book_title,
        name: loan.student_name, urn: loan.urn,
        borrowDate: loan.borrow_date, dueDate: loan.due_date,
    });
};

// Active Loans table

function renderActiveLoans(loans) {
    const tbody = document.getElementById('admin-loans-body');
    if (!tbody) return;

    const now = new Date();
    const sortedLoans = [...loans].sort((a, b) => {
        // Active loans first, then returned; within each, by borrow_date desc
        if (a.returned !== b.returned) return a.returned ? 1 : -1;
        return new Date(b.borrow_date) - new Date(a.borrow_date);
    });

    tbody.innerHTML = sortedLoans.map(loan => {
        const borrowDate = new Date(loan.borrow_date);
        const dueDate    = loan.due_date ? new Date(loan.due_date) : null;
        const today      = now;

        let statusBadge = '';
        let daysInfo = '';

        if (loan.returned) {
            const retDate = loan.return_date ? new Date(loan.return_date) : null;
            statusBadge = `<span class="status-badge status-returned">✓ Returned</span>`;
            daysInfo = loan.penalty_amount > 0
                ? `₹${loan.penalty_amount} penalty`
                : 'On time';
        } else {
            const diffMs = dueDate ? dueDate - today : 0;
            const diffDays = diffMs > 0 ? Math.ceil(diffMs / 86400000) : Math.floor(Math.abs(diffMs) / 86400000);

            if (diffDays <= 0) {
                statusBadge = `<span class="status-badge status-overdue">⚠ ${Math.abs(diffDays)} day(s) overdue</span>`;
                daysInfo = `Penalty: ₹${Math.abs(diffDays) * 50}`;
            } else {
                statusBadge = `<span class="status-badge status-active">● ${diffDays} day(s) left</span>`;
                daysInfo = '';
            }
        }

        return `
            <tr>
                <td class="mono">#${loan.id}</td>
                <td class="mono">${loan.urn}</td>
                <td>${escapeHtml(loan.student_name)}</td>
                <td><strong>${escapeHtml(loan.book_title)}</strong></td>
                <td>${fmtDate(loan.borrow_date)}</td>
                <td>${dueDate ? dueDate.toLocaleDateString() : '—'}</td>
                <td>${statusBadge}<br><small style="color:var(--ink-muted)">${daysInfo}</small></td>
                <td>
                    ${!loan.returned
                        ? `<button class="action-btn loan-return-btn"
                               data-loan-id="${loan.id}"
                               data-title="${escapeHtml(loan.book_title)}"
                               data-name="${escapeHtml(loan.student_name)}"
                               data-urn="${loan.urn}"
                               data-borrow="${loan.borrow_date}"
                               data-due="${loan.due_date || ''}">
                               Return
                           </button>`
                        : '—'}
                </td>
            </tr>
        `;
    }).join('');

    // Wire up return buttons
    tbody.querySelectorAll('.loan-return-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            openReturnConfirmModal({
                id:       btn.dataset.loanId,
                title:    btn.dataset.title,
                name:     btn.dataset.name,
                urn:      btn.dataset.urn,
                borrowDate: btn.dataset.borrow,
                dueDate:  btn.dataset.due,
            });
        });
    });
}

// Return confirmation modal

function openReturnConfirmModal(loan) {
    window.pendingReturnLoanId = parseInt(loan.id, 10);

    document.getElementById('return-book-title').textContent = loan.title || loan.book_title || '—';
    document.getElementById('return-student').textContent = loan.name;
    document.getElementById('return-urn').textContent = loan.urn;
    document.getElementById('return-borrow-date').textContent = fmtDate(loan.borrowDate);
    document.getElementById('return-due-date').textContent = loan.dueDate ? fmtDate(loan.dueDate) : '—';

    // Calculate penalty preview
    const now = new Date();
    const due = loan.dueDate ? new Date(loan.dueDate) : null;
    const diffMs = due ? now - due : 0;
    const daysLate = diffMs > 0 ? Math.floor(diffMs / 86400000) : 0;
    const penalty = daysLate * 50;

    const penaltyDisplay = document.getElementById('penalty-display');
    const onTimeMsg = document.getElementById('on-time-msg');
    const penaltyAmount = document.getElementById('penalty-amount');
    const penaltyDays = document.getElementById('penalty-days');

    if (penalty > 0) {
        penaltyDisplay.style.display = 'block';
        onTimeMsg.style.display = 'none';
        penaltyAmount.textContent = `₹${penalty}`;
        penaltyDays.textContent = `${daysLate} day(s) late × ₹50/day`;
    } else {
        penaltyDisplay.style.display = 'none';
        onTimeMsg.style.display = 'block';
    }

    showModal('return-confirm-modal');
}

// Inventory table

function renderInventory(inventory) {
    const tbody = document.getElementById('admin-inventory-body');
    if (!tbody) return;

    if (!inventory.length) {
        tbody.innerHTML = `<tr><td colspan="6" class="table-empty">No books in inventory. Upload an Excel file above.</td></tr>`;
        return;
    }

    tbody.innerHTML = inventory.map(b => `
        <tr>
            <td class="mono">#${b.id}</td>
            <td><strong>${escapeHtml(b.title)}</strong></td>
            <td>${b.author ? escapeHtml(b.author) : '—'}</td>
            <td class="mono">${escapeHtml(b.shelf)}</td>
            <td>${b.quantity}</td>
            <td>
                <span class="avail-badge ${b.available > 0 ? 'avail-yes' : 'avail-no'}">
                    ${b.available}
                </span>
            </td>
        </tr>
    `).join('');
}

// Actions

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

async function clearReturnedLoans() {
    if (!confirm('Permanently delete all returned loan records?\n\nActive loans are kept. This cannot be undone.')) return;
    try {
        const res = await apiFetch('/api/admin/clear-returned-loans', 'POST');
        showToast(`${res.message}`);
        loadAdminData();
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
        '• Delete ALL book loans\n' +
        '• Delete ALL book inventory\n' +
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
        const [borrows, reservations, inventory, loans] = await Promise.all([
            apiFetch('/api/borrows'),
            apiFetch('/api/reservations'),
            apiFetch('/api/books'),
            apiFetch('/api/admin/loans'),
        ]);

        let csv = 'BORROW RECORDS\n';
        csv += 'ID,URN,Student Name,Book Title,Author,Borrowed,Returned,Status\n';
        borrows.forEach(b => {
            csv += `${b.id},${b.urn},"${esc(b.student_name)}","${esc(b.book_title)}","${esc(b.author || '')}","${b.borrow_time}","${b.return_time || ''}","${b.returned ? 'Returned' : 'Active'}"\n`;
        });

        csv += '\nBOOK LOANS\n';
        csv += 'ID,URN,Student Name,Book Title,Borrow Date,Due Date,Return Date,Penalty,Status\n';
        loans.forEach(l => {
            csv += `${l.id},${l.urn},"${esc(l.student_name)}","${esc(l.book_title)}","${l.borrow_date}","${l.due_date || ''}","${l.return_date || ''}","${l.penalty_amount || 0}","${l.returned ? 'Returned' : 'Active'}"\n`;
        });

        csv += '\nACTIVE SEAT RESERVATIONS\n';
        csv += 'Seat,URN,Student Name,Reserved Until\n';
        reservations.forEach(r => {
            csv += `${r.seat_id},${r.urn},"${esc(r.student_name)}","${r.end_time}"\n`;
        });

        csv += '\nBOOK INVENTORY\n';
        csv += 'ID,Title,Author,Shelf,Quantity,Available\n';
        inventory.forEach(i => {
            csv += `${i.id},"${esc(i.title)}","${esc(i.author || '')}","${esc(i.shelf)}",${i.quantity},${i.available}\n`;
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
        renderReturnableBooks(allLoansData);
        return;
    }

    renderReturnableBooks(
        allLoansData,
        l => !l.returned && (
            String(l.urn).includes(term) ||
            l.book_title.toLowerCase().includes(term) ||
            l.student_name.toLowerCase().includes(term)
        )
    );
}

// Excel Upload

async function uploadBooksExcel() {
    const fileInput = document.getElementById('excel-file-input');
    const errEl = document.getElementById('upload-error');

    if (!fileInput.files.length) {
        if (errEl) { errEl.textContent = 'Please select an Excel file first'; errEl.style.display = 'block'; }
        return;
    }

    const file = fileInput.files[0];
    if (errEl) errEl.style.display = 'none';

    const formData = new FormData();
    formData.append('file', file);

    const btn = document.getElementById('upload-books-btn');
    btn.disabled = true;
    btn.textContent = 'Uploading…';

    try {
        const options = {
            method: 'POST',
            headers: {},
            body: formData,
        };

        const token = getAdminToken();
        if (token) options.headers['Authorization'] = `Bearer ${token}`;

        const response = await fetch('/api/admin/upload-books', options);

        if (!response.ok) {
            const err = await response.json();
            throw new Error(err.detail || `HTTP ${response.status}`);
        }

        const res = await response.json();
        showToast(`${res.message}`);
        fileInput.value = '';
        loadAdminData();
        if (typeof loadBrowse === 'function') loadBrowse();
    } catch (err) {
        if (errEl) { errEl.textContent = err.message; errEl.style.display = 'block'; }
        showToast(`✗ ${err.message}`);
    } finally {
        btn.disabled = false;
        btn.textContent = 'Upload & Import';
    }
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
            renderReturnableBooks(allLoansData);
        });
    document.getElementById('return-search')
        ?.addEventListener('keydown', e => { if (e.key === 'Enter') searchBorrows(); });

    // Admin action buttons
    document.getElementById('clear-returned-books-btn')
        ?.addEventListener('click', clearReturnedBooks);
    document.getElementById('clear-returned-loans-btn')
        ?.addEventListener('click', clearReturnedLoans);
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

    // Excel upload
    document.getElementById('upload-books-btn')
        ?.addEventListener('click', uploadBooksExcel);
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
