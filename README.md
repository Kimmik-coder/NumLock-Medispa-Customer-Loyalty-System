# MediSpa — Customer & Loyalty Management System (Frontend Demo)

A polished front-end prototype for a MediSpa customer and loyalty management system. It is intentionally built without a backend so the main user flows can be demonstrated during a class presentation.

## Frontend implementation

The prototype now demonstrates the core planned frontend flows:

- **Login** — demo authentication screen using the supplied MediSpa logo.
- **Dashboard** — KPI cards, sales overview chart, recent customers, quick actions, and loyalty-rule summary.
- **Customer** — add/edit/delete customer records, loyalty status badges, search, and status filtering.
- **Transaction** — record a purchase, automatically calculate points, update the customer's balance, and offer a printable reward voucher when the threshold is reached.
- **Report** — revenue, transaction count, average transaction, customer points, and total spending with print support.
- **Setting** — store name, loyalty rules, password update, and demo-data reset.

All major screens are connected through the shared sidebar navigation. The layout is responsive for desktop/tablet/mobile widths, with a mobile slide-out navigation and overlay.

## Tech stack

| Layer | Technology |
|---|---|
| Structure | HTML5 |
| Styling | CSS3 |
| Logic | Vanilla JavaScript |
| Data | Browser LocalStorage |
| Voucher | `window.print()` |
| Assets | Supplied MediSpa logo |

No backend, database, npm install, or build process is required.

## Demo accounts & roles

Two roles are supported, both stored in `js/app.js`'s seed data:

| Role | Username | Password | Access |
|---|---|---|---|
| Admin | `admin` | `admin123` | All pages: Dashboard, Customer, Transaction, Report, Settings |
| Staff | `staff` | `staff123` | Dashboard, Customer, Transaction only — no Report or Settings |

Role is assigned per user in the seed data (`DB_KEYS.users`) and stored on the login session. The sidebar hides links a role can't use, and the Report/Settings pages themselves also check the role on load (via `requireRole(['admin'])` in `js/app.js`), so a staff account can't get in even by typing the URL directly.

## Run

### Option A — open directly
Unzip the project and open `index.html` in a browser.

### Option B — local server (recommended)

```bash
cd medispa
python3 -m http.server 8000
```

Then open `http://localhost:8000`.

## Demo flow for presentation

1. Log in.
2. From Dashboard, show the KPI cards, Sales Overview, Recent Customers, and Loyalty Program summary.
3. Open **Customer** and demonstrate search/filter plus Add/Edit/Delete.
4. Open **Transaction**, select a customer, enter an amount, and record it. Points are calculated automatically.
5. Show the updated transaction history and customer points.
6. Open **Report** to show revenue and loyalty/customer spending information and demonstrate Print.
7. Open **Setting** to show configurable loyalty rules and demo-data reset.

## Data and limitations

The prototype stores data in browser LocalStorage only. It is suitable for a frontend classroom demonstration, not production use. Passwords are stored in plain text in LocalStorage, and data is not synchronized between devices.


## Branding & Navigation Icons
- Uses the provided MediSpa logo and supplied navigation icons.
