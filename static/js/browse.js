let allBooksData = [];

// Load all books from inventory
async function loadBrowse() {
    try {
        const books = await apiFetch('/api/books');
        allBooksData = books;
        renderBrowseTable(books);
    } catch (err) {
        console.error('Failed to load books inventory:', err);
        const tbody = document.getElementById('browse-table-body');
        if (tbody) {
            tbody.innerHTML = `<tr><td colspan="6" class="table-empty">⚠ Error loading — please refresh.</td></tr>`;
        }
    }
}

// Render the browse table
function renderBrowseTable(books) {
    const tbody = document.getElementById('browse-table-body');
    if (!tbody) return;

    if (!books.length) {
        tbody.innerHTML = `<tr><td colspan="6" class="table-empty">No books in inventory yet.</td></tr>`;
        return;
    }

    tbody.innerHTML = books.map((b, i) => `
        <tr>
            <td class="mono">#${b.id}</td>
            <td><strong>${escapeHtml(b.title)}</strong></td>
            <td>${b.author ? escapeHtml(b.author) : '—'}</td>
            <td class="mono">${escapeHtml(b.shelf)}</td>
            <td>
                <span class="avail-badge ${b.available > 0 ? 'avail-yes' : 'avail-no'}">
                    ${b.available} / ${b.quantity}
                </span>
            </td>
            <td>
                ${b.available > 0
                    ? `<button class="action-btn borrow-btn"
                           data-title="${escapeHtml(b.title)}"
                           data-author="${escapeHtml(b.author || '')}"
                           data-shelf="${escapeHtml(b.shelf)}">
                           Borrow
                       </button>`
                    : `<span class="unavailable-text">Out of stock</span>`
                }
            </td>
        </tr>
    `).join('');

    // Wire up borrow buttons
    tbody.querySelectorAll('.borrow-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const title  = btn.dataset.title;
            const author = btn.dataset.author;
            const shelf  = btn.dataset.shelf;
            openGuidelinesModal(title, author, shelf);
        });
    });
}

// Open the guidelines modal
function openGuidelinesModal(title, author, shelf) {
    window.pendingBorrowBook = { title, author, shelf };

    const info = document.getElementById('guidelines-book-info');
    if (info) {
        info.innerHTML = `
            <strong>Book:</strong> ${escapeHtml(title)}
            ${author ? `<br><strong>Author:</strong> ${escapeHtml(author)}` : ''}
            <br><strong>Shelf:</strong> ${escapeHtml(shelf)}
        `;
    }

    // Reset checkbox and confirm button
    const cb = document.getElementById('guidelines-checkbox');
    const btn = document.getElementById('guidelines-confirm-btn');
    if (cb) cb.checked = false;
    if (btn) btn.disabled = true;

    showModal('guidelines-modal');
}

// Search
function searchBrowseBooks() {
    const term = document.getElementById('browse-search').value.toLowerCase().trim();
    if (!term) {
        renderBrowseTable(allBooksData);
        return;
    }

    const filtered = allBooksData.filter(b =>
        b.title.toLowerCase().includes(term) ||
        (b.author && b.author.toLowerCase().includes(term))
    );
    renderBrowseTable(filtered);
}

// Helpers (reuse from other files if available, safety fallbacks here)
function escapeHtml(str) {
    if (!str) return '';
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

function showModal(id) {
    const el = document.getElementById(id);
    if (el) el.classList.add('show');
}
function hideModal(id) {
    const el = document.getElementById(id);
    if (el) el.classList.remove('show');
}

// Init
document.addEventListener('DOMContentLoaded', () => {
    document.getElementById('browse-search-btn')
        ?.addEventListener('click', searchBrowseBooks);

    document.getElementById('browse-show-all')
        ?.addEventListener('click', () => {
            document.getElementById('browse-search').value = '';
            renderBrowseTable(allBooksData);
        });

    document.getElementById('browse-search')
        ?.addEventListener('keydown', e => {
            if (e.key === 'Enter') searchBrowseBooks();
        });
});
