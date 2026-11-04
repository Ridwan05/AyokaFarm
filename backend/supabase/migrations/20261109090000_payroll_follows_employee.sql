-- Draft payslips follow corrections to the employee record.
--
-- prepare_payroll() copies each person's pay basis, rate and share of the month onto
-- their payslip when the month is first prepared, and never refreshes it. So correcting
-- someone's start date or pay afterwards left the draft payslip on the old figures
-- (October 2026: three staff stuck at "4 of 31 days" and ₦0).
--
-- From now on, while a month is still a draft, changing an employee's start or leaving
-- date, pay rate or pay basis updates their payslip too. Payslips where someone typed
-- different days or a different rate by hand are left alone, and approved months are
-- locked as before.

-- Share of a month a monthly employee is on the books, the same sum prepare_payroll() uses.
create or replace function private.month_share(started date, left_on date, period date)
 returns numeric
 language sql
 immutable
 set search_path to ''
as $function$
  select greatest(0, round(
    (least(coalesce(left_on, (period + interval '1 month - 1 day')::date), (period + interval '1 month - 1 day')::date)
      - greatest(started, period) + 1)::numeric
    / extract(day from period + interval '1 month - 1 day'), 4))
$function$;

-- Copies a corrected employee record onto their draft payslips, unless a payslip was edited by hand.
create or replace function private.employee_pay_changed()
 returns trigger
 language plpgsql
 security definer
 set search_path to ''
as $function$
declare
  l record;
begin
  for l in
    select pl.id, pl.units, pl.rate, pl.pay_basis, r.period
    from public.payroll_lines pl
    join public.payroll_runs r on r.id = pl.run_id
    where pl.employee_id = new.id and r.status = 'draft'
  loop
    -- Still exactly what the old record produced? Then nobody has changed it by hand.
    if l.rate = old.pay_rate and l.pay_basis = old.pay_basis
       and (old.pay_basis <> 'monthly' or l.units = private.month_share(old.started_on, old.left_on, l.period)) then
      update public.payroll_lines
      set rate = new.pay_rate,
          pay_basis = new.pay_basis,
          -- Casuals' days or weeks are always typed in, so only monthly staff get a new share.
          units = case when new.pay_basis = 'monthly' then private.month_share(new.started_on, new.left_on, l.period)
                       when old.pay_basis = 'monthly' then 0
                       else l.units end
      where id = l.id;
      perform private.recalc_payslip(l.id);
    end if;
  end loop;
  return null;
end;
$function$;

revoke execute on function private.month_share(date, date, date) from anon, public;
revoke execute on function private.employee_pay_changed() from anon, public;
grant execute on function private.month_share(date, date, date) to authenticated, service_role;
grant execute on function private.employee_pay_changed() to authenticated, service_role;

drop trigger if exists pay_follows_employee on public.employees;
create trigger pay_follows_employee
  after update of started_on, left_on, pay_rate, pay_basis on public.employees
  for each row
  when ((old.started_on, old.left_on, old.pay_rate, old.pay_basis) is distinct from (new.started_on, new.left_on, new.pay_rate, new.pay_basis))
  execute function private.employee_pay_changed();

-- One-time repair: draft payslips still at ₦0 for people whose record now has a pay rate.
-- (Owners with no salary keep their ₦0 rate, so they're not touched.)
do $repair$
declare
  l record;
begin
  for l in
    select pl.id, r.period, e.pay_basis, e.pay_rate, e.started_on, e.left_on
    from public.payroll_lines pl
    join public.payroll_runs r on r.id = pl.run_id
    join public.employees e on e.id = pl.employee_id
    where r.status = 'draft' and pl.rate = 0 and e.pay_rate > 0
  loop
    update public.payroll_lines
    set rate = l.pay_rate,
        pay_basis = l.pay_basis,
        units = case when l.pay_basis = 'monthly' then private.month_share(l.started_on, l.left_on, l.period) else units end
    where id = l.id;
    perform private.recalc_payslip(l.id);
  end loop;
end
$repair$;
