/* ============================================================
   MediSpa demo app — all data lives in browser LocalStorage.
   No backend, no build step. Open the HTML files directly,
   or serve the folder with any static file server.

   NOTE: This is a frontend-only demo/prototype. Auth here is
   for UI/UX purposes only — it is NOT a secure authentication
   system (no hashing, no server-side check). Do not use as-is
   for real user data.
   ============================================================ */

// Local calendar date as YYYY-MM-DD (toISOString() is UTC, which is "yesterday" in Manila before 8 AM).
function localISODate(d) {
  d = d || new Date();
  const p = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

const DB_KEYS = {
  users: 'medispa_users',
  customers: 'medispa_customers',
  transactions: 'medispa_transactions',
  settings: 'medispa_settings',
  redemptions: 'medispa_redemptions',
  session: 'medispa_session'
};

/* ---------- Loyalty rules ----------
   One simple rule: a customer's spending on the QUALIFYING service
   (Massage) is tracked in pesos. Every time it reaches `redeemThreshold`
   (default P10,000) they earn one reward, picked from the `prizes` list
   (default: a free 90-minute massage).

   The customer's `points` field now means "qualifying massage spend in
   pesos" (P1 spent on massage = 1 point), so existing code that compares
   points against redeemThreshold keeps working. */
const SERVICE_CATEGORIES = ['Massage', 'Nail Treatments', 'Body & Facial', 'Physical Therapy', 'Cleaning'];
const SETTINGS_VERSION = 2;
const DEFAULT_SETTINGS = {
  version: SETTINGS_VERSION,
  storeName: 'MediSpa',
  currency: '\u20B1',
  qualifyingCategory: 'Massage',
  redeemThreshold: 10000,
  prizes: ['Free 90-minute massage']
};

// Always returns a complete, valid settings object (fills in anything missing).
function getSettings() {
  const raw = readDB(DB_KEYS.settings, {});
  const s = Object.assign({}, DEFAULT_SETTINGS, raw);
  if (!Array.isArray(s.prizes) || !s.prizes.length) s.prizes = DEFAULT_SETTINGS.prizes.slice();
  if (!SERVICE_CATEGORIES.includes(s.qualifyingCategory)) s.qualifyingCategory = DEFAULT_SETTINGS.qualifyingCategory;
  if (!(Number(s.redeemThreshold) > 0)) s.redeemThreshold = DEFAULT_SETTINGS.redeemThreshold;
  return s;
}

// Points (= qualifying spend in pesos) that a purchase adds to the customer.
function pointsForPurchase(amount, category, settings) {
  settings = settings || getSettings();
  if (category !== settings.qualifyingCategory) return 0;
  return Math.floor(Number(amount) || 0);
}

/* A redemption moves through: pending -> approved -> received.
   Older records have no `status`; they already had a code (approved). */
function redemptionStatus(r) {
  if (r.status) return r.status;
  return r.received ? 'received' : 'approved';
}
function redemptionDate(r) {
  const st = redemptionStatus(r);
  if (st === 'received') return r.receivedDate || r.approvedDate || r.date || r.requestedDate || '';
  if (st === 'approved') return r.approvedDate || r.date || r.requestedDate || '';
  return r.requestedDate || r.date || '';
}
// Newest-first comparator (uses createdAt so two redemptions on the same day sort correctly).
function newestRedemptionFirst(a, b) {
  const d = (b.createdAt || 0) - (a.createdAt || 0);
  return d || redemptionDate(b).localeCompare(redemptionDate(a));
}

/* ---------- Service menu (from the printed MediSpa price list) ----------
   Each service has a regular and a promo price. Cleaning is priced per
   square metre (`perSqm: true`), so the amount = rate x area. */
const SERVICE_MENU = {
  'Massage': [
    { name: 'Swedish / Shiatsu / Combination', reg: 700, promo: 550 },
    { name: 'HARD Swedish / Shiatsu / Combi', reg: 950, promo: 750 },
    { name: 'Electric Sleep Inducing Massage', reg: 700, promo: 550 },
    { name: 'Pickleball / Tennis Massage', reg: 930, promo: 730 },
    { name: 'Hatha Yoga Thai Massage', reg: 930, promo: 730 },
    { name: 'Yanjing Foot Bath Reflexology', reg: 930, promo: 730 },
    { name: 'Traditional Filipino Massage', reg: 930, promo: 730 },
    { name: '14pcs Ventosa Cupping Massage', reg: 930, promo: 730 },
    { name: 'Lymphatic Drainage Massage', reg: 1000, promo: 790 },
    { name: 'Lomi Lomi Hawaiian Massage', reg: 1000, promo: 790 },
    { name: '32pcs Basalt Hot Stone Massage', reg: 1000, promo: 790 },
    { name: 'Prenatal / Postnatal Massage', reg: 775, promo: 620 },
    { name: 'Lactation Massage', reg: 775, promo: 620 }
  ],
  'Nail Treatments': [
    { name: 'Manicure (Orly)', reg: 400, promo: 310 },
    { name: 'Pedicure (Orly)', reg: 400, promo: 310 },
    { name: 'Manicure & Pedicure (Orly)', reg: 775, promo: 620 },
    { name: 'Peppermint Signature Foot Spa', reg: 675, promo: 530 },
    { name: 'Foot Spa + 30 mins Leg Massage', reg: 925, promo: 740 },
    { name: 'Mani, Pedi and Foot Spa', reg: 1150, promo: 910 },
    { name: 'The Royal Treatment', reg: 2500, promo: 1975 }
  ],
  'Body & Facial': [
    { name: 'Anti-Cellulite Coffee Body Scrub', reg: 1075, promo: 850 },
    { name: 'Rehydrating Milk Body Scrub', reg: 1075, promo: 850 },
    { name: 'Whitening Papaya Body Scrub', reg: 1075, promo: 850 },
    { name: 'Anti-Acne Cucumber Body Scrub', reg: 1075, promo: 850 },
    { name: 'Moisturizing Yogurt Mint Body Scrub', reg: 1250, promo: 990 },
    { name: 'Facial Scrub, Masque + Massage', reg: 700, promo: 550 },
    { name: 'Diamond Peel Microdermabrasion', reg: 1000, promo: 790 }
  ],
  'Physical Therapy': [
    { name: 'Myofascial Release Therapy', reg: 2000, promo: 1500 },
    { name: 'Geriatric Rehab', reg: 2000, promo: 1500 },
    { name: 'Orthopedic Therapy', reg: 2000, promo: 1500 },
    { name: 'Neurological Therapy', reg: 2000, promo: 1500 },
    { name: 'Stroke Rehab', reg: 2000, promo: 1500 },
    { name: 'Post Covid Reconditioning', reg: 2000, promo: 1500 }
  ],
  'Cleaning': [
    { name: 'Regular Cleaning', rate: 45, perSqm: true },
    { name: 'Premium Cleaning', rate: 55, perSqm: true },
    { name: 'Renovation / Post-Construction Cleaning', rate: 65, perSqm: true },
    { name: 'Deep Cleaning / Prenatal Cleaning', rate: 75, perSqm: true }
  ]
};

/* ---------- Voucher workflow ----------
   1. STAFF requests a reward for a customer who hit the threshold  -> pending
   2. ADMIN approves it (points are deducted, code is generated)    -> approved
   3. STAFF prints the voucher and hands it to the therapist, then
      marks it received                                             -> received
   4. ADMIN is notified on the Dashboard (adminSeen === false)
   Each step checks the logged-in role, so the rule holds even if a
   page forgets to hide a button. */
function currentRole() {
  const s = readDB(DB_KEYS.session, null);
  return s && s.loggedIn ? (s.role || 'admin') : null;
}
function customerDisplayName(c) {
  if (!c) return 'Unknown customer';
  if (c.lastName || c.firstName) return `${c.lastName || ''}${c.lastName && c.firstName ? ', ' : ''}${c.firstName || ''}`;
  return c.name || '-';
}
function makeVoucherCode() {
  const d = localISODate().replace(/-/g, '');
  return `MS-${d}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
}
const pesoShort = n => (getSettings().currency || '\u20B1') + Math.round(Number(n) || 0).toLocaleString('en-PH');

// STAFF: ask for a reward. Nothing is deducted yet.
function requestVoucher(customerId, prize) {
  if (currentRole() !== 'staff') return { ok: false, msg: 'Only staff can request a reward.' };
  const settings = getSettings();
  const customers = readDB(DB_KEYS.customers, []);
  const c = customers.find(x => x.id === customerId);
  if (!c) return { ok: false, msg: 'Customer record not found.' };
  if ((c.points || 0) < settings.redeemThreshold) return { ok: false, msg: 'Not enough massage spend to redeem.' };
  const reds = readDB(DB_KEYS.redemptions, []);
  if (reds.some(r => r.customerId === c.id && ['pending', 'approved'].includes(redemptionStatus(r)))) {
    return { ok: false, msg: 'This customer still has a voucher in progress.' };
  }
  reds.push({
    id: cryptoId(), createdAt: Date.now(),
    customerId: c.id, customerName: customerDisplayName(c),
    prize: prize || settings.prizes[0], points: settings.redeemThreshold,
    status: 'pending', code: null,
    requestedBy: (getSession() || {}).username || '',
    requestedDate: localISODate(),
    approvedDate: null, receivedDate: null, received: false
  });
  writeDB(DB_KEYS.redemptions, reds);
  return { ok: true };
}

// ADMIN: approve. Deducts the spend and generates the code.
async function approveVoucher(redemptionId) {
  if (currentRole() !== 'admin') { toast('Only the admin can approve vouchers.', 'warning'); return false; }
  const settings = getSettings();
  const reds = readDB(DB_KEYS.redemptions, []);
  const r = reds.find(x => x.id === redemptionId);
  if (!r || redemptionStatus(r) !== 'pending') return false;
  const customers = readDB(DB_KEYS.customers, []);
  const c = customers.find(x => x.id === r.customerId);
  if (!c) { toast('Customer record not found', 'error'); return false; }
  const cost = r.points || settings.redeemThreshold;
  if ((c.points || 0) < cost) { toast(`${customerDisplayName(c)} no longer has enough massage spend.`, 'error'); return false; }
  const ok = await confirmDialog(
    `Approve "${r.prize || settings.prizes[0]}" for ${customerDisplayName(c)}? This uses ${pesoShort(cost)} of massage spend. Staff will then print it for the therapist.`,
    { title: 'Approve voucher', confirmText: 'Approve' }
  );
  if (!ok) return false;
  c.points = (c.points || 0) - cost;
  r.status = 'approved';
  r.code = makeVoucherCode();
  r.approvedBy = (getSession() || {}).username || '';
  r.approvedDate = localISODate();
  writeDB(DB_KEYS.redemptions, reds);
  writeDB(DB_KEYS.customers, customers);
  toast('Voucher approved \u2014 staff can now print it');
  return true;
}

// ADMIN: decline a pending request. The request is removed; nothing was deducted yet,
// so the customer stays Loyalty Ready and staff can request again if needed.
async function rejectVoucher(redemptionId) {
  if (currentRole() !== 'admin') { toast('Only the admin can reject vouchers.', 'warning'); return false; }
  const reds = readDB(DB_KEYS.redemptions, []);
  const r = reds.find(x => x.id === redemptionId);
  if (!r || redemptionStatus(r) !== 'pending') return false;
  const ok = await confirmDialog(
    `Reject the voucher request for ${r.customerName || 'this customer'}? The request will be removed.`,
    { title: 'Reject request', confirmText: 'Reject', danger: true }
  );
  if (!ok) return false;
  writeDB(DB_KEYS.redemptions, reds.filter(x => x.id !== redemptionId));
  toast('Voucher request rejected');
  return true;
}

// STAFF: voucher was given to the therapist. Flags it for the admin dashboard.
async function markVoucherReceived(redemptionId) {
  if (currentRole() !== 'staff') { toast('Only staff can mark a voucher as received.', 'warning'); return false; }
  const reds = readDB(DB_KEYS.redemptions, []);
  const r = reds.find(x => x.id === redemptionId);
  if (!r || redemptionStatus(r) !== 'approved') return false;
  const ok = await confirmDialog(
    `Confirm the voucher for ${r.customerName || 'this customer'} was given to the therapist? The admin will be notified.`,
    { title: 'Mark as received', confirmText: 'Yes, received' }
  );
  if (!ok) return false;
  r.status = 'received';
  r.received = true;
  r.receivedBy = (getSession() || {}).username || '';
  r.receivedDate = localISODate();
  r.receivedAt = Date.now();
  r.adminSeen = false;
  writeDB(DB_KEYS.redemptions, reds);
  toast('Marked as received \u2014 admin notified');
  return true;
}

// ADMIN: clear dashboard notifications (one id, or all when id is omitted).
function acknowledgeReceived(id) {
  const reds = readDB(DB_KEYS.redemptions, []);
  reds.forEach(r => { if (r.adminSeen === false && (!id || r.id === id)) r.adminSeen = true; });
  writeDB(DB_KEYS.redemptions, reds);
}

// Number shown on the Home nav badge.
function voucherAlertCount() {
  const role = currentRole();
  const reds = readDB(DB_KEYS.redemptions, []);
  if (role === 'admin') return reds.filter(r => redemptionStatus(r) === 'pending' || (redemptionStatus(r) === 'received' && r.adminSeen === false)).length;
  if (role === 'staff') return reds.filter(r => redemptionStatus(r) === 'approved').length;
  return 0;
}

/* ---------- Voucher modal (shared: Customers + Dashboard) ----------
   Shows a printable voucher for one approved/received redemption.
   Staff get Print + Mark as received; onChange() runs after a status change. */
function openVoucherModal(redemptionId, onChange) {
  const r = readDB(DB_KEYS.redemptions, []).find(x => x.id === redemptionId);
  if (!r || !r.code) return;
  const st = redemptionStatus(r);
  let backdrop = document.getElementById('voucher-modal-shared');
  if (backdrop) backdrop.remove();
  backdrop = document.createElement('div');
  backdrop.id = 'voucher-modal-shared';
  backdrop.className = 'modal-backdrop open';
  backdrop.setAttribute('role', 'dialog');
  backdrop.setAttribute('aria-modal', 'true');
  const isStaff = currentRole() === 'staff';
  backdrop.innerHTML = `
    <div class="modal">
      <h2 style="margin-top:0;">Voucher for therapist</h2>
      <p class="card-subtitle" style="margin-top:4px;">${st === 'received'
        ? 'This voucher was already given to the therapist.'
        : 'Print this voucher, give it to the therapist, then mark it as received.'}</p>
      <div class="voucher-card">
        <img src="assets/medispa-logo.png" alt="MediSpa">
        <div class="for">Specially for you</div>
        <div class="who"></div>
        <div class="prize"></div>
        <div class="code"></div>
        <div class="meta"></div>
      </div>
      <div class="modal-actions">
        <button class="btn" type="button" data-act="close">Close</button>
        ${isStaff ? '<button class="btn" type="button" data-act="print">Print</button>' : ''}
        ${isStaff && st === 'approved' ? '<button class="btn solid" type="button" data-act="received">Mark as received</button>' : ''}
      </div>
    </div>`;
  backdrop.querySelector('.who').textContent = r.customerName || '-';
  backdrop.querySelector('.prize').textContent = r.prize || getSettings().prizes[0];
  backdrop.querySelector('.code').textContent = r.code;
  backdrop.querySelector('.meta').textContent =
    `Approved ${r.approvedDate || ''} \u00B7 Give this to the therapist`;
  document.body.appendChild(backdrop);
  const close = () => backdrop.remove();
  backdrop.addEventListener('click', async (e) => {
    if (e.target === backdrop) return close();
    const act = e.target.closest('button') && e.target.closest('button').getAttribute('data-act');
    if (act === 'close') close();
    if (act === 'print') {
      document.body.classList.add('print-voucher');
      window.addEventListener('afterprint', () => document.body.classList.remove('print-voucher'), { once: true });
      window.print();
    }
    if (act === 'received') {
      if (await markVoucherReceived(redemptionId)) { close(); if (onChange) onChange(); }
    }
  });
}

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
  const existing = readDB(DB_KEYS.settings, null);
  if (!existing) {
    writeDB(DB_KEYS.settings, Object.assign({}, DEFAULT_SETTINGS));
  } else if ((existing.version || 1) < SETTINGS_VERSION) {
    // Old points-per-peso rules -> new massage-spend rule. Keep the store name.
    writeDB(DB_KEYS.settings, Object.assign({}, DEFAULT_SETTINGS, {
      storeName: existing.storeName || DEFAULT_SETTINGS.storeName,
      currency: existing.currency || DEFAULT_SETTINGS.currency
    }));
  }
  if (!localStorage.getItem(DB_KEYS.customers)) {
    writeDB(DB_KEYS.customers, [
      // points = massage spend in pesos (startingPoints = spend carried over before the system)
      { id: cryptoId(), name: 'Reyes, Rosela', phone: '0917-000-0001', email: 'rosela@example.com', startingPoints: 8000, points: 10200, joined: '2026-06-01' },
      { id: cryptoId(), name: 'Carlos, Almira', phone: '0917-000-0002', email: 'almira@example.com', startingPoints: 3000, points: 3900, joined: '2026-06-14' },
      { id: cryptoId(), name: 'Egera, Kimberly', phone: '0917-000-0003', email: 'kimberly@example.com', startingPoints: 0, points: 0, joined: '2026-07-02' }
    ].concat(buildDemoCustomers()));
  }
  if (!localStorage.getItem(DB_KEYS.transactions)) {
    const custs = readDB(DB_KEYS.customers, []);
    const now = new Date();
    const mk = (daysAgo, custIdx, amount, category) => {
      const d = new Date(now);
      d.setDate(d.getDate() - daysAgo);
      return {
        id: cryptoId(),
        customerId: custs[custIdx] ? custs[custIdx].id : null,
        customerName: custs[custIdx] ? custs[custIdx].name : 'Walk-in',
        amount: amount,
        category: category,
        pointsEarned: category === 'Massage' ? Math.floor(amount) : 0,
        date: localISODate(d)
      };
    };
    writeDB(DB_KEYS.transactions, [
      mk(20, 0, 1500, 'Massage'),
      mk(12, 1, 900, 'Massage'),
      mk(5, 2, 350, 'Nail Treatments'),   // not a massage, so no reward progress
      mk(2, 0, 700, 'Massage')
    ].concat(buildDemoTransactions()));
  }
}

/* ---------- demo data (so pagination / filters have something to show) ----------
   Deterministic pseudo-random numbers: the same data is generated on every
   fresh start, so the demo always looks the same. */
function demoRng(seed) {
  let x = seed;
  return () => { x = (x * 1664525 + 1013904223) % 4294967296; return x / 4294967296; };
}
const DEMO_NAMES = [
  ['Maria', 'Santos'], ['Jose', 'Dela Cruz'], ['Angelica', 'Garcia'], ['Mark', 'Villanueva'],
  ['Joanna', 'Bautista'], ['Paolo', 'Mendoza'], ['Katrina', 'Ramos'], ['Daniel', 'Aquino'],
  ['Bea', 'Navarro'], ['Carlo', 'Castillo'], ['Liza', 'Domingo'], ['Rico', 'Fernandez'],
  ['Trisha', 'Lopez'], ['Miguel', 'Torres'], ['Nina', 'Cruz'], ['Enzo', 'Rivera'],
  ['Hazel', 'Pascual'], ['Gabriel', 'Soriano'], ['Camille', 'Valdez'], ['Ryan', 'Salazar'],
  ['Ivy', 'Manalo'], ['Jun', 'Tolentino'], ['Sheila', 'Aguilar'], ['Patrick', 'Reyes'],
  ['Denise', 'Flores'], ['Alvin', 'Mercado'], ['Rhea', 'Corpuz']
];
function demoDate(daysAgo) {
  const d = new Date();
  d.setDate(d.getDate() - daysAgo);
  return localISODate(d);
}
function buildDemoData() {
  const rnd = demoRng(2026);
  const pick = list => list[Math.floor(rnd() * list.length)];
  const customers = DEMO_NAMES.map((n, i) => {
    // 0 - 7,000 carried over; every 6th customer gets +5,000 so a few are close to / past a reward
    const startingPoints = Math.round(rnd() * 70) * 100 + (i % 6 === 2 ? 5000 : 0);
    const joinedDaysAgo = 30 + Math.floor(rnd() * 90);
    return {
      id: 'id_demo' + String(i + 1).padStart(3, '0'),
      firstName: n[0],
      lastName: n[1],
      name: `${n[1]}, ${n[0]}`,
      phone: '0918-555-' + String(1000 + i * 37).slice(-4),
      email: (n[0] + '.' + n[1]).toLowerCase().replace(/\s+/g, '') + '@example.com',
      startingPoints: startingPoints,
      points: startingPoints,                                     // massage transactions are added below
      joined: demoDate(joinedDaysAgo),
      _joinedDaysAgo: joinedDaysAgo
    };
  });

  const txns = [];
  for (let i = 0; i < 60; i++) {
    const c = customers[Math.floor(rnd() * customers.length)];
    // Weighted toward Massage (the qualifying service).
    const category = rnd() < 0.6 ? 'Massage' : pick(SERVICE_CATEGORIES);
    const item = pick(SERVICE_MENU[category]);
    let amount, priceType, area = null;
    if (item.perSqm) { area = 20 + Math.floor(rnd() * 8) * 10; amount = item.rate * area; priceType = 'per-sqm'; }
    else { priceType = rnd() < 0.7 ? 'promo' : 'reg'; amount = item[priceType]; }
    const pointsEarned = category === 'Massage' ? Math.floor(amount) : 0;
    c.points += pointsEarned;                                     // keep customer spend consistent with history
    txns.push({
      id: 'id_demotx' + String(i + 1).padStart(3, '0'),
      customerId: c.id,
      customerName: c.name,
      amount: amount,
      category: category,
      service: item.name,
      priceType: priceType,
      area: area,
      pointsEarned: pointsEarned,
      date: demoDate(Math.floor(rnd() * (c._joinedDaysAgo - 1)))
    });
  }
  customers.forEach(c => { delete c._joinedDaysAgo; });
  return { customers: customers, txns: txns };
}
function buildDemoCustomers() { return buildDemoData().customers; }
function buildDemoTransactions() { return buildDemoData().txns; }

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
  // Demo-only check against the seeded users in LocalStorage.
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
      <span class="ico"><img src="${item.icon}" alt=""></span><span>${escapeHTML(item.label)}</span>${
      item.href === 'dashboard.html' && voucherAlertCount() ? `<span class="nav-badge" title="Voucher updates">${voucherAlertCount()}</span>` : ''}
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