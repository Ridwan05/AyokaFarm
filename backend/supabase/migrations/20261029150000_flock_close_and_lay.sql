-- Closing flocks (owners only), marking when a layer flock starts laying, and the setting for
-- spreading layer rearing cost over the laying period in the P&L.

-- ── Flocks ──────────────────────────────────────────────────────────
alter table public.flocks
  add column laying_started_on date,
  add column close_reason text check (close_reason in ('sold_out', 'culled', 'moved', 'died', 'other')),
  add column close_note text;

comment on column public.flocks.laying_started_on is 'Point of lay: first day counted as laying. Rearing cost runs from placed_on to the day before.';
comment on column public.flocks.close_reason is 'Why the flock was closed: sold_out, culled, moved, died or other.';

-- ── Settings ────────────────────────────────────────────────────────
alter table public.farm_settings
  add column spread_rearing_cost boolean not null default false,
  add column layer_laying_weeks integer not null default 60 check (layer_laying_weeks > 0);

comment on column public.farm_settings.spread_rearing_cost is 'P&L opens in the view that spreads each layer flock''s rearing cost over its laying period.';
comment on column public.farm_settings.layer_laying_weeks is 'Expected laying life of a layer flock, in weeks, for spreading its rearing cost.';

-- ── Rules for changing a flock ──────────────────────────────────────
-- Managers may edit flocks (existing policy); closing or re-opening one is for the owner only.
create function private.guard_flock_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  last_entry date;
  lays boolean;
begin
  if new.status is distinct from old.status or new.closed_on is distinct from old.closed_on then
    -- No signed-in user means the SQL Editor or a server script, which only the owner can reach.
    if (select auth.uid()) is not null and coalesce(private.my_role(), '') <> 'owner' then
      raise exception 'Only the owner can close or re-open a flock' using errcode = '42501';
    end if;
    if new.status = 'closed' then
      if new.closed_on > private.farm_today() then
        raise exception 'The closing date can''t be in the future' using errcode = '23514';
      end if;
      select max(pr.record_date) into last_entry from public.production_records pr
      where pr.flock_id = new.id and pr.deleted_at is null;
      if last_entry is not null and new.closed_on < last_entry then
        raise exception 'Flock % has entries up to %; close it on or after that day', new.code, to_char(last_entry, 'DD Mon YYYY')
          using errcode = '23514';
      end if;
      if new.close_reason is null then
        raise exception 'Say why the flock is being closed' using errcode = '23514';
      end if;
    else
      new.close_reason := null;
      new.close_note := null;
    end if;
  end if;

  if new.laying_started_on is distinct from old.laying_started_on and new.laying_started_on is not null then
    select bt.lays_eggs into lays from public.bird_types bt where bt.id = new.bird_type_id;
    if not coalesce(lays, false) then
      raise exception 'Only layer flocks have a start of lay' using errcode = '23514';
    end if;
    if new.laying_started_on < new.placed_on or new.laying_started_on > private.farm_today()
       or (new.closed_on is not null and new.laying_started_on > new.closed_on) then
      raise exception 'Start of lay must be between placement and today' using errcode = '23514';
    end if;
  end if;
  return new;
end;
$$;

create trigger guard_change before update on public.flocks
  for each row execute function private.guard_flock_change();

-- Daily entries must belong to the pen's flock and fall within its life.
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
  return new;
end;
$$;

grant execute on all functions in schema private to authenticated, service_role;
revoke execute on all functions in schema private from public, anon;
