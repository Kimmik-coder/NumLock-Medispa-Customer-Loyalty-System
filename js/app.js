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

/* ---------- Business day (remit day) ----------
   MediSpa is open 11:00 AM to 3:00 AM the next morning, so one remit day
   runs across midnight. Anything recorded between 12:00 AM and 2:59 AM
   still belongs to the day that opened at 11 AM (the PREVIOUS calendar date). */
const SHOP_OPEN_HOUR = 11;
const SHOP_CLOSE_HOUR = 3;
function businessDate(d) {
  d = d ? new Date(d) : new Date();
  if (d.getHours() < SHOP_CLOSE_HOUR) d.setDate(d.getDate() - 1);
  return localISODate(d);
}
function localTimeHM(d) {
  d = d || new Date();
  const p = n => String(n).padStart(2, '0');
  return `${p(d.getHours())}:${p(d.getMinutes())}`;
}
function fmtTime12(hm) {
  if (!hm) return '';
  const [h, m] = hm.split(':').map(Number);
  return `${((h + 11) % 12) + 1}:${String(m).padStart(2, '0')} ${h < 12 ? 'AM' : 'PM'}`;
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
  prizes: ['Free 90-minute massage'],
  therapists: ['Joy Dela Peña', 'Grace Mendoza', 'Liza Ramos', 'Maricel Bautista', 'Jenny Villanueva', 'Rowena Castillo', 'Cheryl Aquino', 'Analyn Torres', 'Glenda Navarro', 'Marites Domingo', 'Rhea Santiago', 'Jocelyn Pascual', 'Mylene Cruz']
};

// Always returns a complete, valid settings object (fills in anything missing).
function getSettings() {
  const raw = readDB(DB_KEYS.settings, {});
  const s = Object.assign({}, DEFAULT_SETTINGS, raw);
  if (!Array.isArray(s.prizes) || !s.prizes.length) s.prizes = DEFAULT_SETTINGS.prizes.slice();
  if (!Array.isArray(s.therapists) || !s.therapists.length) s.therapists = DEFAULT_SETTINGS.therapists.slice();
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

/* ---------- Therapist hours & remittance ----------
   Every transaction records which therapist did the service (`therapist`)
   and how many hours it took (`hours`, minimum 1). What a therapist has to
   remit = the total amount of the transactions they handled. */
const MIN_THERAPIST_HOURS = 1;
const NO_THERAPIST = 'No therapist recorded';   // older transactions made before this field existed

function therapistSummary(txns) {
  const map = {};
  txns.forEach(t => {
    const key = t.therapist || NO_THERAPIST;
    const r = map[key] || (map[key] = { name: key, count: 0, hours: 0, total: 0, items: [] });
    r.items.push(t);
    r.count += 1;
    r.hours += Number(t.hours) || 0;
    r.total += Number(t.amount) || 0;
  });
  return Object.values(map).sort((a, b) =>
    a.name === NO_THERAPIST ? 1 : b.name === NO_THERAPIST ? -1 : a.name.localeCompare(b.name));
}
/* One separate block per therapist. Each block is a collapsed row showing her
   name, transactions, total hours and total to remit; tap it to open her own
   list of work. A grand total for everyone sits at the bottom.
   `fmtPeso` and `esc` come from the page. */
function therapistBreakdownHTML(txns, fmtPeso, esc, emptyMsg) {
  const rows = therapistSummary(txns);
  if (!rows.length) return '<div style="color:var(--text-muted);font-size:13px;">' + esc(emptyMsg || 'No transactions in this view.') + '</div>';
  const blocks = rows.map(r => {
    const items = r.items.slice().sort((a, b) => String(a.date || '').localeCompare(String(b.date || '')) || String(a.time || '').localeCompare(String(b.time || '')));
    const body = items.map(t => `<tr>
        <td>${esc(t.date || '')}${t.time ? ' <small style="color:var(--text-muted)">' + esc(fmtTime12(t.time)) + '</small>' : ''}</td>
        <td>${esc(t.customerName || 'Walk-in')}</td>
        <td>${esc(t.service || t.category || '')}</td>
        <td class="num">${t.hours ? esc(fmtHours(t.hours)) : '\u2014'}</td>
        <td class="num">${fmtPeso(t.amount)}</td></tr>`).join('');
    return `<details class="therapist-card">
      <summary class="therapist-head">
        <span class="therapist-name"><span class="chev">\u25B8</span> ${esc(r.name)}</span>
        <span class="therapist-totals"><span>${r.count} transaction${r.count === 1 ? '' : 's'}</span><span>${esc(fmtHours(r.hours))}</span><span class="remit-amt">${fmtPeso(r.total)}</span></span>
      </summary>
      <div class="table-wrap"><table>
        <thead><tr><th>Date</th><th>Customer</th><th>Service</th><th class="num">Hours</th><th class="num">Amount</th></tr></thead>
        <tbody>${body}</tbody>
        <tfoot><tr><td colspan="3">Subtotal \u2014 ${esc(r.name)}</td><td class="num">${esc(fmtHours(r.hours))}</td><td class="num">${fmtPeso(r.total)}</td></tr></tfoot>
      </table></div>
    </details>`;
  }).join('');
  const sum = rows.reduce((a, r) => ({ count: a.count + r.count, hours: a.hours + r.hours, total: a.total + r.total }), { count: 0, hours: 0, total: 0 });
  return `<div class="therapist-colhead"><span>Therapist</span><span class="therapist-totals"><span>Transactions</span><span>Hours</span><span>To remit</span></span></div>`
    + blocks
    + `<div class="therapist-grand"><span>All therapists</span><span class="therapist-totals"><span>${sum.count} transactions</span><span>${esc(fmtHours(sum.hours))}</span><span>${fmtPeso(sum.total)}</span></span></div>`;
}
// Open every therapist block while printing, then restore.
window.addEventListener('beforeprint', () => {
  document.querySelectorAll('details.therapist-card').forEach(d => { d._wasOpen = d.open; d.open = true; });
});
window.addEventListener('afterprint', () => {
  document.querySelectorAll('details.therapist-card').forEach(d => { d.open = !!d._wasOpen; });
});
function fmtHours(h) {
  const n = Math.round((Number(h) || 0) * 100) / 100;
  return n + (n === 1 ? ' hr' : ' hrs');
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

/* ---------- Bulk voucher actions ----------
   ADMIN: approve every pending request in one go.
   STAFF: pick several approved vouchers, print them in ONE print job
   (1 per page, or 8 per A4 sheet to cut out), then mark them received together. */
function pendingVouchers() {
  return readDB(DB_KEYS.redemptions, []).filter(r => redemptionStatus(r) === 'pending');
}
function approvedVouchers() {
  return readDB(DB_KEYS.redemptions, []).filter(r => redemptionStatus(r) === 'approved' && r.code);
}

async function approveAllVouchers() {
  if (currentRole() !== 'admin') { toast('Only the admin can approve vouchers.', 'warning'); return false; }
  const pending = pendingVouchers();
  if (!pending.length) { toast('No pending voucher requests.', 'warning'); return false; }
  const ok = await confirmDialog(
    `Approve all ${pending.length} pending voucher request${pending.length > 1 ? 's' : ''}? Each customer's massage spend will be deducted and a code generated. Customers without enough spend are skipped.`,
    { title: 'Approve all', confirmText: 'Approve all' }
  );
  if (!ok) return false;
  const settings = getSettings();
  const reds = readDB(DB_KEYS.redemptions, []);
  const customers = readDB(DB_KEYS.customers, []);
  const me = (getSession() || {}).username || '';
  let done = 0, skipped = 0;
  reds.forEach(r => {
    if (redemptionStatus(r) !== 'pending') return;
    const c = customers.find(x => x.id === r.customerId);
    const cost = r.points || settings.redeemThreshold;
    if (!c || (c.points || 0) < cost) { skipped++; return; }
    c.points = (c.points || 0) - cost;
    r.status = 'approved';
    r.code = makeVoucherCode();
    r.approvedBy = me;
    r.approvedDate = localISODate();
    done++;
  });
  writeDB(DB_KEYS.redemptions, reds);
  writeDB(DB_KEYS.customers, customers);
  toast(`${done} voucher${done === 1 ? '' : 's'} approved` + (skipped ? ` · ${skipped} skipped (not enough spend)` : ''),
        skipped ? 'warning' : undefined);
  return done > 0;
}

async function markVouchersReceivedBulk(ids) {
  if (currentRole() !== 'staff') { toast('Only staff can mark vouchers as received.', 'warning'); return false; }
  const reds = readDB(DB_KEYS.redemptions, []);
  const targets = reds.filter(r => ids.includes(r.id) && redemptionStatus(r) === 'approved');
  if (!targets.length) return false;
  const ok = await confirmDialog(
    `Confirm ${targets.length} voucher${targets.length > 1 ? 's were' : ' was'} given to the therapist? The admin will be notified.`,
    { title: 'Mark as received', confirmText: 'Yes, received' }
  );
  if (!ok) return false;
  const me = (getSession() || {}).username || '';
  targets.forEach(r => {
    r.status = 'received'; r.received = true; r.receivedBy = me;
    r.receivedDate = localISODate(); r.receivedAt = Date.now(); r.adminSeen = false;
  });
  writeDB(DB_KEYS.redemptions, reds);
  toast(`${targets.length} marked as received — admin notified`);
  return true;
}

function printVoucherSheet(list, layout) {
  const old = document.getElementById('bulk-print-sheet');
  if (old) old.remove();
  const sheet = document.createElement('div');
  sheet.id = 'bulk-print-sheet';
  sheet.className = layout === 'single' ? 'bulk-single' : 'bulk-grid';
  const prizeDefault = getSettings().prizes[0];
  list.forEach(r => {
    const card = document.createElement('div');
    card.className = 'voucher-card';
    card.innerHTML = `<img src="assets/medispa-logo.png" alt="MediSpa">
      <div class="for">Specially for you</div><div class="who"></div>
      <div class="prize"></div><div class="code"></div><div class="meta"></div>`;
    card.querySelector('.who').textContent = r.customerName || '-';
    card.querySelector('.prize').textContent = r.prize || prizeDefault;
    card.querySelector('.code').textContent = r.code;
    card.querySelector('.meta').textContent = `Approved ${r.approvedDate || ''} · Give this to the therapist`;
    sheet.appendChild(card);
  });
  document.body.appendChild(sheet);
  document.body.classList.add('print-bulk');
  window.addEventListener('afterprint', () => {
    document.body.classList.remove('print-bulk');
    sheet.remove();
  }, { once: true });
  window.print();
}

function openBulkVoucherModal(onChange) {
  if (currentRole() !== 'staff') return;
  const list = approvedVouchers();
  if (!list.length) { toast('No approved vouchers waiting to be printed.', 'warning'); return; }
  let backdrop = document.getElementById('voucher-bulk-modal');
  if (backdrop) backdrop.remove();
  backdrop = document.createElement('div');
  backdrop.id = 'voucher-bulk-modal';
  backdrop.className = 'modal-backdrop open';
  backdrop.setAttribute('role', 'dialog');
  backdrop.setAttribute('aria-modal', 'true');
  backdrop.innerHTML = `
    <div class="modal" style="max-width:520px;">
      <h2 style="margin-top:0;">Print approved vouchers</h2>
      <p class="card-subtitle" style="margin-top:4px;">Select the vouchers to print in one go. Then give them to the therapists and mark them received.</p>
      <label style="display:flex;gap:8px;align-items:center;font-weight:600;margin:8px 0;">
        <input type="checkbox" id="bulk-all" checked> Select all (<span id="bulk-count"></span>)
      </label>
      <div id="bulk-list" style="max-height:260px;overflow:auto;border:1px solid #e3e8ec;border-radius:8px;"></div>
      <label style="display:flex;gap:8px;align-items:center;margin:12px 0 0;">Layout
        <select class="filter-select" id="bulk-layout">
          <option value="grid">8 per A4 page (cut out)</option>
          <option value="single">1 per page</option>
        </select>
      </label>
      <div class="modal-actions">
        <button class="btn" type="button" data-act="close">Close</button>
        <button class="btn" type="button" data-act="print">Print selected</button>
        <button class="btn solid" type="button" data-act="received">Mark selected received</button>
      </div>
    </div>`;
  const box = backdrop.querySelector('#bulk-list');
  list.forEach(r => {
    const row = document.createElement('label');
    row.style.cssText = 'display:flex;gap:10px;align-items:center;padding:8px 10px;border-bottom:1px solid #eef2f4;cursor:pointer;';
    row.innerHTML = '<input type="checkbox" checked><span style="flex:1"><b class="n"></b><br><small class="p" style="color:#6b7b86"></small></span><code class="c"></code>';
    row.querySelector('input').value = r.id;
    row.querySelector('.n').textContent = r.customerName || '-';
    row.querySelector('.p').textContent = r.prize || getSettings().prizes[0];
    row.querySelector('.c').textContent = r.code;
    box.appendChild(row);
  });
  document.body.appendChild(backdrop);
  const boxes = () => [...box.querySelectorAll('input[type=checkbox]')];
  const selected = () => boxes().filter(b => b.checked).map(b => b.value);
  const allBox = backdrop.querySelector('#bulk-all');
  const refresh = () => {
    const n = selected().length;
    backdrop.querySelector('#bulk-count').textContent = `${n} of ${list.length}`;
    allBox.checked = n === list.length;
  };
  refresh();
  allBox.addEventListener('change', () => { boxes().forEach(b => b.checked = allBox.checked); refresh(); });
  box.addEventListener('change', refresh);
  const close = () => backdrop.remove();
  backdrop.addEventListener('click', async (e) => {
    if (e.target === backdrop) return close();
    const btn = e.target.closest('button[data-act]');
    if (!btn) return;
    const act = btn.getAttribute('data-act');
    const ids = selected();
    if (act === 'close') return close();
    if (!ids.length) { toast('Select at least one voucher.', 'warning'); return; }
    if (act === 'print') {
      printVoucherSheet(list.filter(r => ids.includes(r.id)), backdrop.querySelector('#bulk-layout').value);
    }
    if (act === 'received') {
      if (await markVouchersReceivedBulk(ids)) { close(); if (onChange) onChange(); }
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
      { id: cryptoId(), name: 'Egera, Kimberly', phone: '0917-000-0003', email: 'kimberly@example.com', startingPoints: 0, points: 0, joined: '2026-07-02' },
      // Extra Loyalty Ready customers so the bulk approve / print demo has several at once
      { id: cryptoId(), name: 'Santos, Maria', phone: '0917-000-0004', email: 'maria.santos@example.com', startingPoints: 10500, points: 10500, joined: '2026-06-05' },
      { id: cryptoId(), name: 'Dela Cruz, Juan', phone: '0917-000-0005', email: 'juan.delacruz@example.com', startingPoints: 11000, points: 11000, joined: '2026-06-09' },
      { id: cryptoId(), name: 'Villanueva, Ana', phone: '0917-000-0006', email: 'ana.villanueva@example.com', startingPoints: 10000, points: 10000, joined: '2026-06-20' },
      { id: cryptoId(), name: 'Garcia, Liza', phone: '0917-000-0007', email: 'liza.garcia@example.com', startingPoints: 12000, points: 12000, joined: '2026-07-11' }
    ].concat(buildDemoCustomers()));
  }
  if (!localStorage.getItem(DB_KEYS.transactions)) {
    const custs = readDB(DB_KEYS.customers, []);
    const now = new Date();
    const mk = (daysAgo, custIdx, amount, category, therapist, hours) => {
      const d = new Date(now);
      d.setDate(d.getDate() - daysAgo);
      return {
        id: cryptoId(),
        customerId: custs[custIdx] ? custs[custIdx].id : null,
        customerName: custs[custIdx] ? custs[custIdx].name : 'Walk-in',
        amount: amount,
        category: category,
        pointsEarned: category === 'Massage' ? Math.floor(amount) : 0,
        therapist: therapist,
        hours: hours,
        date: localISODate(d)
      };
    };
    writeDB(DB_KEYS.transactions, [
      mk(20, 0, 1500, 'Massage', DEFAULT_SETTINGS.therapists[0], 2),
      mk(12, 1, 900, 'Massage', DEFAULT_SETTINGS.therapists[1], 1.5),
      mk(5, 2, 350, 'Nail Treatments', DEFAULT_SETTINGS.therapists[2], 1),   // not a massage, so no reward progress
      mk(2, 0, 700, 'Massage', DEFAULT_SETTINGS.therapists[0], 1)
    ].concat(buildDemoTransactions()));
  }
  addTherapistSampleOnce();
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
  const rndT = demoRng(77);                       // separate stream so therapist/hours don't change the other demo data
  const DEMO_THERAPISTS = DEFAULT_SETTINGS.therapists;
  const DEMO_HOURS = [1, 1, 1, 1.5, 2];
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
      therapist: DEMO_THERAPISTS[Math.floor(rndT() * DEMO_THERAPISTS.length)],
      hours: DEMO_HOURS[Math.floor(rndT() * DEMO_HOURS.length)],
      date: demoDate(Math.floor(rnd() * (c._joinedDaysAgo - 1)))
    });
  }
  customers.forEach(c => { delete c._joinedDaysAgo; });
  return { customers: customers, txns: txns };
}

/* ---------- Therapist sample data ----------
   Every therapist gets a few services (with time + hours) on each of the last
   3 remit days, so the Therapist page and its printout have something to show.
   All services are HOME SERVICE (no walk-ins), so each one is linked to a real customer. */
const THERAPIST_SAMPLE_FLAG = 'medispa_therapist_sample_v2';
function buildTherapistSampleTxns(custs) {
  const rnd = demoRng(4242);
  const names = DEFAULT_SETTINGS.therapists;
  custs = (custs || []).filter(c => c && c.id);
  if (!custs.length) return [];
  const cats = ['Massage', 'Massage', 'Massage', 'Massage', 'Nail Treatments', 'Body & Facial', 'Physical Therapy'];
  const times = ['11:30', '12:45', '14:00', '15:30', '17:00', '18:30', '20:00', '21:15', '22:30', '23:45', '00:40', '01:30'];
  const out = [];
  let n = 0;
  [0, 1, 2].forEach(daysAgo => {
    const bizDate = demoDate(daysAgo);
    names.forEach((th, ti) => {
      const jobs = 2 + Math.floor(rnd() * 3);                  // 2 - 4 services per therapist per day
      for (let k = 0; k < jobs; k++) {
        const category = cats[Math.floor(rnd() * cats.length)];
        const list = SERVICE_MENU[category];
        const item = list[Math.floor(rnd() * list.length)];
        const priceType = rnd() < 0.7 ? 'promo' : 'reg';
        const time = times[Math.floor(rnd() * times.length)];
        const cust = custs[Math.floor(rnd() * custs.length)];
        // Sales after midnight keep the date of the day that opened at 11 AM (remit day).
        out.push({
          id: 'id_thsample' + String(++n).padStart(4, '0'),
          customerId: cust.id,
          customerName: cust.name || customerDisplayName(cust),
          amount: item[priceType],
          category: category,
          service: item.name,
          priceType: priceType,
          area: null,
          pointsEarned: category === 'Massage' ? Math.floor(item[priceType]) : 0,
          therapist: th,
          hours: category === 'Physical Therapy' ? 1 : [1, 1, 1.5, 2][Math.floor(rnd() * 4)],
          date: bizDate,
          time: time,
          location: 'Home service'
        });
        if (category === 'Massage') cust.points = (cust.points || 0) + Math.floor(item[priceType]);
      }
    });
  });
  return out;
}
// Adds the sample once to browsers that already have data (seed only runs on a fresh start).
// Also replaces the older sample (walk-in version) if it is there.
function addTherapistSampleOnce() {
  if (localStorage.getItem(THERAPIST_SAMPLE_FLAG)) return;
  const have = readDB(DB_KEYS.transactions, null);
  const custs = readDB(DB_KEYS.customers, []);
  if (have) {
    const kept = have.filter(t => !String(t.id || '').startsWith('id_thsample'));
    const sample = buildTherapistSampleTxns(custs);
    writeDB(DB_KEYS.transactions, kept.concat(sample));
    writeDB(DB_KEYS.customers, custs);
  }
  localStorage.setItem(THERAPIST_SAMPLE_FLAG, '1');
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
  { href: 'therapists.html', icon: 'assets/icons/admin.png', label: 'Therapist' },
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