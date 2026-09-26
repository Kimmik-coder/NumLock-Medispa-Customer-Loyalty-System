/* ============================================================
   MediSpa demo app — all data lives in browser LocalStorage.
   No backend, no build step. Open the HTML files directly,
   or serve the folder with any static file server.

   NOTE: This is a frontend-only demo/prototype. Auth here is
   for UI/UX purposes only — it is NOT a secure authentication
   system (no hashing, no server-side check). Do not use as-is
   for real user data.
   ============================================================ */

const DB_KEYS = {
  users: 'medispa_users',
  customers: 'medispa_customers',
  transactions: 'medispa_transactions',
  settings: 'medispa_settings',
  session: 'medispa_session'
};

// Session auto-expires after this many minutes of inactivity.
const SESSION_TIMEOUT_MINUTES = 30;

/* ---------- low level storage helpers ---------- */
function readDB(key, fallback) {
  const raw = localStorage.getItem(key);
  if (!raw) return fallback;
  try { return JSON.parse(raw); } catch (e) { return fallback; }
}
function writeDB(key, value) {
  localStorage.setItem(key, JSON.stringify(value));
}

/* ---------- first-run seed data ---------- */
function seedIfEmpty() {
  if (!localStorage.getItem(DB_KEYS.users)) {
    writeDB(DB_KEYS.users, [
      { username: 'admin', password: 'admin123', role: 'admin' },
      { username: 'staff', password: 'staff123', role: 'staff' }
    ]);
  }
  if (!localStorage.getItem(DB_KEYS.settings)) {
    writeDB(DB_KEYS.settings, {
      storeName: 'MediSpa',
      pointsPerAmount: 10,   // points earned
      amountUnit: 100,       // per this many currency units spent
      redeemThreshold: 100   // points needed to redeem a loyalty voucher
    });
  }
  if (!localStorage.getItem(DB_KEYS.customers)) {
    writeDB(DB_KEYS.customers, [
      { id: cryptoId(), name: 'Reyes, Rosela', phone: '0917-000-0001', email: 'rosela@example.com', points: 120, joined: '2026-06-01' },
      { id: cryptoId(), name: 'Carlos, Almira', phone: '0917-000-0002', email: 'almira@example.com', points: 60, joined: '2026-06-14' },
      { id: cryptoId(), name: 'Egera, Kimberly', phone: '0917-000-0003', email: 'kimberly@example.com', points: 15, joined: '2026-07-02' }
    ]);
  }
  if (!localStorage.getItem(DB_KEYS.transactions)) {
    const custs = readDB(DB_KEYS.customers, []);
    const now = new Date();
    const mk = (daysAgo, custIdx, amount) => {
      const d = new Date(now);
      d.setDate(d.getDate() - daysAgo);
      return {
        id: cryptoId(),
        customerId: custs[custIdx] ? custs[custIdx].id : null,
        customerName: custs[custIdx] ? custs[custIdx].name : 'Walk-in',
        amount: amount,
        pointsEarned: Math.floor(amount / 100) * 10,
        date: d.toISOString().slice(0, 10)
      };
    };
    writeDB(DB_KEYS.transactions, [
      mk(20, 0, 1500),
      mk(12, 1, 900),
      mk(5, 2, 350),
      mk(2, 0, 700)
    ]);
  }
}

function cryptoId() {
  return 'id_' + Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
}

/* ---------- small utils ---------- */
// Prevent XSS when injecting user-supplied strings (e.g. username) into innerHTML.
function escapeHTML(str) {
  const div = document.createElement('div');
  div.textContent = String(str == null ? '' : str);
  return div.innerHTML;
}

/* ---------- auth ---------- */
function getSession() {
  const s = readDB(DB_KEYS.session, null);
  if (!s || !s.loggedIn) return null;

  // Enforce client-side session timeout based on last activity.
  const now = Date.now();
  if (!s.lastActive || (now - s.lastActive) > SESSION_TIMEOUT_MINUTES * 60 * 1000) {
    localStorage.removeItem(DB_KEYS.session);
    return null;
  }

  // Sliding expiry: touch the session on every check so active use doesn't time out.
  s.lastActive = now;
  writeDB(DB_KEYS.session, s);
  return s;
}

function requireAuth() {
  seedIfEmpty();
  const s = getSession();
  if (!s) {
    window.location.href = 'index.html';
    return null;
  }
  return s;
}

// Use on pages that only some roles may open (e.g. Settings, Report are
// admin-only). allowedRoles is an array like ['admin']. Staff who try to
// open the page directly (typed URL, bookmark, etc.) get bounced back to
// the dashboard with an explanatory toast.
function requireRole(allowedRoles) {
  const s = requireAuth();
  if (!s) return null;
  const role = s.role || 'admin';
  if (allowedRoles && !allowedRoles.includes(role)) {
    sessionStorage.setItem('medispa_flash', "Your staff account doesn't have access to that page.");
    window.location.href = 'dashboard.html';
    return null;
  }
  return s;
}

function login(username, password) {
  const users = readDB(DB_KEYS.users, []);
  // Simple JD if-else check, per the tech-stack brief.
  for (let i = 0; i < users.length; i++) {
    if (users[i].username === username && users[i].password === password) {
      writeDB(DB_KEYS.session, {
        username: username,
        role: users[i].role || 'admin',
        loggedIn: true,
        lastActive: Date.now()
      });
      return true;
    }
  }
  return false;
}

function logout() {
  localStorage.removeItem(DB_KEYS.session);
  window.location.href = 'index.html';
}

/* ---------- formatting helpers ---------- */
function money(n) {
  return Number(n || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
function initials(name) {
  return (name || '?').trim().charAt(0).toUpperCase();
}
/* ---------- Notification box (toast) ----------
   Replaces the browser's default alert()-style popup with an in-app
   notification box, stacked so several actions can each get their own
   message instead of overwriting one another.
   type: 'success' (default) | 'error' | 'warning' | 'info' */
const TOAST_ICONS = { success: '✓', error: '!', warning: '!', info: 'i' };
function toast(msg, type) {
  type = type && TOAST_ICONS[type] ? type : 'success';
  let stack = document.getElementById('toast-stack');
  if (!stack) {
    stack = document.createElement('div');
    stack.id = 'toast-stack';
    stack.className = 'toast-stack';
    document.body.appendChild(stack);
  }
  const el = document.createElement('div');
  el.className = `toast-item ${type}`;
  el.innerHTML = `
    <span class="toast-icon">${TOAST_ICONS[type]}</span>
    <span class="toast-msg"></span>
    <button type="button" class="toast-close" aria-label="Dismiss">&times;</button>
  `;
  el.querySelector('.toast-msg').textContent = msg;

  const remove = () => {
    el.classList.remove('show');
    setTimeout(() => el.remove(), 220);
  };
  el.querySelector('.toast-close').addEventListener('click', remove);

  stack.appendChild(el);
  requestAnimationFrame(() => el.classList.add('show'));
  el._t = setTimeout(remove, 3200);
}

/* ---------- Confirm dialog (replaces native confirm()) ----------
   Returns a Promise<boolean> so callers can `await confirmDialog(...)`.
   Renders an in-app dialog instead of the browser's own "<site> says"
   popup. Usage:
     if (!(await confirmDialog('Delete this customer?'))) return;
   Options: { title, confirmText, cancelText, danger } */
function confirmDialog(message, opts) {
  opts = opts || {};
  return new Promise(resolve => {
    let backdrop = document.getElementById('confirm-backdrop');
    if (backdrop) backdrop.remove(); // avoid stacking if one is already open
    backdrop = document.createElement('div');
    backdrop.id = 'confirm-backdrop';
    backdrop.className = 'confirm-backdrop';
    backdrop.setAttribute('role', 'dialog');
    backdrop.setAttribute('aria-modal', 'true');
    backdrop.innerHTML = `
      <div class="confirm-card">
        <h2></h2>
        <p></p>
        <div class="confirm-actions">
          <button type="button" class="btn" id="confirm-cancel"></button>
          <button type="button" class="btn ${opts.danger ? 'danger' : 'solid'}" id="confirm-ok"></button>
        </div>
      </div>
    `;
    backdrop.querySelector('h2').textContent = opts.title || 'Please confirm';
    backdrop.querySelector('p').textContent = message;
    backdrop.querySelector('#confirm-cancel').textContent = opts.cancelText || 'Cancel';
    backdrop.querySelector('#confirm-ok').textContent = opts.confirmText || 'Confirm';
    document.body.appendChild(backdrop);
    requestAnimationFrame(() => backdrop.classList.add('open'));

    const cleanup = (result) => {
      document.removeEventListener('keydown', onKey);
      backdrop.classList.remove('open');
      setTimeout(() => backdrop.remove(), 150);
      resolve(result);
    };
    const onKey = (e) => {
      if (e.key === 'Escape') cleanup(false);
      if (e.key === 'Enter') cleanup(true);
    };
    document.addEventListener('keydown', onKey);
    backdrop.querySelector('#confirm-ok').addEventListener('click', () => cleanup(true));
    backdrop.querySelector('#confirm-cancel').addEventListener('click', () => cleanup(false));
    backdrop.addEventListener('click', (e) => { if (e.target === backdrop) cleanup(false); });
  });
}

/* ---------- shared shell (sidebar + topbar) ---------- */
// `roles` limits which logged-in roles see this nav item / may open the page.
// Omit `roles` (or leave it out) for pages every role can use.
const NAV_ITEMS = [
  { href: 'dashboard.html', icon: 'assets/icons/home.png', label: 'Home' },
  { href: 'customers.html', icon: 'assets/icons/customers.png', label: 'Customer' },
  { href: 'transactions.html', icon: 'assets/icons/transactions.png', label: 'Transaction' },
  { href: 'report.html', icon: 'assets/icons/report.png', label: 'Report', roles: ['admin'] },
  { href: 'settings.html', icon: 'assets/icons/settings.png', label: 'Setting', roles: ['admin'] }
];

function renderShell(activeHref, pageTitle) {
  const sidebarSlot = document.getElementById('sidebar-slot');
  const topbarSlot = document.getElementById('topbar-slot');
  if (!sidebarSlot || !topbarSlot) {
    console.warn('renderShell: #sidebar-slot or #topbar-slot not found on this page.');
    return;
  }

  const settings = readDB(DB_KEYS.settings, { storeName: 'MediSpa' });
  const session = getSession();
  const role = session ? (session.role || 'admin') : 'admin';

  const nav = NAV_ITEMS
    .filter(item => !item.roles || item.roles.includes(role))
    .map(item => `
    <a class="nav-item ${item.href === activeHref ? 'active' : ''}" href="${item.href}">
      <span class="ico"><img src="${item.icon}" alt=""></span><span>${escapeHTML(item.label)}</span>
    </a>
  `).join('');

  sidebarSlot.innerHTML = `
    <div class="brand">
      <img src="assets/medispa-logo.png" alt="MediSpa logo">
      <div class="brand-copy">
        <div class="brand-name">${escapeHTML(settings.storeName || 'MediSpa')}</div>
        <small>Customer Loyalty System</small>
      </div>
    </div>
    <div class="nav-label">Main menu</div>
    ${nav}
  `;

  topbarSlot.innerHTML = `
    <div class="topbar-left">
      <button class="mobile-menu" id="mobile-menu" aria-label="Open menu">☰</button>
      <div>
        <h1>${escapeHTML(pageTitle)}</h1>
      </div>
    </div>
    <div class="user-chip" id="user-chip">
      <div class="avatar admin-avatar"><img src="assets/icons/admin.png" alt="Admin"></div>
      <span style="font-size:13px;color:var(--text-muted)">${escapeHTML(session ? session.username : '')}</span>
      <span class="badge ${role === 'admin' ? 'gold' : 'member'}" style="text-transform:capitalize;">${escapeHTML(role)}</span>
      <span>&#9660;</span>
      <div class="user-menu" id="user-menu">
        <button id="logout-btn">Log out</button>
      </div>
    </div>
  `;

  const overlay = document.createElement('div');
  overlay.className = 'overlay';
  document.body.appendChild(overlay);
  const mobileMenu = document.getElementById('mobile-menu');
  const sidebar = document.getElementById('sidebar-slot');
  mobileMenu.addEventListener('click', (e) => {
    e.stopPropagation();
    sidebar.classList.add('open');
    overlay.classList.add('open');
  });
  overlay.addEventListener('click', () => {
    sidebar.classList.remove('open');
    overlay.classList.remove('open');
  });
  document.querySelectorAll('.nav-item').forEach(link => link.addEventListener('click', () => {
    sidebar.classList.remove('open');
    overlay.classList.remove('open');
  }));

  const chip = document.getElementById('user-chip');
  const menu = document.getElementById('user-menu');
  chip.addEventListener('click', (e) => {
    menu.classList.toggle('open');
    e.stopPropagation();
  });
  document.addEventListener('click', () => menu.classList.remove('open'));
  const logoutBtn = document.getElementById('logout-btn');
  if (logoutBtn) logoutBtn.addEventListener('click', logout);
}