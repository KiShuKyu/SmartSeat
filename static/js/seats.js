let currentSeatToReserve = null;
let selectedDuration = 2;


async function loadSeats() {
    try {
        const seats = await apiFetch('/api/seats');
        renderSeatMap(seats);
        await loadStats();
    } catch (err) {
        console.error('Failed to load seats:', err);
        showToast('⚠ Error loading seat map — please refresh');
    }
}

function renderSeatMap(seats) {
    const seatMap = {};
    seats.forEach(s => seatMap[s.id] = s);

    const frontRow = document.getElementById('front-row');
    if (frontRow) {
        frontRow.innerHTML = '';
        for (let i = 1; i <= 12; i++) {
            const id = `T${i}`;
            frontRow.appendChild(createSeatButton(seatMap[id] || { id, status: 'vacant' }));
        }
    }

    const clustersDiv = document.getElementById('clusters-area');
    if (!clustersDiv) return;
    clustersDiv.innerHTML = '';

    ['A', 'B'].forEach(letter => {
        const cluster = document.createElement('div');
        cluster.className = 'table-cluster';

        const lbl = document.createElement('div');
        lbl.className = 'section-label';
        lbl.textContent = `Table ${letter}`;
        cluster.appendChild(lbl);

        const inner = document.createElement('div');
        inner.className = 'cluster-inner';

        const leftCol  = document.createElement('div');
        leftCol.className = 'seat-col';

        // Give the table block a height proportional to number of seats
        const tableBlock = document.createElement('div');
        tableBlock.className = 'table-block';
        tableBlock.style.height = `${6 * (46 + 6) - 6}px`; // 6 seats × (height+gap) − last gap

        const rightCol = document.createElement('div');
        rightCol.className = 'seat-col';

        for (let row = 1; row <= 6; row++) {
            const lId = `${letter}${row}L`;
            const rId = `${letter}${row}R`;
            leftCol.appendChild(createSeatButton(seatMap[lId]  || { id: lId,  status: 'vacant' }));
            rightCol.appendChild(createSeatButton(seatMap[rId] || { id: rId, status: 'vacant' }));
        }

        inner.appendChild(leftCol);
        inner.appendChild(tableBlock);
        inner.appendChild(rightCol);
        cluster.appendChild(inner);
        clustersDiv.appendChild(cluster);
    });
}

function createSeatButton(seat) {
    const btn = document.createElement('button');
    btn.className = `seat ${seat.status}`;
    btn.textContent = seat.id;

    switch (seat.status) {
        case 'vacant':
            btn.title = '✓ Available — click to reserve';
            btn.addEventListener('click', () => openReserveModal(seat.id));
            break;

        case 'mine':
            btn.title = 'Your seat — click to release early';
            btn.addEventListener('click', () => openReleaseModal(seat));
            break;

        case 'occupied':
            btn.title = seat.student_name ? `Taken by ${seat.student_name}` : 'Occupied';
            btn.setAttribute('aria-disabled', 'true');
            btn.addEventListener('click', () => {
                showToast(seat.student_name
                    ? `Seat ${seat.id} is taken by ${seat.student_name}`
                    : `Seat ${seat.id} is currently occupied`
                );
            });
            break;
    }

    return btn;
}

// Stats 

async function loadStats() {
    try {
        const stats = await apiFetch('/api/stats');
        setText('stat-vacant',  stats.vacant        ?? 0);
        setText('stat-occupied', stats.occupied      ?? 0);
        setText('stat-borrows',  stats.active_borrows ?? 0);
        setText('stat-entries',  stats.today_entries  ?? 0);
    } catch (err) {
        console.error('Stats error:', err);
    }
}

function setText(id, val) {
    const el = document.getElementById(id);
    if (el) el.textContent = val;
}

// Reserve Modal 

function openReserveModal(seatId) {
    currentSeatToReserve = seatId;
    document.getElementById('modal-seat-label').textContent = `Seat ${seatId}`;
    document.getElementById('reserve-urn').value  = '';
    document.getElementById('reserve-name').value = '';
    hideError('reserve-error');
    showModal('reserve-modal');
    setTimeout(() => document.getElementById('reserve-urn').focus(), 220);
}

async function confirmReservation() {
    const urnInput = document.getElementById('reserve-urn').value.trim();
    const name     = document.getElementById('reserve-name').value.trim();

    if (!urnInput) { return showError('reserve-error', 'Please enter your URN'); }
    const urn = parseInt(urnInput, 10);
    if (isNaN(urn) || urn <= 0) { return showError('reserve-error', 'URN must be a valid positive number'); }
    if (!name)   { return showError('reserve-error', 'Please enter your full name'); }

    hideError('reserve-error');
    setButtonLoading('confirm-reserve-btn', true);

    try {
        await apiFetch('/api/reserve', 'POST', {
            seat_id:        currentSeatToReserve,
            urn,
            student_name:   name,
            duration_hours: selectedDuration,
        });
        hideModal('reserve-modal');
        showToast(`✓ Seat ${currentSeatToReserve} reserved for ${selectedDuration} hour${selectedDuration > 1 ? 's' : ''}`);
        loadSeats();
        if (isAdminActive()) loadAdminData?.();
    } catch (err) {
        showError('reserve-error', err.message);
    } finally {
        setButtonLoading('confirm-reserve-btn', false);
    }
}

// Release Modal 

function openReleaseModal(seat) {
    window.currentReleaseSeat = seat;
    document.getElementById('release-seat-label').textContent = `Seat ${seat.id}`;
    document.getElementById('reserved-student-name').textContent = seat.student_name || 'Unknown';
    document.getElementById('release-urn').value = '';
    hideError('release-error');
    showModal('release-modal');
    setTimeout(() => document.getElementById('release-urn').focus(), 220);
}

async function confirmRelease() {
    const urnInput = document.getElementById('release-urn').value.trim();
    const seat     = window.currentReleaseSeat;

    if (!urnInput) { return showError('release-error', 'Please enter your URN to verify'); }
    const urn = parseInt(urnInput, 10);
    if (isNaN(urn) || urn <= 0) { return showError('release-error', 'URN must be a valid positive number'); }

    hideError('release-error');
    setButtonLoading('confirm-release-btn', true);

    try {
        await apiFetch('/api/release', 'POST', { seat_id: seat.id, urn });
        hideModal('release-modal');
        showToast(`Seat ${seat.id} released — see you next time!`);
        loadSeats();
        if (isAdminActive()) loadAdminData?.();
    } catch (err) {
        showError('release-error', err.message);
    } finally {
        setButtonLoading('confirm-release-btn', false);
    }
}

// Helpers 

function showModal(id) { document.getElementById(id)?.classList.add('show'); }
function hideModal(id) { document.getElementById(id)?.classList.remove('show'); }

function showError(id, msg) {
    const el = document.getElementById(id);
    if (!el) return;
    el.textContent = msg;
    el.style.display = 'block';
}

function hideError(id) {
    const el = document.getElementById(id);
    if (el) el.style.display = 'none';
}

function setButtonLoading(id, loading) {
    const btn = document.getElementById(id);
    if (!btn) return;
    btn.disabled = loading;
    if (loading) {
        btn.dataset.originalText = btn.textContent;
        btn.textContent = 'Please wait…';
    } else {
        btn.textContent = btn.dataset.originalText || btn.textContent;
    }
}

function isAdminActive() {
    return document.getElementById('page-admin')?.classList.contains('active');
}

// Init 

document.addEventListener('DOMContentLoaded', () => {
    // Duration buttons
    document.querySelectorAll('.dur-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.dur-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            selectedDuration = parseInt(btn.dataset.hours, 10);
        });
    });

    // Reserve confirm
    document.getElementById('confirm-reserve-btn')
        ?.addEventListener('click', confirmReservation);

    // Release confirm
    document.getElementById('confirm-release-btn')
        ?.addEventListener('click', confirmRelease);

    // Enter key in URN fields triggers confirm
    document.getElementById('reserve-urn')
        ?.addEventListener('keydown', e => { if (e.key === 'Enter') confirmReservation(); });
    document.getElementById('reserve-name')
        ?.addEventListener('keydown', e => { if (e.key === 'Enter') confirmReservation(); });
    document.getElementById('release-urn')
        ?.addEventListener('keydown', e => { if (e.key === 'Enter') confirmRelease(); });

    // Close buttons
    document.getElementById('close-reserve-modal')
        ?.addEventListener('click', () => hideModal('reserve-modal'));
    document.getElementById('close-release-modal')
        ?.addEventListener('click', () => hideModal('release-modal'));

    // Escape key
    document.addEventListener('keydown', e => {
        if (e.key === 'Escape') {
            hideModal('reserve-modal');
            hideModal('release-modal');
        }
    });

    // Click outside modal
    document.querySelectorAll('.overlay').forEach(overlay => {
        overlay.addEventListener('click', e => {
            if (e.target === overlay) overlay.classList.remove('show');
        });
    });
});