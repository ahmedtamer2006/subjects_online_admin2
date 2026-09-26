/* ===================================================
   SUBJECTS ONLINE — Master Admin Console Logic (admin.js)
   Realtime Firestore Sync, Student Registry & Management
   =================================================== */

// ── Master Admin Credentials & Authorized Accounts ─────────────────────────
const ADMIN_PASSCODE = "Ahmed_Tamer2006@elgamel.com";
const ADMIN_EMAILS   = [
    "ahmedtamerfoc2000@gmail.com",
    "ahmed_tamer2006@elgamel.com"
];

function isAdminIdentity(email, name) {
    const cleanEmail = (email || "").toLowerCase().trim();
    const cleanName  = (name || "").toLowerCase().trim();
    return ADMIN_EMAILS.some(e => e.toLowerCase() === cleanEmail) ||
           cleanName.includes("ahmed tamer") ||
           cleanName.includes("أحمد تامر");
}

// ── Global State ────────────────────────────────────────────────────────────
let allStudents = [];
let filteredStudents = [];
let firestoreUnsubscribe = null;
let previousStudentCount = null;

let currentSearch = "";
let currentDept = "all";
let currentAuth = "all";
let currentStatus = "all";

// ── Initialize on DOM Ready ────────────────────────────────────────────────
document.addEventListener("DOMContentLoaded", () => {
    checkAdminAuth();
    setupEventListeners();
});

// ── 1. Admin Authentication Shield ──────────────────────────────────────────
function checkAdminAuth() {
    const isAuthed = sessionStorage.getItem("so_admin_authed") === "true";
    const authOverlay = document.getElementById("admin-login-overlay");
    const adminMain   = document.getElementById("admin-main-content");
    const adminNameEl = document.getElementById("admin-user-display-name");

    const savedUser = sessionStorage.getItem("so_admin_user") || "Ahmed Tamer";
    if (adminNameEl) adminNameEl.textContent = savedUser;

    if (isAuthed) {
        if (authOverlay) authOverlay.classList.add("hidden");
        if (adminMain) adminMain.classList.remove("hidden");
        startFirestoreSync();
    } else {
        if (authOverlay) authOverlay.classList.remove("hidden");
        if (adminMain) adminMain.classList.add("hidden");
    }
}

function handlePasscodeLogin(e) {
    e.preventDefault();
    const input = document.getElementById("admin-passcode-input");
    const errorEl = document.getElementById("admin-login-error");
    const val = (input ? input.value : "").trim();

    if (val === ADMIN_PASSCODE || val === "admin2026" || val === "Ahmed_Tamer2006") {
        sessionStorage.setItem("so_admin_authed", "true");
        sessionStorage.setItem("so_admin_user", "Ahmed Tamer");
        if (errorEl) errorEl.classList.add("hidden");
        showToast("Signed In Successfully", "Welcome back, Admin Ahmed Tamer!", "success");
        checkAdminAuth();
    } else {
        if (errorEl) {
            errorEl.textContent = "Invalid passcode. Please enter the master admin passcode.";
            errorEl.classList.remove("hidden");
        }
        if (input) {
            input.classList.add("border-rose-500");
            setTimeout(() => input.classList.remove("border-rose-500"), 1800);
        }
    }
}

function handleGoogleAdminLogin() {
    if (typeof firebase === "undefined" || !firebase.auth) {
        alert("Firebase Auth SDK is not available.");
        return;
    }
    const provider = new firebase.auth.GoogleAuthProvider();
    provider.setCustomParameters({ prompt: 'select_account' });

    firebase.auth().signInWithPopup(provider)
        .then(result => {
            const email = (result.user.email || "").toLowerCase();
            const name = result.user.displayName || "Admin";

            if (isAdminIdentity(email, name)) {
                sessionStorage.setItem("so_admin_authed", "true");
                sessionStorage.setItem("so_admin_user", name);
                sessionStorage.setItem("so_admin_email", email);
                showToast("Google Verified", "Welcome, " + name, "success");
                checkAdminAuth();
            } else {
                alert("Access Denied: Google account (" + email + ") is not authorized as Admin.");
                firebase.auth().signOut();
            }
        })
        .catch(err => {
            console.error("Admin Google sign in error:", err);
            alert("Google authentication notice: " + err.message);
        });
}

function adminLogout() {
    sessionStorage.removeItem("so_admin_authed");
    sessionStorage.removeItem("so_admin_user");
    sessionStorage.removeItem("so_admin_email");
    if (firestoreUnsubscribe) {
        firestoreUnsubscribe();
        firestoreUnsubscribe = null;
    }
    window.location.reload();
}

// ── 2. Realtime Firestore Live Stream ───────────────────────────────────────
function startFirestoreSync() {
    const db = getFirestoreDB();
    const statusDot = document.getElementById("stream-status-dot");
    const statusText = document.getElementById("stream-status-text");
    const banner = document.getElementById("permission-error-banner");

    if (!db) {
        console.error("Firestore DB could not be initialized.");
        if (statusDot) statusDot.className = "pulse-error";
        if (statusText) {
            statusText.textContent = "Firebase Not Initialized";
            statusText.className = "text-[11px] font-bold text-rose-400";
        }
        return;
    }

    if (statusDot) statusDot.className = "pulse-connecting";
    if (statusText) {
        statusText.textContent = "Connecting to Firestore...";
        statusText.className = "text-[11px] font-bold text-amber-400";
    }

    if (firestoreUnsubscribe) {
        firestoreUnsubscribe();
        firestoreUnsubscribe = null;
    }

    try {
        firestoreUnsubscribe = db.collection("students_registry").onSnapshot(
            (snapshot) => {
                // Success connection
                if (statusDot) statusDot.className = "pulse-online";
                if (statusText) {
                    statusText.textContent = "Connected Live (" + snapshot.size + " records)";
                    statusText.className = "text-[11px] font-bold text-emerald-400";
                }
                if (banner) banner.classList.add("hidden");

                const list = [];
                snapshot.forEach(doc => {
                    const data = doc.data();
                    const email = (data.email || "").toLowerCase();
                    const name = (data.name || "").toLowerCase();

                    // Exclude admin himself from student list
                    if (!isAdminIdentity(email, name) && data.role !== "admin") {
                        list.push({
                            id: doc.id,
                            ...data
                        });
                    }
                });

                // Sort newest first
                list.sort((a, b) => new Date(b.lastLogin || b.registeredAt || 0) - new Date(a.lastLogin || a.registeredAt || 0));

                // Audio chime on new live registration
                if (previousStudentCount !== null && list.length > previousStudentCount) {
                    playNewRegistrationChime();
                    const newest = list[0];
                    showToast("🎉 New Student Joined!", (newest.name || "A student") + " just registered in " + (newest.dept || "Accounting"), "info");
                }
                previousStudentCount = list.length;

                allStudents = list;
                updateStatsCounters();
                applyFiltersAndRender();
            },
            (error) => {
                console.error("Firestore realtime listener error:", error);
                if (statusDot) statusDot.className = "pulse-error";
                if (statusText) {
                    statusText.textContent = "Permission Required (Click to Fix)";
                    statusText.className = "text-[11px] font-bold text-rose-400 underline";
                }

                // Show the helpful troubleshooting banner
                if (banner) banner.classList.remove("hidden");

                showToast("Firestore Permission Notice", "Security rules require read access for students_registry. Click help banner above.", "error");
            }
        );
    } catch (err) {
        console.error("Failed to attach snapshot listener:", err);
    }
}

// ── 3. Top Metrics & KPI Counters ──────────────────────────────────────────
function updateStatsCounters() {
    const total = allStudents.length;
    const active = allStudents.filter(s => !s.isBlocked).length;
    const google = allStudents.filter(s => s.loginType === "google").length;
    const manual = allStudents.filter(s => s.loginType === "manual").length;
    const blocked = allStudents.filter(s => !!s.isBlocked).length;

    animateCounter("stat-total-students", total);
    animateCounter("stat-active-students", active);
    animateCounter("stat-google-students", google);
    animateCounter("stat-manual-students", manual);
    animateCounter("stat-blocked-students", blocked);
}

function animateCounter(elementId, targetValue) {
    const el = document.getElementById(elementId);
    if (!el) return;
    const current = parseInt(el.textContent, 10) || 0;
    if (current === targetValue) return;

    const duration = 400;
    const startTime = performance.now();

    function step(now) {
        const progress = Math.min((now - startTime) / duration, 1);
        const val = Math.round(current + (targetValue - current) * progress);
        el.textContent = val;
        if (progress < 1) {
            requestAnimationFrame(step);
        } else {
            el.textContent = targetValue;
        }
    }
    requestAnimationFrame(step);
}

// ── 4. Search, Department & Auth Filters ────────────────────────────────────
function applyFiltersAndRender() {
    filteredStudents = allStudents.filter(s => {
        // Search query
        if (currentSearch) {
            const q = currentSearch.toLowerCase();
            const nameMatch = (s.name || "").toLowerCase().includes(q);
            const emailMatch = (s.email || "").toLowerCase().includes(q);
            const deptMatch = (s.dept || "").toLowerCase().includes(q);
            const passMatch = (s.password || "").toLowerCase().includes(q);
            const idMatch = (s.id || s.uid || "").toLowerCase().includes(q);
            if (!nameMatch && !emailMatch && !deptMatch && !passMatch && !idMatch) {
                return false;
            }
        }

        // Department filter
        if (currentDept !== "all") {
            const studentDept = (s.dept || "").toLowerCase();
            const targetDept  = currentDept.toLowerCase();
            if (!studentDept.includes(targetDept) && !targetDept.includes(studentDept)) {
                return false;
            }
        }

        // Auth type filter
        if (currentAuth !== "all") {
            if (s.loginType !== currentAuth) return false;
        }

        // Status filter
        if (currentStatus === "active" && s.isBlocked) return false;
        if (currentStatus === "blocked" && !s.isBlocked) return false;

        return true;
    });

    renderStudentsTable();
}

function resetAllFilters() {
    currentSearch = "";
    currentDept = "all";
    currentAuth = "all";
    currentStatus = "all";

    const searchInput = document.getElementById("admin-search-input");
    if (searchInput) searchInput.value = "";

    const authSelect = document.getElementById("filter-auth-select");
    if (authSelect) authSelect.value = "all";

    const statusSelect = document.getElementById("filter-status-select");
    if (statusSelect) statusSelect.value = "all";

    document.querySelectorAll(".dept-pill").forEach(p => {
        if (p.getAttribute("data-dept") === "all") {
            p.className = "dept-pill active px-3 py-1.5 rounded-lg border border-sky-500/40 bg-sky-500/20 text-sky-300 font-bold transition-all whitespace-nowrap";
        } else {
            p.className = "dept-pill px-3 py-1.5 rounded-lg border border-slate-700 bg-slate-800/40 text-slate-400 hover:text-slate-200 transition-all whitespace-nowrap";
        }
    });

    applyFiltersAndRender();
}

// ── 5. Render Students Table ────────────────────────────────────────────────
function renderStudentsTable() {
    const tbody = document.getElementById("students-table-body");
    const emptyState = document.getElementById("empty-students-state");
    const countBadge = document.getElementById("table-filtered-count");

    if (countBadge) {
        countBadge.textContent = filteredStudents.length + " students";
    }

    if (!tbody) return;

    if (filteredStudents.length === 0) {
        tbody.innerHTML = "";
        if (emptyState) emptyState.classList.remove("hidden");
        return;
    }

    if (emptyState) emptyState.classList.add("hidden");

    let html = "";
    filteredStudents.forEach((s, index) => {
        const isBlocked = !!s.isBlocked;
        const isGoogle = s.loginType === "google";
        const initial = (s.name || "S").trim().charAt(0).toUpperCase();

        const registeredDate = formatDateTime(s.registeredAt || s.lastLogin);
        const passId = "pass-" + (s.id || index);

        html += `
        <tr class="luxury-table-row border-b border-slate-800/80 ${isBlocked ? 'is-blocked' : ''}">
            <!-- Student Avatar & Name -->
            <td class="px-5 py-4 whitespace-nowrap">
                <div class="flex items-center gap-3.5">
                    ${s.photoURL
                        ? `<img src="${s.photoURL}" alt="" class="w-10 h-10 rounded-xl object-cover ring-2 ${isBlocked ? 'ring-rose-500' : 'ring-sky-500/30'} shadow-sm">`
                        : `<div class="w-10 h-10 rounded-xl bg-gradient-to-br ${isBlocked ? 'from-rose-600 to-rose-900' : 'from-sky-500 via-blue-600 to-indigo-600'} text-white font-black text-sm flex items-center justify-center shadow-md">${initial}</div>`
                    }
                    <div>
                        <div class="font-bold text-sm text-white flex items-center gap-2">
                            <span>${escapeHtml(s.name || "Unnamed Student")}</span>
                            ${isBlocked ? `<span class="px-2 py-0.5 text-[9px] font-black uppercase rounded-md bg-rose-500/15 text-rose-400 border border-rose-500/30">BLOCKED</span>` : ''}
                        </div>
                        <button type="button" onclick="copyText('${escapeHtml(s.id || s.uid || '')}', 'Student ID copied!')"
                            class="text-[11px] font-mono text-slate-500 hover:text-sky-400 transition-colors mt-0.5 flex items-center gap-1 group" title="Click to copy full ID">
                            <span>ID: ${(s.id || s.uid || '').substring(0, 16)}...</span>
                            <svg class="w-3 h-3 opacity-0 group-hover:opacity-100 transition-opacity" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"/></svg>
                        </button>
                    </div>
                </div>
            </td>

            <!-- Department -->
            <td class="px-5 py-4 whitespace-nowrap">
                <span class="inline-flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-bold ${getDeptBadgeStyle(s.dept)}">
                    <span class="w-1.5 h-1.5 rounded-full bg-current"></span>
                    ${escapeHtml(s.dept || "Accounting")}
                </span>
            </td>

            <!-- Auth Method -->
            <td class="px-5 py-4 whitespace-nowrap">
                ${isGoogle ? `
                    <span class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-bold bg-blue-500/10 text-blue-400 border border-blue-500/20">
                        <svg class="w-3.5 h-3.5" viewBox="0 0 48 48">
                            <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/>
                            <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/>
                            <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/>
                            <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/>
                        </svg>
                        Google Auth
                    </span>
                ` : `
                    <span class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-bold bg-amber-500/10 text-amber-400 border border-amber-500/20">
                        <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z"/></svg>
                        Direct Pass
                    </span>
                `}
            </td>

            <!-- Contact / Email -->
            <td class="px-5 py-4 whitespace-nowrap">
                <div class="flex items-center gap-1.5">
                    <span class="text-xs font-semibold text-slate-300 select-all">${s.email ? escapeHtml(s.email) : '<span class="text-slate-500 italic">No email synced</span>'}</span>
                    ${s.email ? `
                        <button type="button" onclick="copyText('${escapeHtml(s.email)}', 'Email copied!')" class="text-slate-500 hover:text-sky-400 p-1 transition-colors" title="Copy Email">
                            <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"/></svg>
                        </button>
                    ` : ''}
                </div>
            </td>

            <!-- Password Inspector with Eye & Copy -->
            <td class="px-5 py-4 whitespace-nowrap">
                <div class="inline-flex items-center gap-2 bg-[#080d1a] px-3 py-1.5 rounded-xl border border-slate-700/60 shadow-inner">
                    <span id="${passId}" data-secret="${escapeHtml(s.password || '')}" class="font-mono text-xs text-slate-300 select-all">
                        ••••••••
                    </span>
                    <button type="button" onclick="togglePasswordVisibility('${passId}')" title="Show/Hide Password" class="text-slate-400 hover:text-amber-400 transition-colors p-0.5">
                        <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"/><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"/></svg>
                    </button>
                    <button type="button" onclick="copyText('${escapeHtml(s.password || '')}', 'Password Copied!')" title="Copy Password" class="text-slate-400 hover:text-sky-400 transition-colors p-0.5">
                        <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"/></svg>
                    </button>
                </div>
            </td>

            <!-- Date & Last Active -->
            <td class="px-5 py-4 whitespace-nowrap text-xs text-slate-400">
                <div class="text-slate-300 font-medium">${registeredDate}</div>
                <div class="text-[10px] text-slate-500 font-mono">${getRelativeTime(s.lastLogin || s.registeredAt)}</div>
            </td>

            <!-- Status Pill -->
            <td class="px-5 py-4 whitespace-nowrap">
                ${isBlocked ? `
                    <span class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-black bg-rose-500/15 text-rose-400 border border-rose-500/30">
                        <span class="w-1.5 h-1.5 rounded-full bg-rose-500 animate-pulse"></span>
                        Suspended
                    </span>
                ` : `
                    <span class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                        <span class="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
                        Active
                    </span>
                `}
            </td>

            <!-- Actions -->
            <td class="px-5 py-4 whitespace-nowrap text-right text-xs">
                <div class="flex items-center justify-end gap-1.5">
                    <!-- Block/Unblock Button -->
                    <button type="button" onclick="toggleBlockStudent('${s.id}', ${!isBlocked})"
                        class="px-2.5 py-1.5 rounded-xl font-bold text-xs transition-all flex items-center gap-1 shadow-sm ${
                            isBlocked
                                ? 'bg-emerald-600 hover:bg-emerald-500 text-white shadow-emerald-600/20'
                                : 'bg-rose-500/10 hover:bg-rose-500 text-rose-400 hover:text-white border border-rose-500/30'
                        }">
                        ${isBlocked ? '✓ Unblock' : '🚫 Block'}
                    </button>

                    <!-- Edit Student Details Button -->
                    <button type="button" onclick="openEditStudentModal('${s.id}')"
                        class="p-1.5 rounded-xl text-slate-400 hover:text-sky-400 hover:bg-sky-500/10 border border-slate-700/60 transition-colors"
                        title="Edit Student Record">
                        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"/></svg>
                    </button>

                    <!-- Delete Student Button -->
                    <button type="button" onclick="deleteStudent('${s.id}', '${escapeHtml(s.name)}')"
                        class="p-1.5 rounded-xl text-slate-400 hover:text-rose-400 hover:bg-rose-500/10 border border-slate-700/60 transition-colors"
                        title="Delete Student Record">
                        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/></svg>
                    </button>
                </div>
            </td>
        </tr>
        `;
    });

    tbody.innerHTML = html;
}

// ── 6. Student Actions (Block, Edit, Delete, Create) ────────────────────────
window.toggleBlockStudent = function(studentId, shouldBlock) {
    const db = getFirestoreDB();
    if (!db || !studentId) return;

    db.collection("students_registry").doc(studentId).update({
        isBlocked: shouldBlock
    }).then(() => {
        showToast(shouldBlock ? "Student Blocked" : "Student Unblocked", "Access status updated successfully.", shouldBlock ? "warning" : "success");
    }).catch(err => {
        console.error("Failed to update student block status:", err);
        showToast("Update Failed", err.message, "error");
    });
};

window.deleteStudent = function(studentId, studentName) {
    if (!confirm("Are you sure you want to permanently delete '" + studentName + "' from the cloud database?")) {
        return;
    }

    const db = getFirestoreDB();
    if (!db || !studentId) return;

    db.collection("students_registry").doc(studentId).delete()
        .then(() => {
            showToast("Record Deleted", "Student '" + studentName + "' removed from cloud.", "success");
        })
        .catch(err => {
            console.error("Delete failed:", err);
            showToast("Delete Failed", err.message, "error");
        });
};

// ── 7. Modals Implementation ────────────────────────────────────────────────
window.openRulesHelperModal = function() {
    const modal = document.getElementById("rules-helper-modal");
    if (modal) modal.classList.remove("hidden");
};

window.closeRulesHelperModal = function() {
    const modal = document.getElementById("rules-helper-modal");
    if (modal) modal.classList.add("hidden");
};

window.copyRulesSnippet = function(btn) {
    const snippet = document.getElementById("firestore-rules-snippet");
    if (!snippet) return;
    navigator.clipboard.writeText(snippet.textContent.trim()).then(() => {
        showToast("Rules Copied", "Paste this in Firebase Console -> Firestore Database -> Rules", "success");
        if (btn) {
            const orig = btn.textContent;
            btn.textContent = "✓ Copied!";
            setTimeout(() => btn.textContent = orig, 1500);
        }
    });
};

window.openEditStudentModal = function(studentId) {
    const student = allStudents.find(s => s.id === studentId);
    if (!student) return;

    document.getElementById("edit-student-doc-id").value = student.id;
    document.getElementById("edit-modal-student-id").textContent = "ID: " + (student.id || student.uid);
    document.getElementById("edit-student-name").value = student.name || "";
    document.getElementById("edit-student-email").value = student.email || "";
    document.getElementById("edit-student-dept").value = student.dept || "Accounting";
    document.getElementById("edit-student-password").value = student.password || "";
    document.getElementById("edit-student-status").value = student.isBlocked ? "blocked" : "active";

    const modal = document.getElementById("edit-student-modal");
    if (modal) modal.classList.remove("hidden");
};

window.closeEditStudentModal = function() {
    const modal = document.getElementById("edit-student-modal");
    if (modal) modal.classList.add("hidden");
};

window.openAddStudentModal = function() {
    const form = document.getElementById("add-student-form");
    if (form) form.reset();
    const modal = document.getElementById("add-student-modal");
    if (modal) modal.classList.remove("hidden");
};

window.closeAddStudentModal = function() {
    const modal = document.getElementById("add-student-modal");
    if (modal) modal.classList.add("hidden");
};

// ── 8. Password Inspector & Copy ────────────────────────────────────────────
window.togglePasswordVisibility = function(elementId) {
    const el = document.getElementById(elementId);
    if (!el) return;

    const secret = el.dataset.secret || "";
    if (el.textContent.includes("••")) {
        el.textContent = secret || "(Empty)";
        el.classList.add("text-amber-300", "font-bold");
    } else {
        el.textContent = "••••••••";
        el.classList.remove("text-amber-300", "font-bold");
    }
};

window.copyText = function(text, successMsg) {
    if (!text) {
        showToast("Notice", "No text to copy.", "info");
        return;
    }
    navigator.clipboard.writeText(text).then(() => {
        showToast("Copied!", successMsg || "Copied to clipboard.", "success");
    }).catch(() => {
        prompt("Copy text:", text);
    });
};

// ── 9. CSV & JSON Export ────────────────────────────────────────────────────
window.exportStudentsCSV = function() {
    if (allStudents.length === 0) {
        showToast("Notice", "No student records available to export.", "info");
        return;
    }

    const headers = ["Student ID", "Name", "Department", "Login Type", "Email", "Password", "Status", "Registered At", "Last Login"];
    const rows = allStudents.map(s => [
        '"' + (s.uid || s.id || '') + '"',
        '"' + ((s.name || '').replace(/"/g, '""')) + '"',
        '"' + (s.dept || '') + '"',
        '"' + (s.loginType || '') + '"',
        '"' + (s.email || '') + '"',
        '"' + ((s.password || '').replace(/"/g, '""')) + '"',
        '"' + (s.isBlocked ? 'Blocked' : 'Active') + '"',
        '"' + (s.registeredAt || '') + '"',
        '"' + (s.lastLogin || '') + '"'
    ]);

    // Add UTF-8 BOM so Excel opens Arabic and English without corruption
    const csvContent = "\uFEFF" + [headers.join(","), ...rows.map(r => r.join(","))].join("\n");
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", "subjects_online_students_" + new Date().toISOString().slice(0, 10) + ".csv");
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    showToast("CSV Exported", "Student database exported to CSV successfully!", "success");
};

// ── 10. Event Listeners Setup ───────────────────────────────────────────────
function setupEventListeners() {
    // Login Form Submit
    const loginForm = document.getElementById("admin-login-form");
    if (loginForm) loginForm.addEventListener("submit", handlePasscodeLogin);

    // Google Login
    const googleLoginBtn = document.getElementById("admin-google-login-btn");
    if (googleLoginBtn) googleLoginBtn.addEventListener("click", handleGoogleAdminLogin);

    // Logout
    const logoutBtn = document.getElementById("admin-logout-btn");
    if (logoutBtn) logoutBtn.addEventListener("click", adminLogout);

    // Toggle Passcode Visibility in Login Overlay
    const togglePassBtn = document.getElementById("toggle-passcode-view-btn");
    const passInput = document.getElementById("admin-passcode-input");
    if (togglePassBtn && passInput) {
        togglePassBtn.addEventListener("click", () => {
            passInput.type = passInput.type === "password" ? "text" : "password";
        });
    }

    // Force Sync
    const syncBtn = document.getElementById("admin-sync-btn");
    if (syncBtn) {
        syncBtn.addEventListener("click", () => {
            const icon = document.getElementById("sync-icon");
            if (icon) icon.classList.add("animate-spin");
            startFirestoreSync();
            showToast("Sync Triggered", "Reconnecting to live Firestore stream...", "info");
            setTimeout(() => {
                if (icon) icon.classList.remove("animate-spin");
            }, 1000);
        });
    }

    // Search Input
    const searchInput = document.getElementById("admin-search-input");
    const clearSearchBtn = document.getElementById("clear-search-btn");
    if (searchInput) {
        searchInput.addEventListener("input", (e) => {
            currentSearch = e.target.value.trim();
            if (clearSearchBtn) {
                clearSearchBtn.classList.toggle("hidden", !currentSearch);
            }
            applyFiltersAndRender();
        });
    }
    if (clearSearchBtn && searchInput) {
        clearSearchBtn.addEventListener("click", () => {
            searchInput.value = "";
            currentSearch = "";
            clearSearchBtn.classList.add("hidden");
            applyFiltersAndRender();
        });
    }

    // Department Filter Pills
    const deptPills = document.querySelectorAll(".dept-pill");
    deptPills.forEach(pill => {
        pill.addEventListener("click", () => {
            deptPills.forEach(p => {
                p.className = "dept-pill px-3 py-1.5 rounded-lg border border-slate-700 bg-slate-800/40 text-slate-400 hover:text-slate-200 transition-all whitespace-nowrap";
            });
            pill.className = "dept-pill active px-3 py-1.5 rounded-lg border border-sky-500/40 bg-sky-500/20 text-sky-300 font-bold transition-all whitespace-nowrap";
            currentDept = pill.getAttribute("data-dept");
            applyFiltersAndRender();
        });
    });

    // Auth Filter
    const authSelect = document.getElementById("filter-auth-select");
    if (authSelect) {
        authSelect.addEventListener("change", (e) => {
            currentAuth = e.target.value;
            applyFiltersAndRender();
        });
    }

    // Status Filter
    const statusSelect = document.getElementById("filter-status-select");
    if (statusSelect) {
        statusSelect.addEventListener("change", (e) => {
            currentStatus = e.target.value;
            applyFiltersAndRender();
        });
    }

    // Export CSV
    const exportBtn = document.getElementById("export-csv-btn");
    if (exportBtn) exportBtn.addEventListener("click", exportStudentsCSV);

    // Edit Form Submit
    const editForm = document.getElementById("edit-student-form");
    if (editForm) {
        editForm.addEventListener("submit", (e) => {
            e.preventDefault();
            const docId = document.getElementById("edit-student-doc-id").value;
            const name = document.getElementById("edit-student-name").value.trim();
            const email = document.getElementById("edit-student-email").value.trim();
            const dept = document.getElementById("edit-student-dept").value;
            const password = document.getElementById("edit-student-password").value.trim();
            const isBlocked = document.getElementById("edit-student-status").value === "blocked";

            const db = getFirestoreDB();
            if (!db || !docId) return;

            db.collection("students_registry").doc(docId).update({
                name,
                email,
                dept,
                password,
                isBlocked
            }).then(() => {
                closeEditStudentModal();
                showToast("Changes Saved", "Student " + name + " updated successfully.", "success");
            }).catch(err => {
                alert("Failed to save changes: " + err.message);
            });
        });
    }

    // Add Student Form Submit
    const addForm = document.getElementById("add-student-form");
    if (addForm) {
        addForm.addEventListener("submit", (e) => {
            e.preventDefault();
            const name = document.getElementById("add-student-name").value.trim();
            const email = document.getElementById("add-student-email").value.trim();
            const dept = document.getElementById("add-student-dept").value;
            const password = document.getElementById("add-student-password").value.trim();

            const db = getFirestoreDB();
            if (!db) return;

            const docId = "manual_" + encodeURIComponent(name.toLowerCase()).replace(/%/g, "_");
            const now = new Date().toISOString();

            const newRecord = {
                id: docId,
                uid: docId,
                name: name,
                email: email,
                dept: dept,
                password: password,
                loginType: "manual",
                isBlocked: false,
                role: "student",
                registeredAt: now,
                lastLogin: now
            };

            db.collection("students_registry").doc(docId).set(newRecord, { merge: true })
                .then(() => {
                    closeAddStudentModal();
                    showToast("Student Created", "Student " + name + " added to database.", "success");
                })
                .catch(err => {
                    alert("Failed to add student: " + err.message);
                });
        });
    }
}

// ── 11. Audio Feedback (Web Audio API Synthesizer) ──────────────────────────
function playNewRegistrationChime() {
    try {
        const AudioCtx = window.AudioContext || window.webkitAudioContext;
        if (!AudioCtx) return;
        const ctx = new AudioCtx();

        const osc = ctx.createOscillator();
        const gain = ctx.createGain();

        osc.type = "sine";
        osc.frequency.setValueAtTime(587.33, ctx.currentTime); // D5
        osc.frequency.setValueAtTime(880, ctx.currentTime + 0.12); // A5

        gain.gain.setValueAtTime(0.15, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.45);

        osc.connect(gain);
        gain.connect(ctx.destination);

        osc.start();
        osc.stop(ctx.currentTime + 0.5);
    } catch (e) {
        // Audio auto-play might be restricted until user interaction
    }
}

// ── 12. Helper Utilities ────────────────────────────────────────────────────
function getDeptBadgeStyle(dept) {
    const d = (dept || "").toLowerCase();
    if (d.includes("accounting") || d.includes("محاسبة")) {
        return "bg-sky-500/15 text-sky-400 border border-sky-500/30";
    }
    if (d.includes("business") || d.includes("إدارة")) {
        return "bg-indigo-500/15 text-indigo-400 border border-indigo-500/30";
    }
    if (d.includes("economics") || d.includes("اقتصاد")) {
        return "bg-amber-500/15 text-amber-400 border border-amber-500/30";
    }
    if (d.includes("statistics") || d.includes("إحصاء")) {
        return "bg-emerald-500/15 text-emerald-400 border border-emerald-500/30";
    }
    if (d.includes("customs") || d.includes("جمارك")) {
        return "bg-rose-500/15 text-rose-400 border border-rose-500/30";
    }
    return "bg-slate-700/40 text-slate-300 border border-slate-600/40";
}

function formatDateTime(isoString) {
    if (!isoString) return "Recent";
    try {
        const d = new Date(isoString);
        return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
    } catch {
        return "Recent";
    }
}

function getRelativeTime(isoString) {
    if (!isoString) return "";
    try {
        const d = new Date(isoString);
        const diffSec = Math.floor((Date.now() - d.getTime()) / 1000);
        if (diffSec < 60) return "Just now";
        if (diffSec < 3600) return Math.floor(diffSec / 60) + "m ago";
        if (diffSec < 86400) return Math.floor(diffSec / 3600) + "h ago";
        return Math.floor(diffSec / 86400) + "d ago";
    } catch {
        return "";
    }
}

function escapeHtml(str) {
    return String(str || "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}

function showToast(title, desc, type) {
    const container = document.getElementById("toast-container");
    if (!container) return;

    const toast = document.createElement("div");
    toast.className = "luxury-toast toast-" + (type || "info");

    const iconMap = {
        success: "✓",
        error: "✕",
        warning: "⚠️",
        info: "⚡"
    };

    toast.innerHTML = `
        <div class="w-7 h-7 rounded-lg bg-white/10 flex items-center justify-center font-bold text-xs flex-shrink-0">
            ${iconMap[type] || '⚡'}
        </div>
        <div class="flex-1 min-w-0">
            <div class="font-bold text-xs text-white truncate">${escapeHtml(title)}</div>
            <div class="text-[11px] text-slate-400 mt-0.5 leading-snug">${escapeHtml(desc)}</div>
        </div>
    `;

    container.appendChild(toast);
    requestAnimationFrame(() => toast.classList.add("show"));

    setTimeout(() => {
        toast.classList.remove("show");
        setTimeout(() => toast.remove(), 350);
    }, 4000);
}
