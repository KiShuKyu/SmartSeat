async function loadBorrows() {
    const container = document.getElementById('borrow-list');
    if (!container) return;

    try {
        const records = await apiFetch('/api/borrows');
        const active  = records.filter(r => !r.returned);

        if (!active.length) {
            container.innerHTML = `
                <div class="empty-state">
                    No books currently borrowed.<br>Use the form to borrow one!
                </div>`;
            return;
        }

        container.innerHTML = active.map(r => `
            <div class="borrow-item">
                <div style="flex:1;min-width:0;">
                    <div class="borrow-title">${escapeHtml(r.book_title)}</div>
                    ${r.author
                        ? `<div class="borrow-meta">by ${escapeHtml(r.author)}</div>`
                        : ''}
                    <div class="borrow-meta">
                        ${escapeHtml(r.student_name)} &middot;
                        URN ${r.urn} &middot;
                        ${formatDate(r.borrow_time)}
                    </div>
                </div>
                <div style="flex-shrink:0;text-align:right;">
                    <span class="badge-pill pill-borrowed">Borrowed</span>
                    <div>
                        <button class="ret-btn"
                            data-id="${r.id}"
                            data-title="${escapeHtml(r.book_title)}">
                            Return
                        </button>
                    </div>
                </div>
            </div>
        `).join('');

        container.querySelectorAll('.ret-btn').forEach(btn => {
            btn.addEventListener('click', async e => {
                const id    = parseInt(e.currentTarget.dataset.id, 10);
                const title = e.currentTarget.dataset.title;
                await returnBook(id, title);
            });
        });
    } catch (err) {
        console.error('Failed to load borrows:', err);
        container.innerHTML = `<div class="empty-state">⚠ Error loading - please refresh.</div>`;
    }
}

// Book Borrow — all borrows now go through inventory with penalty tracking

async function borrowFromInventory(urn, name, title) {
    try {
        await apiFetch('/api/borrow-book', 'POST', {
            urn,
            student_name: name,
            book_title:   title,
        });
        showToast(`"${title}" borrowed - due in 15 days!`);
        hideModal('guidelines-modal');
        loadBorrows();
        if (typeof loadStats  === 'function') loadStats();
        if (typeof loadBrowse === 'function') loadBrowse();
        if (typeof loadAdminData === 'function' &&
            document.getElementById('page-admin')?.classList.contains('active')) {
            loadAdminData();
        }
        return true;
    } catch (err) {
        showToast(`✗ ${err.message}`);
        return false;
    }
}

// Return (legacy borrow record — also restores inventory)

async function returnBook(recordId, bookTitle) {
    if (!confirm(`Return "${bookTitle}"?`)) return;

    try {
        await apiFetch('/api/return', 'POST', { record_id: recordId });
        showToast(`"${bookTitle}" returned - thank you!`);
        loadBorrows();
        if (typeof loadStats     === 'function') loadStats();
        if (typeof loadAdminData === 'function') loadAdminData();
        if (typeof loadBrowse    === 'function') loadBrowse();
    } catch (err) {
        showToast(`✗ ${err.message}`);
    }
}

// Helpers

function formatDate(ts) {
    if (!ts) return '—';
    return new Date(ts).toLocaleDateString(undefined, {
        day: 'numeric', month: 'short', year: 'numeric'
    });
}

function escapeHtml(str) {
    if (!str) return '';
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

// Init

document.addEventListener('DOMContentLoaded', () => {
    const borrowBtn = document.getElementById('borrow-btn');
    if (!borrowBtn) return;

    borrowBtn.addEventListener('click', async () => {
        const urnRaw = document.getElementById('borrow-urn').value.trim();
        const name   = document.getElementById('borrow-name').value.trim();
        const title  = document.getElementById('borrow-title').value.trim();
        const author = document.getElementById('borrow-author').value.trim();

        if (!urnRaw)         { return showToast('✗ Please enter your URN'); }
        const urn = parseInt(urnRaw, 10);
        if (isNaN(urn) || urn <= 0) { return showToast('✗ URN must be a valid positive number'); }
        if (!name)           { return showToast('✗ Please enter your full name'); }
        if (!title)          { return showToast('✗ Please enter the book title'); }

        // Disable button to prevent double-submit
        borrowBtn.disabled = true;
        const orig = borrowBtn.textContent;
        borrowBtn.textContent = 'Processing…';

        const success = await borrowFromInventory(urn, name, title);

        borrowBtn.disabled = false;
        borrowBtn.textContent = orig;

        if (success) {
            document.getElementById('borrow-urn').value    = '';
            document.getElementById('borrow-name').value   = '';
            document.getElementById('borrow-title').value  = '';
            document.getElementById('borrow-author').value = '';
            const dueDisplay = document.getElementById('borrow-due-display');
            if (dueDisplay) dueDisplay.style.display = 'none';
        }
    });

    // Guidelines modal
    const checkbox = document.getElementById('guidelines-checkbox');
    const confirmBtn = document.getElementById('guidelines-confirm-btn');
    if (checkbox && confirmBtn) {
        checkbox.addEventListener('change', () => {
            confirmBtn.disabled = !checkbox.checked;
        });
    }

    confirmBtn?.addEventListener('click', async () => {
        // Support both Browse page (modal fields) and Book Borrow page (form fields)
        const modalUrn      = document.getElementById('guidelines-urn');
        const modalName     = document.getElementById('guidelines-name');
        const borrowUrn     = document.getElementById('borrow-urn');
        const borrowName    = document.getElementById('borrow-name');

        const urnRaw    = (modalUrn ? modalUrn.value.trim() : '') || (borrowUrn ? borrowUrn.value.trim() : '');
        const nameRaw   = (modalName ? modalName.value.trim() : '') || (borrowName ? borrowName.value.trim() : '');

        const book      = window.pendingBorrowBook;
        if (!book) return;

        if (!urnRaw)         { return showToast('✗ Please enter your URN'); }
        const urn = parseInt(urnRaw, 10);
        if (isNaN(urn) || urn <= 0) { return showToast('✗ URN must be a valid positive number'); }
        if (!nameRaw)        { return showToast('✗ Please enter your full name'); }

        confirmBtn.disabled = true;
        confirmBtn.textContent = 'Processing…';
        const success = await borrowFromInventory(urn, nameRaw, book.title);
        confirmBtn.disabled = false;
        confirmBtn.textContent = 'Confirm Borrow';
        if (success) {
            checkbox.checked = false;
            // Clear modal fields if they exist
            if (modalUrn) modalUrn.value = '';
            if (modalName) modalName.value = '';
            // Clear form fields on Book Borrow page
            if (borrowUrn)  borrowUrn.value  = '';
            if (borrowName) borrowName.value = '';
            if (borrowUrn)  document.getElementById('borrow-title').value = '';
            if (borrowName) document.getElementById('borrow-author').value = '';
            const dueDisplay = document.getElementById('borrow-due-display');
            if (dueDisplay) dueDisplay.style.display = 'none';
        }
    });

    document.getElementById('guidelines-cancel-btn')
        ?.addEventListener('click', () => hideModal('guidelines-modal'));

    document.getElementById('close-guidelines-modal')
        ?.addEventListener('click', () => hideModal('guidelines-modal'));

    // Return confirmation modal handlers
    document.getElementById('confirm-return-btn')
        ?.addEventListener('click', async () => {
            const loanId = window.pendingReturnLoanId;
            const bookTitle = document.getElementById('return-book-title')?.textContent || '';
            if (!loanId) return;

            const btn = document.getElementById('confirm-return-btn');
            btn.disabled = true;
            btn.textContent = 'Processing…';

            try {
                const res = await apiFetch('/api/return-book', 'POST', { loan_id: loanId });
                const penaltyMsg = res.penalty_amount > 0
                    ? ` - Penalty: ₹${res.penalty_amount} (${res.days_late} day(s) late)`
                    : ' - returned on time!';
                showToast(`"${bookTitle}" returned${penaltyMsg}`);
                hideModal('return-confirm-modal');
                loadAdminData();
                if (typeof loadStats === 'function') loadStats();
            } catch (err) {
                showToast(`✗ ${err.message}`);
            } finally {
                btn.disabled = false;
                btn.textContent = 'Confirm Return';
            }
        });

    document.getElementById('close-return-confirm-modal')
        ?.addEventListener('click', () => hideModal('return-confirm-modal'));

    // Escape key for new modals
    document.addEventListener('keydown', e => {
        if (e.key === 'Escape') {
            hideModal('guidelines-modal');
            hideModal('return-confirm-modal');
        }
    });
});
