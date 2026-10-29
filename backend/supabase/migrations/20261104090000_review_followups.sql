-- Follow-ups from the integration review.
--
-- 1. Expense receipts: a private storage bucket. Staff who can add expenses upload; anyone who can
--    see expenses can view. Files are stored as receipts/<expense ref>/<file name>.
-- 2. New staff get an employee record automatically (payroll and My pay), not just the people who
--    existed when payroll was added.
-- 3. Sales & Accounts can read production and stock (not change them), so the reports, P&L and
--    financial statements they see aren't missing egg, feed and medication figures.
-- 4. The owner role's permissions can't be changed, even through the API.

-- ── 1. Receipts bucket ──────────────────────────────────────────────
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('receipts', 'receipts', false, 10485760, array['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'application/pdf'])
on conflict (id) do nothing;

create policy "Staff who add expenses upload receipts" on storage.objects for insert to authenticated
  with check (bucket_id = 'receipts' and (select private.can('expenses', 'add')));
create policy "Staff who see expenses view receipts" on storage.objects for select to authenticated
  using (bucket_id = 'receipts' and (select private.can('expenses', 'view')));
create policy "Staff who edit expenses replace receipts" on storage.objects for update to authenticated
  using (bucket_id = 'receipts' and (select private.can('expenses', 'edit')))
  with check (bucket_id = 'receipts' and (select private.can('expenses', 'edit')));
create policy "Owner removes receipts" on storage.objects for delete to authenticated
  using (bucket_id = 'receipts' and (select private.can('expenses', 'delete')));

-- ── 2. Every staff member is an employee ────────────────────────────
create function private.profile_employee()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.employees (full_name, phone, job_title, profile_id, pay_basis, pay_rate, started_on, is_active)
  select new.full_name, new.phone, (select r.name from public.roles r where r.id = new.role_id), new.id,
         'monthly', 0, private.farm_today(), new.is_active
  where not exists (select 1 from public.employees e where e.profile_id = new.id);
  return null;
end;
$$;
create trigger employee after insert on public.profiles
  for each row execute function private.profile_employee();

-- Keep the employee's name, phone and job in step with the login.
create function private.profile_employee_sync()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (new.full_name, new.phone, new.role_id) is distinct from (old.full_name, old.phone, old.role_id) then
    update public.employees e
    set full_name = new.full_name,
        phone = coalesce(new.phone, e.phone),
        job_title = coalesce((select r.name from public.roles r where r.id = new.role_id), e.job_title)
    where e.profile_id = new.id;
  end if;
  return null;
end;
$$;
create trigger employee_sync after update on public.profiles
  for each row execute function private.profile_employee_sync();

-- Anyone added since payroll went in.
insert into public.employees (full_name, phone, job_title, profile_id, pay_basis, pay_rate, started_on, is_active)
select p.full_name, p.phone, r.name, p.id, 'monthly', 0, p.created_at::date, p.is_active
from public.profiles p
left join public.roles r on r.id = p.role_id
where not exists (select 1 from public.employees e where e.profile_id = p.id);

-- ── 3. Accounts can read production and stock ───────────────────────
update public.role_permissions
set can_view = 'all', scope_note = 'Read only, for reports and statements'
where role_id = 'sales_accounts' and module in ('production', 'inventory', 'medication') and can_view = 'none';

-- ── 4. The owner role is locked ─────────────────────────────────────
create function private.guard_owner_permissions()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if coalesce(new.role_id, old.role_id) = 'owner' and (select auth.uid()) is not null then
    raise exception 'The owner role’s permissions can’t be changed' using errcode = '42501';
  end if;
  return coalesce(new, old);
end;
$$;
create trigger owner_locked before insert or update or delete on public.role_permissions
  for each row execute function private.guard_owner_permissions();

grant execute on all functions in schema private to authenticated, service_role;
revoke execute on all functions in schema private from public, anon;
