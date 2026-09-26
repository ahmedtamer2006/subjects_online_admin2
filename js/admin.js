/* ===================================================
   SUBJECTS ONLINE — Admin Panel Core Logic (admin.js)
   2nd Year — Faculty of Commerce
   Real-time Firestore Student Registry Management
   =================================================== */

// ── 0. State ──────────────────────────────────────────────────────────────────
let adminSearchQuery = '';
let adminAuthFilter = 'all';
let adminStatusFilter = 'all';
let firestoreUnsub = null;
let studentsCache = [];

// ── 1. Admin Gate ─────────────────────────────────────────────────────────────
const ADMIN_PASSWORDS = ['Ahmed_Tamer2006@elgamel.com', 'admin', 'admin123', 'admin2026'];

function checkAdminAuth() {
    return sessionStorage.getItem('so_admin_authenticated') === 'true';
}

function showAdminLogin() {
    document.getElementById('admin-login-screen').classList.remove('hidden');
    document.getElementById('admin-dashboard').classList.add('hidden');
    const input = document.getElementById('admin-password-input');
    if (input) input.focus();
}

function showAdminDashboard() {
    document.getElementById('admin-login-screen').classList.add('hidden');
    document.getElementById('admin-dashboard').classList.remove('hidden');
    initDashboard();
}

function attemptAdminLogin() {
    const input = document.getElementById('admin-password-input');
    const errorEl = document.getElementById('admin-login-error');
    if (!input) return;

    const password = input.value.trim();
    if (ADMIN_PASSWORDS.includes(password)) {
        sessionStorage.setItem('so_admin_authenticated', 'true');
        if (errorEl) errorEl.classList.add('hidden');
        showAdminDashboard();
    } else {
        if (errorEl) {
            errorEl.textContent = 'Incorrect password. Access denied.';
            errorEl.classList.remove('hidden');
        }
        input.value = '';
        input.focus();
        // Shake animation
        input.classList.add('shake');
        setTimeout(() => input.classList.remove('shake'), 500);
    }
}

function adminLogout() {
    sessionStorage.removeItem('so_admin_authenticated');
    if (firestoreUnsub) {
        firestoreUnsub();
        firestoreUnsub = null;
    }
    showAdminLogin();
}

// ── 2. Dashboard Initialization ──────────────────────────────────────────────
function initDashboard() {
    subscribeToFirestore();
    bindEvents();
    updateLastRefreshTime();
}

// ── 3. Firestore Real-time Listener ──────────────────────────────────────────
function subscribeToFirestore() {
    try {
        const db = getFirebaseDB();
        if (!db) {
            console.error('Firebase not available');
            showToast('Connection Error', 'Could not connect to Firebase.', 'error');
            return;
        }

        if (firestoreUnsub) firestoreUnsub();

        firestoreUnsub = db.collection('students_registry')
            .orderBy('lastLogin', 'desc')
            .onSnapshot((snapshot) => {
                const students = [];
                snapshot.forEach(doc => {
                    const data = doc.data();
                    // Show all registered users
                    students.push({ ...data, _docId: doc.id });
                });

                studentsCache = students;
                renderStats();
                renderStudentTable();
                updateLastRefreshTime();
            }, (err) => {
                console.error('Firestore listener error:', err);
                showToast('Sync Error', 'Lost connection to Firebase. Retrying...', 'error');
            });
    } catch (e) {
        console.error('Firestore subscribe error:', e);
    }
}

function updateLastRefreshTime() {
    const el = document.getElementById('last-refresh-time');
    if (el) {
        el.textContent = new Date().toLocaleTimeString('en-US', {
            hour: '2-digit', minute: '2-digit', second: '2-digit'
        });
    }
}

// ── 4. Stats Rendering ───────────────────────────────────────────────────────
function renderStats() {
    const total = studentsCache.length;
    const google = studentsCache.filter(s => s.loginType === 'google').length;
    const manual = studentsCache.filter(s => s.loginType === 'manual').length;
    const blocked = studentsCache.filter(s => s.isBlocked).length;

    animateCounter('stat-total', total);
    animateCounter('stat-google', google);
    animateCounter('stat-manual', manual);
    animateCounter('stat-blocked', blocked);
}

function animateCounter(id, target) {
    const el = document.getElementById(id);
    if (!el) return;
    const current = parseInt(el.textContent, 10) || 0;
    if (current === target) return;

    const duration = 400;
    const start = performance.now();

    function step(now) {
        const progress = Math.min((now - start) / duration, 1);
        const eased = 1 - Math.pow(1 - progress, 3); // ease-out cubic
        el.textContent = Math.round(current + (target - current) * eased);
        if (progress < 1) requestAnimationFrame(step);
    }
    requestAnimationFrame(step);
}

// ── 5. Student Table Rendering ───────────────────────────────────────────────
function getFilteredStudents() {
    let list = [...studentsCache];

    // Search filter
    if (adminSearchQuery.trim()) {
        const q = adminSearchQuery.toLowerCase().trim();
        list = list.filter(s =>
            (s.name && s.name.toLowerCase().includes(q)) ||
            (s.email && s.email.toLowerCase().includes(q)) ||
            (s.password && s.password.toLowerCase().includes(q)) ||
            (s.id && s.id.toLowerCase().includes(q)) ||
            (s.uid && s.uid.toLowerCase().includes(q))
        );
    }

    // Auth filter
    if (adminAuthFilter === 'google') {
        list = list.filter(s => s.loginType === 'google');
    } else if (adminAuthFilter === 'manual') {
        list = list.filter(s => s.loginType === 'manual');
    }

    // Status filter
    if (adminStatusFilter === 'active') {
        list = list.filter(s => !s.isBlocked);
    } else if (adminStatusFilter === 'blocked') {
        list = list.filter(s => s.isBlocked);
    }

    return list;
}

function renderStudentTable() {
    const tbody = document.getElementById('students-tbody');
    const emptyState = document.getElementById('empty-state');
    const countBadge = document.getElementById('table-count');
    if (!tbody) return;

    const filtered = getFilteredStudents();

    if (countBadge) {
        countBadge.textContent = `${filtered.length} Student${filtered.length !== 1 ? 's' : ''}`;
    }

    if (filtered.length === 0) {
        tbody.innerHTML = '';
        if (emptyState) {
            emptyState.classList.remove('hidden');
            if (adminSearchQuery.trim() || adminAuthFilter !== 'all' || adminStatusFilter !== 'all') {
                emptyState.querySelector('h3').textContent = 'No Matching Students';
                emptyState.querySelector('p').textContent = 'Try adjusting your search or filters.';
            } else {
                emptyState.querySelector('h3').textContent = 'No Students Yet';
                emptyState.querySelector('p').textContent = 'When students log in to Subjects Online, they will appear here in real-time.';
            }
        }
        return;
    }

    if (emptyState) emptyState.classList.add('hidden');

    tbody.innerHTML = filtered.map((student, index) => {
        const isGoogle = student.loginType === 'google';
        const isBlocked = !!student.isBlocked;
        const initial = (student.name || 'S').charAt(0).toUpperCase();
        const docId = student._docId || student.id || student.uid;

        const registeredDate = student.registeredAt
            ? new Date(student.registeredAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
            : '—';
        const lastLoginDate = student.lastLogin
            ? new Date(student.lastLogin).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) + ' ' +
              new Date(student.lastLogin).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })
            : '—';

        const passId = `pass-${docId}`.replace(/[^a-zA-Z0-9_-]/g, '_');

        return `
        <tr class="table-row ${isBlocked ? 'blocked-row' : ''}" style="animation-delay: ${index * 30}ms">
            <!-- Avatar & Name -->
            <td class="px-4 py-3.5 sm:px-6">
                <div class="flex items-center gap-3">
                    <div class="avatar ${isBlocked ? 'avatar-blocked' : ''}">
                        ${student.photoURL
                            ? `<img src="${student.photoURL}" alt="${student.name}" class="w-full h-full object-cover rounded-full">`
                            : `<span>${initial}</span>`}
                    </div>
                    <div class="min-w-0">
                        <div class="font-semibold text-sm text-slate-900 dark:text-white truncate">${student.name || 'Student'}</div>
                        <div class="text-[11px] text-slate-400 dark:text-slate-500 font-mono truncate">${student.email || 'No email'}</div>
                    </div>
                </div>
            </td>

            <!-- Auth Method -->
            <td class="px-4 py-3.5 hidden sm:table-cell">
                ${isGoogle ? `
                    <span class="badge badge-google">
                        <svg class="w-3.5 h-3.5" viewBox="0 0 48 48"><path fill="#FFC107" d="M43.611,20.083H42V20H24v8h11.303c-1.649,4.657-6.08,8-11.303,8c-6.627,0-12-5.373-12-12c0-6.627,5.373-12,12-12c3.059,0,5.842,1.154,7.961,3.039l5.657-5.657C34.046,6.053,29.268,4,24,4C12.955,4,4,12.955,4,24c0,11.045,8.955,20,20,20c11.045,0,20-8.955,20-20C44,22.659,43.862,21.35,43.611,20.083z"/><path fill="#FF3D00" d="M6.306,14.691l6.571,4.819C14.655,15.108,18.961,12,24,12c3.059,0,5.842,1.154,7.961,3.039l5.657-5.657C34.046,6.053,29.268,4,24,4C16.318,4,9.656,8.337,6.306,14.691z"/><path fill="#4CAF50" d="M24,44c5.166,0,9.86-1.977,13.409-5.192l-6.19-5.238C29.211,35.091,26.715,36,24,36c-5.202,0-9.619-3.317-11.283-7.946l-6.522,5.025C9.505,39.556,16.227,44,24,44z"/><path fill="#1976D2" d="M43.611,20.083H42V20H24v8h11.303c-0.792,2.237-2.231,4.166-4.087,5.571c0.001-0.001,0.002-0.001,0.003-0.002l6.19,5.238C36.971,39.205,44,34,44,24C44,22.659,43.862,21.35,43.611,20.083z"/></svg>
                        Google
                    </span>
                ` : `
                    <span class="badge badge-manual">
                        <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z"/></svg>
                        Password
                    </span>
                `}
            </td>

            <!-- Credentials -->
            <td class="px-4 py-3.5 hidden md:table-cell">
                <div class="flex items-center gap-1.5">
                    ${isGoogle ? `
                        <span class="credential-text truncate max-w-[180px]" title="${student.email}">${student.email || '—'}</span>
                        <button onclick="copyText('${(student.email || '').replace(/'/g, "\\'")}', this)" class="credential-btn" title="Copy Email">
                            <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"/></svg>
                        </button>
                    ` : `
                        <span id="${passId}" class="credential-text credential-password truncate max-w-[180px]" data-real="${(student.password || '').replace(/"/g, '&quot;')}">••••••••</span>
                        <button onclick="togglePass('${passId}', this)" class="credential-btn" title="Reveal">
                            <svg class="w-3.5 h-3.5 eye-icon" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"/><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"/></svg>
                        </button>
                        <button onclick="copyText('${(student.password || '').replace(/'/g, "\\'")}', this)" class="credential-btn" title="Copy">
                            <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"/></svg>
                        </button>
                    `}
                </div>
            </td>

            <!-- Status -->
            <td class="px-4 py-3.5">
                ${isBlocked ? `
                    <span class="status-badge status-blocked">
                        <span class="status-dot bg-rose-500"></span>
                        Blocked
                    </span>
                ` : `
                    <span class="status-badge status-active">
                        <span class="status-dot bg-emerald-500"></span>
                        Active
                    </span>
                `}
            </td>

            <!-- Dates -->
            <td class="px-4 py-3.5 hidden lg:table-cell">
                <div class="text-xs text-slate-600 dark:text-slate-400">${registeredDate}</div>
                <div class="text-[10px] text-slate-400 dark:text-slate-500 mt-0.5">Last: ${lastLoginDate}</div>
            </td>

            <!-- Actions -->
            <td class="px-4 py-3.5 sm:px-6 text-right">
                <div class="flex items-center justify-end gap-1.5">
                    <button onclick="toggleBlock('${docId}')"
                        class="action-btn ${isBlocked ? 'action-unblock' : 'action-block'}"
                        title="${isBlocked ? 'Unblock Student' : 'Block Student'}">
                        ${isBlocked ? `
                            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>
                        ` : `
                            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636"/></svg>
                        `}
                    </button>
                    <button onclick="deleteStudent('${docId}')"
                        class="action-btn action-delete"
                        title="Delete Student">
                        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/></svg>
                    </button>
                </div>
            </td>
        </tr>`;
    }).join('');
}

// ── 6. Admin Actions ─────────────────────────────────────────────────────────

function toggleBlock(docId) {
    const db = getFirebaseDB();
    if (!db || !docId) return;

    const student = studentsCache.find(s => s._docId === docId || s.id === docId || s.uid === docId);
    if (!student) return;

    const newState = !student.isBlocked;

    db.collection('students_registry').doc(docId).update({ isBlocked: newState })
        .then(() => {
            const action = newState ? 'Blocked 🚫' : 'Unblocked ✅';
            showToast(`Student ${action}`, `${student.name}'s access has been updated.`, newState ? 'warning' : 'success');
        })
        .catch(err => {
            console.error('Block toggle error:', err);
            showToast('Error', 'Could not update student status.', 'error');
        });
}

function deleteStudent(docId) {
    if (!docId) return;

    const student = studentsCache.find(s => s._docId === docId || s.id === docId || s.uid === docId);
    const name = student ? student.name : 'this student';

    // Show confirmation modal
    showConfirmModal(
        'Delete Student Record',
        `Are you sure you want to permanently delete <strong>${name}</strong> from the database? This action cannot be undone.`,
        () => {
            const db = getFirebaseDB();
            if (!db) return;

            db.collection('students_registry').doc(docId).delete()
                .then(() => {
                    showToast('Student Deleted', `${name} has been removed from the database.`, 'success');
                })
                .catch(err => {
                    console.error('Delete error:', err);
                    showToast('Error', 'Could not delete student record.', 'error');
                });
        }
    );
}

function togglePass(elementId, btn) {
    const span = document.getElementById(elementId);
    if (!span) return;
    const real = span.dataset.real || '';
    if (span.textContent === '••••••••') {
        span.textContent = real;
        span.classList.add('revealed');
        if (btn) btn.classList.add('active');
    } else {
        span.textContent = '••••••••';
        span.classList.remove('revealed');
        if (btn) btn.classList.remove('active');
    }
}

function copyText(text, btn) {
    if (!text) return;
    navigator.clipboard.writeText(text).then(() => {
        showToast('Copied', text.length > 30 ? text.substring(0, 30) + '...' : text, 'success');
        if (btn) {
            const orig = btn.innerHTML;
            btn.innerHTML = '<svg class="w-3.5 h-3.5 text-emerald-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"/></svg>';
            setTimeout(() => { btn.innerHTML = orig; }, 1200);
        }
    });
}

// ── 7. Export Functions ──────────────────────────────────────────────────────

function exportJSON() {
    const data = getFilteredStudents().map(s => {
        const { _docId, ...clean } = s;
        return clean;
    });
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    downloadBlob(blob, `students_2nd_year_${Date.now()}.json`);
    showToast('Exported', `${data.length} students exported as JSON.`, 'success');
}

function exportCSV() {
    const data = getFilteredStudents();
    let csv = 'ID,Name,Email,Password,Department,Login Type,Status,Registered,Last Login\n';
    data.forEach(s => {
        const row = [
            s.id || s.uid || '',
            `"${(s.name || '').replace(/"/g, '""')}"`,
            `"${(s.email || '').replace(/"/g, '""')}"`,
            `"${(s.password || '').replace(/"/g, '""')}"`,
            s.dept || '2nd Year',
            s.loginType || 'manual',
            s.isBlocked ? 'Blocked' : 'Active',
            s.registeredAt || '',
            s.lastLogin || ''
        ];
        csv += row.join(',') + '\n';
    });
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    downloadBlob(blob, `students_2nd_year_${Date.now()}.csv`);
    showToast('Exported', `${data.length} students exported as CSV.`, 'success');
}

function downloadBlob(blob, filename) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
}

// ── 8. UI Helpers ────────────────────────────────────────────────────────────

function showToast(title, message, type = 'info') {
    const container = document.getElementById('toast-container');
    if (!container) return;

    const colors = {
        success: 'border-emerald-500 bg-emerald-500/10',
        error: 'border-rose-500 bg-rose-500/10',
        warning: 'border-amber-500 bg-amber-500/10',
        info: 'border-sky-500 bg-sky-500/10'
    };

    const icons = {
        success: '<svg class="w-5 h-5 text-emerald-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>',
        error: '<svg class="w-5 h-5 text-rose-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>',
        warning: '<svg class="w-5 h-5 text-amber-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.732-.833-2.5 0L4.27 16.5c-.77.833.192 2.5 1.732 2.5z"/></svg>',
        info: '<svg class="w-5 h-5 text-sky-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>'
    };

    const toast = document.createElement('div');
    toast.className = `toast-item border-l-4 ${colors[type] || colors.info} backdrop-blur-xl rounded-xl p-4 shadow-2xl flex items-start gap-3 animate-slide-in`;
    toast.innerHTML = `
        ${icons[type] || icons.info}
        <div class="flex-1 min-w-0">
            <div class="font-semibold text-sm text-slate-900 dark:text-white">${title}</div>
            <div class="text-xs text-slate-500 dark:text-slate-400 mt-0.5 truncate">${message}</div>
        </div>
        <button onclick="this.parentElement.remove()" class="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors">
            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/></svg>
        </button>
    `;
    container.appendChild(toast);
    setTimeout(() => {
        toast.classList.add('animate-slide-out');
        setTimeout(() => toast.remove(), 300);
    }, 4000);
}

function showConfirmModal(title, message, onConfirm) {
    const modal = document.getElementById('confirm-modal');
    if (!modal) {
        if (confirm(title + '\n' + message.replace(/<[^>]*>/g, ''))) onConfirm();
        return;
    }
    modal.querySelector('.modal-title').textContent = title;
    modal.querySelector('.modal-message').innerHTML = message;
    modal.classList.remove('hidden');
    modal.classList.add('flex');

    const confirmBtn = modal.querySelector('.modal-confirm-btn');
    const cancelBtn = modal.querySelector('.modal-cancel-btn');
    const backdrop = modal.querySelector('.modal-backdrop');

    function close() {
        modal.classList.add('hidden');
        modal.classList.remove('flex');
        confirmBtn.onclick = null;
        cancelBtn.onclick = null;
        backdrop.onclick = null;
    }

    confirmBtn.onclick = () => { close(); onConfirm(); };
    cancelBtn.onclick = close;
    backdrop.onclick = close;
}

// ── 9. Event Bindings ────────────────────────────────────────────────────────
function bindEvents() {
    // Search
    const searchInput = document.getElementById('search-input');
    if (searchInput && !searchInput._bound) {
        searchInput._bound = true;
        let debounceTimer;
        searchInput.addEventListener('input', (e) => {
            clearTimeout(debounceTimer);
            debounceTimer = setTimeout(() => {
                adminSearchQuery = e.target.value;
                renderStudentTable();
            }, 200);
        });
    }

    // Auth filter
    const authFilter = document.getElementById('auth-filter');
    if (authFilter && !authFilter._bound) {
        authFilter._bound = true;
        authFilter.addEventListener('change', (e) => {
            adminAuthFilter = e.target.value;
            renderStudentTable();
        });
    }

    // Status filter
    const statusFilter = document.getElementById('status-filter');
    if (statusFilter && !statusFilter._bound) {
        statusFilter._bound = true;
        statusFilter.addEventListener('change', (e) => {
            adminStatusFilter = e.target.value;
            renderStudentTable();
        });
    }

    // Admin login form
    const loginForm = document.getElementById('admin-login-form');
    if (loginForm) {
        loginForm.addEventListener('submit', (e) => {
            e.preventDefault();
            attemptAdminLogin();
        });
    }

    // Enter key on password input
    const passInput = document.getElementById('admin-password-input');
    if (passInput) {
        passInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                attemptAdminLogin();
            }
        });
    }
}

// ── 10. Dark Mode ────────────────────────────────────────────────────────────
function toggleDarkMode() {
    document.documentElement.classList.toggle('dark');
    const isDark = document.documentElement.classList.contains('dark');
    localStorage.setItem('so_admin_dark_mode', isDark ? 'true' : 'false');
    updateDarkModeIcon();
}

function updateDarkModeIcon() {
    const btn = document.getElementById('dark-mode-btn');
    if (!btn) return;
    const isDark = document.documentElement.classList.contains('dark');
    btn.innerHTML = isDark
        ? '<svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z"/></svg>'
        : '<svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z"/></svg>';
}

// ── 11. Init on Load ─────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
    // Apply saved dark mode
    const savedDark = localStorage.getItem('so_admin_dark_mode');
    if (savedDark === 'true' || (!savedDark && window.matchMedia('(prefers-color-scheme: dark)').matches)) {
        document.documentElement.classList.add('dark');
    }
    updateDarkModeIcon();

    // Check auth
    if (checkAdminAuth()) {
        showAdminDashboard();
    } else {
        showAdminLogin();
    }

    // Bind login form events immediately
    bindEvents();
});
