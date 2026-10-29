-- Fixes from the integration review.
--
-- 1. A payment can say which sale it's for. "Record a payment" on a sale now saves a payment row
--    (money in, dated the day it's received) instead of editing the sale, which the edit window
--    usually refused without an error. The app applies such a payment to that sale first.
-- 2. The audit log keeps whole rows, so salary, loan and finance changes were readable by anyone
--    who can read the log (managers). Those rows now need payroll / finance access too.
-- 3. Signed-out visitors had read grants on the newer tables (no rule let them see a row, but
--    there's no reason for the grant).

-- ── 1. Payments for a particular sale ───────────────────────────────
alter table public.payments add column sale_id bigint references public.sales (id);
alter table public.payments add constraint payments_sale_is_money_in check (sale_id is null or direction = 'in');
create index payments_sale_idx on public.payments (sale_id) where sale_id is not null;
comment on column public.payments.sale_id is 'The sale this payment was taken for (applied to it first); null for general payments that clear the oldest bills.';

-- ── 2. Audit rows follow the module they belong to ──────────────────
drop policy if exists "Managers see the audit log" on public.audit_log;
do $$
declare
  p record;
begin
  -- Replace whatever the select rule is called.
  for p in select policyname from pg_policies where schemaname = 'public' and tablename = 'audit_log' and cmd = 'SELECT' loop
    execute format('drop policy %I on public.audit_log', p.policyname);
  end loop;
end;
$$;
create policy "Managers see the audit log" on public.audit_log for select to authenticated
  using (
    (select private.is_manager())
    and case
      when table_name in ('employees', 'employee_loans', 'payroll_runs', 'payroll_lines', 'payslip_items') then (select private.can('payroll', 'view'))
      when table_name in ('fixed_assets', 'finance_entries') then (select private.can('finance', 'view'))
      else true
    end
  );

-- ── 3. Nothing for signed-out visitors ──────────────────────────────
revoke all on public.sale_allocations, public.flock_placements, public.bird_stock, public.employees, public.employee_loans,
  public.payroll_runs, public.payroll_lines, public.payslip_items, public.employee_loan_balances,
  public.fixed_assets, public.finance_entries
  from anon;
alter default privileges in schema public revoke all on tables from anon;
