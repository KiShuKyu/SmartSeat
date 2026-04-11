const API_BASE = '';

/**
 * Fetch wrapper with JSON error handling.
 * @param {string} endpoint
 * @param {'GET'|'POST'|'PUT'|'DELETE'} method
 * @param {object|null} body
 * @param {boolean} raw - if true, body is sent as FormData (for file uploads)
 * @returns {Promise<any>}
 */
async function apiFetch(endpoint, method = 'GET', body = null, raw = false) {
    const options = {
        method,
        headers: {},
    };

    if (raw) {
        // FormData — don't set Content-Type, let the browser set it with boundary
        options.body = body;
    } else if (body !== null) {
        options.headers['Content-Type'] = 'application/json';
        options.body = JSON.stringify(body);
    }

    try {
        const token = getAdminToken();
        if (token) options.headers['Authorization'] = `Bearer ${token}`;
    } catch {}

    const response = await fetch(`${API_BASE}${endpoint}`, options);

    if (!response.ok) {
        let detail;
        try {
            const err = await response.json();
            detail = err.detail || `HTTP ${response.status}`;
        } catch {
            detail = `Request failed (${response.status})`;
        }
        throw new Error(detail);
    }

    const ct = response.headers.get('content-type') || '';
    return ct.includes('application/json') ? response.json() : response.text();
}


function getAdminToken() {
    return localStorage.getItem('adminToken') || '';
}

function setAdminToken(token) {
    if (token) localStorage.setItem('adminToken', token);
}

function clearAdminToken() {
    localStorage.removeItem('adminToken');
}


let _toastTimer = null;

/**
 * Display a toast notification.
 * @param {string} message
 * @param {number} duration  ms, default 3 s
 */
function showToast(message, duration = 3000) {
    const toast = document.getElementById('toast');
    if (!toast) return;

    // Clear any queued hide
    if (_toastTimer) clearTimeout(_toastTimer);

    toast.textContent = message;
    toast.classList.add('show');

    _toastTimer = setTimeout(() => {
        toast.classList.remove('show');
        _toastTimer = null;
    }, duration);
}
