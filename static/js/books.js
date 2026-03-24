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
        container.innerHTML = `<div class="empty-state">⚠ Error loading — please refresh.</div>`;
    }
}

// Borrow 

async function borrowBook(urn, name, title, author) {
    try {
        await apiFetch('/api/borrow', 'POST', {
            urn,
            student_name: name,
            book_title:   title,
            author:       author || null,
        });
        showToast(`"${title}" borrowed — happy reading!`);
        loadBorrows();
        if (typeof loadStats     === 'function') loadStats();
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

// Return 

async function returnBook(recordId, bookTitle) {
    if (!confirm(`Return "${bookTitle}"?`)) return;

    try {
        await apiFetch('/api/return', 'POST', { record_id: recordId });
        showToast(`"${bookTitle}" returned — thank you!`);
        loadBorrows();
        if (typeof loadStats     === 'function') loadStats();
        if (typeof loadAdminData === 'function') loadAdminData();
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

        const success = await borrowBook(urn, name, title, author);

        borrowBtn.disabled = false;
        borrowBtn.textContent = orig;

        if (success) {
            document.getElementById('borrow-urn').value    = '';
            document.getElementById('borrow-name').value   = '';
            document.getElementById('borrow-title').value  = '';
            document.getElementById('borrow-author').value = '';
        }
    });
});