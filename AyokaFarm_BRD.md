# AyokaFarm Poultry Management App — Business Requirements Document

---

## 1. Executive summary

AyokaFarm needs one web app that replaces paper and spreadsheet records for its poultry operation: suppliers, customers, feed and bird purchases, feed inventory, daily pen production, sales and expenses. Every transaction is captured once by the staff member responsible, and supplier and customer balances are calculated automatically from those transactions rather than typed in.

### Problem today

- Records are kept per activity with no link between them, so balances, stock and mortality must be reconciled by hand.
- Supplier and customer balances are entered manually (previous / current balance), which invites errors and disputes.
- There is no view of actual vs expected feed consumption, mortality trends or profitability per pen.

### Proposed solution

A role-based web app (mobile-friendly for pen staff) with data-entry forms and searchable tables per module, an admin area for staff, roles and farm settings, and a dashboard of operational and financial KPIs.

---

## 2. Business objectives and success metrics

| # | Objective | Success metric (target) |
|---|---|---|
| BO1 | Single source of truth for farm records | 100% of purchases, sales, production and expenses entered in the app within 3 months of go-live |
| BO2 | Accurate, automatic receivables and payables | 0 manually typed balances; supplier and customer statements reconcile with transactions |
| BO3 | Control feed usage and wastage | Daily actual vs expected feed variance visible per pen; variance > ±10% flagged |
| BO4 | Reduce bird losses | Mortality rate tracked daily per pen with alerts above threshold |
| BO5 | Know profitability | Monthly revenue, cost and margin per pen/flock available without spreadsheets |
| BO6 | Accountability | Every record stamped with the staff member who created or edited it |

---

## 3. Scope

### In scope (Phase 1)

1. **Master data:** suppliers, customers, pens, flocks/batches.
2. **Transactions:** feed, bird and medication purchases, sales, expenses, payments.
3. **Operations:** daily production per pen (mortality, feed, medication), feed and medication inventory.
4. **Admin:** staff, roles and permissions, settings (expected consumption by age, medication types, feed types, bird types, products, expense categories, units).
5. **Dashboard and standard reports** (statements, stock, production, P&L summary).
6. **Export** of any table to Excel/CSV and PDF; WhatsApp notifications for alerts, receipts and statements.

### Out of scope (Phase 1, candidates for later)

- Full double-entry accounting, payroll and tax filing.
- Online payments or a customer-facing ordering portal.
- IoT sensors (temperature, automatic feeders).
- Offline-first mobile app (Phase 1 is a responsive web app).

### Assumptions

- Currency is Naira (₦); one feed bag = 25 kg (configurable in settings).
- The farm keeps both layers and broilers (confirmed) across 6 pens with 8 staff today, growing as the farm expands (no hard limit on pens, flocks or users); each pen holds one flock at a time with a known start date, so bird age is computed automatically.
- Staff have smartphones or a shared tablet/PC with internet access at least once a day.

**Platform decision:** custom web app (confirmed), e.g. a React/Next.js front end with a PostgreSQL database; final stack to be agreed with the developer.

### Constraints

- Low-cost hosting and simple operation; no dedicated IT staff at the farm.
- Intermittent connectivity on site.

---

## 4. User roles and permissions

Roles are configurable by the Admin; the five below are the proposed defaults. Permissions are set per module as View / Add / Edit / Delete, and users only see the menus their role allows.

| Role | Typical user | Main responsibilities |
|---|---|---|
| Admin | Owner / farm director | Full access, staff and role management, settings, approvals, audit log |
| Farm Manager | Head of operations | Oversees all operations, edits records, views finance and dashboard |
| Pen Attendant | Pen / production staff | Daily production entries (mortality, feed, medication) for assigned pens |
| Store Keeper | Feed store staff | Feed purchases receipt, inventory counts |
| Sales / Accounts Officer | Sales and cashier | Sales, customer payments, supplier payments, expenses |

### Permission matrix

*(V = view, A = add, E = edit, D = delete)*

| Module | Admin | Farm Manager | Pen Attendant | Store Keeper | Sales / Accounts |
|---|---|---|---|---|---|
| Suppliers | VAED | VAE | — | V | VA |
| Customers | VAED | VAE | — | — | VAE |
| Feed purchases | VAED | VAE | — | VA | VA |
| Bird purchases | VAED | VAE | — | — | VA |
| Inventory | VAED | VAE | V | VAE | V |
| Production | VAED | VAE | VA (own pens) | V | — |
| Sales | VAED | VAE | — | — | VAE |
| Expenses | VAED | VAE | A (own pens) | A | VAE |
| Payments | VAED | V | — | — | VAE |
| Dashboard | Full | Full | Production tiles only | Stock tiles only | Sales tiles only |
| Admin & settings | Full | View settings | — | — | — |

**Medication purchases and stock (section 5.10):** Admin VAED · Farm Manager VAE · Store Keeper VAE · Pen Attendant V · Sales / Accounts VA.

### Rules

- Staff name on every record is filled automatically from the logged-in user, not typed.
- Non-admin edits are allowed only within a configurable window (e.g. same day); later corrections need Farm Manager or Admin.
- Deletes are soft deletes with a reason, kept in the audit log.

---

## 5. Functional requirements by module

Every module provides: a searchable, filterable, sortable table (by date range, pen, supplier/customer, staff); an add form; record detail with edit history; and Excel/PDF export. Fields marked *auto* are computed and read-only.

### 5.1 Suppliers

| Field | Type / rule |
|---|---|
| Name | Text, required, unique |
| Phone, address | Text (added for statements and follow-up) |
| Product type | Dropdown: Feed, Bird, Medication, Equipment (multi-select allowed) |
| Product name | If Bird → bird type list; if Feed → feed type list; if Medication → medication list (from settings) |
| Balance | *auto* — see section 6 |

- **FR-SUP-1:** Open a supplier statement showing every purchase and payment with running balance.
- **FR-SUP-2:** A supplier cannot be deleted once it has transactions; it can be deactivated.
- **FR-SUP-3:** Equipment such as crates and cages is recorded under Expenses (section 5.8) with the supplier selected. Staff enter the amount paid on each purchase: the full cost always counts as an expense, and any unpaid amount is added to that supplier's balance (section 6).

### 5.2 Customers

| Field | Type / rule |
|---|---|
| Name | Text, required |
| Phone, address | Text |
| Customer type | Regular or One-off |
| Product type | Multi-select: Birds, Eggs, Sacks, Droppings |
| Balance | *auto* — see section 6 |

- **FR-CUS-1:** One-off buyers can be recorded at sale time without creating a full customer profile, but must pay in full (no credit).
- **FR-CUS-2:** Customer statement with running balance, printable/shareable as PDF.

### 5.3 Feed purchases

**Fields:** Date · Supplier (filtered to feed suppliers) · Feed type · Quantity (bags) · Unit price · Total cost *auto* (qty × price) · Amount paid · Previous balance *auto* · Current balance *auto* · Staff *auto*.

- **FR-PF-1:** Saving a feed purchase adds the bags to that feed type's stock as "New order" on that date.

### 5.4 Bird purchases

**Fields:** Date · Supplier (bird suppliers) · Pen · Bird type · Quantity (birds) · Unit price · Total cost *auto* · Amount paid · Previous balance *auto* · Current balance *auto* · Staff *auto*.

- **FR-PB-1:** Saving a bird purchase creates (or tops up) the flock in the selected pen with a placement date and age at arrival (e.g. day-old, point-of-lay), which drives the age on production records.

### 5.5 Feed inventory

**Fields:** Date · Feed type · Opening stock (bags) *auto* = previous closing · New order (bags) *auto* from purchases · Used (bags) *auto* from production · Closing stock (bags) *auto* = opening + new − used · Staff *auto*.

- **FR-INV-1:** Inventory is a daily ledger per feed type, computed from purchases and production, not typed.
- **FR-INV-2:** Periodic physical count with adjustment entry (reason required) to correct differences.
- **FR-INV-3:** Low-stock alert when closing stock < reorder level or < N days of expected consumption.

### 5.6 Production (daily, per pen)

**Fields:**

- Date
- Pen
- Age *auto* (in days from flock placement, shown as weeks + days)
- Opening birds *auto* (previous closing)
- Mortality
- Closing birds *auto* = opening − mortality − birds sold (culls are recorded as mortality or as sales, e.g. spent layers)
- Feed type
- Feed consumed (bags)
- Feed consumed (kg) *auto* = bags × 25
- Expected consumption (kg) *auto* = closing birds × expected g/bird/day for that age ÷ 1000
- Variance *auto*
- Medication (from list)
- Quantity used (stock unit)
- Mode of medication (water, feed, injection, spray, eye drop)
- Purpose (treatment, prevention, vaccination, vitamin)
- Staff *auto*

**Requirements:**

- **FR-PRD-1:** One production record per pen per day; duplicates blocked.
- **FR-PRD-2:** Multiple medications per day allowed (child lines).
- **FR-PRD-3:** For layer pens (confirmed): eggs collected (crates + pieces), cracked eggs, and laying rate % *auto*.
- **FR-PRD-4:** Mortality above a threshold (e.g. 0.5% of birds in a day) triggers an alert to the Farm Manager.

### 5.7 Sales

**Fields:** Date · Pen (where the product came from) · Product (live birds, broilers, spent layers, eggs, cracks, droppings, sacks) · Unit (from product: bird, crate, piece, bag, kg) · Quantity · Unit price · Total amount *auto* · Customer (regular or one-off) · Amount paid · Previous balance *auto* · Current balance *auto* · Staff *auto*.

- **FR-SAL-1:** Selling birds reduces the pen's bird count on the next production record.
- **FR-SAL-2:** Selling eggs cannot exceed egg stock (collected − sold).
- **FR-SAL-3:** Printable receipt/invoice per sale.
- **FR-SAL-4:** Unit price is entered at each sale (confirmed; no fixed price list). The form pre-fills the last price used for that product and customer, and staff can change it.
- **FR-SAL-5:** Optional Admin-set minimum price per product; a sale below it needs Farm Manager approval.
- **FR-SAL-6:** Sacks are empty feed bags resold. Sack sales are recorded like any other product but are not checked against a stock count.

### 5.8 Expenses

**Fields:** Date · Category (from settings: labour, utilities, fuel, repairs, vet services, transport, medication purchase, etc.) · Description · Amount · Supplier (optional; for equipment such as crates and cages) · Amount paid (when a supplier is selected) · Pen (optional; blank = general farm overhead) · Staff *auto* · Receipt photo (optional).

Expenses count as soon as they are saved (no approval step); every entry is kept in the audit log.

### 5.9 Payments (confirmed)

Records money paid to a supplier or received from a customer outside a purchase/sale (e.g. settling an old debt).

**Fields:** Date · Party · Amount · Method (cash, transfer, POS) · Reference · Staff *auto*.

Without this, a debt can only be cleared by entering a fake purchase or sale.

### 5.10 Medication purchases and stock (confirmed)

**Medication purchase:** Date · Supplier (medication suppliers) · Medication · Quantity (stock unit: ml, g, vial, sachet, dose) · Unit price · Total cost *auto* · Amount paid · Batch no. · Expiry date · Previous balance *auto* · Current balance *auto* · Staff *auto*. Counts toward the supplier balance exactly like feed and bird purchases (section 6).

**Medication stock ledger:** Date · Medication · Opening *auto* · Received *auto* from purchases · Used *auto* from production medication lines · Closing *auto* · Adjustment (reason required).

- **FR-MED-1:** A production medication line cannot use more than the closing stock of that medication.
- **FR-MED-2:** Stock is used first-expiry-first-out by batch.
- **FR-MED-3:** Alerts for low stock (below reorder level) and for batches expiring within 30 days.
- **FR-MED-4:** Medication cost used per pen flows into pen profitability on the dashboard.

---

## 6. Balance calculation rules

A supplier's or customer's balance is never typed: it is the sum of everything owed minus everything paid, across all their transactions. Positive = they owe / we owe; a negative value is shown as a credit (advance).

```
Supplier balance = Σ Total cost (feed, bird and medication purchases; supplier expenses)
                 − Σ Amount paid on purchases and supplier expenses
                 − Σ Supplier payments

Customer balance = Σ Total amount (sales)
                 − Σ Amount paid on sales
                 − Σ Customer payments
```

On each purchase or sale line:

1. **Previous balance** = the party's balance from all transactions dated before this one (ties broken by entry time).
2. **Current balance** = Previous balance + Total − Amount paid.
3. The Suppliers and Customers tables show the latest Current balance, so they always match the transaction tables.

### Worked example (feed supplier)

| Date | Entry | Total (₦) | Paid (₦) | Previous (₦) | Current (₦) |
|---|---|---|---|---|---|
| 03 Oct | 20 bags @ 18,000 | 360,000 | 200,000 | 0 | 160,000 |
| 10 Oct | 10 bags @ 18,500 | 185,000 | 185,000 | 160,000 | 160,000 |
| 12 Oct | Payment | — | 100,000 | 160,000 | 60,000 |

### Rules

- **BR-1:** Editing or deleting a back-dated transaction recalculates the previous/current balance of every later transaction for that party.
- **BR-2:** Amount paid cannot be negative; overpayment is allowed and shows as credit.
- **BR-3:** One-off customers must have Amount paid = Total.
- **BR-4:** Optional opening balance per party at go-live, to carry over existing debts.

---

## 7. Admin and settings

Only the Admin can change settings; every change is logged with who, when, old value and new value.

### 7.1 Staff and roles

- Add, edit, deactivate staff: name, phone, email/username, role, assigned pens, status.
- Create custom roles by ticking View/Add/Edit/Delete per module (section 4 defaults preloaded).
- Password reset and forced logout of a deactivated user.

### 7.2 Expected consumption by age

A table per bird type giving feed per bird per day by age band. The app uses it to compute Expected consumption on each production record. Example layout (values to be confirmed by the farm):

| Bird type | Age from (week) | Age to (week) | Feed (g/bird/day) | Recommended feed type |
|---|---|---|---|---|
| Layer | 1 | 1 | 12 | Chick mash |
| Layer | 2 | 2 | 18 | Chick mash |
| Layer | 9 | 16 | 60–75 | Grower mash |
| Layer | 19+ | — | 110–120 | Layer mash |
| Broiler | 1 | 1 | 25 | Broiler starter |
| Broiler | 4 | 6 | 150–200 | Broiler finisher |

- Tolerance % for variance alerts (default ±10%) is set here.

### 7.3 Medication types

Name · Category (vaccine, antibiotic, vitamin, dewormer, coccidiostat, disinfectant) · Default mode (water, feed, injection, spray, eye/nose drop) · Default purpose · Dosage note · Withdrawal period (days) · Stock unit · Reorder level · Active/inactive.

### 7.4 Feed types

Name (e.g. chick mash, grower mash, layer mash, broiler starter/finisher) · Bag weight (default 25 kg) · Reorder level (bags) · Active/inactive.

### 7.5 Other settings (needed by the forms)

- **Pens:** name, capacity, bird type, status.
- **Bird types:** layer, broiler, cockerel, noiler, etc.
- **Sales products and their units** (crate = 30 eggs, bird, bag, kg).
- **Expense categories.**
- **Alert thresholds:** mortality %, low stock days, variance %.
- **Farm profile:** name, logo, currency, address (for receipts and statements).

---

## 8. Dashboard and analytics

The dashboard opens with a filter bar (date range, pen, bird type) and four groups of tiles and charts. Each role sees only its groups (section 4).

### Flock and production

| KPI / chart | Calculation | Visual |
|---|---|---|
| Live birds now | Sum of latest closing birds per pen | KPI tile, split by pen |
| Mortality rate | Mortality ÷ opening birds, daily and cumulative per flock | Line chart per pen, threshold line |
| Hen-day laying rate | Eggs collected ÷ live layers × 100 | Line chart vs breed standard |
| Eggs collected / cracked % | Crates per day; cracks ÷ total | Bar chart |
| Flock age | Weeks since placement per pen | Table |

### Feed

| KPI / chart | Calculation | Visual |
|---|---|---|
| Actual vs expected feed | kg consumed vs expected per pen per day | Line pair with variance band |
| Feed stock and days of cover | Closing bags ÷ average daily use | KPI tile per feed type, low-stock flag |
| Feed conversion ratio (broilers) | Feed kg ÷ live weight gained kg | KPI tile |
| Feed per crate of eggs (layers) | Feed kg ÷ crates collected | KPI tile |
| Feed cost per bird | Feed cost ÷ average live birds | Bar by pen |

### Sales and finance

| KPI / chart | Calculation | Visual |
|---|---|---|
| Revenue | Sum of sales, by product and by month | Stacked monthly bars |
| Expenses | Sum by category | Bars by category |
| Gross margin | Revenue − (purchases + expenses) | Monthly line |
| Profit per pen / flock | Pen revenue − pen-allocated costs | Ranked bars |
| Cost of producing a crate / bird | Pen costs ÷ output | KPI tile |
| Top customers | Revenue by customer | Ranked list |

### Receivables and payables

| KPI / chart | Calculation | Visual |
|---|---|---|
| Total owed by customers | Sum of positive customer balances | KPI tile + aging (0–30, 31–60, 60+ days) |
| Total owed to suppliers | Sum of supplier balances | KPI tile + aging |
| Debtors and creditors list | Balance per party, sorted | Table with link to statement |

### Alerts panel

Mortality spike, feed variance outside tolerance, low feed or medication stock, medication nearing expiry, missing daily production entry for a pen, overdue customer debts.

---

## 9. Data model overview

| Entity | Key fields | Links to |
|---|---|---|
| User | name, role, assigned pens, status | Role; every transaction (created_by) |
| Role | name, permissions per module | User |
| Supplier | name, contact, product types, opening balance | Feed/bird/medication purchases, equipment expenses, payments |
| Customer | name, contact, type, product types, opening balance | Sales, payments |
| Pen | name, capacity, bird type | Flock |
| Flock | pen, bird type, placement date, age at placement, status | Bird purchase, production, sales |
| Feed type | name, bag kg, reorder level | Purchases, inventory, production |
| Medication type | name, category, default mode, purpose | Production medication lines |
| Consumption standard | bird type, age band, g/bird/day | Production |
| Feed purchase | date, supplier, feed type, bags, price, paid | Inventory ledger, supplier balance |
| Bird purchase | date, supplier, pen, bird type, qty, price, paid | Flock, supplier balance |
| Production | date, pen, mortality, feed bags, eggs | Flock, inventory ledger, medication lines |
| Inventory ledger | date, feed type, opening, in, out, closing, adjustment | Purchases, production |
| Sale | date, pen, product, unit, qty, price, customer, paid | Customer balance, flock |
| Expense | date, category, description, amount, supplier, paid, pen | Pen |
| Payment | date, party, direction, amount, method | Supplier or customer balance |
| Audit log | user, time, record, old/new values | All |

**Added for medication stock:**

| Entity | Key fields | Links to |
|---|---|---|
| Medication purchase | date, supplier, medication, qty, price, paid, batch, expiry | Supplier balance |
| Medication stock ledger | date, medication, batch, opening, in, out, closing, adjustment | Production medication lines |

---

## 10. Non-functional requirements

| Area | Requirement |
|---|---|
| Access | Responsive web app usable on a phone in the pen; login with username/phone + password |
| Connectivity | Forms keep unsaved entries if the network drops; Phase 2 option: offline capture with sync |
| Performance | Tables of 10,000+ rows load in under 3 seconds; dashboard under 5 seconds |
| Security | Role-based access enforced on the server; HTTPS; passwords hashed; session timeout |
| Audit | Who/when/what for every create, edit, delete; soft deletes only |
| Data | Daily automatic backup; export of all data to Excel |
| Usability | Dropdowns over free text; date defaults to today; staff and computed fields auto-filled |
| Localisation | ₦ currency, DD/MM/YYYY dates, Africa/Lagos time zone |
| Availability | 99% uptime; low-cost cloud hosting |

### WhatsApp notifications (confirmed)

Sent through the WhatsApp Business Platform (Cloud API) or an approved provider, using pre-approved message templates:

| Message | Recipient | Trigger |
|---|---|---|
| Mortality spike, feed variance, missing daily entry | Farm Manager, Admin | Threshold breached / no entry by set time |
| Low feed or medication stock, expiring medication | Store Keeper, Farm Manager | Daily check |
| Daily summary (birds, mortality, eggs, sales, cash received) | Admin | Each evening |
| Sale receipt | Customer | Sent manually by staff from the sale record |
| Statement / payment reminder | Customer with balance | Weekly or on demand |

### Scalability

Pens, flocks, staff and roles are unlimited records, so growing beyond 6 pens and 8 staff needs no code change; design for multi-site as a future option.
