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
const loginSection     = document.getElementById("login-section");
const dashboardSection = document.getElementById("dashboard-section");
const loginForm        = document.getElementById("login-form");
const loginBtn         = document.getElementById("login-btn");
const loginError       = document.getElementById("login-error");
const logoutBtn        = document.getElementById("logout-btn");
const logoutSuccess    = document.getElementById("logout-success");
const togglePw         = document.getElementById("toggle-pw");
const passwordInput    = document.getElementById("password");

/* ------------------------------------------------------------------ UI helpers */
function showError(msg) {
  loginError.textContent = msg;
  loginError.classList.remove("hidden");
}
function hideError() { loginError.classList.add("hidden"); }

function showLogin() {
  dashboardSection.classList.add("hidden");
  loginSection.classList.remove("hidden");
  loginForm.reset();
  hideError();
  logoutSuccess.classList.add("hidden");
}

function showDashboard(user) {
  loginSection.classList.add("hidden");
  dashboardSection.classList.remove("hidden");
  document.getElementById("user-name").textContent    = user.full_name;
  document.getElementById("user-email").textContent   = user.email;
  document.getElementById("user-id").textContent      = user.id;
  document.getElementById("user-role").textContent    = user.role;
  document.getElementById("user-created").textContent =
    new Date(user.created_at).toLocaleDateString(undefined, { dateStyle: "long" });
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
  logoutSuccess.classList.remove("hidden");
  showLogin();
  logoutSuccess.classList.remove("hidden"); // keep visible on login screen briefly
  setTimeout(() => logoutSuccess.classList.add("hidden"), 3000);
});

/* ------------------------------------------------------------------ Password toggle */
togglePw.addEventListener("click", () => {
  const isHidden = passwordInput.type === "password";
  passwordInput.type = isHidden ? "text" : "password";
  togglePw.textContent = isHidden ? "🙈" : "👁";
});

/* ------------------------------------------------------------------ Init */
(async function init() {
  if (token.access) {
    await loadMe();
  } else {
    showLogin();
  }
})();
