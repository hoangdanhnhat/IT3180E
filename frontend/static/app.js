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
const loginSection      = document.getElementById("login-section");
const registerSection   = document.getElementById("register-section");
const dashboardSection  = document.getElementById("dashboard-section");
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

  if (!subject || !description) {
    errorEl.textContent = "Subject and description are required.";
    errorEl.classList.remove("hidden");
    return;
  }

  submitBtn.disabled = true;
  submitBtn.textContent = "Submitting\u2026";

  try {
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
    document.getElementById("new-ticket-form").reset();
    successEl.textContent = `Ticket ${ticket.ticket_number} submitted successfully!`;
    successEl.classList.remove("hidden");
    setTimeout(() => successEl.classList.add("hidden"), 5000);
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
