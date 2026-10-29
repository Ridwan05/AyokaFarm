-- Bird stock, placing flocks from it, pens without a fixed bird type, and owner-only edits.
--
-- A bird purchase goes into bird stock. Placing a flock draws birds from one or more purchases
-- (flock_placements), which records what the placed birds cost. The owner can also place birds
-- that weren't bought (go-live flocks, own hatch), with an optional cost a bird. The flock decides
-- the bird type; a pen only has a description. Pen and flock details can be changed by the owner;
-- farm managers can still add pens, place flocks, add birds and mark start of lay.

create function private.is_owner()
returns boolean
language sql
stable
set search_path = ''
as $$ select coalesce(private.my_role() = 'owner', false) $$;

-- ── Bird purchases say what they are ────────────────────────────────
alter table public.purchases
  add column bird_type_id bigint references public.bird_types (id),
  add column breed text,
  add column bird_age_days integer not null default 0 check (bird_age_days >= 0);
alter table public.purchases add constraint purchases_birds_have_type
  check (kind <> 'birds' or bird_type_id is not null) not valid;
create index purchases_bird_type_idx on public.purchases (bird_type_id) where bird_type_id is not null;
comment on column public.purchases.flock_id is 'Superseded by flock_placements for bird purchases.';

-- ── Where each flock's birds came from ──────────────────────────────
create table public.flock_placements (
  id bigint generated always as identity primary key,
  flock_id bigint not null references public.flocks (id) on delete cascade,
  -- Null = not from a purchase (go-live flock, own hatch); owner only.
  purchase_id bigint references public.purchases (id),
  placed_on date not null,
  birds integer not null check (birds > 0),
  -- From the purchase (total ÷ birds received), or typed by the owner when not from a purchase.
  cost_per_bird numeric(14,2) check (cost_per_bird is null or cost_per_bird >= 0),
  created_by uuid default auth.uid() references public.profiles (id),
  created_at timestamptz not null default now()
);
create index flock_placements_flock_idx on public.flock_placements (flock_id);
create index flock_placements_purchase_idx on public.flock_placements (purchase_id) where purchase_id is not null;

alter table public.flock_placements enable row level security;
create policy "See placements of visible flocks" on public.flock_placements for select to authenticated
  using (exists (select 1 from public.flocks f where f.id = flock_id));
create policy "Managers place birds" on public.flock_placements for insert to authenticated
  with check ((select private.is_manager()));
create policy "Owner edits placements" on public.flock_placements for update to authenticated
  using ((select private.is_owner())) with check ((select private.is_owner()));
create policy "Owner removes placements" on public.flock_placements for delete to authenticated
  using ((select private.is_owner()));
grant select, insert, update, delete on public.flock_placements to authenticated;

-- Birds received on a purchase and how many are still in stock.
create function private.purchase_birds_left(purchase bigint, except_placement bigint default null)
returns integer
language sql
stable
security definer
set search_path = ''
as $$
  select (coalesce(p.received_quantity, p.quantity) - p.returned_quantity)::integer
       - coalesce((select sum(fp.birds) from public.flock_placements fp
                   where fp.purchase_id = p.id and fp.id is distinct from except_placement), 0)::integer
  from public.purchases p where p.id = purchase
$$;

-- Every placement is checked here, however it's written.
create function private.check_placement()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  fl public.flocks;
  p public.purchases;
  received numeric;
  left_over integer;
begin
  select * into fl from public.flocks where id = new.flock_id;
  if new.placed_on < fl.placed_on then
    raise exception 'Birds can''t be placed before the flock (%)', to_char(fl.placed_on, 'DD Mon YYYY') using errcode = '23514';
  end if;
  if fl.closed_on is not null and new.placed_on > fl.closed_on then
    raise exception 'Flock % was closed on %', fl.code, to_char(fl.closed_on, 'DD Mon YYYY') using errcode = '23514';
  end if;

  if new.purchase_id is null then
    if (select auth.uid()) is not null and not private.is_owner() then
      raise exception 'Only the owner can place birds that weren''t bought' using errcode = '42501';
    end if;
    return new;
  end if;

  select * into p from public.purchases where id = new.purchase_id;
  if p.kind <> 'birds' or p.deleted_at is not null or p.status <> 'received' then
    raise exception 'Purchase % isn''t birds in stock', p.ref using errcode = '23514';
  end if;
  if p.bird_type_id is distinct from fl.bird_type_id then
    raise exception 'Purchase % is a different type of bird from flock %', p.ref, fl.code using errcode = '23514';
  end if;
  left_over := private.purchase_birds_left(p.id, case when tg_op = 'UPDATE' then new.id end);
  if new.birds > left_over then
    raise exception 'Only % birds left from %', left_over, p.ref using errcode = '23514';
  end if;
  received := coalesce(p.received_quantity, p.quantity) - p.returned_quantity;
  new.cost_per_bird := case when received > 0 then round(coalesce(p.total, p.quantity * p.unit_price) / received, 2) end;
  return new;
end;
$$;

create trigger check_placement before insert or update on public.flock_placements
  for each row execute function private.check_placement();

-- Bird stock: one row per received bird purchase.
create view public.bird_stock with (security_invoker = true) as
select
  p.id as purchase_id,
  p.ref,
  p.supplier_id,
  s.name as supplier,
  p.bird_type_id,
  bt.name as bird_type,
  p.breed,
  p.bird_age_days,
  p.received_on,
  (coalesce(p.received_quantity, p.quantity) - p.returned_quantity)::integer as received,
  coalesce((select sum(fp.birds) from public.flock_placements fp where fp.purchase_id = p.id), 0)::integer as placed,
  ((coalesce(p.received_quantity, p.quantity) - p.returned_quantity)
    - coalesce((select sum(fp.birds) from public.flock_placements fp where fp.purchase_id = p.id), 0))::integer as in_stock,
  case when coalesce(p.received_quantity, p.quantity) - p.returned_quantity > 0
       then round(coalesce(p.total, p.quantity * p.unit_price) / (coalesce(p.received_quantity, p.quantity) - p.returned_quantity), 2) end as cost_per_bird
from public.purchases p
join public.suppliers s on s.id = p.supplier_id
left join public.bird_types bt on bt.id = p.bird_type_id
where p.kind = 'birds' and p.status = 'received' and p.deleted_at is null;
grant select on public.bird_stock to authenticated;

-- ── Placing a flock and adding birds ────────────────────────────────
-- Sources: [{"purchase_id": 12, "birds": 1000}, {"purchase_id": null, "birds": 50, "cost_per_bird": 900}]
create function private.sources_total(sources jsonb)
returns integer
language plpgsql
immutable
set search_path = ''
as $$
declare
  total integer := 0;
  e jsonb;
begin
  if sources is null or jsonb_typeof(sources) <> 'array' or jsonb_array_length(sources) = 0 then
    raise exception 'Say where the birds came from' using errcode = '23514';
  end if;
  for e in select * from jsonb_array_elements(sources) loop
    if coalesce((e ->> 'birds')::integer, 0) <= 0 then
      raise exception 'Each source needs a number of birds' using errcode = '23514';
    end if;
    total := total + (e ->> 'birds')::integer;
  end loop;
  return total;
end;
$$;

create function public.place_flock(flock jsonb, sources jsonb)
returns public.flocks
language plpgsql
security invoker
set search_path = ''
as $$
declare
  f public.flocks;
  pen_name text;
begin
  select name into pen_name from public.pens where id = (flock ->> 'pen_id')::bigint;
  if exists (select 1 from public.flocks x where x.pen_id = (flock ->> 'pen_id')::bigint and x.status = 'active') then
    raise exception '% already has a flock; close it first', pen_name using errcode = '23514';
  end if;
  insert into public.flocks (code, pen_id, bird_type_id, breed, placed_on, age_at_placement_days, birds_placed, notes)
  values (
    flock ->> 'code',
    (flock ->> 'pen_id')::bigint,
    (flock ->> 'bird_type_id')::bigint,
    flock ->> 'breed',
    (flock ->> 'placed_on')::date,
    coalesce((flock ->> 'age_at_placement_days')::integer, 0),
    private.sources_total(sources),
    flock ->> 'notes'
  )
  returning * into f;
  insert into public.flock_placements (flock_id, purchase_id, placed_on, birds, cost_per_bird)
  select f.id, (e ->> 'purchase_id')::bigint, f.placed_on, (e ->> 'birds')::integer, (e ->> 'cost_per_bird')::numeric
  from jsonb_array_elements(sources) e;
  return f;
end;
$$;

-- Birds added to a flock after it was placed (top-ups). They join the flock's count on that day.
create function public.add_birds_to_flock(flock_id bigint, placed_on date, sources jsonb)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  f public.flocks;
begin
  select * into f from public.flocks x where x.id = flock_id;
  if not found or f.status <> 'active' then
    raise exception 'That flock isn''t active' using errcode = '23514';
  end if;
  if placed_on <= f.placed_on then
    raise exception 'Added birds must come after the flock was placed (%)', to_char(f.placed_on, 'DD Mon YYYY') using errcode = '23514';
  end if;
  perform private.sources_total(sources);
  insert into public.flock_placements (flock_id, purchase_id, placed_on, birds, cost_per_bird)
  select f.id, (e ->> 'purchase_id')::bigint, add_birds_to_flock.placed_on, (e ->> 'birds')::integer, (e ->> 'cost_per_bird')::numeric
  from jsonb_array_elements(sources) e;
end;
$$;

-- Owner: change where a flock's first-day birds came from (and so how many were placed).
create function public.set_flock_sources(flock_id bigint, sources jsonb)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  f public.flocks;
  total integer;
begin
  if not private.is_owner() then
    raise exception 'Only the owner can change a flock''s birds' using errcode = '42501';
  end if;
  select * into f from public.flocks x where x.id = flock_id;
  if not found then
    raise exception 'Flock not found' using errcode = 'P0002';
  end if;
  total := private.sources_total(sources);
  delete from public.flock_placements fp where fp.flock_id = f.id and fp.placed_on = f.placed_on;
  insert into public.flock_placements (flock_id, purchase_id, placed_on, birds, cost_per_bird)
  select f.id, (e ->> 'purchase_id')::bigint, f.placed_on, (e ->> 'birds')::integer, (e ->> 'cost_per_bird')::numeric
  from jsonb_array_elements(sources) e;
  update public.flocks x set birds_placed = total where x.id = f.id;
end;
$$;

revoke execute on function public.place_flock(jsonb, jsonb) from public, anon;
revoke execute on function public.add_birds_to_flock(bigint, date, jsonb) from public, anon;
revoke execute on function public.set_flock_sources(bigint, jsonb) from public, anon;
grant execute on function public.place_flock(jsonb, jsonb) to authenticated;
grant execute on function public.add_birds_to_flock(bigint, date, jsonb) to authenticated;
grant execute on function public.set_flock_sources(bigint, jsonb) to authenticated;

-- ── Bird counts include birds added later ───────────────────────────
create or replace function private.recalc_flock(f bigint)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  fl public.flocks;
  rec record;
  prev_date date;
  running integer;
  opening integer;
begin
  select * into fl from public.flocks where id = f;
  if not found then
    return;
  end if;
  running := fl.birds_placed;
  prev_date := fl.placed_on - 1;

  for rec in
    select id, record_date, mortality, opening_birds from public.production_records
    where flock_id = f and deleted_at is null
    order by record_date
  loop
    opening := running
      -- Birds added after placement (flock_placements), and older purchases linked straight to the flock.
      + coalesce((
          select sum(fp.birds)::integer from public.flock_placements fp
          where fp.flock_id = f and fp.placed_on > fl.placed_on
            and fp.placed_on > prev_date and fp.placed_on <= rec.record_date
        ), 0)
      + coalesce((
          select sum(coalesce(pu.received_quantity, pu.quantity) - pu.returned_quantity)::integer
          from public.purchases pu
          where pu.flock_id = f and pu.kind = 'birds' and pu.status = 'received' and pu.deleted_at is null
            and pu.received_on > prev_date and pu.received_on <= rec.record_date
            and pu.received_on > fl.placed_on
        ), 0)
      - coalesce((
          select sum(a.quantity)::integer
          from public.sale_allocations a
          join public.sales s on s.id = a.sale_id
          join public.products p on p.id = s.product_id
          where a.flock_id = f and p.kind = 'birds' and s.deleted_at is null and s.approval <> 'rejected'
            and s.sold_on >= greatest(prev_date, fl.placed_on) and s.sold_on < rec.record_date
        ), 0);
    if opening is distinct from rec.opening_birds then
      update public.production_records set opening_birds = opening where id = rec.id;
    end if;
    running := opening - rec.mortality;
    prev_date := rec.record_date;
  end loop;
end;
$$;

create or replace function private.flock_birds_on(f bigint, d date, except_sale bigint default null)
returns integer
language sql
stable
security definer
set search_path = ''
as $$
  select (fl.birds_placed
    + coalesce((select sum(fp.birds) from public.flock_placements fp
                where fp.flock_id = f and fp.placed_on > fl.placed_on and fp.placed_on <= d), 0)
    + coalesce((select sum(coalesce(pu.received_quantity, pu.quantity) - pu.returned_quantity)
                from public.purchases pu
                where pu.flock_id = f and pu.kind = 'birds' and pu.status = 'received' and pu.deleted_at is null
                  and pu.received_on > fl.placed_on and pu.received_on <= d), 0)
    - coalesce((select sum(pr.mortality) from public.production_records pr
                where pr.flock_id = f and pr.deleted_at is null and pr.record_date <= d), 0)
    - coalesce((select sum(a.quantity) from public.sale_allocations a
                join public.sales s on s.id = a.sale_id
                where a.flock_id = f and s.deleted_at is null and s.approval <> 'rejected'
                  and s.sold_on <= d and s.id is distinct from except_sale), 0))::integer
  from public.flocks fl where fl.id = f
$$;

create function private.placement_changed()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.recalc_flock(coalesce(new.flock_id, old.flock_id));
  return null;
end;
$$;

create trigger flock_birds after insert or update or delete on public.flock_placements
  for each row execute function private.placement_changed();
create trigger audit after insert or update or delete on public.flock_placements
  for each row execute function private.audit();

-- ── Flock edits: owner only, except start of lay ────────────────────
create or replace function private.guard_flock_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  last_entry date;
  first_entry date;
  lays boolean;
  signed_in boolean := (select auth.uid()) is not null;
begin
  -- No signed-in user means the SQL Editor or a server script, which only the owner can reach.
  if signed_in and not private.is_owner() and (
       new.code is distinct from old.code or new.pen_id is distinct from old.pen_id
       or new.bird_type_id is distinct from old.bird_type_id or new.breed is distinct from old.breed
       or new.placed_on is distinct from old.placed_on or new.age_at_placement_days is distinct from old.age_at_placement_days
       or new.birds_placed is distinct from old.birds_placed or new.notes is distinct from old.notes
       or new.status is distinct from old.status or new.closed_on is distinct from old.closed_on
       or new.close_reason is distinct from old.close_reason or new.close_note is distinct from old.close_note) then
    raise exception 'Only the owner can change a flock''s details' using errcode = '42501';
  end if;

  select min(pr.record_date), max(pr.record_date) into first_entry, last_entry
  from public.production_records pr where pr.flock_id = new.id and pr.deleted_at is null;

  if first_entry is not null and (new.bird_type_id is distinct from old.bird_type_id or new.pen_id is distinct from old.pen_id) then
    raise exception 'Flock % has daily entries, so its bird type and pen can''t change', new.code using errcode = '23514';
  end if;
  if first_entry is not null and new.placed_on > first_entry then
    raise exception 'Flock % has entries from %; it can''t be placed after that', new.code, to_char(first_entry, 'DD Mon YYYY')
      using errcode = '23514';
  end if;

  if new.status is distinct from old.status or new.closed_on is distinct from old.closed_on then
    if new.status = 'closed' then
      if new.closed_on > private.farm_today() then
        raise exception 'The closing date can''t be in the future' using errcode = '23514';
      end if;
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

-- ── Pens: a description instead of a bird type; owner edits ─────────
alter table public.pens add column description text;
comment on column public.pens.bird_type_id is 'Superseded: the flock placed in a pen decides its bird type.';

drop policy "Managers edit pens" on public.pens;
create policy "Owner edits pens" on public.pens for update to authenticated
  using ((select private.is_owner())) with check ((select private.is_owner()));

create function private.guard_pen_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if old.is_active and not new.is_active
     and exists (select 1 from public.flocks f where f.pen_id = new.id and f.status = 'active') then
    raise exception '% still has a flock; close it before making the pen inactive', new.name using errcode = '23514';
  end if;
  return new;
end;
$$;
create trigger guard_change before update on public.pens
  for each row execute function private.guard_pen_change();

-- ── Existing flocks: record their birds as "not from a purchase" ────
insert into public.flock_placements (flock_id, purchase_id, placed_on, birds, cost_per_bird)
select f.id, null, f.placed_on, f.birds_placed, null
from public.flocks f
where not exists (select 1 from public.flock_placements fp where fp.flock_id = f.id);

grant execute on all functions in schema private to authenticated, service_role;
revoke execute on all functions in schema private from public, anon;
