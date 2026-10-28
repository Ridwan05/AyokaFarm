-- AyokaFarm core schema (BRD §4–§9).
--
-- Principles
-- * Facts are typed once; everything else is calculated (BRD §1). Balances, stock levels,
--   opening/closing birds, expected feed and laying rate come from views or triggers, never input.
-- * Every record is stamped with who created it (BO6) and every change lands in audit_log.
-- * Transactions are soft-deleted with a reason (BRD §4 rules); authenticated users can't hard-delete them.
-- * Access follows Roles & permissions (role_permissions), enforced with RLS on every table.
--   Helper functions live in the unexposed `private` schema.
-- * Money is numeric(14,2) naira; dates are local farm dates (Africa/Lagos).

create schema if not exists private;
revoke all on schema private from public, anon, authenticated;
grant usage on schema private to authenticated, service_role;

-- ── Types ────────────────────────────────────────────────────────────

create type public.app_module as enum (
  'production', 'inventory', 'medication', 'expenses', 'dashboard',
  'sales', 'purchases', 'payments', 'parties', 'admin'
);
-- none = hidden; own = limited scope; all = every record. What "own" means per module:
--   production: assigned pens (staff_pens) · expenses: pen expenses for the pens you can record
--   production for, no farm-wide or supplier expenses · purchases: receiving feed and medication
--   deliveries only · dashboard and admin: the narrower view noted on the permission row.
create type public.access_level as enum ('none', 'own', 'all');
create type public.payment_method as enum ('cash', 'transfer', 'pos');
create type public.customer_type as enum ('regular', 'one_off');
create type public.product_kind as enum ('eggs', 'birds', 'droppings', 'sacks');
create type public.supplier_kind as enum ('feed', 'birds', 'medication', 'equipment');
create type public.purchase_kind as enum ('feed', 'birds', 'medication');
create type public.purchase_status as enum ('ordered', 'received');
create type public.sale_approval as enum ('approved', 'pending', 'rejected');
create type public.payment_direction as enum ('in', 'out');
create type public.flock_status as enum ('active', 'closed');
create type public.medication_category as enum ('vaccine', 'antibiotic', 'vitamin', 'dewormer', 'coccidiostat', 'disinfectant', 'other');
create type public.medication_mode as enum ('water', 'feed', 'injection', 'spray', 'eye_nose_drop');
create type public.medication_purpose as enum ('treatment', 'prevention', 'vaccination', 'vitamin');
-- Eggs are counted in pieces; cracked eggs are kept apart because they sell as their own product.
create type public.stock_item as enum ('feed', 'medication', 'eggs', 'cracked_eggs');
create type public.stock_movement_type as enum ('opening', 'received', 'used', 'collected', 'sold', 'adjusted');

-- ── Shared trigger helpers ──────────────────────────────────────────

create function private.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- Today on the farm, not in UTC.
create function private.farm_today()
returns date
language sql
stable
set search_path = ''
as $$ select (now() at time zone 'Africa/Lagos')::date $$;

-- ── Roles, staff and permissions (BRD §4, §7.1) ─────────────────────

create table public.roles (
  id text primary key check (id ~ '^[a-z][a-z0-9_]*$'),
  name text not null unique,
  description text not null default '',
  -- The five default roles can be edited but not deleted.
  is_system boolean not null default false,
  created_at timestamptz not null default now()
);

create table public.role_permissions (
  role_id text not null references public.roles (id) on delete cascade,
  module public.app_module not null,
  can_view public.access_level not null default 'none',
  can_add public.access_level not null default 'none',
  can_edit public.access_level not null default 'none',
  can_delete public.access_level not null default 'none',
  -- Plain-language scope shown on Roles & permissions, e.g. "Own pens · edit until 23:59".
  scope_note text not null default '',
  primary key (role_id, module)
);

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  full_name text not null check (length(trim(full_name)) > 0),
  phone text,
  role_id text references public.roles (id),
  is_active boolean not null default true,
  whatsapp_opt_in boolean not null default false,
  last_active_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index profiles_role_id_idx on public.profiles (role_id);

-- ── Farm settings (BRD §7.5) — exactly one row ──────────────────────

create table public.farm_settings (
  id boolean primary key default true check (id),
  farm_name text not null,
  trading_as text,
  address text,
  phone text,
  email text,
  logo_path text,
  currency text not null default 'NGN',
  time_zone text not null default 'Africa/Lagos',
  financial_year_start_month smallint not null default 1 check (financial_year_start_month between 1 and 12),
  go_live_date date,
  receipt_footer text,
  whatsapp_sender text,
  whatsapp_monthly_limit integer check (whatsapp_monthly_limit >= 0),
  -- Alert thresholds
  mortality_alert_pct numeric(5,2) not null default 0.5 check (mortality_alert_pct >= 0),
  feed_variance_pct numeric(5,2) not null default 10 check (feed_variance_pct >= 0),
  low_stock_days smallint not null default 5 check (low_stock_days >= 0),
  expiry_warning_days smallint not null default 30 check (expiry_warning_days >= 0),
  missing_entry_cutoff time not null default '18:00',
  overdue_debt_days smallint not null default 60 check (overdue_debt_days >= 0),
  eggs_per_crate smallint not null default 30 check (eggs_per_crate > 0),
  -- Non-managers may edit their own records until this many days after creating them (0 = same day).
  edit_window_days smallint not null default 0 check (edit_window_days >= 0),
  updated_at timestamptz not null default now()
);

-- ── Reference lists (BRD §7.2–7.5) ──────────────────────────────────

create table public.bird_types (
  id bigint generated always as identity primary key,
  name text not null unique,
  lays_eggs boolean not null default false,
  is_active boolean not null default true
);

create table public.feed_types (
  id bigint generated always as identity primary key,
  name text not null unique,
  bag_kg numeric(6,2) not null default 25 check (bag_kg > 0),
  reorder_level_bags numeric(10,2) not null default 0 check (reorder_level_bags >= 0),
  is_active boolean not null default true
);

-- Expected feed per bird per day by age band (BRD §7.2).
create table public.feed_targets (
  id bigint generated always as identity primary key,
  bird_type_id bigint not null references public.bird_types (id),
  breed text,
  week_from smallint not null check (week_from >= 1),
  week_to smallint check (week_to is null or week_to >= week_from),
  grams_per_bird_day numeric(7,2) not null check (grams_per_bird_day > 0),
  recommended_feed_type_id bigint references public.feed_types (id)
);
create index feed_targets_bird_type_idx on public.feed_targets (bird_type_id, week_from);
create index feed_targets_feed_type_idx on public.feed_targets (recommended_feed_type_id);

create table public.medications (
  id bigint generated always as identity primary key,
  name text not null unique,
  category public.medication_category not null,
  default_mode public.medication_mode,
  default_purpose public.medication_purpose,
  dosage_note text,
  -- null = not given to birds (e.g. disinfectant), so no withdrawal applies.
  withdrawal_days smallint check (withdrawal_days >= 0),
  stock_unit text not null check (stock_unit in ('ml', 'g', 'kg', 'vial', 'sachet', 'dose')),
  reorder_level numeric(12,2) not null default 0 check (reorder_level >= 0),
  is_active boolean not null default true
);

create table public.products (
  id bigint generated always as identity primary key,
  name text not null unique,
  kind public.product_kind not null,
  unit text not null,
  -- Which stock a sale takes from, and how many stock units one sold unit is (a crate = 30 eggs).
  -- Null = not stock-checked, e.g. sacks and droppings (FR-SAL-6).
  stock_item public.stock_item check (stock_item is null or stock_item in ('eggs', 'cracked_eggs')),
  stock_units_per_unit numeric(10,2) check (stock_units_per_unit > 0),
  -- Selling below this needs a manager's approval (FR-SAL-5).
  min_price numeric(14,2) check (min_price >= 0),
  is_active boolean not null default true,
  check ((stock_item is null) = (stock_units_per_unit is null))
);

create table public.expense_categories (
  id bigint generated always as identity primary key,
  name text not null unique,
  is_active boolean not null default true
);

create table public.adjustment_reasons (
  id bigint generated always as identity primary key,
  name text not null unique,
  is_active boolean not null default true
);

-- ── Pens and flocks ─────────────────────────────────────────────────

create table public.pens (
  id bigint generated always as identity primary key,
  name text not null unique,
  capacity integer not null check (capacity > 0),
  bird_type_id bigint references public.bird_types (id),
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);
create index pens_bird_type_idx on public.pens (bird_type_id);

-- Pens a staff member works in. Pen attendants only see these (BRD §4).
create table public.staff_pens (
  profile_id uuid not null references public.profiles (id) on delete cascade,
  pen_id bigint not null references public.pens (id) on delete cascade,
  primary key (profile_id, pen_id)
);
create index staff_pens_pen_idx on public.staff_pens (pen_id);

create table public.flocks (
  id bigint generated always as identity primary key,
  code text not null unique,
  pen_id bigint not null references public.pens (id),
  bird_type_id bigint not null references public.bird_types (id),
  breed text,
  placed_on date not null,
  -- e.g. 0 for day-old chicks, 126 for point-of-lay (BRD FR-PB-1).
  age_at_placement_days integer not null default 0 check (age_at_placement_days >= 0),
  birds_placed integer not null check (birds_placed > 0),
  status public.flock_status not null default 'active',
  closed_on date check (closed_on is null or closed_on >= placed_on),
  notes text,
  created_by uuid default auth.uid() references public.profiles (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check ((status = 'closed') = (closed_on is not null))
);
-- One flock per pen at a time.
create unique index flocks_one_active_per_pen on public.flocks (pen_id) where status = 'active';
create index flocks_pen_idx on public.flocks (pen_id, placed_on desc);
create index flocks_bird_type_idx on public.flocks (bird_type_id);
create index flocks_created_by_idx on public.flocks (created_by);

-- ── Customers and suppliers (BRD §5.1, §5.2) ────────────────────────

create table public.customers (
  id bigint generated always as identity primary key,
  name text not null check (length(trim(name)) > 0),
  short_name text,
  phone text,
  address text,
  area text,
  customer_type public.customer_type not null default 'regular',
  buys public.product_kind[] not null default '{}',
  whatsapp_opt_in boolean not null default false,
  -- What they owed at go-live (BR-4) — the only balance anyone types.
  opening_balance numeric(14,2) not null default 0,
  opening_balance_source text,
  opening_balance_checked boolean not null default false,
  is_active boolean not null default true,
  created_by uuid default auth.uid() references public.profiles (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index customers_name_idx on public.customers (lower(name));
create index customers_created_by_idx on public.customers (created_by);

create table public.suppliers (
  id bigint generated always as identity primary key,
  name text not null unique check (length(trim(name)) > 0),
  short_name text,
  phone text,
  address text,
  supplies public.supplier_kind[] not null default '{}',
  payment_terms_days smallint check (payment_terms_days >= 0),
  opening_balance numeric(14,2) not null default 0,
  opening_balance_source text,
  opening_balance_checked boolean not null default false,
  -- Suppliers with transactions are deactivated, never deleted (FR-SUP-2; enforced by FKs).
  is_active boolean not null default true,
  created_by uuid default auth.uid() references public.profiles (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index suppliers_created_by_idx on public.suppliers (created_by);

-- ── Human-readable references, e.g. S-0951 ──────────────────────────

create sequence public.sale_ref_seq;
create sequence public.purchase_feed_ref_seq;
create sequence public.purchase_bird_ref_seq;
create sequence public.purchase_med_ref_seq;
create sequence public.payment_in_ref_seq;
create sequence public.payment_out_ref_seq;
create sequence public.expense_ref_seq;

create function private.next_ref(prefix text, seq regclass)
returns text
language sql
set search_path = ''
as $$ select prefix || lpad(nextval(seq)::text, 4, '0') $$;

-- ── Purchases (BRD §5.3, §5.4, §5.10) ───────────────────────────────

create table public.purchases (
  id bigint generated always as identity primary key,
  ref text not null unique,
  kind public.purchase_kind not null,
  purchased_on date not null default private.farm_today(),
  supplier_id bigint not null references public.suppliers (id),
  feed_type_id bigint references public.feed_types (id),
  medication_id bigint references public.medications (id),
  -- Bird purchases create or top up the flock in a pen (FR-PB-1).
  flock_id bigint references public.flocks (id),
  quantity numeric(12,2) not null check (quantity > 0),
  -- Unit as written on the invoice, e.g. "bags", "birds", "× 250 g".
  unit text not null,
  -- Stock units one purchased unit adds, e.g. 250 for a 250 g pack counted in grams.
  stock_units_per_unit numeric(12,2) not null default 1 check (stock_units_per_unit > 0),
  unit_price numeric(14,2) not null check (unit_price >= 0),
  total numeric(14,2) generated always as (round(quantity * unit_price, 2)) stored,
  -- Paid at the time of purchase; later payments are rows in public.payments (BR-2: never negative).
  amount_paid numeric(14,2) not null default 0 check (amount_paid >= 0),
  payment_method public.payment_method,
  -- Medication batches, used first-expiry-first-out (FR-MED-2).
  batch_no text,
  expiry_date date,
  -- Ordered, then received by the Store Keeper. Stock moves only on receipt.
  status public.purchase_status not null default 'received',
  received_on date,
  received_quantity numeric(12,2) check (received_quantity >= 0),
  returned_quantity numeric(12,2) not null default 0 check (returned_quantity >= 0),
  delivery_note text,
  received_by uuid references public.profiles (id),
  notes text,
  recorded_by uuid not null default auth.uid() references public.profiles (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  deleted_by uuid references public.profiles (id),
  delete_reason text,
  check ((kind = 'feed') = (feed_type_id is not null)),
  check ((kind = 'medication') = (medication_id is not null)),
  check (kind = 'birds' or flock_id is null),
  check (status = 'ordered' or received_on is not null),
  check (returned_quantity <= coalesce(received_quantity, quantity)),
  check (deleted_at is null or delete_reason is not null)
);
create index purchases_supplier_idx on public.purchases (supplier_id, purchased_on);
create index purchases_feed_type_idx on public.purchases (feed_type_id) where feed_type_id is not null;
create index purchases_medication_idx on public.purchases (medication_id, expiry_date) where medication_id is not null;
create index purchases_flock_idx on public.purchases (flock_id) where flock_id is not null;
create index purchases_open_orders_idx on public.purchases (purchased_on) where status = 'ordered' and deleted_at is null;
create index purchases_recorded_by_idx on public.purchases (recorded_by);
create index purchases_received_by_idx on public.purchases (received_by);
create index purchases_deleted_by_idx on public.purchases (deleted_by);

create function private.purchase_ref()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.ref is null then
    new.ref := case new.kind
      when 'feed' then private.next_ref('PF-', 'public.purchase_feed_ref_seq')
      when 'birds' then private.next_ref('PB-', 'public.purchase_bird_ref_seq')
      else private.next_ref('PM-', 'public.purchase_med_ref_seq')
    end;
  end if;
  return new;
end;
$$;

-- ── Sales (BRD §5.7) ─────────────────────────────────────────────────

create table public.sales (
  id bigint generated always as identity primary key,
  ref text not null unique default private.next_ref('S-', 'public.sale_ref_seq'),
  sold_on date not null default private.farm_today(),
  -- Null for a one-off buyer recorded at the gate (FR-CUS-1).
  customer_id bigint references public.customers (id),
  buyer_name text,
  pen_id bigint references public.pens (id),
  flock_id bigint references public.flocks (id),
  product_id bigint not null references public.products (id),
  quantity numeric(12,2) not null check (quantity > 0),
  unit_price numeric(14,2) not null check (unit_price >= 0),
  total numeric(14,2) generated always as (round(quantity * unit_price, 2)) stored,
  amount_paid numeric(14,2) not null default 0 check (amount_paid >= 0),
  payment_method public.payment_method,
  -- Below the product's minimum price → pending until a manager approves (FR-SAL-5). Set by trigger.
  approval public.sale_approval not null default 'approved',
  approved_by uuid references public.profiles (id),
  approved_at timestamptz,
  notes text,
  recorded_by uuid not null default auth.uid() references public.profiles (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  deleted_by uuid references public.profiles (id),
  delete_reason text,
  check (customer_id is not null or length(trim(coalesce(buyer_name, ''))) > 0),
  -- One-off buyers pay in full (BR-3).
  check (customer_id is not null or amount_paid = total),
  check (deleted_at is null or delete_reason is not null)
);
create index sales_customer_idx on public.sales (customer_id, sold_on) where customer_id is not null;
create index sales_sold_on_idx on public.sales (sold_on);
create index sales_product_idx on public.sales (product_id);
create index sales_pen_idx on public.sales (pen_id) where pen_id is not null;
create index sales_flock_idx on public.sales (flock_id) where flock_id is not null;
create index sales_pending_idx on public.sales (created_at) where approval = 'pending' and deleted_at is null;
create index sales_recorded_by_idx on public.sales (recorded_by);
create index sales_approved_by_idx on public.sales (approved_by);
create index sales_deleted_by_idx on public.sales (deleted_by);

-- ── Payments outside a sale or purchase (BRD §5.9) ──────────────────

create table public.payments (
  id bigint generated always as identity primary key,
  ref text not null unique,
  paid_on date not null default private.farm_today(),
  direction public.payment_direction not null,
  customer_id bigint references public.customers (id),
  supplier_id bigint references public.suppliers (id),
  amount numeric(14,2) not null check (amount > 0),
  method public.payment_method not null,
  reference text,
  notes text,
  recorded_by uuid not null default auth.uid() references public.profiles (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  deleted_by uuid references public.profiles (id),
  delete_reason text,
  -- Money in comes from a customer; money out goes to a supplier.
  check ((direction = 'in' and customer_id is not null and supplier_id is null)
      or (direction = 'out' and supplier_id is not null and customer_id is null)),
  check (deleted_at is null or delete_reason is not null)
);
create index payments_customer_idx on public.payments (customer_id, paid_on) where customer_id is not null;
create index payments_supplier_idx on public.payments (supplier_id, paid_on) where supplier_id is not null;
create index payments_recorded_by_idx on public.payments (recorded_by);
create index payments_deleted_by_idx on public.payments (deleted_by);

create function private.payment_ref()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.ref is null then
    new.ref := case new.direction
      when 'in' then private.next_ref('P-', 'public.payment_in_ref_seq')
      else private.next_ref('PP-', 'public.payment_out_ref_seq')
    end;
  end if;
  return new;
end;
$$;

-- ── Expenses (BRD §5.8) ─────────────────────────────────────────────

create table public.expenses (
  id bigint generated always as identity primary key,
  ref text not null unique default private.next_ref('E-', 'public.expense_ref_seq'),
  spent_on date not null default private.farm_today(),
  category_id bigint not null references public.expense_categories (id),
  description text not null check (length(trim(description)) > 0),
  amount numeric(14,2) not null check (amount > 0),
  -- Equipment bought from a supplier (FR-SUP-3): the full cost is an expense, anything unpaid
  -- is added to that supplier's balance.
  supplier_id bigint references public.suppliers (id),
  amount_paid numeric(14,2) not null check (amount_paid >= 0),
  payment_method public.payment_method,
  -- Null = general farm overhead, shared across pens by bird-days.
  pen_id bigint references public.pens (id),
  receipt_path text,
  recorded_by uuid not null default auth.uid() references public.profiles (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  deleted_by uuid references public.profiles (id),
  delete_reason text,
  check (supplier_id is not null or amount_paid = amount),
  check (deleted_at is null or delete_reason is not null)
);
create index expenses_spent_on_idx on public.expenses (spent_on);
create index expenses_category_idx on public.expenses (category_id);
create index expenses_supplier_idx on public.expenses (supplier_id, spent_on) where supplier_id is not null;
create index expenses_pen_idx on public.expenses (pen_id) where pen_id is not null;
create index expenses_recorded_by_idx on public.expenses (recorded_by);
create index expenses_deleted_by_idx on public.expenses (deleted_by);

-- ── Daily production (BRD §5.6) ─────────────────────────────────────

create table public.production_records (
  id bigint generated always as identity primary key,
  pen_id bigint not null references public.pens (id),
  flock_id bigint not null references public.flocks (id),
  record_date date not null default private.farm_today(),
  -- Calculated by trigger: the last record's closing, plus birds added, minus birds sold since.
  opening_birds integer not null default 0,
  mortality integer not null default 0 check (mortality >= 0),
  closing_birds integer generated always as (opening_birds - mortality) stored,
  feed_type_id bigint references public.feed_types (id),
  feed_bags numeric(8,2) not null default 0 check (feed_bags >= 0),
  -- Layers only (FR-PRD-3). Total eggs collected, cracked included; the UI enters crates + pieces.
  eggs_collected integer check (eggs_collected >= 0),
  eggs_cracked integer check (eggs_cracked >= 0),
  notes text,
  recorded_by uuid not null default auth.uid() references public.profiles (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  deleted_by uuid references public.profiles (id),
  delete_reason text,
  check (eggs_cracked is null or eggs_cracked <= coalesce(eggs_collected, 0)),
  check (feed_bags = 0 or feed_type_id is not null),
  check (deleted_at is null or delete_reason is not null)
);
-- One record per pen per day (FR-PRD-1).
create unique index production_one_per_pen_day on public.production_records (pen_id, record_date) where deleted_at is null;
create index production_flock_idx on public.production_records (flock_id, record_date);
create index production_feed_type_idx on public.production_records (feed_type_id);
create index production_recorded_by_idx on public.production_records (recorded_by);
create index production_deleted_by_idx on public.production_records (deleted_by);

-- Several medications a day are allowed (FR-PRD-2).
create table public.production_medications (
  id bigint generated always as identity primary key,
  production_record_id bigint not null references public.production_records (id) on delete cascade,
  medication_id bigint not null references public.medications (id),
  -- The batch used (a medication purchase); first-expiry-first-out by default (FR-MED-2).
  purchase_id bigint references public.purchases (id),
  quantity numeric(12,2) not null check (quantity > 0),
  mode public.medication_mode not null,
  purpose public.medication_purpose not null,
  created_at timestamptz not null default now()
);
create index production_medications_record_idx on public.production_medications (production_record_id);
create index production_medications_medication_idx on public.production_medications (medication_id);
create index production_medications_purchase_idx on public.production_medications (purchase_id);

-- ── Stock counts and adjustments (FR-INV-2) ─────────────────────────

create table public.stock_adjustments (
  id bigint generated always as identity primary key,
  adjusted_on date not null default private.farm_today(),
  item public.stock_item not null,
  feed_type_id bigint references public.feed_types (id),
  medication_id bigint references public.medications (id),
  purchase_id bigint references public.purchases (id),
  -- Opening stock at go-live, or a correction after a physical count.
  is_opening boolean not null default false,
  counted_quantity numeric(12,2) check (counted_quantity >= 0),
  -- Signed change applied to stock.
  quantity_change numeric(12,2) not null,
  reason_id bigint references public.adjustment_reasons (id),
  note text,
  recorded_by uuid not null default auth.uid() references public.profiles (id),
  created_at timestamptz not null default now(),
  check ((item = 'feed') = (feed_type_id is not null)),
  check ((item = 'medication') = (medication_id is not null)),
  -- Every correction needs a reason; opening stock doesn't.
  check (is_opening or reason_id is not null)
);
create index stock_adjustments_feed_idx on public.stock_adjustments (feed_type_id) where feed_type_id is not null;
create index stock_adjustments_medication_idx on public.stock_adjustments (medication_id) where medication_id is not null;
create index stock_adjustments_purchase_idx on public.stock_adjustments (purchase_id);
create index stock_adjustments_reason_idx on public.stock_adjustments (reason_id);
create index stock_adjustments_recorded_by_idx on public.stock_adjustments (recorded_by);

-- ── Stock ledger (FR-INV-1) ─────────────────────────────────────────
-- Written only by triggers on the source records, so stock is always calculated, never typed.
-- Quantities are signed, in stock units: bags, the medication's stock unit, or eggs.

create table public.stock_movements (
  id bigint generated always as identity primary key,
  moved_on date not null,
  item public.stock_item not null,
  feed_type_id bigint references public.feed_types (id),
  medication_id bigint references public.medications (id),
  -- Medication batch (the purchase it came from), when known.
  purchase_id bigint references public.purchases (id),
  movement public.stock_movement_type not null,
  quantity numeric(12,2) not null,
  source_table text not null,
  source_id bigint not null,
  pen_id bigint references public.pens (id),
  created_at timestamptz not null default now(),
  check ((item = 'feed') = (feed_type_id is not null)),
  check ((item = 'medication') = (medication_id is not null))
);
create index stock_movements_source_idx on public.stock_movements (source_table, source_id);
create index stock_movements_feed_idx on public.stock_movements (feed_type_id, moved_on) where feed_type_id is not null;
create index stock_movements_medication_idx on public.stock_movements (medication_id, moved_on) where medication_id is not null;
create index stock_movements_item_idx on public.stock_movements (item, moved_on);
create index stock_movements_purchase_idx on public.stock_movements (purchase_id);
create index stock_movements_pen_idx on public.stock_movements (pen_id);

-- ── Audit log (BO6, BRD §10) ────────────────────────────────────────

create table public.audit_log (
  id bigint generated always as identity primary key,
  occurred_at timestamptz not null default now(),
  actor_id uuid references public.profiles (id) on delete set null,
  table_name text not null,
  record_id text not null,
  action text not null check (action in ('insert', 'update', 'delete')),
  old_data jsonb,
  new_data jsonb
);
create index audit_log_record_idx on public.audit_log (table_name, record_id, occurred_at desc);
create index audit_log_occurred_idx on public.audit_log (occurred_at desc);
create index audit_log_actor_idx on public.audit_log (actor_id);

-- ════════════════════════════════════════════════════════════════════
-- Access helpers (private schema, not reachable through the Data API)
-- ════════════════════════════════════════════════════════════════════

-- SECURITY DEFINER so policies can read profiles/role_permissions without recursing through
-- their own RLS. Each one only ever answers about the calling user (auth.uid()).

create function private.my_role()
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select p.role_id from public.profiles p
  where p.id = (select auth.uid()) and p.is_active
$$;

create function private.access(m public.app_module, action text)
returns public.access_level
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((
    select case action
      when 'view' then rp.can_view
      when 'add' then rp.can_add
      when 'edit' then rp.can_edit
      when 'delete' then rp.can_delete
    end
    from public.profiles p
    join public.role_permissions rp on rp.role_id = p.role_id and rp.module = m
    where p.id = (select auth.uid()) and p.is_active
  ), 'none'::public.access_level)
$$;

create function private.can(m public.app_module, action text)
returns boolean
language sql
stable
set search_path = ''
as $$ select private.access(m, action) <> 'none' $$;

-- Pens this user may work with for a module: every pen with 'all' access, assigned pens with 'own'.
create function private.can_pen(m public.app_module, action text, pen bigint)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select case private.access(m, action)
    when 'all' then true
    when 'own' then pen is not null and exists (
      select 1 from public.staff_pens sp where sp.profile_id = (select auth.uid()) and sp.pen_id = pen
    )
    else false
  end
$$;

-- Managers approve sales, correct old records and see the audit log.
create function private.is_manager()
returns boolean
language sql
stable
set search_path = ''
as $$ select coalesce(private.my_role() in ('owner', 'farm_manager'), false) $$;

-- Non-managers can change their own records only within the edit window (BRD §4 rules).
create function private.within_edit_window(recorded_by uuid, created_at timestamptz)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.is_manager() or (
    recorded_by = (select auth.uid())
    and (created_at at time zone 'Africa/Lagos')::date
        >= private.farm_today() - (select fs.edit_window_days from public.farm_settings fs)
  )
$$;

revoke execute on all functions in schema private from public, anon;
grant execute on all functions in schema private to authenticated, service_role;

-- ════════════════════════════════════════════════════════════════════
-- Business-rule triggers
-- ════════════════════════════════════════════════════════════════════

-- New sign-ups get a profile with no role (so no access) until the owner assigns one.
-- The role comes from app_metadata, which only the server can set — never user_metadata.
create function private.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, full_name, phone, role_id)
  values (
    new.id,
    coalesce(nullif(trim(new.raw_user_meta_data ->> 'full_name'), ''), split_part(coalesce(new.email, new.phone, 'New user'), '@', 1)),
    new.phone,
    (select r.id from public.roles r where r.id = new.raw_app_meta_data ->> 'role')
  );
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function private.handle_new_user();

-- Only the owner (admin module edit) can change someone's role or active flag.
create function private.guard_profile_update()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if (new.role_id is distinct from old.role_id or new.is_active is distinct from old.is_active)
     and not private.can('admin', 'edit')
     and current_user = 'authenticated' then
    raise exception 'Only the owner can change roles or deactivate staff' using errcode = '42501';
  end if;
  return new;
end;
$$;

-- Sales below the product's minimum price wait for approval (FR-SAL-5); approvals are managers' only.
create function private.sale_approval()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  min_price numeric;
begin
  select p.min_price into min_price from public.products p where p.id = new.product_id;

  if tg_op = 'INSERT' then
    new.approval := case when min_price is not null and new.unit_price < min_price then 'pending' else 'approved' end;
    new.approved_by := null;
    new.approved_at := null;
  elsif new.approval is distinct from old.approval then
    if not private.is_manager() and current_user = 'authenticated' then
      raise exception 'Only the farm manager or owner can approve or reject a sale' using errcode = '42501';
    end if;
    new.approved_by := (select auth.uid());
    new.approved_at := now();
  elsif new.unit_price is distinct from old.unit_price and min_price is not null and new.unit_price < min_price then
    new.approval := 'pending';
    new.approved_by := null;
    new.approved_at := null;
  end if;
  return new;
end;
$$;

-- Store keepers receive deliveries but can't change what was bought or its price.
create function private.guard_purchase_update()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if current_user = 'authenticated' and private.access('purchases', 'edit') = 'own'
     and (new.kind, new.supplier_id, new.feed_type_id, new.medication_id, new.flock_id, new.quantity, new.unit,
          new.stock_units_per_unit, new.unit_price, new.amount_paid, new.purchased_on, new.deleted_at)
         is distinct from
         (old.kind, old.supplier_id, old.feed_type_id, old.medication_id, old.flock_id, old.quantity, old.unit,
          old.stock_units_per_unit, old.unit_price, old.amount_paid, old.purchased_on, old.deleted_at) then
    raise exception 'You can record receipt of this delivery but not change the purchase' using errcode = '42501';
  end if;
  if new.status = 'received' and old.status = 'ordered' then
    new.received_by := coalesce(new.received_by, (select auth.uid()));
  end if;
  return new;
end;
$$;

-- Soft deletes. Deleting or restoring a record needs delete permission for its module (passed as
-- the trigger argument) — editing rights alone aren't enough.
create function private.soft_delete()
returns trigger
language plpgsql
set search_path = ''
as $
begin
  if new.deleted_at is not distinct from old.deleted_at then
    return new;
  end if;
  if current_user = 'authenticated' and not private.can(tg_argv[0]::public.app_module, 'delete') then
    raise exception 'Only roles with delete permission can delete or restore records' using errcode = '42501';
  end if;
  if new.deleted_at is not null then
    new.deleted_by := (select auth.uid());
  else
    -- Restored: the audit log keeps who deleted it and why.
    new.deleted_by := null;
    new.delete_reason := null;
  end if;
  return new;
end;
$;

-- ── Stock movements, rebuilt from each source row ───────────────────

create function private.clear_movements(src text, src_id bigint)
returns void
language sql
security definer
set search_path = ''
as $$ delete from public.stock_movements where source_table = src and source_id = src_id $$;

create function private.purchase_stock()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  r public.purchases := coalesce(new, old);
begin
  perform private.clear_movements('purchases', r.id);
  if tg_op <> 'DELETE' and r.deleted_at is null and r.status = 'received' and r.kind <> 'birds' then
    insert into public.stock_movements (moved_on, item, feed_type_id, medication_id, purchase_id, movement, quantity, source_table, source_id)
    values (
      r.received_on,
      case r.kind when 'feed' then 'feed'::public.stock_item else 'medication'::public.stock_item end,
      r.feed_type_id, r.medication_id,
      case when r.kind = 'medication' then r.id end,
      'received',
      (coalesce(r.received_quantity, r.quantity) - r.returned_quantity) * r.stock_units_per_unit,
      'purchases', r.id
    );
  end if;
  return null;
end;
$$;

create function private.production_stock()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  r public.production_records := coalesce(new, old);
begin
  perform private.clear_movements('production_records', r.id);
  if tg_op <> 'DELETE' and r.deleted_at is null then
    if r.feed_bags > 0 then
      insert into public.stock_movements (moved_on, item, feed_type_id, movement, quantity, source_table, source_id, pen_id)
      values (r.record_date, 'feed', r.feed_type_id, 'used', -r.feed_bags, 'production_records', r.id, r.pen_id);
    end if;
    if coalesce(r.eggs_collected, 0) > 0 then
      insert into public.stock_movements (moved_on, item, movement, quantity, source_table, source_id, pen_id)
      values (r.record_date, 'eggs', 'collected', r.eggs_collected - coalesce(r.eggs_cracked, 0), 'production_records', r.id, r.pen_id);
    end if;
    if coalesce(r.eggs_cracked, 0) > 0 then
      insert into public.stock_movements (moved_on, item, movement, quantity, source_table, source_id, pen_id)
      values (r.record_date, 'cracked_eggs', 'collected', r.eggs_cracked, 'production_records', r.id, r.pen_id);
    end if;
  end if;
  -- A soft-deleted record also takes its medication out of the ledger.
  if tg_op = 'UPDATE' and (new.deleted_at is distinct from old.deleted_at or new.record_date is distinct from old.record_date) then
    update public.production_medications set quantity = quantity where production_record_id = r.id;
  end if;
  return null;
end;
$$;

create function private.production_medication_stock()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  m public.production_medications := coalesce(new, old);
  pr public.production_records;
  remaining numeric;
  take numeric;
  b record;
begin
  perform private.clear_movements('production_medications', m.id);
  if tg_op = 'DELETE' then
    return null;
  end if;
  select * into pr from public.production_records where id = m.production_record_id;
  if pr.deleted_at is not null then
    return null;
  end if;

  -- Take from the chosen batch, or first-expiry-first-out across batches (FR-MED-2).
  -- Stock without a batch (e.g. opening stock) is used last.
  remaining := m.quantity;
  for b in
    select sm.purchase_id, sum(sm.quantity) as on_hand
    from public.stock_movements sm
    left join public.purchases pu on pu.id = sm.purchase_id
    where sm.item = 'medication' and sm.medication_id = m.medication_id
      and (m.purchase_id is null or sm.purchase_id = m.purchase_id)
    group by sm.purchase_id, pu.expiry_date
    having sum(sm.quantity) > 0
    order by pu.expiry_date nulls last, sm.purchase_id nulls last
  loop
    take := least(remaining, b.on_hand);
    insert into public.stock_movements (moved_on, item, medication_id, purchase_id, movement, quantity, source_table, source_id, pen_id)
    values (pr.record_date, 'medication', m.medication_id, b.purchase_id, 'used', -take, 'production_medications', m.id, pr.pen_id);
    remaining := remaining - take;
    exit when remaining <= 0;
  end loop;

  -- FR-MED-1: can't use more than is in the store.
  if remaining > 0 then
    raise exception 'Only % in stock for this medication', m.quantity - remaining using errcode = '23514';
  end if;
  return null;
end;
$$;

create function private.sale_stock()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  s public.sales := coalesce(new, old);
  p public.products;
  available numeric;
begin
  perform private.clear_movements('sales', s.id);
  if tg_op = 'DELETE' or s.deleted_at is not null or s.approval = 'rejected' then
    return null;
  end if;
  select * into p from public.products where id = s.product_id;
  if p.stock_item is null then
    return null;
  end if;

  -- FR-SAL-2: can't sell more eggs than are in the store.
  select coalesce(sum(sm.quantity), 0) into available
  from public.stock_movements sm where sm.item = p.stock_item;
  if s.quantity * p.stock_units_per_unit > available then
    raise exception 'Only % % in the store', available, replace(p.stock_item::text, '_', ' ') using errcode = '23514';
  end if;

  insert into public.stock_movements (moved_on, item, movement, quantity, source_table, source_id, pen_id)
  values (s.sold_on, p.stock_item, 'sold', -(s.quantity * p.stock_units_per_unit), 'sales', s.id, s.pen_id);
  return null;
end;
$$;

create function private.adjustment_stock()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  a public.stock_adjustments := coalesce(new, old);
begin
  perform private.clear_movements('stock_adjustments', a.id);
  if tg_op <> 'DELETE' then
    insert into public.stock_movements (moved_on, item, feed_type_id, medication_id, purchase_id, movement, quantity, source_table, source_id)
    values (a.adjusted_on, a.item, a.feed_type_id, a.medication_id, a.purchase_id,
            case when a.is_opening then 'opening'::public.stock_movement_type else 'adjusted'::public.stock_movement_type end,
            a.quantity_change, 'stock_adjustments', a.id);
  end if;
  return null;
end;
$$;

-- ── Birds in each pen (FR-SAL-1, FR-PB-1) ───────────────────────────
-- Opening birds = the previous record's closing (or the birds placed), plus birds bought into the
-- flock, minus birds sold since. Recalculated for the whole flock whenever any input changes, so a
-- back-dated correction flows through every later day.

create function private.recalc_flock(f bigint)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  fl public.flocks;
  rec record;
  prev_date date;
  running integer;
  opening integer;
begin
  select * into fl from public.flocks where id = f;
  if not found then
    return;
  end if;
  running := fl.birds_placed;
  prev_date := fl.placed_on - 1;

  for rec in
    select id, record_date, mortality, opening_birds from public.production_records
    where flock_id = f and deleted_at is null
    order by record_date
  loop
    opening := running
      + coalesce((
          select sum(coalesce(pu.received_quantity, pu.quantity) - pu.returned_quantity)::integer
          from public.purchases pu
          where pu.flock_id = f and pu.kind = 'birds' and pu.status = 'received' and pu.deleted_at is null
            and pu.received_on > prev_date and pu.received_on <= rec.record_date
            and pu.received_on > fl.placed_on
        ), 0)
      - coalesce((
          select sum(s.quantity)::integer
          from public.sales s join public.products p on p.id = s.product_id
          where s.flock_id = f and p.kind = 'birds' and s.deleted_at is null and s.approval <> 'rejected'
            and s.sold_on >= greatest(prev_date, fl.placed_on) and s.sold_on < rec.record_date
        ), 0);
    if opening is distinct from rec.opening_birds then
      update public.production_records set opening_birds = opening where id = rec.id;
    end if;
    running := opening - rec.mortality;
    prev_date := rec.record_date;
  end loop;
end;
$$;

create function private.production_birds()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- The recalculation itself updates opening_birds; don't recurse on that.
  if pg_trigger_depth() > 1 then
    return null;
  end if;
  if tg_op <> 'INSERT' then
    perform private.recalc_flock(old.flock_id);
  end if;
  if tg_op <> 'DELETE' and (tg_op = 'INSERT' or new.flock_id is distinct from old.flock_id
     or new.record_date is distinct from old.record_date or new.mortality is distinct from old.mortality
     or new.deleted_at is distinct from old.deleted_at) then
    perform private.recalc_flock(new.flock_id);
  end if;
  return null;
end;
$$;

create function private.flock_inputs_changed()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op <> 'INSERT' and old.flock_id is not null then
    perform private.recalc_flock(old.flock_id);
  end if;
  if tg_op <> 'DELETE' and new.flock_id is not null and (tg_op = 'INSERT' or new.flock_id is distinct from old.flock_id) then
    perform private.recalc_flock(new.flock_id);
  end if;
  return null;
end;
$$;

create function private.flock_changed()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.birds_placed is distinct from old.birds_placed or new.placed_on is distinct from old.placed_on then
    perform private.recalc_flock(new.id);
  end if;
  return null;
end;
$$;

-- A production record's flock must be the pen's flock.
create function private.production_flock_matches_pen()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not exists (select 1 from public.flocks f where f.id = new.flock_id and f.pen_id = new.pen_id) then
    raise exception 'That flock is not in this pen' using errcode = '23514';
  end if;
  return new;
end;
$$;

-- ── Audit trail ─────────────────────────────────────────────────────

create function private.audit()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  j jsonb := coalesce(to_jsonb(new), to_jsonb(old));
  -- Bookkeeping columns that change without anyone editing the record.
  noise text[] := array['updated_at', 'opening_birds', 'closing_birds'];
begin
  if tg_op = 'UPDATE' and to_jsonb(new) - noise = to_jsonb(old) - noise then
    return null;
  end if;
  insert into public.audit_log (actor_id, table_name, record_id, action, old_data, new_data)
  values (
    (select auth.uid()),
    tg_table_name,
    coalesce(j ->> 'id', concat_ws('/', j ->> 'role_id', j ->> 'module', j ->> 'profile_id', j ->> 'pen_id')),
    lower(tg_op),
    case when tg_op <> 'INSERT' then to_jsonb(old) end,
    case when tg_op <> 'DELETE' then to_jsonb(new) end
  );
  return null;
end;
$$;

revoke execute on all functions in schema private from public, anon;
grant execute on all functions in schema private to authenticated, service_role;

-- ── Attach triggers ─────────────────────────────────────────────────

do $$
declare
  t text;
begin
  foreach t in array array['profiles', 'farm_settings', 'flocks', 'customers', 'suppliers', 'purchases', 'sales', 'payments', 'expenses', 'production_records']
  loop
    execute format('create trigger set_updated_at before update on public.%I for each row execute function private.set_updated_at()', t);
  end loop;

  foreach t in array array['purchases', 'sales', 'payments', 'expenses', 'production_records']
  loop
    execute format('create trigger soft_delete before update of deleted_at on public.%I for each row execute function private.soft_delete(%L)',
                   t, case t when 'production_records' then 'production' else t end);
  end loop;

  foreach t in array array[
    'roles', 'role_permissions', 'profiles', 'farm_settings', 'staff_pens', 'bird_types', 'feed_types', 'feed_targets',
    'medications', 'products', 'expense_categories', 'adjustment_reasons', 'pens', 'flocks', 'customers', 'suppliers',
    'purchases', 'sales', 'payments', 'expenses', 'production_records', 'production_medications', 'stock_adjustments'
  ]
  loop
    execute format('create trigger audit after insert or update or delete on public.%I for each row execute function private.audit()', t);
  end loop;
end;
$$;

create trigger guard_role_change before update on public.profiles for each row execute function private.guard_profile_update();

create trigger set_ref before insert on public.purchases for each row execute function private.purchase_ref();
create trigger guard_receive_only before update on public.purchases for each row execute function private.guard_purchase_update();
create trigger stock after insert or update or delete on public.purchases for each row execute function private.purchase_stock();
create trigger flock_birds after insert or update or delete on public.purchases for each row execute function private.flock_inputs_changed();

create trigger set_ref before insert on public.payments for each row execute function private.payment_ref();

create trigger approval before insert or update on public.sales for each row execute function private.sale_approval();
create trigger stock after insert or update or delete on public.sales for each row execute function private.sale_stock();
create trigger flock_birds after insert or update or delete on public.sales for each row execute function private.flock_inputs_changed();

create trigger flock_matches_pen before insert or update of pen_id, flock_id on public.production_records for each row execute function private.production_flock_matches_pen();
create trigger stock after insert or update or delete on public.production_records for each row execute function private.production_stock();
create trigger birds after insert or update or delete on public.production_records for each row execute function private.production_birds();
create trigger stock after insert or update or delete on public.production_medications for each row execute function private.production_medication_stock();
create trigger stock after insert or update or delete on public.stock_adjustments for each row execute function private.adjustment_stock();
create trigger recalc after update on public.flocks for each row execute function private.flock_changed();

-- ════════════════════════════════════════════════════════════════════
-- Calculated views (security_invoker: callers see only what their RLS allows)
-- ════════════════════════════════════════════════════════════════════

-- Daily production with the calculated fields from BRD §5.6.
create view public.production_daily with (security_invoker = true) as
select
  pr.id,
  pr.pen_id,
  pr.flock_id,
  pr.record_date,
  pr.record_date - f.placed_on + f.age_at_placement_days as age_days,
  pr.opening_birds,
  pr.mortality,
  pr.closing_birds,
  case when pr.opening_birds > 0 then round(pr.mortality * 100.0 / pr.opening_birds, 2) end as mortality_pct,
  pr.feed_type_id,
  pr.feed_bags,
  round(pr.feed_bags * coalesce(ft.bag_kg, 25), 2) as feed_kg,
  round(pr.closing_birds * tgt.grams_per_bird_day / 1000.0, 2) as expected_feed_kg,
  case when tgt.grams_per_bird_day > 0 and pr.closing_birds > 0 then
    round((pr.feed_bags * coalesce(ft.bag_kg, 25) - pr.closing_birds * tgt.grams_per_bird_day / 1000.0)
          * 100.0 / (pr.closing_birds * tgt.grams_per_bird_day / 1000.0), 2)
  end as feed_variance_pct,
  pr.eggs_collected,
  pr.eggs_cracked,
  case when pr.eggs_collected is not null and pr.closing_birds > 0 then round(pr.eggs_collected * 100.0 / pr.closing_birds, 2) end as laying_rate_pct,
  pr.recorded_by,
  pr.created_at
from public.production_records pr
join public.flocks f on f.id = pr.flock_id
left join public.feed_types ft on ft.id = pr.feed_type_id
left join lateral (
  select t.grams_per_bird_day
  from public.feed_targets t
  where t.bird_type_id = f.bird_type_id
    and (t.breed is null or t.breed = f.breed)
    and ((pr.record_date - f.placed_on + f.age_at_placement_days) / 7 + 1) >= t.week_from
    and (t.week_to is null or ((pr.record_date - f.placed_on + f.age_at_placement_days) / 7 + 1) <= t.week_to)
  order by (t.breed is null), t.week_from desc
  limit 1
) tgt on true
where pr.deleted_at is null;

-- Running statement per customer (BRD §6, FR-CUS-2). Positive balance = they owe the farm.
create view public.customer_statement with (security_invoker = true) as
with lines as (
  select c.id as customer_id, coalesce(fs.go_live_date, c.created_at::date) as entry_date, c.created_at as entered_at,
         'opening'::text as entry_type, null::text as ref, c.opening_balance as charged, 0::numeric as paid
  from public.customers c left join public.farm_settings fs on true
  where c.opening_balance <> 0
  union all
  select s.customer_id, s.sold_on, s.created_at, 'sale', s.ref, s.total, s.amount_paid
  from public.sales s
  where s.customer_id is not null and s.deleted_at is null and s.approval <> 'rejected'
  union all
  select p.customer_id, p.paid_on, p.created_at, 'payment', p.ref, 0, p.amount
  from public.payments p
  where p.direction = 'in' and p.deleted_at is null
)
select
  customer_id, entry_date, entered_at, entry_type, ref, charged, paid,
  sum(charged - paid) over w - (charged - paid) as previous_balance,
  sum(charged - paid) over w as balance
from lines
window w as (partition by customer_id order by entry_date, entered_at, ref rows unbounded preceding);

create view public.customer_balances with (security_invoker = true) as
select
  c.id as customer_id,
  c.name,
  c.opening_balance
    + coalesce((select sum(s.total - s.amount_paid) from public.sales s
                where s.customer_id = c.id and s.deleted_at is null and s.approval <> 'rejected'), 0)
    - coalesce((select sum(p.amount) from public.payments p
                where p.customer_id = c.id and p.direction = 'in' and p.deleted_at is null), 0) as balance
from public.customers c;

-- Running statement per supplier, including equipment bought as an expense (FR-SUP-3).
-- Positive balance = the farm owes them.
create view public.supplier_statement with (security_invoker = true) as
with lines as (
  select s.id as supplier_id, coalesce(fs.go_live_date, s.created_at::date) as entry_date, s.created_at as entered_at,
         'opening'::text as entry_type, null::text as ref, s.opening_balance as charged, 0::numeric as paid
  from public.suppliers s left join public.farm_settings fs on true
  where s.opening_balance <> 0
  union all
  select pu.supplier_id, pu.purchased_on, pu.created_at, 'purchase', pu.ref, pu.total, pu.amount_paid
  from public.purchases pu
  where pu.deleted_at is null
  union all
  select e.supplier_id, e.spent_on, e.created_at, 'expense', e.ref, e.amount, e.amount_paid
  from public.expenses e
  where e.supplier_id is not null and e.deleted_at is null
  union all
  select p.supplier_id, p.paid_on, p.created_at, 'payment', p.ref, 0, p.amount
  from public.payments p
  where p.direction = 'out' and p.deleted_at is null
)
select
  supplier_id, entry_date, entered_at, entry_type, ref, charged, paid,
  sum(charged - paid) over w - (charged - paid) as previous_balance,
  sum(charged - paid) over w as balance
from lines
window w as (partition by supplier_id order by entry_date, entered_at, ref rows unbounded preceding);

create view public.supplier_balances with (security_invoker = true) as
select
  s.id as supplier_id,
  s.name,
  s.opening_balance
    + coalesce((select sum(pu.total - pu.amount_paid) from public.purchases pu
                where pu.supplier_id = s.id and pu.deleted_at is null), 0)
    + coalesce((select sum(e.amount - e.amount_paid) from public.expenses e
                where e.supplier_id = s.id and e.deleted_at is null), 0)
    - coalesce((select sum(p.amount) from public.payments p
                where p.supplier_id = s.id and p.direction = 'out' and p.deleted_at is null), 0) as balance
from public.suppliers s;

-- Daily stock ledger per item: opening, in, out, adjustments, closing (FR-INV-1, §5.10).
create view public.stock_daily with (security_invoker = true) as
with days as (
  select
    item, feed_type_id, medication_id, moved_on,
    sum(quantity) filter (where movement in ('received', 'collected')) as received,
    -sum(quantity) filter (where movement in ('used', 'sold')) as used,
    sum(quantity) filter (where movement in ('adjusted', 'opening')) as adjusted,
    sum(quantity) as net
  from public.stock_movements
  group by item, feed_type_id, medication_id, moved_on
)
select
  item, feed_type_id, medication_id, moved_on,
  sum(net) over w - net as opening,
  coalesce(received, 0) as received,
  coalesce(used, 0) as used,
  coalesce(adjusted, 0) as adjusted,
  sum(net) over w as closing
from days
window w as (partition by item, feed_type_id, medication_id order by moved_on rows unbounded preceding);

-- Stock on hand now.
create view public.stock_levels with (security_invoker = true) as
select item, feed_type_id, medication_id, sum(quantity) as on_hand
from public.stock_movements
group by item, feed_type_id, medication_id;

-- Medication batches still in stock, earliest expiry first (FR-MED-2, FR-MED-3).
create view public.medication_batches with (security_invoker = true) as
select
  pu.id as purchase_id,
  pu.medication_id,
  pu.batch_no,
  pu.expiry_date,
  sum(sm.quantity) as on_hand
from public.purchases pu
join public.stock_movements sm on sm.purchase_id = pu.id
where pu.kind = 'medication'
group by pu.id, pu.medication_id, pu.batch_no, pu.expiry_date
having sum(sm.quantity) > 0;

-- ════════════════════════════════════════════════════════════════════
-- Row Level Security
-- ════════════════════════════════════════════════════════════════════

alter table public.roles enable row level security;
alter table public.role_permissions enable row level security;
alter table public.profiles enable row level security;
alter table public.farm_settings enable row level security;
alter table public.bird_types enable row level security;
alter table public.feed_types enable row level security;
alter table public.feed_targets enable row level security;
alter table public.medications enable row level security;
alter table public.products enable row level security;
alter table public.expense_categories enable row level security;
alter table public.adjustment_reasons enable row level security;
alter table public.pens enable row level security;
alter table public.staff_pens enable row level security;
alter table public.flocks enable row level security;
alter table public.customers enable row level security;
alter table public.suppliers enable row level security;
alter table public.purchases enable row level security;
alter table public.sales enable row level security;
alter table public.payments enable row level security;
alter table public.expenses enable row level security;
alter table public.production_records enable row level security;
alter table public.production_medications enable row level security;
alter table public.stock_adjustments enable row level security;
alter table public.stock_movements enable row level security;
alter table public.audit_log enable row level security;

-- Reference data and settings: readable by any active staff member, written by the owner.
do $$
declare
  t text;
begin
  foreach t in array array['roles', 'role_permissions', 'farm_settings', 'bird_types', 'feed_types', 'feed_targets',
                           'medications', 'products', 'expense_categories', 'adjustment_reasons']
  loop
    execute format($f$create policy "Staff can read" on public.%I for select to authenticated using ((select private.my_role()) is not null)$f$, t);
    execute format($f$create policy "Owner can add" on public.%I for insert to authenticated with check ((select private.can('admin', 'add'))))$f$, t);
    execute format($f$create policy "Owner can edit" on public.%I for update to authenticated using ((select private.can('admin', 'edit'))) with check ((select private.can('admin', 'edit'))))$f$, t);
    execute format($f$create policy "Owner can delete" on public.%I for delete to authenticated using ((select private.can('admin', 'delete'))))$f$, t);
  end loop;
end;
$$;

-- Profiles: you see yourself; managers and the owner see all staff; the owner edits anyone.
create policy "See own profile or all as admin viewer" on public.profiles for select to authenticated
  using (id = (select auth.uid()) or (select private.can('admin', 'view')));
create policy "Owner adds staff" on public.profiles for insert to authenticated
  with check ((select private.can('admin', 'add')));
create policy "Edit own profile or anyone as owner" on public.profiles for update to authenticated
  using (id = (select auth.uid()) or (select private.can('admin', 'edit')))
  with check (id = (select auth.uid()) or (select private.can('admin', 'edit')));

create policy "See own pen assignments or all as admin viewer" on public.staff_pens for select to authenticated
  using (profile_id = (select auth.uid()) or (select private.can('admin', 'view')));
-- The owner and the farm manager assign pens to attendants.
create policy "Managers assign pens" on public.staff_pens for insert to authenticated
  with check ((select private.is_manager()));
create policy "Managers unassign pens" on public.staff_pens for delete to authenticated
  using ((select private.is_manager()));

-- Pens and flocks: everyone working with production, stock or expenses sees the pens their scope
-- allows; managers manage them.
create policy "See pens in scope" on public.pens for select to authenticated
  using (private.can_pen('production', 'view', id)
         or (select private.can('sales', 'view')) or (select private.can('inventory', 'view')));
create policy "Managers add pens" on public.pens for insert to authenticated with check ((select private.is_manager()));
create policy "Managers edit pens" on public.pens for update to authenticated
  using ((select private.is_manager())) with check ((select private.is_manager()));

create policy "See flocks in scope" on public.flocks for select to authenticated
  using (private.can_pen('production', 'view', pen_id) or (select private.can('sales', 'view'))
         or (select private.can('purchases', 'view')));
create policy "Managers place flocks" on public.flocks for insert to authenticated with check ((select private.is_manager()));
create policy "Managers edit flocks" on public.flocks for update to authenticated
  using ((select private.is_manager())) with check ((select private.is_manager()));

-- Customers and suppliers. Store keepers need supplier names to receive deliveries.
create policy "See customers" on public.customers for select to authenticated
  using ((select private.can('parties', 'view')) or (select private.can('sales', 'view')));
create policy "Add customers" on public.customers for insert to authenticated
  with check ((select private.can('parties', 'add')) or (select private.can('sales', 'add')));
create policy "Edit customers" on public.customers for update to authenticated
  using ((select private.can('parties', 'edit'))) with check ((select private.can('parties', 'edit')));

create policy "See suppliers" on public.suppliers for select to authenticated
  using ((select private.can('parties', 'view')) or (select private.can('purchases', 'view')));
create policy "Add suppliers" on public.suppliers for insert to authenticated
  with check ((select private.can('parties', 'add')));
create policy "Edit suppliers" on public.suppliers for update to authenticated
  using ((select private.can('parties', 'edit'))) with check ((select private.can('parties', 'edit')));

-- Transactions. Soft-delete is an UPDATE of deleted_at, allowed for roles with delete access.
-- Rows already soft-deleted stay visible only to managers (for the audit trail).

create policy "See purchases" on public.purchases for select to authenticated
  using (
    (deleted_at is null or (select private.is_manager()))
    and (
      (select private.access('purchases', 'view')) = 'all'
      -- 'own' = the store keeper's deliveries: feed and medication orders.
      or ((select private.access('purchases', 'view')) = 'own' and kind in ('feed', 'medication'))
    )
  );
create policy "Record purchases" on public.purchases for insert to authenticated
  with check ((select private.access('purchases', 'add')) = 'all' and recorded_by = (select auth.uid()));
create policy "Edit or receive purchases" on public.purchases for update to authenticated
  using (
    ((select private.access('purchases', 'edit')) = 'all' and private.within_edit_window(recorded_by, created_at))
    or ((select private.access('purchases', 'edit')) = 'own' and kind in ('feed', 'medication') and deleted_at is null)
    or ((select private.can('purchases', 'delete')) and deleted_at is null)
  )
  with check (
    (select private.access('purchases', 'edit')) <> 'none' or (select private.can('purchases', 'delete'))
  );

create policy "See sales" on public.sales for select to authenticated
  using ((deleted_at is null or (select private.is_manager())) and (select private.can('sales', 'view')));
create policy "Record sales" on public.sales for insert to authenticated
  with check ((select private.can('sales', 'add')) and recorded_by = (select auth.uid()));
create policy "Edit sales" on public.sales for update to authenticated
  using (
    ((select private.can('sales', 'edit')) and private.within_edit_window(recorded_by, created_at))
    or ((select private.can('sales', 'delete')) and deleted_at is null)
    -- Managers approve or reject pending sales.
    or ((select private.is_manager()) and approval = 'pending')
  )
  with check ((select private.can('sales', 'edit')) or (select private.can('sales', 'delete')) or (select private.is_manager()));

create policy "See payments" on public.payments for select to authenticated
  using ((deleted_at is null or (select private.is_manager())) and (select private.can('payments', 'view')));
create policy "Record payments" on public.payments for insert to authenticated
  with check ((select private.can('payments', 'add')) and recorded_by = (select auth.uid()));
create policy "Edit payments" on public.payments for update to authenticated
  using (
    ((select private.can('payments', 'edit')) and private.within_edit_window(recorded_by, created_at))
    or ((select private.can('payments', 'delete')) and deleted_at is null)
  )
  with check ((select private.can('payments', 'edit')) or (select private.can('payments', 'delete')));

-- Expenses: attendants add (and see their own) expenses for the pens they record production for.
create policy "See expenses" on public.expenses for select to authenticated
  using (
    (deleted_at is null or (select private.is_manager()))
    and (
      (select private.access('expenses', 'view')) = 'all'
      or recorded_by = (select auth.uid())
    )
  );
create policy "Add expenses" on public.expenses for insert to authenticated
  with check (
    recorded_by = (select auth.uid())
    and (
      (select private.access('expenses', 'add')) = 'all'
      or ((select private.access('expenses', 'add')) = 'own' and supplier_id is null and pen_id is not null
          and private.can_pen('production', 'add', pen_id))
    )
  );
create policy "Edit expenses" on public.expenses for update to authenticated
  using (
    ((select private.can('expenses', 'edit')) and private.within_edit_window(recorded_by, created_at))
    or ((select private.can('expenses', 'delete')) and deleted_at is null)
  )
  with check ((select private.can('expenses', 'edit')) or (select private.can('expenses', 'delete')));

-- Production: pen attendants see and record their own pens; edits within the edit window.
create policy "See production in scope" on public.production_records for select to authenticated
  using ((deleted_at is null or (select private.is_manager())) and private.can_pen('production', 'view', pen_id));
create policy "Record production for pens in scope" on public.production_records for insert to authenticated
  with check (private.can_pen('production', 'add', pen_id) and recorded_by = (select auth.uid()));
create policy "Edit production in scope" on public.production_records for update to authenticated
  using (
    (private.can_pen('production', 'edit', pen_id) and private.within_edit_window(recorded_by, created_at))
    or ((select private.can('production', 'delete')) and deleted_at is null)
  )
  with check (private.can_pen('production', 'edit', pen_id) or (select private.can('production', 'delete')));

create policy "See medication given in scope" on public.production_medications for select to authenticated
  using (exists (select 1 from public.production_records pr where pr.id = production_record_id
                 and private.can_pen('production', 'view', pr.pen_id)));
create policy "Add medication lines in scope" on public.production_medications for insert to authenticated
  with check (exists (select 1 from public.production_records pr where pr.id = production_record_id
                      and private.can_pen('production', 'add', pr.pen_id)
                      and private.within_edit_window(pr.recorded_by, pr.created_at)));
create policy "Edit medication lines in scope" on public.production_medications for update to authenticated
  using (exists (select 1 from public.production_records pr where pr.id = production_record_id
                 and private.can_pen('production', 'edit', pr.pen_id)
                 and private.within_edit_window(pr.recorded_by, pr.created_at)))
  with check (exists (select 1 from public.production_records pr where pr.id = production_record_id
                      and private.can_pen('production', 'edit', pr.pen_id)));
create policy "Remove medication lines in scope" on public.production_medications for delete to authenticated
  using (exists (select 1 from public.production_records pr where pr.id = production_record_id
                 and private.can_pen('production', 'edit', pr.pen_id)
                 and private.within_edit_window(pr.recorded_by, pr.created_at)));

-- Stock: anyone who can view inventory or medication stock sees the ledger.
create policy "See stock adjustments" on public.stock_adjustments for select to authenticated
  using (case item when 'medication' then (select private.can('medication', 'view')) else (select private.can('inventory', 'view')) end);
create policy "Record counts and adjustments" on public.stock_adjustments for insert to authenticated
  with check (
    recorded_by = (select auth.uid())
    and case item when 'medication' then (select private.can('medication', 'add')) else (select private.can('inventory', 'add')) end
  );

create policy "See stock movements" on public.stock_movements for select to authenticated
  using (case item when 'medication' then (select private.can('medication', 'view')) else (select private.can('inventory', 'view')) end);

-- Audit log: managers and the owner only. Written by triggers.
create policy "Managers see the audit log" on public.audit_log for select to authenticated
  using ((select private.is_manager()));

-- ════════════════════════════════════════════════════════════════════
-- Grants. New tables are not exposed to the Data API automatically; grant only what's needed.
-- Signed-in staff only — nothing for anon.
-- ════════════════════════════════════════════════════════════════════

revoke all on all tables in schema public from anon;
revoke all on all sequences in schema public from anon;

grant select, insert, update, delete on
  public.roles, public.role_permissions, public.farm_settings, public.bird_types, public.feed_types, public.feed_targets,
  public.medications, public.products, public.expense_categories, public.adjustment_reasons, public.staff_pens,
  public.production_medications
  to authenticated;

-- Transactions are soft-deleted (update deleted_at), never hard-deleted by users.
grant select, insert, update on
  public.profiles, public.pens, public.flocks, public.customers, public.suppliers,
  public.purchases, public.sales, public.payments, public.expenses, public.production_records
  to authenticated;

grant select, insert on public.stock_adjustments to authenticated;
grant select on public.stock_movements, public.audit_log to authenticated;

grant select on
  public.production_daily, public.customer_statement, public.customer_balances,
  public.supplier_statement, public.supplier_balances, public.stock_daily, public.stock_levels,
  public.medication_batches
  to authenticated;

grant usage on all sequences in schema public to authenticated;
grant all on all tables in schema public to service_role;
grant all on all sequences in schema public to service_role;
