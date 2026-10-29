-- Payroll: employees (with or without a login), salary advances and interest-free loans, monthly
-- payroll runs with payslip lines, and self-service (staff see their own payslips and loans).
--
-- Approving a month posts one Labour expense for total gross pay. It has no pen, so like other
-- general costs it is shared across pens by bird-days. Advances and loans are not expenses: the
-- money is owed back, and repayments come off payslips.
-- Payslip items are open-ended (earning / deduction / loan / statutory), so pension or PAYE lines
-- can be added later without changing the schema.

-- ── Who can do what ─────────────────────────────────────────────────
insert into public.role_permissions (role_id, module, can_view, can_add, can_edit, can_delete, scope_note)
select r.id, 'payroll',
  case r.id when 'owner' then 'all' when 'sales_accounts' then 'all' else 'none' end::public.access_level,
  case r.id when 'owner' then 'all' when 'sales_accounts' then 'all' else 'none' end::public.access_level,
  case r.id when 'owner' then 'all' when 'sales_accounts' then 'all' else 'none' end::public.access_level,
  case r.id when 'owner' then 'all' else 'none' end::public.access_level,
  case r.id
    when 'owner' then 'Sets pay, approves loans and payroll'
    when 'sales_accounts' then 'Prepares payroll, records pay; loans need the owner'
    else 'Own payslips and loans only'
  end
from public.roles r
on conflict do nothing;

-- ── Employees ───────────────────────────────────────────────────────
create type public.pay_basis as enum ('monthly', 'daily', 'weekly');

create table public.employees (
  id bigint generated always as identity primary key,
  full_name text not null check (length(trim(full_name)) > 0),
  phone text,
  job_title text,
  -- Staff who use the app; casual workers have no login.
  profile_id uuid unique references public.profiles (id),
  pay_basis public.pay_basis not null default 'monthly',
  -- A month's salary, or the rate a day / a week for casuals.
  pay_rate numeric(14,2) not null default 0 check (pay_rate >= 0),
  started_on date not null default private.farm_today(),
  left_on date check (left_on is null or left_on >= started_on),
  bank_name text,
  account_number text,
  account_name text,
  notes text,
  is_active boolean not null default true,
  created_by uuid default auth.uid() references public.profiles (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ── Salary advances and loans (interest-free) ───────────────────────
create type public.loan_kind as enum ('advance', 'loan');
create type public.loan_status as enum ('pending', 'active', 'repaid', 'cancelled');
create sequence public.advance_ref_seq;
create sequence public.loan_ref_seq;

create table public.employee_loans (
  id bigint generated always as identity primary key,
  ref text not null unique,
  employee_id bigint not null references public.employees (id),
  kind public.loan_kind not null,
  amount numeric(14,2) not null check (amount > 0),
  issued_on date not null default private.farm_today(),
  payment_method public.payment_method,
  reason text,
  -- Taken off each payslip from first_month until repaid. An advance is repaid in one month.
  monthly_repayment numeric(14,2) not null check (monthly_repayment > 0),
  first_month date not null check (extract(day from first_month) = 1),
  status public.loan_status not null default 'pending',
  requested_by uuid default auth.uid() references public.profiles (id),
  approved_by uuid references public.profiles (id),
  approved_at timestamptz,
  created_at timestamptz not null default now(),
  check (kind = 'loan' or monthly_repayment = amount)
);
create index employee_loans_employee_idx on public.employee_loans (employee_id);

create function private.loan_ref()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.ref is null then
    new.ref := case new.kind when 'advance' then private.next_ref('ADV-', 'public.advance_ref_seq')
                             else private.next_ref('LN-', 'public.loan_ref_seq') end;
  end if;
  return new;
end;
$$;
create trigger set_ref before insert on public.employee_loans for each row execute function private.loan_ref();

-- ── Payroll runs, payslip lines and items ───────────────────────────
create type public.payroll_status as enum ('draft', 'approved');
create type public.payslip_item_kind as enum ('earning', 'deduction', 'loan', 'statutory');

create table public.payroll_runs (
  id bigint generated always as identity primary key,
  period date not null unique check (extract(day from period) = 1),
  status public.payroll_status not null default 'draft',
  prepared_by uuid default auth.uid() references public.profiles (id),
  approved_by uuid references public.profiles (id),
  approved_at timestamptz,
  expense_id bigint references public.expenses (id),
  notes text,
  created_at timestamptz not null default now()
);

create table public.payroll_lines (
  id bigint generated always as identity primary key,
  run_id bigint not null references public.payroll_runs (id) on delete cascade,
  employee_id bigint not null references public.employees (id),
  pay_basis public.pay_basis not null,
  rate numeric(14,2) not null check (rate >= 0),
  -- Days or weeks worked (casuals), or the share of the month employed (monthly staff, 0–1).
  units numeric(8,4) not null default 0 check (units >= 0),
  basic numeric(14,2) not null default 0,
  gross numeric(14,2) not null default 0,
  deductions numeric(14,2) not null default 0,
  net numeric(14,2) not null default 0,
  paid_on date,
  payment_method public.payment_method,
  payment_ref text,
  unique (run_id, employee_id)
);
create index payroll_lines_employee_idx on public.payroll_lines (employee_id);

create table public.payslip_items (
  id bigint generated always as identity primary key,
  line_id bigint not null references public.payroll_lines (id) on delete cascade,
  kind public.payslip_item_kind not null,
  label text not null check (length(trim(label)) > 0),
  amount numeric(14,2) not null check (amount >= 0),
  loan_id bigint references public.employee_loans (id),
  check ((kind = 'loan') = (loan_id is not null))
);
create index payslip_items_line_idx on public.payslip_items (line_id);
create index payslip_items_loan_idx on public.payslip_items (loan_id) where loan_id is not null;

-- ── Keep each line's totals right ───────────────────────────────────
create function private.recalc_payslip(line bigint)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  l public.payroll_lines;
  extra numeric;
  taken numeric;
  pay numeric;
begin
  select * into l from public.payroll_lines where id = line;
  if not found then
    return;
  end if;
  pay := round(l.rate * l.units, 2);
  select coalesce(sum(amount) filter (where kind = 'earning'), 0),
         coalesce(sum(amount) filter (where kind <> 'earning'), 0)
    into extra, taken
  from public.payslip_items where line_id = line;
  update public.payroll_lines pl
  set basic = pay, gross = pay + extra, deductions = taken, net = pay + extra - taken
  where pl.id = line
    and (pl.basic, pl.gross, pl.deductions, pl.net) is distinct from (pay, pay + extra, taken, pay + extra - taken);
end;
$$;

create function private.payslip_item_changed()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.recalc_payslip(coalesce(new.line_id, old.line_id));
  return null;
end;
$$;
create trigger totals after insert or update or delete on public.payslip_items
  for each row execute function private.payslip_item_changed();

create function private.payroll_line_changed()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.rate is distinct from old.rate or new.units is distinct from old.units then
    perform private.recalc_payslip(new.id);
  end if;
  return null;
end;
$$;
create trigger totals after update of rate, units on public.payroll_lines
  for each row execute function private.payroll_line_changed();

-- An approved month is locked; only the payment details of a line can still be recorded.
create function private.guard_payroll_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  run_status public.payroll_status;
begin
  if tg_table_name = 'payroll_runs' then
    if old.status = 'approved' and (new.status <> 'approved' or new.period <> old.period or new.expense_id is distinct from old.expense_id) then
      raise exception 'That payroll month is approved and locked' using errcode = '23514';
    end if;
    return new;
  end if;
  if tg_table_name = 'payroll_lines' then
    select status into run_status from public.payroll_runs where id = coalesce(new.run_id, old.run_id);
    if run_status = 'approved' and (tg_op <> 'UPDATE'
        or (new.rate, new.units, new.employee_id, new.pay_basis) is distinct from (old.rate, old.units, old.employee_id, old.pay_basis)) then
      -- Only the payment details can still be recorded.
      raise exception 'That payroll month is approved and locked' using errcode = '23514';
    end if;
  else
    select r.status into run_status from public.payroll_lines l join public.payroll_runs r on r.id = l.run_id
    where l.id = coalesce(new.line_id, old.line_id);
    if run_status = 'approved' then
      raise exception 'That payroll month is approved and locked' using errcode = '23514';
    end if;
  end if;
  return coalesce(new, old);
end;
$$;
create trigger guard_change before update on public.payroll_runs for each row execute function private.guard_payroll_change();
create trigger guard_change before insert or update or delete on public.payroll_lines for each row execute function private.guard_payroll_change();
create trigger guard_change before insert or update or delete on public.payslip_items for each row execute function private.guard_payroll_change();

-- Loans: only the owner can approve, cancel or change one that's running.
create function private.guard_loan_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (select auth.uid()) is null or private.is_owner() then
    if new.status = 'active' and (tg_op = 'INSERT' or old.status = 'pending') then
      new.approved_by := coalesce(new.approved_by, (select auth.uid()));
      new.approved_at := coalesce(new.approved_at, now());
    end if;
    return new;
  end if;
  if tg_op = 'INSERT' then
    if new.status <> 'pending' then
      raise exception 'Advances and loans need the owner''s approval' using errcode = '42501';
    end if;
    return new;
  end if;
  if old.status <> 'pending' or new.status <> 'pending' then
    raise exception 'Only the owner can approve or change a running advance or loan' using errcode = '42501';
  end if;
  return new;
end;
$$;
create trigger guard_change before insert or update on public.employee_loans for each row execute function private.guard_loan_change();

-- ── Loan balances ───────────────────────────────────────────────────
create view public.employee_loan_balances with (security_invoker = true) as
select
  ln.id as loan_id,
  ln.ref,
  ln.employee_id,
  ln.kind,
  ln.status,
  ln.amount,
  ln.monthly_repayment,
  ln.first_month,
  ln.issued_on,
  coalesce(sum(i.amount) filter (where r.status = 'approved'), 0) as repaid,
  ln.amount - coalesce(sum(i.amount) filter (where r.status = 'approved'), 0) as balance,
  ceil((ln.amount - coalesce(sum(i.amount) filter (where r.status = 'approved'), 0)) / ln.monthly_repayment)::integer as months_left
from public.employee_loans ln
left join public.payslip_items i on i.loan_id = ln.id
left join public.payroll_lines l on l.id = i.line_id
left join public.payroll_runs r on r.id = l.run_id
group by ln.id;

-- ── Preparing, approving and paying a month ─────────────────────────
-- Adds a line for each employee working that month and this month's loan repayments. Running it
-- again only adds what's missing, so changes made to the draft are kept.
create function public.prepare_payroll(period date)
returns public.payroll_runs
language plpgsql
security invoker
set search_path = ''
as $$
declare
  run public.payroll_runs;
  month_end date := (date_trunc('month', period) + interval '1 month - 1 day')::date;
  days_in_month integer := extract(day from (date_trunc('month', period) + interval '1 month - 1 day'))::integer;
  e record;
  ln record;
  line_id bigint;
begin
  if not private.can('payroll', 'add') then
    raise exception 'permission denied to prepare payroll' using errcode = '42501';
  end if;
  period := date_trunc('month', period)::date;
  select * into run from public.payroll_runs r where r.period = prepare_payroll.period;
  if not found then
    insert into public.payroll_runs (period) values (prepare_payroll.period) returning * into run;
  elsif run.status = 'approved' then
    raise exception 'That payroll month is approved and locked' using errcode = '23514';
  end if;

  for e in
    select * from public.employees x
    where x.started_on <= month_end and (x.left_on is null or x.left_on >= prepare_payroll.period)
      and (x.is_active or x.left_on is not null)
  loop
    if not exists (select 1 from public.payroll_lines pl where pl.run_id = run.id and pl.employee_id = e.id) then
      insert into public.payroll_lines (run_id, employee_id, pay_basis, rate, units)
      values (
        run.id, e.id, e.pay_basis, e.pay_rate,
        case e.pay_basis
          -- Monthly staff: the share of the month they were employed.
          when 'monthly' then round(((least(coalesce(e.left_on, month_end), month_end) - greatest(e.started_on, prepare_payroll.period) + 1)::numeric / days_in_month), 4)
          -- Casuals: days or weeks are entered by hand.
          else 0
        end
      )
      returning id into line_id;
      perform private.recalc_payslip(line_id);
    end if;
  end loop;

  -- This month's repayment on each running advance or loan, never more than what's left.
  for ln in
    select b.*, pl.id as pl_id from public.employee_loan_balances b
    join public.payroll_lines pl on pl.run_id = run.id and pl.employee_id = b.employee_id
    where b.status = 'active' and b.first_month <= prepare_payroll.period and b.balance > 0
      and not exists (select 1 from public.payslip_items i where i.line_id = pl.id and i.loan_id = b.loan_id)
  loop
    insert into public.payslip_items (line_id, kind, label, amount, loan_id)
    values (ln.pl_id, 'loan', case ln.kind when 'advance' then 'Salary advance ' else 'Loan repayment ' end || ln.ref,
            least(ln.monthly_repayment, ln.balance), ln.loan_id);
  end loop;
  return run;
end;
$$;

-- Owner: lock the month, post one Labour expense for total gross pay, close repaid loans.
create function public.approve_payroll(run_id bigint)
returns public.payroll_runs
language plpgsql
security invoker
set search_path = ''
as $$
declare
  run public.payroll_runs;
  total numeric;
  staff integer;
  expense bigint;
  category bigint;
begin
  if not private.is_owner() then
    raise exception 'Only the owner can approve payroll' using errcode = '42501';
  end if;
  select * into run from public.payroll_runs r where r.id = run_id;
  if not found or run.status <> 'draft' then
    raise exception 'That payroll month isn''t a draft' using errcode = '23514';
  end if;
  if exists (select 1 from public.payroll_lines l where l.run_id = run.id and l.net < 0) then
    raise exception 'A payslip has deductions larger than its pay; reduce them first' using errcode = '23514';
  end if;
  select coalesce(sum(gross), 0), count(*) into total, staff from public.payroll_lines l where l.run_id = run.id;
  if total > 0 then
    select id into category from public.expense_categories where name = 'Labour';
    insert into public.expenses (spent_on, category_id, description, amount, amount_paid, recorded_by)
    values (
      least((run.period + interval '1 month - 1 day')::date, private.farm_today()),
      category,
      'Payroll · ' || to_char(run.period, 'FMMonth YYYY') || ' (' || staff || ' staff)',
      total, total, (select auth.uid())
    )
    returning id into expense;
  end if;
  update public.payroll_runs r
  set status = 'approved', approved_by = (select auth.uid()), approved_at = now(), expense_id = expense
  where r.id = run.id
  returning * into run;
  update public.employee_loans ln set status = 'repaid'
  where ln.status = 'active' and exists (select 1 from public.employee_loan_balances b where b.loan_id = ln.id and b.balance <= 0);
  return run;
end;
$$;

-- Record net pay going out for one or more payslips of an approved month.
create function public.pay_payroll_lines(line_ids bigint[], paid_on date, method public.payment_method, reference text default null)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if not private.can('payroll', 'edit') then
    raise exception 'permission denied to record pay' using errcode = '42501';
  end if;
  if exists (select 1 from public.payroll_lines l join public.payroll_runs r on r.id = l.run_id
             where l.id = any(line_ids) and r.status <> 'approved') then
    raise exception 'Approve the month before recording pay' using errcode = '23514';
  end if;
  update public.payroll_lines l
  set paid_on = pay_payroll_lines.paid_on, payment_method = method, payment_ref = reference
  where l.id = any(line_ids);
end;
$$;

revoke execute on function public.prepare_payroll(date) from public, anon;
revoke execute on function public.approve_payroll(bigint) from public, anon;
revoke execute on function public.pay_payroll_lines(bigint[], date, public.payment_method, text) from public, anon;
grant execute on function public.prepare_payroll(date) to authenticated;
grant execute on function public.approve_payroll(bigint) to authenticated;
grant execute on function public.pay_payroll_lines(bigint[], date, public.payment_method, text) to authenticated;

-- ── Row-level security ──────────────────────────────────────────────
-- Payroll staff see everything; everyone else sees only their own employee record, loans and
-- payslips from approved months.
create function private.my_employee_id()
returns bigint
language sql
stable
security definer
set search_path = ''
as $$ select e.id from public.employees e where e.profile_id = (select auth.uid()) $$;

alter table public.employees enable row level security;
alter table public.employee_loans enable row level security;
alter table public.payroll_runs enable row level security;
alter table public.payroll_lines enable row level security;
alter table public.payslip_items enable row level security;

create policy "See employees" on public.employees for select to authenticated
  using ((select private.can('payroll', 'view')) or profile_id = (select auth.uid()));
create policy "Add employees" on public.employees for insert to authenticated
  with check ((select private.can('payroll', 'add')));
create policy "Edit employees" on public.employees for update to authenticated
  using ((select private.can('payroll', 'edit'))) with check ((select private.can('payroll', 'edit')));

create policy "See loans" on public.employee_loans for select to authenticated
  using ((select private.can('payroll', 'view')) or employee_id = (select private.my_employee_id()));
create policy "Request loans" on public.employee_loans for insert to authenticated
  with check ((select private.can('payroll', 'add')));
create policy "Change loans" on public.employee_loans for update to authenticated
  using ((select private.can('payroll', 'edit'))) with check ((select private.can('payroll', 'edit')));

create policy "See payroll months" on public.payroll_runs for select to authenticated
  using ((select private.can('payroll', 'view'))
         or (status = 'approved' and exists (select 1 from public.payroll_lines l where l.run_id = payroll_runs.id and l.employee_id = (select private.my_employee_id()))));
create policy "Prepare payroll months" on public.payroll_runs for insert to authenticated
  with check ((select private.can('payroll', 'add')) and status = 'draft');
create policy "Edit payroll months" on public.payroll_runs for update to authenticated
  using ((select private.can('payroll', 'edit')))
  with check (status = 'draft' or (select private.is_owner()));

create policy "See payslips" on public.payroll_lines for select to authenticated
  using ((select private.can('payroll', 'view'))
         or (employee_id = (select private.my_employee_id())
             and exists (select 1 from public.payroll_runs r where r.id = run_id and r.status = 'approved')));
create policy "Add payslips" on public.payroll_lines for insert to authenticated
  with check ((select private.can('payroll', 'add')));
create policy "Edit payslips" on public.payroll_lines for update to authenticated
  using ((select private.can('payroll', 'edit'))) with check ((select private.can('payroll', 'edit')));
create policy "Remove payslips" on public.payroll_lines for delete to authenticated
  using ((select private.can('payroll', 'edit')));

create policy "See payslip items" on public.payslip_items for select to authenticated
  using (exists (select 1 from public.payroll_lines l where l.id = line_id));
create policy "Add payslip items" on public.payslip_items for insert to authenticated
  with check ((select private.can('payroll', 'edit')));
create policy "Edit payslip items" on public.payslip_items for update to authenticated
  using ((select private.can('payroll', 'edit'))) with check ((select private.can('payroll', 'edit')));
create policy "Remove payslip items" on public.payslip_items for delete to authenticated
  using ((select private.can('payroll', 'edit')));

grant select, insert, update on public.employees, public.employee_loans, public.payroll_runs to authenticated;
grant select, insert, update, delete on public.payroll_lines, public.payslip_items to authenticated;
grant select on public.employee_loan_balances to authenticated;
grant usage on sequence public.advance_ref_seq, public.loan_ref_seq to authenticated;

create trigger set_updated_at before update on public.employees for each row execute function private.set_updated_at();
create trigger audit after insert or update or delete on public.employees for each row execute function private.audit();
create trigger audit after insert or update or delete on public.employee_loans for each row execute function private.audit();
create trigger audit after insert or update or delete on public.payroll_runs for each row execute function private.audit();
create trigger audit after insert or update or delete on public.payroll_lines for each row execute function private.audit();
create trigger audit after insert or update or delete on public.payslip_items for each row execute function private.audit();

-- ── Everyone with a login starts as an employee (pay to be filled in) ─
insert into public.employees (full_name, phone, job_title, profile_id, pay_basis, pay_rate, started_on, is_active)
select p.full_name, p.phone, r.name, p.id, 'monthly', 0, p.created_at::date, p.is_active
from public.profiles p
left join public.roles r on r.id = p.role_id
where not exists (select 1 from public.employees e where e.profile_id = p.id);

grant execute on all functions in schema private to authenticated, service_role;
revoke execute on all functions in schema private from public, anon;
