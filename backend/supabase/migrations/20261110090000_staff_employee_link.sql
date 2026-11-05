-- Staff logins and employee records stay one person.
--
-- Adding a staff member always made a fresh employee record, so someone already on the
-- payroll ended up listed twice. And a name changed in Employees never reached their login.
--
-- From now on:
-- * link_staff_employee() lets the owner attach a new login to an existing employee
--   (the blank record the new-user trigger made is removed);
-- * renaming an employee renames their login, as renaming a login already renamed the employee;
-- * a login change only copies the fields that changed, so a custom job title survives a rename.

-- Keep the employee's name, phone and job in step with the login, copying only what changed.
create or replace function private.profile_employee_sync()
 returns trigger
 language plpgsql
 security definer
 set search_path to ''
as $function$
begin
  if new.full_name is distinct from old.full_name then
    update public.employees e set full_name = new.full_name
    where e.profile_id = new.id and e.full_name is distinct from new.full_name;
  end if;
  if new.phone is distinct from old.phone and new.phone is not null then
    update public.employees e set phone = new.phone where e.profile_id = new.id;
  end if;
  if new.role_id is distinct from old.role_id then
    update public.employees e
    set job_title = coalesce((select r.name from public.roles r where r.id = new.role_id), e.job_title)
    where e.profile_id = new.id;
  end if;
  return null;
end;
$function$;

-- Renaming an employee renames their login. Only the name: the employee's phone is a contact
-- number, the login's is what they sign in with.
create or replace function private.employee_profile_sync()
 returns trigger
 language plpgsql
 security definer
 set search_path to ''
as $function$
begin
  update public.profiles p set full_name = new.full_name
  where p.id = new.profile_id and p.full_name is distinct from new.full_name;
  return null;
end;
$function$;

drop trigger if exists profile_sync on public.employees;
create trigger profile_sync
  after update of full_name on public.employees
  for each row
  when (new.full_name is distinct from old.full_name and new.profile_id is not null)
  execute function private.employee_profile_sync();

-- Owner only: attach a new login to someone already on the payroll, in place of the blank
-- employee record the new-user trigger made for it.
create or replace function public.link_staff_employee(profile uuid, employee bigint)
 returns void
 language plpgsql
 security definer
 set search_path to ''
as $function$
declare
  target public.employees;
  blank bigint;
begin
  if not private.is_owner() then
    raise exception 'Only an owner can link a login to an employee' using errcode = '42501';
  end if;
  select * into target from public.employees e where e.id = employee for update;
  if target.id is null then
    raise exception 'That employee wasn’t found';
  end if;
  if target.profile_id = profile then
    return;
  end if;
  if target.profile_id is not null then
    raise exception '% already has an app login', target.full_name;
  end if;
  if target.left_on is not null or not target.is_active then
    raise exception '% has left; mark them as working again first', target.full_name;
  end if;

  -- The record made when the login was created; remove it only while nothing points at it.
  select e.id into blank from public.employees e where e.profile_id = profile;
  if blank is not null then
    if exists (select 1 from public.payroll_lines l where l.employee_id = blank)
       or exists (select 1 from public.employee_loans l where l.employee_id = blank) then
      raise exception 'This login already has payslips or loans under another employee record';
    end if;
    delete from public.employees e where e.id = blank;
  end if;

  update public.employees e
  set profile_id = profile,
      job_title = coalesce(nullif(trim(e.job_title), ''),
                           (select r.name from public.profiles p join public.roles r on r.id = p.role_id where p.id = profile))
  where e.id = employee;

  -- The login takes the employee's name, so both lists show the same person.
  update public.profiles p set full_name = target.full_name
  where p.id = profile and p.full_name is distinct from target.full_name;
end;
$function$;

revoke execute on function public.link_staff_employee(uuid, bigint) from public, anon;
grant execute on function public.link_staff_employee(uuid, bigint) to authenticated, service_role;
revoke execute on function private.employee_profile_sync() from public, anon;
