-- Fix: the read rules on payroll_runs and payroll_lines each looked up the other table, so
-- Postgres refused every query on them ("infinite recursion detected in policy"). The cross-table
-- checks now go through private helpers that read without row-level security.

create function private.payroll_run_approved(run bigint)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$ select exists (select 1 from public.payroll_runs r where r.id = run and r.status = 'approved') $$;

create function private.has_my_payslip(run bigint)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.payroll_lines l
    where l.run_id = run and l.employee_id = private.my_employee_id()
  )
$$;

drop policy "See payroll months" on public.payroll_runs;
create policy "See payroll months" on public.payroll_runs for select to authenticated
  using ((select private.can('payroll', 'view')) or (status = 'approved' and private.has_my_payslip(id)));

drop policy "See payslips" on public.payroll_lines;
create policy "See payslips" on public.payroll_lines for select to authenticated
  using ((select private.can('payroll', 'view'))
         or (employee_id = (select private.my_employee_id()) and private.payroll_run_approved(run_id)));

grant execute on all functions in schema private to authenticated, service_role;
revoke execute on all functions in schema private from public, anon;
