-- Records the financial statements need beyond trade: fixed assets, owner's capital and drawings,
-- loans, other income and opening cash/bank at go-live; and where each expense category sits on the
-- Income Statement. The statements themselves are calculated in the app (accrual basis).

-- ── Who can do what ─────────────────────────────────────────────────
insert into public.role_permissions (role_id, module, can_view, can_add, can_edit, can_delete, scope_note)
select r.id, 'finance',
  case r.id when 'owner' then 'all' when 'sales_accounts' then 'all' else 'none' end::public.access_level,
  case r.id when 'owner' then 'all' when 'sales_accounts' then 'all' else 'none' end::public.access_level,
  case r.id when 'owner' then 'all' when 'sales_accounts' then 'all' else 'none' end::public.access_level,
  case r.id when 'owner' then 'all' else 'none' end::public.access_level,
  case r.id
    when 'owner' then 'Financial statements, assets, capital and loans'
    when 'sales_accounts' then 'Financial statements; records assets, capital and loans'
    else 'No access'
  end
from public.roles r
on conflict do nothing;

-- ── Where each expense category goes on the Income Statement ────────
alter table public.expense_categories
  add column statement_line text not null default 'misc'
  check (statement_line in ('labour', 'utilities', 'supplies', 'healthcare', 'maintenance', 'transport', 'marketing', 'permits', 'misc'));
comment on column public.expense_categories.statement_line is 'Income Statement line: labour, utilities, supplies, healthcare, maintenance (operating); transport, marketing, permits, misc (overheads).';

update public.expense_categories set statement_line = case
  when name ilike 'labour%' or name ilike 'wage%' or name ilike 'salar%' then 'labour'
  when name ilike '%fuel%' or name ilike '%power%' or name ilike '%utilit%' or name ilike '%electric%' or name ilike '%water%' then 'utilities'
  when name ilike '%equipment%' or name ilike '%suppl%' or name ilike '%packag%' or name ilike '%bedding%' then 'supplies'
  when name ilike '%vet%' then 'healthcare'
  when name ilike '%repair%' or name ilike '%maint%' then 'maintenance'
  when name ilike '%transport%' or name ilike '%delivery%' then 'transport'
  when name ilike '%market%' or name ilike '%advert%' then 'marketing'
  when name ilike '%permit%' or name ilike '%licen%' or name ilike '%tax%' then 'permits'
  else 'misc'
end;

-- ── Fixed assets ────────────────────────────────────────────────────
create type public.asset_category as enum ('land', 'buildings', 'equipment', 'machinery', 'vehicles');

create table public.fixed_assets (
  id bigint generated always as identity primary key,
  name text not null check (length(trim(name)) > 0),
  category public.asset_category not null,
  acquired_on date not null,
  cost numeric(14,2) not null check (cost >= 0),
  -- Straight-line over this many months; null for land, which isn't depreciated.
  useful_life_months integer check (useful_life_months is null or useful_life_months > 0),
  salvage_value numeric(14,2) not null default 0 check (salvage_value >= 0),
  -- How it was paid: cash or bank; null if it was already owned at go-live (an opening asset).
  paid_from text check (paid_from in ('cash', 'bank')),
  disposed_on date check (disposed_on is null or disposed_on >= acquired_on),
  disposal_amount numeric(14,2) check (disposal_amount is null or disposal_amount >= 0),
  disposal_account text check (disposal_account in ('cash', 'bank')),
  notes text,
  created_by uuid default auth.uid() references public.profiles (id),
  created_at timestamptz not null default now(),
  check (category <> 'land' or useful_life_months is null),
  check (salvage_value <= cost)
);

-- ── Capital, drawings, loans, other income, opening cash ────────────
create type public.finance_kind as enum ('opening_cash', 'capital_in', 'drawing', 'loan_received', 'loan_repaid', 'other_income');
create sequence public.finance_ref_seq;

create table public.finance_entries (
  id bigint generated always as identity primary key,
  ref text not null unique default private.next_ref('FE-', 'public.finance_ref_seq'),
  entry_on date not null default private.farm_today(),
  kind public.finance_kind not null,
  amount numeric(14,2) not null check (amount > 0),
  account text not null check (account in ('cash', 'bank')),
  -- The bank or partner for loans; who paid in, for capital.
  counterparty text,
  -- Loans: due within a year (short) or longer (long).
  loan_term text check (loan_term in ('short', 'long')),
  notes text,
  recorded_by uuid default auth.uid() references public.profiles (id),
  created_at timestamptz not null default now(),
  -- Loans say who lent and whether they're due within a year.
  check (kind not in ('loan_received', 'loan_repaid') or (counterparty is not null and loan_term is not null))
);
create index finance_entries_kind_idx on public.finance_entries (kind, entry_on);

-- ── Row-level security ──────────────────────────────────────────────
alter table public.fixed_assets enable row level security;
alter table public.finance_entries enable row level security;

create policy "See fixed assets" on public.fixed_assets for select to authenticated using ((select private.can('finance', 'view')));
create policy "Add fixed assets" on public.fixed_assets for insert to authenticated with check ((select private.can('finance', 'add')));
create policy "Edit fixed assets" on public.fixed_assets for update to authenticated
  using ((select private.can('finance', 'edit'))) with check ((select private.can('finance', 'edit')));
create policy "Remove fixed assets" on public.fixed_assets for delete to authenticated using ((select private.can('finance', 'delete')));

create policy "See finance entries" on public.finance_entries for select to authenticated using ((select private.can('finance', 'view')));
create policy "Add finance entries" on public.finance_entries for insert to authenticated with check ((select private.can('finance', 'add')));
create policy "Edit finance entries" on public.finance_entries for update to authenticated
  using ((select private.can('finance', 'edit'))) with check ((select private.can('finance', 'edit')));
create policy "Remove finance entries" on public.finance_entries for delete to authenticated using ((select private.can('finance', 'delete')));

grant select, insert, update, delete on public.fixed_assets, public.finance_entries to authenticated;
grant usage on sequence public.finance_ref_seq to authenticated;

create trigger audit after insert or update or delete on public.fixed_assets for each row execute function private.audit();
create trigger audit after insert or update or delete on public.finance_entries for each row execute function private.audit();
