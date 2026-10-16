# MediSpa — Customer & Loyalty Management System (Frontend Demo)

A polished front-end prototype for a MediSpa customer and loyalty management system. It is intentionally built without a backend so the main user flows can be demonstrated during a class presentation.

## Frontend implementation

The prototype now demonstrates the core planned frontend flows:

- **Login** — demo authentication screen using the supplied MediSpa logo.
- **Dashboard** — KPI cards, sales overview chart, recent customers, quick actions, and loyalty-rule summary.
- **Customer** — add/edit/delete customer records, loyalty status badges, search, and status filtering.
- **Transaction** — record a purchase with its service (Massage, Nail, Body & Facial, Physical Therapy, Cleaning). Only massage purchases count toward the reward. The history table can be searched and filtered by service type and date range.
- **Loyalty reward** — every ₱10,000 spent on massage earns one reward. The prize is chosen from a dropdown (default: *Free 90-minute massage*) when the reward is requested, then approved and printed as a voucher.
- **Report** — revenue, transaction count, average transaction, customer points, and total spending with print support.
- **Setting** — store name, qualifying service, spend needed, the list of prizes shown in the dropdown, password update, and demo-data reset.

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
| Admin | `admin` | `admin123` | Approves vouchers, sees notifications, reviews Customers/Transactions (read-only), Report, Settings. Does **not** add customers or record transactions |
| Staff | `staff` | `staff123` | Dashboard, Customer, Transaction only — no Report or Settings |

Role is assigned per user in the seed data (`DB_KEYS.users`) and stored on the login session. The sidebar hides links a role can't use, and the Report/Settings pages themselves also check the role on load (via `requireRole(['admin'])` in `js/app.js`), so a staff account can't get in even by typing the URL directly.

## Voucher workflow

1. **Staff** clicks *Redeem* on a Loyalty Ready customer and picks the prize -> *pending*.
2. **Admin** approves it (Dashboard or Customers page) or **rejects** it (the request is removed and nothing is deducted). Admin never requests or prints.
3. **Staff** sees it under *Approved - ready to print* (Dashboard / Customers), prints it for the therapist, then clicks *Mark as received*.

**Many vouchers at once (batch):**
- **Admin:** on the Customers page, *Approve all pending (N)* approves every pending request with one confirmation. Customers who no longer have enough spend are skipped.
- **Staff:** *Print approved vouchers (N)* opens a list with checkboxes. Choose the vouchers, pick a layout (8 per A4 sheet to cut out, or 1 per page), then *Print selected* (one print dialog) and *Mark selected received* (one confirmation).
- Customers page search also finds a customer by **voucher code**.
- Print tip: use A4 paper and tick *Background graphics* in the print dialog.
4. **Admin** gets a notification on the Dashboard (and a badge on Home) that the voucher was received.

## Transactions

Staff pick *Service type -> Service -> Price* (Promo or Regular, from the MediSpa price list). Cleaning is priced per sqm, so staff enter the area and the total is computed. Prices live in `SERVICE_MENU` in `js/app.js`.

## Run

### Option A — open directly
Unzip the project and open `index.html` in a browser.

### Option B — local server (recommended)

```bash
cd NumLock-Medispa-Customer-Loyalty-System-main
python3 -m http.server 8000
```

Then open `http://localhost:8000`.

## Demo flow for presentation

Before starting: open **Setting** (admin) -> **Reset demo data** so everyone starts from the same sample data. Rosela Reyes begins at ₱10,200 massage spend, so she is already Loyalty Ready.

**Part 1 - Staff (`staff` / `staff123`)**
1. Log in. Show the Dashboard (KPI cards, Sales Overview, Recent Customers, Loyalty Program summary).
2. **Customer**: search/filter, then Add / Edit a customer.
3. **Transaction**: pick a customer, service type, service and price, then record it. Only massage counts toward the reward. Try the history filters (search, service type, date range).
4. **Customer**: on Rosela (and Maria Santos, Juan Dela Cruz, Ana Villanueva, Liza Garcia, who are also Loyalty Ready) click **Redeem**, choose the prize -> status becomes *Pending approval*. Log out.

**Part 2 - Admin (`admin` / `admin123`)**
5. Dashboard shows the pending requests and a badge on Home. Click **Approve voucher** on one (or **Reject** to show the decline path), then **Customers -> Approve all pending** for the rest. Log out.

**Part 3 - Staff again**
6. Customer: **Print approved vouchers** -> select all -> **Print selected** (several vouchers in one print job), then **Mark selected received**. (A single voucher can still be printed one by one with **Print voucher**.) Log out.

**Part 4 - Admin again**
7. Dashboard shows the "voucher received" notification.
8. **Report**: revenue and customer spending, with Print and **Export transactions (CSV)**.
9. **Setting**: loyalty rules, prize list, password, demo-data reset.

## Data and limitations

The prototype stores data in browser LocalStorage only. It is suitable for a frontend classroom demonstration, not production use. Passwords are stored in plain text in LocalStorage, and data is not synchronized between devices.


## Branding & Navigation Icons
- Uses the provided MediSpa logo and supplied navigation icons.
