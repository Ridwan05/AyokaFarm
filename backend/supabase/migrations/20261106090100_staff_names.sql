-- Staff names for everyone signed in.
--
-- Profiles are readable only by the owner and farm manager, so other roles saw "Someone" or a blank
-- wherever the app names who recorded, approved or should be asked about something. This gives every
-- signed-in member of staff the names and roles of their colleagues — not phone numbers or anything else.

create or replace function private.staff_names()
returns table (id uuid, full_name text, role_id text, is_active boolean)
language sql
stable
security definer
set search_path = ''
as $$
  select p.id, p.full_name, p.role_id, p.is_active
  from public.profiles p
  where (select auth.uid()) is not null
$$;

create or replace function public.staff_names()
returns table (id uuid, full_name text, role_id text, is_active boolean)
language sql
stable
security invoker
set search_path = ''
as $$
  select * from private.staff_names()
$$;

revoke execute on function public.staff_names() from public, anon;
grant execute on function public.staff_names() to authenticated;
grant execute on all functions in schema private to authenticated, service_role;
revoke execute on all functions in schema private from public, anon;
