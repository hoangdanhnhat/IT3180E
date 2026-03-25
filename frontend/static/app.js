/* ------------------------------------------------------------------ Config */
const API = "/api/v1";

/* ------------------------------------------------------------------ Token helpers */
const token = {
  get access()  { return localStorage.getItem("access_token");  },
  get refresh() { return localStorage.getItem("refresh_token"); },
  save(data) {
    localStorage.setItem("access_token",  data.access_token);
    localStorage.setItem("refresh_token", data.refresh_token);
  },
  clear() {
    localStorage.removeItem("access_token");
    localStorage.removeItem("refresh_token");
  },
};

/* ------------------------------------------------------------------ DOM refs */
const loginSection          = document.getElementById("login-section");
const registerSection       = document.getElementById("register-section");
const dashboardSection      = document.getElementById("dashboard-section");
const adminDashboardSection = document.getElementById("admin-dashboard-section");
const loginForm         = document.getElementById("login-form");
const loginBtn          = document.getElementById("login-btn");
const loginError        = document.getElementById("login-error");
const logoutBtn         = document.getElementById("logout-btn");
const logoutSuccess     = document.getElementById("logout-success");
const togglePw          = document.getElementById("toggle-pw");
const passwordInput     = document.getElementById("password");

/* ------------------------------------------------------------------ UI helpers */
function showError(msg) {
  loginError.textContent = msg;
  loginError.classList.remove("hidden");
}
function hideError() { loginError.classList.add("hidden"); }

function showLogin() {
  dashboardSection.classList.add("hidden");
  adminDashboardSection.classList.add("hidden");
  registerSection.classList.add("hidden");
  loginSection.classList.remove("hidden");
  loginForm.reset();
  hideError();
}

function showRegister() {
  dashboardSection.classList.add("hidden");
  loginSection.classList.add("hidden");
  registerSection.classList.remove("hidden");
  document.getElementById("register-form").reset();
  document.getElementById("register-error").classList.add("hidden");
  document.getElementById("register-form-wrap").classList.remove("hidden");
  document.getElementById("register-success").classList.add("hidden");
}

function showDashboard(user) {
  loginSection.classList.add("hidden");
  registerSection.classList.add("hidden");

  if (user.role === "admin") {
    dashboardSection.classList.add("hidden");
    adminDashboardSection.classList.remove("hidden");
    document.getElementById("admin-user-name").textContent = user.full_name;
    activateAdminTab("users");
    loadAdminUsers();
    return;
  }

  adminDashboardSection.classList.add("hidden");
  dashboardSection.classList.remove("hidden");
  document.getElementById("user-name").textContent    = user.full_name;
  document.getElementById("user-email").textContent   = user.email;
  document.getElementById("user-role").textContent    = user.role;
  document.getElementById("user-created").textContent =
    new Date(user.created_at).toLocaleDateString(undefined, { dateStyle: "long" });
  activateTab("overview");
}

/* ------------------------------------------------------------------ API calls */
async function apiPost(path, body, authToken = null) {
  const headers = { "Content-Type": "application/json" };
  if (authToken) headers["Authorization"] = `Bearer ${authToken}`;
  const res = await fetch(`${API}${path}`, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
  return res;
}

async function apiGet(path, authToken) {
  const res = await fetch(`${API}${path}`, {
    headers: { Authorization: `Bearer ${authToken}` },
  });
  return res;
}

/* ------------------------------------------------------------------ Login flow */
loginForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  hideError();

  const email    = document.getElementById("email").value.trim();
  const password = passwordInput.value;

  if (!email || !password) { showError("Please enter your email and password."); return; }

  loginBtn.disabled   = true;
  loginBtn.textContent = "Signing in…";

  try {
    const res  = await apiPost("/auth/login", { email, password });
    const data = await res.json();

    if (!res.ok) {
      const detail = data.detail;
      const msg = Array.isArray(detail)
        ? detail.map(e => e.msg || JSON.stringify(e)).join("; ")
        : (typeof detail === "string" ? detail : "Login failed. Please try again.");
      showError(msg || "Login failed. Please try again.");
      return;
    }

    token.save(data);
    await loadMe();
  } catch {
    showError("Network error. Is the server running?");
  } finally {
    loginBtn.disabled    = false;
    loginBtn.textContent = "Sign in";
  }
});

/* ------------------------------------------------------------------ Load /me */
async function loadMe() {
  const res = await apiGet("/auth/me", token.access);
  if (res.status === 401) {
    // Try refreshing
    const refreshed = await tryRefresh();
    if (!refreshed) { showLogin(); return; }
    const res2 = await apiGet("/auth/me", token.access);
    if (!res2.ok) { showLogin(); return; }
    showDashboard(await res2.json());
    return;
  }
  if (!res.ok) { showLogin(); return; }
  showDashboard(await res.json());
}

/* ------------------------------------------------------------------ Token refresh */
async function tryRefresh() {
  if (!token.refresh) return false;
  try {
    const res = await apiPost("/auth/refresh", { refresh_token: token.refresh });
    if (!res.ok) { token.clear(); return false; }
    token.save(await res.json());
    return true;
  } catch {
    token.clear();
    return false;
  }
}

/* ------------------------------------------------------------------ Logout */
logoutBtn.addEventListener("click", async () => {
  try {
    await apiPost("/auth/logout", {}, token.access);
  } catch { /* ignore network errors on logout */ }
  token.clear();
  showLogin();
  logoutSuccess.classList.remove("hidden");
  setTimeout(() => logoutSuccess.classList.add("hidden"), 3000);
}); 

/* ------------------------------------------------------------------ Password toggle */
togglePw.addEventListener("click", () => {
  const isHidden = passwordInput.type === "password";
  passwordInput.type = isHidden ? "text" : "password";
  togglePw.textContent = isHidden ? "🙈" : "👁";
});

function makeToggle(btnId, inputId) {
  document.getElementById(btnId).addEventListener("click", () => {
    const inp = document.getElementById(inputId);
    const hidden = inp.type === "password";
    inp.type = hidden ? "text" : "password";
    document.getElementById(btnId).textContent = hidden ? "🙈" : "👁";
  });
}
makeToggle("toggle-reg-pw",      "reg-password");
makeToggle("toggle-reg-confirm", "reg-confirm");

/* ------------------------------------------------------------------ Auth-switch links */
document.getElementById("show-register").addEventListener("click", (e) => {
  e.preventDefault();
  showRegister();
});
document.getElementById("show-login").addEventListener("click", (e) => {
  e.preventDefault();
  showLogin();
});

/* ------------------------------------------------------------------ Register form */
document.getElementById("register-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const errorEl   = document.getElementById("register-error");
  const submitBtn = document.getElementById("register-btn");
  errorEl.classList.add("hidden");

  const full_name = document.getElementById("reg-name").value.trim();
  const email     = document.getElementById("reg-email").value.trim();
  const password  = document.getElementById("reg-password").value;
  const confirm   = document.getElementById("reg-confirm").value;

  if (!full_name || !email || !password) {
    errorEl.textContent = "All fields are required.";
    errorEl.classList.remove("hidden");
    return;
  }
  if (password.length < 8) {
    errorEl.textContent = "Password must be at least 8 characters.";
    errorEl.classList.remove("hidden");
    return;
  }
  if (password !== confirm) {
    errorEl.textContent = "Passwords do not match.";
    errorEl.classList.remove("hidden");
    return;
  }

  submitBtn.disabled = true;
  submitBtn.textContent = "Creating account…";

  try {
    const res  = await apiPost("/auth/register", { full_name, email, password });
    const data = await res.json();

    if (!res.ok) {
      const detail = data.detail;
      errorEl.textContent = Array.isArray(detail)
        ? detail.map(d => d.msg || JSON.stringify(d)).join("; ")
        : (typeof detail === "string" ? detail : "Registration failed. Please try again.");
      errorEl.classList.remove("hidden");
      return;
    }

    token.save(data);
    // Show success screen only — dashboard is shown when user clicks "Go to home page"
    document.getElementById("register-form-wrap").classList.add("hidden");
    document.getElementById("register-success").classList.remove("hidden");
  } catch {
    errorEl.classList.remove("hidden");
  } finally {
    submitBtn.disabled = false;
    submitBtn.textContent = "Create account";
  }
});


/* ------------------------------------------------------------------ Go to home page */
document.getElementById("go-home-btn").addEventListener("click", async () => {
  registerSection.classList.add("hidden");
  document.getElementById("register-form-wrap").classList.remove("hidden");
  document.getElementById("register-success").classList.add("hidden");
  showDashboard(await apiGet("/auth/me", token.access).then(r => r.json()));
});

function activateTab(tabName) {
  document.querySelectorAll(".tab").forEach(btn => {
    btn.classList.toggle("active", btn.dataset.tab === tabName);
  });
  document.querySelectorAll(".tab-panel").forEach(panel => {
    panel.classList.add("hidden");
  });
  const panel = document.getElementById(`tab-${tabName}`);
  if (panel) panel.classList.remove("hidden");
  if (tabName === "tickets") loadTickets();
}

document.querySelectorAll(".tab").forEach(btn => {
  btn.addEventListener("click", () => activateTab(btn.dataset.tab));
});

/* ================================================================== TICKETS */

/* ------------------------------------------------------------------ Helpers */
const STATUS_LABELS = {
  open: "Open",
  in_progress: "In Progress",
  pending_customer: "Pending Customer",
  resolved: "Resolved",
  closed: "Closed",
};

const STATUS_COLORS = {
  open: "badge-blue",
  in_progress: "badge-yellow",
  pending_customer: "badge-orange",
  resolved: "badge-green",
  closed: "badge-muted",
};

const PRIORITY_COLORS = {
  low: "badge-muted",
  normal: "",
  high: "badge-orange",
  urgent: "badge-red",
};

function escHtml(str) {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function formatDate(iso) {
  return new Date(iso).toLocaleDateString(undefined, { dateStyle: "medium" });
}

/* ------------------------------------------------------------------ Load tickets */
async function loadTickets() {
  const listEl    = document.getElementById("tickets-list");
  const loadingEl = document.getElementById("tickets-loading");
  const emptyEl   = document.getElementById("tickets-empty");
  const errorEl   = document.getElementById("tickets-error");
  const viewEl    = document.getElementById("tickets-view");
  const detailEl  = document.getElementById("ticket-detail-view");

  detailEl.classList.add("hidden");
  viewEl.classList.remove("hidden");
  listEl.innerHTML = "";
  errorEl.classList.add("hidden");
  emptyEl.classList.add("hidden");
  loadingEl.classList.remove("hidden");

  try {
    const res = await apiGet("/tickets", token.access);
    loadingEl.classList.add("hidden");
    if (res.status === 401) {
      const ok = await tryRefresh();
      if (!ok) { showLogin(); return; }
      return loadTickets();
    }
    if (!res.ok) {
      errorEl.textContent = "Failed to load tickets.";
      errorEl.classList.remove("hidden");
      return;
    }
    const tickets = await res.json();
    if (!tickets.length) {
      emptyEl.classList.remove("hidden");
      return;
    }
    tickets.forEach(ticket => {
      const li = document.createElement("li");
      li.className = "ticket-item";
      li.innerHTML = `
        <div class="ticket-item-top">
          <span class="ticket-number-badge">${escHtml(ticket.ticket_number)}</span>
          <span class="badge ${STATUS_COLORS[ticket.status] || ''}">${STATUS_LABELS[ticket.status] || ticket.status}</span>
          <span class="badge ${PRIORITY_COLORS[ticket.priority] || ''}">${escHtml(ticket.priority)}</span>
        </div>
        <div class="ticket-subject">${escHtml(ticket.subject)}</div>
        <div class="ticket-meta">${escHtml(ticket.category.replace(/_/g, " "))} &bull; ${formatDate(ticket.created_at)}</div>
      `;
      li.addEventListener("click", () => openTicket(ticket.id));
      listEl.appendChild(li);
    });
  } catch {
    loadingEl.classList.add("hidden");
    errorEl.textContent = "Network error loading tickets.";
    errorEl.classList.remove("hidden");
  }
}

/* ------------------------------------------------------------------ Ticket detail */
let currentTicketId = null;

async function openTicket(ticketId) {
  currentTicketId = ticketId;
  document.getElementById("tickets-view").classList.add("hidden");
  const detailEl = document.getElementById("ticket-detail-view");
  detailEl.classList.remove("hidden");
  document.getElementById("messages-list").innerHTML = '<p class="muted-text">Loading\u2026</p>';
  document.getElementById("reply-error").classList.add("hidden");
  document.getElementById("reply-content").value = "";

  try {
    const res = await apiGet(`/tickets/${ticketId}`, token.access);
    if (res.status === 401) {
      const ok = await tryRefresh();
      if (!ok) { showLogin(); return; }
      return openTicket(ticketId);
    }
    if (!res.ok) {
      document.getElementById("messages-list").innerHTML = '<p class="muted-text">Failed to load ticket.</p>';
      return;
    }
    renderTicketDetail(await res.json());
  } catch {
    document.getElementById("messages-list").innerHTML = '<p class="muted-text">Network error.</p>';
  }
}

function renderTicketDetail(t) {
  document.getElementById("detail-number").textContent = t.ticket_number;
  document.getElementById("detail-subject").textContent = t.subject;
  document.getElementById("detail-description").textContent = t.description;

  const statusEl = document.getElementById("detail-status");
  statusEl.textContent = STATUS_LABELS[t.status] || t.status;
  statusEl.className = `badge ${STATUS_COLORS[t.status] || ""}`;

  const priorityEl = document.getElementById("detail-priority");
  priorityEl.textContent = t.priority;
  priorityEl.className = `badge ${PRIORITY_COLORS[t.priority] || ""}`;

  document.getElementById("detail-category").textContent = t.category.replace(/_/g, " ");
  renderMessages(t.messages);
}

function renderMessages(messages) {
  const el = document.getElementById("messages-list");
  if (!messages.length) {
    el.innerHTML = '<p class="muted-text">No messages yet. Be the first to reply!</p>';
    return;
  }
  el.innerHTML = messages.map(m => `
    <div class="message-bubble${m.is_internal ? " internal" : ""}">
      <div class="message-meta">
        <strong>${escHtml(m.sender.full_name)}</strong>
        <span class="muted-text">${new Date(m.created_at).toLocaleString()}</span>
        ${m.is_internal ? '<span class="tag tag-internal">Internal note</span>' : ""}
      </div>
      <p class="message-content">${escHtml(m.content)}</p>
    </div>
  `).join("");
}

document.getElementById("back-to-list").addEventListener("click", () => {
  document.getElementById("ticket-detail-view").classList.add("hidden");
  document.getElementById("tickets-view").classList.remove("hidden");
});

/* ------------------------------------------------------------------ Reply form */
document.getElementById("reply-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const content  = document.getElementById("reply-content").value.trim();
  const errorEl  = document.getElementById("reply-error");
  const replyBtn = document.getElementById("reply-btn");
  if (!content) return;

  errorEl.classList.add("hidden");
  replyBtn.disabled = true;
  replyBtn.textContent = "Sending\u2026";

  try {
    const res = await apiPost(
      `/tickets/${currentTicketId}/messages`,
      { content, is_internal: false },
      token.access
    );
    if (res.status === 401) {
      const ok = await tryRefresh();
      if (!ok) { showLogin(); return; }
      return document.getElementById("reply-form").dispatchEvent(new Event("submit"));
    }
    if (!res.ok) {
      const data = await res.json();
      errorEl.textContent = data.detail || "Failed to send reply.";
      errorEl.classList.remove("hidden");
      return;
    }
    await openTicket(currentTicketId); // refresh detail
  } catch {
    errorEl.textContent = "Network error.";
    errorEl.classList.remove("hidden");
  } finally {
    replyBtn.disabled = false;
    replyBtn.textContent = "Send Reply";
  }
});

/* ------------------------------------------------------------------ Attachment preview */
const ALLOWED_EXTS  = new Set([".jpg", ".jpeg", ".png", ".gif", ".webp", ".pdf"]);
const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10 MB

function renderAttachmentPreview() {
  const input  = document.getElementById("ticket-attachments");
  const listEl = document.getElementById("attachment-preview");
  listEl.innerHTML = "";
  Array.from(input.files).forEach((file) => {
    const ext = file.name.slice(file.name.lastIndexOf(".")).toLowerCase();
    const ok  = ALLOWED_EXTS.has(ext) && file.size <= MAX_FILE_SIZE;
    const li  = document.createElement("li");
    li.className = `attachment-item${ok ? "" : " attachment-item-error"}`;
    const size = file.size < 1024 * 1024
      ? `${(file.size / 1024).toFixed(1)} KB`
      : `${(file.size / (1024 * 1024)).toFixed(1)} MB`;
    li.textContent = `${file.name} (${size})`;
    if (!ok) li.textContent += file.size > MAX_FILE_SIZE ? " \u2014 exceeds 10 MB" : " \u2014 unsupported type";
    listEl.appendChild(li);
  });
}

document.getElementById("ticket-attachments").addEventListener("change", renderAttachmentPreview);

const dropZone = document.getElementById("file-drop-zone");
dropZone.addEventListener("dragover", (e) => { e.preventDefault(); dropZone.classList.add("drag-over"); });
dropZone.addEventListener("dragleave", () => dropZone.classList.remove("drag-over"));
dropZone.addEventListener("drop", (e) => {
  e.preventDefault();
  dropZone.classList.remove("drag-over");
  const dt = e.dataTransfer;
  if (dt && dt.files.length) {
    const input    = document.getElementById("ticket-attachments");
    const transfer = new DataTransfer();
    Array.from(input.files).forEach(f => transfer.items.add(f));
    Array.from(dt.files).forEach(f => transfer.items.add(f));
    input.files = transfer.files;
    renderAttachmentPreview();
  }
});

/* ------------------------------------------------------------------ New Ticket form */
document.getElementById("new-ticket-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const successEl = document.getElementById("new-ticket-success");
  const errorEl   = document.getElementById("new-ticket-error");
  const submitBtn = document.getElementById("submit-ticket-btn");

  successEl.classList.add("hidden");
  errorEl.classList.add("hidden");

  const subject     = document.getElementById("ticket-subject").value.trim();
  const description = document.getElementById("ticket-description").value.trim();
  const category    = document.getElementById("ticket-category").value;
  const priority    = document.getElementById("ticket-priority").value;
  const is_public   = document.getElementById("ticket-public").checked;
  const files       = Array.from(document.getElementById("ticket-attachments").files);

  if (!subject || !description) {
    errorEl.textContent = "Subject and description are required.";
    errorEl.classList.remove("hidden");
    return;
  }

  // Client-side file validation
  for (const file of files) {
    const ext = file.name.slice(file.name.lastIndexOf(".")).toLowerCase();
    if (!ALLOWED_EXTS.has(ext)) {
      errorEl.textContent = `"${file.name}" is not an allowed file type (JPEG, PNG, GIF, WEBP, PDF only).`;
      errorEl.classList.remove("hidden");
      return;
    }
    if (file.size > MAX_FILE_SIZE) {
      errorEl.textContent = `"${file.name}" exceeds the 10 MB size limit.`;
      errorEl.classList.remove("hidden");
      return;
    }
  }

  submitBtn.disabled = true;
  submitBtn.textContent = "Submitting\u2026";

  try {
    // Step 1 — create the ticket
    const res = await apiPost("/tickets", { subject, description, category, priority, is_public }, token.access);
    if (res.status === 401) {
      const ok = await tryRefresh();
      if (!ok) { showLogin(); return; }
      submitBtn.disabled = false;
      submitBtn.textContent = "Submit Ticket";
      return;
    }
    if (!res.ok) {
      const data = await res.json();
      const detail = data.detail;
      errorEl.textContent = Array.isArray(detail)
        ? detail.map(d => d.msg || JSON.stringify(d)).join("; ")
        : (typeof detail === "string" ? detail : "Failed to submit ticket.");
      errorEl.classList.remove("hidden");
      return;
    }
    const ticket = await res.json();

    // Step 2 — upload attachments sequentially
    const uploadErrors = [];
    for (let i = 0; i < files.length; i++) {
      submitBtn.textContent = `Uploading attachments (${i + 1}/${files.length})\u2026`;
      const fd = new FormData();
      fd.append("file", files[i]);
      try {
        const upRes = await fetch(`/api/v1/tickets/${ticket.id}/attachments`, {
          method: "POST",
          headers: { Authorization: `Bearer ${token.access}` },
          body: fd,
        });
        if (!upRes.ok) {
          const upData = await upRes.json().catch(() => ({}));
          uploadErrors.push(upData.detail || files[i].name);
        }
      } catch {
        uploadErrors.push(files[i].name);
      }
    }

    document.getElementById("new-ticket-form").reset();
    document.getElementById("attachment-preview").innerHTML = "";

    if (uploadErrors.length) {
      successEl.textContent = `Ticket ${ticket.ticket_number} submitted, but some attachments failed: ${uploadErrors.join(", ")}`;
    } else {
      successEl.textContent = `Ticket ${ticket.ticket_number} submitted successfully!` +
        (files.length ? ` (${files.length} attachment${files.length > 1 ? "s" : ""} uploaded)` : "");
    }
    successEl.classList.remove("hidden");
    setTimeout(() => successEl.classList.add("hidden"), 6000);
  } catch {
    errorEl.textContent = "Network error.";
    errorEl.classList.remove("hidden");
  } finally {
    submitBtn.disabled = false;
    submitBtn.textContent = "Submit Ticket";
  }
});

/* ------------------------------------------------------------------ Init */
(async function init() {
  if (token.access) {
    await loadMe();
  } else {
    showLogin();
  }
})();

/* ================================================================== ADMIN DASHBOARD */

const ROLE_LABELS = { customer: "Customer", agent: "Agent", admin: "Admin" };
const ROLE_COLORS = { customer: "", agent: "badge-blue", admin: "badge-red" };

/* ------------------------------------------------------------------ Admin tab routing */
function activateAdminTab(tabName) {
  document.querySelectorAll(".admin-tab").forEach(btn => {
    btn.classList.toggle("active", btn.dataset.tab === tabName);
  });
  ["users", "create-user"].forEach(name => {
    const panel = document.getElementById(`admin-tab-${name}`);
    if (panel) panel.classList.add("hidden");
  });
  const panel = document.getElementById(`admin-tab-${tabName}`);
  if (panel) panel.classList.remove("hidden");
}

document.querySelectorAll(".admin-tab").forEach(btn => {
  btn.addEventListener("click", () => activateAdminTab(btn.dataset.tab));
});

/* ------------------------------------------------------------------ Admin logout */
document.getElementById("admin-logout-btn").addEventListener("click", async () => {
  try { await apiPost("/auth/logout", {}, token.access); } catch { /* ignore */ }
  token.clear();
  showLogin();
  logoutSuccess.classList.remove("hidden");
  setTimeout(() => logoutSuccess.classList.add("hidden"), 3000);
});

/* ------------------------------------------------------------------ Load all users */
async function loadAdminUsers() {
  const loadingEl  = document.getElementById("admin-users-loading");
  const errorEl    = document.getElementById("admin-users-error");
  const tableWrap  = document.getElementById("admin-users-table-wrap");
  const ticketsPanel = document.getElementById("admin-user-tickets-panel");
  const tbody      = document.getElementById("admin-users-tbody");

  ticketsPanel.classList.add("hidden");
  tableWrap.classList.remove("hidden");
  errorEl.classList.add("hidden");
  tbody.innerHTML = "";
  loadingEl.classList.remove("hidden");

  try {
    const res = await apiGet("/admin/users", token.access);
    loadingEl.classList.add("hidden");
    if (res.status === 401) {
      const ok = await tryRefresh();
      if (!ok) { showLogin(); return; }
      return loadAdminUsers();
    }
    if (!res.ok) {
      errorEl.textContent = "Failed to load users.";
      errorEl.classList.remove("hidden");
      return;
    }
    const users = await res.json();
    if (!users.length) {
      tbody.innerHTML = '<tr><td colspan="7" class="admin-empty-row">No users found.</td></tr>';
      return;
    }
    users.forEach(u => renderUserRow(u, tbody));
  } catch {
    loadingEl.classList.add("hidden");
    errorEl.textContent = "Network error loading users.";
    errorEl.classList.remove("hidden");
  }
}

function renderUserRow(u, tbody) {
  const tr = document.createElement("tr");
  tr.dataset.userId = u.id;

  const roleOptions = ["customer", "agent", "admin"]
    .map(r => `<option value="${r}"${r === u.role ? " selected" : ""}>${ROLE_LABELS[r]}</option>`)
    .join("");

  tr.innerHTML = `
    <td>${escHtml(u.full_name)}</td>
    <td>${escHtml(u.email)}</td>
    <td>
      <select class="role-select" data-user-id="${escHtml(u.id)}">
        ${roleOptions}
      </select>
    </td>
    <td><span class="badge ${u.is_active ? "badge-green" : "badge-muted"}">${u.is_active ? "Active" : "Inactive"}</span></td>
    <td>${u.ticket_count}</td>
    <td>${formatDate(u.created_at)}</td>
    <td class="admin-actions">
      <button class="btn btn-sm btn-outline save-role-btn" data-user-id="${escHtml(u.id)}">Save Role</button>
      <button class="btn btn-sm view-tickets-btn" data-user-id="${escHtml(u.id)}" data-user-name="${escHtml(u.full_name)}">View Tickets</button>
    </td>
  `;

  tr.querySelector(".save-role-btn").addEventListener("click", async () => {
    const select  = tr.querySelector(".role-select");
    const newRole = select.value;
    await saveUserRole(u.id, newRole, tr);
  });

  tr.querySelector(".view-tickets-btn").addEventListener("click", () => {
    showUserTickets(u.id, u.full_name);
  });

  tbody.appendChild(tr);
}

/* ------------------------------------------------------------------ Save role */
async function saveUserRole(userId, newRole, tr) {
  const btn = tr.querySelector(".save-role-btn");
  btn.disabled = true;
  btn.textContent = "Saving…";
  try {
    const res = await fetch(`${API}/admin/users/${userId}/role`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token.access}`,
      },
      body: JSON.stringify({ role: newRole }),
    });
    if (res.status === 401) {
      const ok = await tryRefresh();
      if (!ok) { showLogin(); return; }
      return saveUserRole(userId, newRole, tr);
    }
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      alert(data.detail || "Failed to update role.");
      return;
    }
    btn.textContent = "Saved ✓";
    setTimeout(() => { btn.disabled = false; btn.textContent = "Save Role"; }, 1500);
  } catch {
    alert("Network error while saving role.");
  } finally {
    if (btn.textContent !== "Saved ✓") {
      btn.disabled = false;
      btn.textContent = "Save Role";
    }
  }
}

/* ------------------------------------------------------------------ View user's tickets */
async function showUserTickets(userId, userName) {
  const tableWrap   = document.getElementById("admin-users-table-wrap");
  const panel       = document.getElementById("admin-user-tickets-panel");
  const titleEl     = document.getElementById("admin-user-tickets-title");
  const loadingEl   = document.getElementById("admin-user-tickets-loading");
  const emptyEl     = document.getElementById("admin-user-tickets-empty");
  const listEl      = document.getElementById("admin-user-tickets-list");

  tableWrap.classList.add("hidden");
  panel.classList.remove("hidden");
  titleEl.textContent = `Tickets for ${userName}`;
  listEl.innerHTML = "";
  emptyEl.classList.add("hidden");
  loadingEl.classList.remove("hidden");

  try {
    const res = await apiGet(`/admin/users/${userId}/tickets`, token.access);
    loadingEl.classList.add("hidden");
    if (res.status === 401) {
      const ok = await tryRefresh();
      if (!ok) { showLogin(); return; }
      return showUserTickets(userId, userName);
    }
    if (!res.ok) {
      listEl.innerHTML = '<p class="muted-text">Failed to load tickets.</p>';
      return;
    }
    const tickets = await res.json();
    if (!tickets.length) {
      emptyEl.classList.remove("hidden");
      return;
    }
    tickets.forEach(ticket => {
      const li = document.createElement("li");
      li.className = "ticket-item";
      li.innerHTML = `
        <div class="ticket-item-top">
          <span class="ticket-number-badge">${escHtml(ticket.ticket_number)}</span>
          <span class="badge ${STATUS_COLORS[ticket.status] || ''}">${STATUS_LABELS[ticket.status] || ticket.status}</span>
          <span class="badge ${PRIORITY_COLORS[ticket.priority] || ''}">${escHtml(ticket.priority)}</span>
        </div>
        <div class="ticket-subject">${escHtml(ticket.subject)}</div>
        <div class="ticket-meta">${escHtml(ticket.category.replace(/_/g, " "))} &bull; ${formatDate(ticket.created_at)}</div>
      `;
      listEl.appendChild(li);
    });
  } catch {
    loadingEl.classList.add("hidden");
    listEl.innerHTML = '<p class="muted-text">Network error.</p>';
  }
}

document.getElementById("admin-back-to-users").addEventListener("click", () => {
  document.getElementById("admin-user-tickets-panel").classList.add("hidden");
  document.getElementById("admin-users-table-wrap").classList.remove("hidden");
});

/* ------------------------------------------------------------------ Create account (admin) */
document.getElementById("admin-create-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const successEl = document.getElementById("admin-create-success");
  const errorEl   = document.getElementById("admin-create-error");
  const submitBtn = document.getElementById("admin-create-btn");

  successEl.classList.add("hidden");
  errorEl.classList.add("hidden");

  const full_name = document.getElementById("admin-new-name").value.trim();
  const email     = document.getElementById("admin-new-email").value.trim();
  const password  = document.getElementById("admin-new-password").value;
  const role      = document.getElementById("admin-new-role").value;

  if (!full_name || !email || !password) {
    errorEl.textContent = "All fields are required.";
    errorEl.classList.remove("hidden");
    return;
  }
  if (password.length < 8) {
    errorEl.textContent = "Password must be at least 8 characters.";
    errorEl.classList.remove("hidden");
    return;
  }

  submitBtn.disabled = true;
  submitBtn.textContent = "Creating…";

  try {
    const res  = await fetch(`${API}/admin/users`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token.access}`,
      },
      body: JSON.stringify({ full_name, email, password, role }),
    });
    const data = await res.json();
    if (res.status === 401) {
      const ok = await tryRefresh();
      if (!ok) { showLogin(); return; }
      submitBtn.disabled = false;
      submitBtn.textContent = "Create Account";
      return;
    }
    if (!res.ok) {
      const detail = data.detail;
      errorEl.textContent = Array.isArray(detail)
        ? detail.map(d => d.msg || JSON.stringify(d)).join("; ")
        : (typeof detail === "string" ? detail : "Failed to create account.");
      errorEl.classList.remove("hidden");
      return;
    }
    successEl.textContent = `Account created for ${data.full_name} (${data.email}) as ${data.role}.`;
    successEl.classList.remove("hidden");
    document.getElementById("admin-create-form").reset();
    setTimeout(() => successEl.classList.add("hidden"), 5000);
  } catch {
    errorEl.textContent = "Network error.";
    errorEl.classList.remove("hidden");
  } finally {
    submitBtn.disabled = false;
    submitBtn.textContent = "Create Account";
  }
});
