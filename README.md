# MediSpa — Customer & Loyalty Demo

A simple, single-layer front-end stack, matching the tech-stack brief:

| Layer      | Tech                          |
|------------|--------------------------------|
| Structure  | HTML5                          |
| Styling    | CSS3 (no framework)            |
| Logic      | Vanilla JavaScript             |
| Data       | Browser LocalStorage           |
| Vouchers   | `window.print()`               |
| Login      | Plain `if/else` username+password check |

No backend, no build tools, no npm install. It runs by opening the HTML files in a browser.

## What's inside

```
medispa/
├── index.html          Login page
├── dashboard.html       KPI cards, sales chart, recent customers
├── customers.html       Add / edit / delete customers, view loyalty status
├── transactions.html    Record a sale, auto-calculates points, prints a voucher at threshold
├── report.html          Revenue summary and top customers by points
├── settings.html        Store name, points rules, change password, reset demo data
├── css/style.css        All styling
└── js/app.js            Shared data layer (LocalStorage), auth, sidebar/topbar
```

## How to run it

**Option A — just open it (fastest)**
1. Unzip the folder anywhere on your computer.
2. Double-click `index.html` — it opens in your default browser.
3. Log in with the demo account: **admin** / **admin123**

That's it. Every page links to the next through the sidebar.

> Note: some browsers restrict LocalStorage on pages opened via `file://`.
> If data doesn't seem to save, use Option B instead.

**Option B — run a tiny local server (recommended, avoids file:// quirks)**

If you have Python installed:
```bash
cd medispa
python3 -m http.server 8000
```
Then open **http://localhost:8000** in your browser.

If you have Node.js installed:
```bash
cd medispa
npx serve .
```
and open the URL it prints (usually http://localhost:3000).

**Option C — VS Code**
Install the "Live Server" extension, right-click `index.html`, choose
"Open with Live Server".

## How the data works

Everything is stored in the browser's LocalStorage under keys prefixed
`medispa_` — customers, transactions, settings, and the logged-in session.
There is no real database and no server: each browser/profile has its own
independent copy of the data. Clearing your browser's site data (or using
a different browser) resets everything.

On first run, the app seeds itself with:
- One login: `admin` / `admin123`
- Three sample customers
- Four sample transactions

Use **Settings → Reset All Data** at any time to wipe and reseed.

## Loyalty logic

- Configurable in Settings (defaults shown):
  - Earn **10 points** per **100** spent on a transaction.
  - Once a customer's running point total reaches **100**, the next
    transaction that crosses the threshold pops a confirmation and, if
    accepted, opens the browser print dialog with a printable voucher.
- Recorded transactions immediately update the customer's point balance
  and the Dashboard/Report KPIs.

## Known limitations (by design — this is a prototype)

- Passwords are stored in plain text in LocalStorage — fine for a demo,
  not for production.
- No multi-user sync — LocalStorage is per-browser, per-device.
- The "Sales Overview" chart is a small hand-rolled canvas chart (no
  external charting library), grouped by transaction date.
