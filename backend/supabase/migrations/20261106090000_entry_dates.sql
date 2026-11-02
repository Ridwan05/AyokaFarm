-- Daily entry dates.
--
-- The app records an entry for the farm's today, but the database accepted any date, so an entry for
-- another day could be written straight through the API by anyone allowed to record. Now:
-- 1. no entry for a future day, or for a day before the flock was placed;
-- 2. an earlier day (filling in a missed entry) is for the farm manager and owner only.
-- Existing entries keep their dates; corrections of an old entry are unaffected unless its date changes.

create or replace function private.production_flock_matches_pen()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  fl public.flocks;
begin
  select * into fl from public.flocks f where f.id = new.flock_id and f.pen_id = new.pen_id;
  if not found then
    raise exception 'That flock is not in this pen' using errcode = '23514';
  end if;
  if fl.closed_on is not null and new.record_date > fl.closed_on then
    raise exception 'Flock % was closed on %', fl.code, to_char(fl.closed_on, 'DD Mon YYYY') using errcode = '23514';
  end if;
  if tg_op = 'INSERT' or new.record_date is distinct from old.record_date then
    if new.record_date > private.farm_today() then
      raise exception 'An entry can''t be for a future day' using errcode = '23514';
    end if;
    if new.record_date < fl.placed_on then
      raise exception 'Flock % was placed on %', fl.code, to_char(fl.placed_on, 'DD Mon YYYY') using errcode = '23514';
    end if;
    if new.record_date < private.farm_today() and not private.is_manager() then
      raise exception 'Only the farm manager or owner can record an earlier day' using errcode = '42501';
    end if;
  end if;
  return new;
end;
$$;

grant execute on all functions in schema private to authenticated, service_role;
revoke execute on all functions in schema private from public, anon;
