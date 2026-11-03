-- Back-dated production and sales are for the owner only.
--
-- 1. Daily entries for an earlier day were allowed for the owner and farm manager; now the owner only
--    (entering the farm's history from before the app). Future days and days before the flock was
--    placed stay refused for everyone.
-- 2. Sales had no date rule: any date could be sent straight to the database. Now a sale can't be for a
--    future day, and only the owner can record one for an earlier day. Existing sales, approvals and
--    voids are unaffected (their date doesn't change).

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
    if new.record_date < private.farm_today() and not private.is_owner() then
      raise exception 'Only the owner can record an earlier day' using errcode = '42501';
    end if;
  end if;
  return new;
end;
$$;

create or replace function private.sale_date_allowed()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' or new.sold_on is distinct from old.sold_on then
    if new.sold_on > private.farm_today() then
      raise exception 'A sale can''t be for a future day' using errcode = '23514';
    end if;
    if new.sold_on < private.farm_today() and not private.is_owner() then
      raise exception 'Only the owner can record an earlier day' using errcode = '42501';
    end if;
  end if;
  return new;
end;
$$;

create trigger sale_date before insert or update of sold_on on public.sales
  for each row execute function private.sale_date_allowed();

grant execute on all functions in schema private to authenticated, service_role;
revoke execute on all functions in schema private from public, anon;
