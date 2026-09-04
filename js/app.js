/* ============================================================
   MediSpa demo app — all data lives in browser LocalStorage.
   No backend, no build step. Open the HTML files directly,
   or serve the folder with any static file server.
   ============================================================ */

const DB_KEYS = {
  users: 'medispa_users',
  customers: 'medispa_customers',
  transactions: 'medispa_transactions',
  settings: 'medispa_settings',
  session: 'medispa_session'
};

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
      { username: 'admin', password: 'admin123' }
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

/* ---------- auth ---------- */
function getSession() {
  return readDB(DB_KEYS.session, null);
}
function requireAuth() {
  seedIfEmpty();
  const s = getSession();
  if (!s || !s.loggedIn) {
    window.location.href = 'index.html';
  }
  return s;
}
function login(username, password) {
  const users = readDB(DB_KEYS.users, []);
  // Simple JD if-else check, per the tech-stack brief.
  for (let i = 0; i < users.length; i++) {
    if (users[i].username === username && users[i].password === password) {
      writeDB(DB_KEYS.session, { username: username, loggedIn: true });
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
function toast(msg) {
  let el = document.getElementById('toast');
  if (!el) {
    el = document.createElement('div');
    el.id = 'toast';
    el.className = 'toast';
    document.body.appendChild(el);
  }
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(el._t);
  el._t = setTimeout(() => el.classList.remove('show'), 2200);
}

/* ---------- shared shell (sidebar + topbar) ---------- */
const NAV_ITEMS = [
  { href: 'dashboard.html', icon: '&#8962;', label: 'Home' },
  { href: 'customers.html', icon: '&#128101;', label: 'Customer' },
  { href: 'transactions.html', icon: '&#128203;', label: 'Transaction' },
  { href: 'report.html', icon: '&#128196;', label: 'Report' },
  { href: 'settings.html', icon: '&#9881;', label: 'Setting' }
];

function renderShell(activeHref, pageTitle) {
  const settings = readDB(DB_KEYS.settings, { storeName: 'MediSpa' });
  const session = getSession();

  const nav = NAV_ITEMS.map(item => `
    <a class="nav-item ${item.href === activeHref ? 'active' : ''}" href="${item.href}">
      <span class="ico">${item.icon}</span><span>${item.label}</span>
    </a>
  `).join('');

  document.getElementById('sidebar-slot').innerHTML = `
    <div class="brand">
      <span class="logo-icon">&#10023;</span>
      <div class="brand-name">${settings.storeName || 'MediSpa'}</div>
    </div>
    ${nav}
  `;

  document.getElementById('topbar-slot').innerHTML = `
    <h1>${pageTitle}</h1>
    <div class="user-chip" id="user-chip">
      <div class="avatar">&#128100;</div>
      <span style="font-size:13px;color:var(--text-muted)">${session ? session.username : ''}</span>
      <span>&#9660;</span>
      <div class="user-menu" id="user-menu">
        <button id="logout-btn">Log out</button>
      </div>
    </div>
  `;

  const chip = document.getElementById('user-chip');
  const menu = document.getElementById('user-menu');
  chip.addEventListener('click', (e) => {
    menu.classList.toggle('open');
    e.stopPropagation();
  });
  document.addEventListener('click', () => menu.classList.remove('open'));
  document.getElementById('logout-btn').addEventListener('click', logout);
}
