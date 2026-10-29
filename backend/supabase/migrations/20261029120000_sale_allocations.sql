-- Split a sale across pens (portions by quantity).
--
-- A sale can come from several pens, e.g. 40 crates: Pen 1 25, Pen 3 15. Each portion names the pen
-- (and the flock in it on the sale date). Bird sales must be split so the right flocks lose the
-- birds; egg, droppings and sack sales may be left unsplit, in which case reports share them
-- across pens by eggs collected ("auto-split").
--
-- Save sales through public.record_sale(...) so the sale and its portions land together, and change
-- portions later with public.set_sale_allocations(...). sales.pen_id / sales.flock_id are superseded.

-- ── Which bird type a bird product comes from ───────────────────────
alter table public.products add column bird_type_id bigint references public.bird_types (id);
comment on column public.products.bird_type_id is 'For bird products: the bird type a portion''s flock must be (spent layers → Layer).';
update public.products p set bird_type_id = bt.id
from public.bird_types bt
where p.kind = 'birds' and p.bird_type_id is null
  and ((p.name ilike '%layer%' and bt.name = 'Layer') or (p.name ilike '%broiler%' and bt.name = 'Broiler'));

comment on column public.sales.pen_id is 'Superseded by sale_allocations; not written by the app.';
comment on column public.sales.flock_id is 'Superseded by sale_allocations; not written by the app.';

-- ── Portions ────────────────────────────────────────────────────────
create table public.sale_allocations (
  id bigint generated always as identity primary key,
  sale_id bigint not null references public.sales (id) on delete cascade,
  pen_id bigint not null references public.pens (id),
  flock_id bigint references public.flocks (id),
  quantity numeric(12,2) not null check (quantity > 0),
  unique (sale_id, pen_id)
);
create index sale_allocations_pen_idx on public.sale_allocations (pen_id);
create index sale_allocations_flock_idx on public.sale_allocations (flock_id) where flock_id is not null;

alter table public.sale_allocations enable row level security;

-- Portions follow their sale: whoever can see the sale sees them; whoever may change the sale
-- (recorder within the edit window, sales editors, managers on a pending sale) may change them.
create function private.can_change_sale(sale bigint)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.sales s
    where s.id = sale and s.deleted_at is null
      and (
        ((select private.can('sales', 'add')) and s.recorded_by = (select auth.uid()) and private.within_edit_window(s.recorded_by, s.created_at))
        or ((select private.can('sales', 'edit')) and private.within_edit_window(s.recorded_by, s.created_at))
        or ((select private.is_manager()) and s.approval = 'pending')
      )
  )
$$;

create policy "See sale portions" on public.sale_allocations for select to authenticated
  using ((select private.can('sales', 'view')));
create policy "Add sale portions" on public.sale_allocations for insert to authenticated
  with check (private.can_change_sale(sale_id));
create policy "Edit sale portions" on public.sale_allocations for update to authenticated
  using (private.can_change_sale(sale_id))
  with check (private.can_change_sale(sale_id));
create policy "Remove sale portions" on public.sale_allocations for delete to authenticated
  using (private.can_change_sale(sale_id));

grant select, insert, update, delete on public.sale_allocations to authenticated;

-- ── Birds a flock has on a day ──────────────────────────────────────
-- Placed + bought in − deaths recorded up to that day − birds already sold up to that day
-- (leaving out one sale, so editing a sale doesn't count its own birds twice).
create function private.flock_birds_on(f bigint, d date, except_sale bigint default null)
returns integer
language sql
stable
security definer
set search_path = ''
as $$
  select (fl.birds_placed
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

-- ── Check portions and fill in each pen's flock ─────────────────────
-- Raises a plain-language error (23514) if the portions don't fit the sale; otherwise returns
-- them as rows to insert.
create function private.checked_portions(s public.sales, portions jsonb)
returns table (pen_id bigint, flock_id bigint, quantity numeric)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  p public.products;
  item record;
  fl public.flocks;
  pen_name text;
  total numeric := 0;
  seen bigint[] := '{}';
  have integer;
begin
  select * into p from public.products where id = s.product_id;
  portions := coalesce(portions, '[]'::jsonb);
  if jsonb_typeof(portions) <> 'array' then
    raise exception 'Pen portions must be a list' using errcode = '22023';
  end if;

  if jsonb_array_length(portions) = 0 then
    if p.kind = 'birds' then
      raise exception 'Say which pen the birds came from' using errcode = '23514';
    end if;
    return;
  end if;

  for item in select (e ->> 'pen_id')::bigint as pen, (e ->> 'quantity')::numeric as qty from jsonb_array_elements(portions) e loop
    select name into pen_name from public.pens where id = item.pen;
    if pen_name is null then
      raise exception 'Unknown pen %', item.pen using errcode = '23514';
    end if;
    if item.qty is null or item.qty <= 0 then
      raise exception '% needs a quantity above 0', pen_name using errcode = '23514';
    end if;
    if item.pen = any(seen) then
      raise exception '% is listed twice', pen_name using errcode = '23514';
    end if;
    seen := seen || item.pen;
    total := total + item.qty;

    -- The flock in the pen on the sale date.
    select * into fl from public.flocks f
    where f.pen_id = item.pen and f.placed_on <= s.sold_on and (f.closed_on is null or f.closed_on >= s.sold_on)
    order by f.placed_on desc limit 1;

    if p.kind = 'birds' then
      if fl.id is null then
        raise exception '% had no flock on %', pen_name, to_char(s.sold_on, 'DD Mon') using errcode = '23514';
      end if;
      if p.bird_type_id is not null and fl.bird_type_id <> p.bird_type_id then
        raise exception '% doesn''t hold % birds', pen_name, lower(split_part(p.name, ' ', 2)) using errcode = '23514';
      end if;
      have := private.flock_birds_on(fl.id, s.sold_on, s.id);
      if item.qty > have then
        raise exception '% only has % birds', pen_name, to_char(have, 'FM999,999,990') using errcode = '23514';
      end if;
    end if;

    pen_id := item.pen;
    flock_id := fl.id;
    quantity := item.qty;
    return next;
  end loop;

  if total <> s.quantity then
    raise exception 'Pen portions add up to %, but the sale is %', total, s.quantity using errcode = '23514';
  end if;
end;
$$;

-- ── Save a sale with its portions (one transaction) ─────────────────
-- Runs as the caller, so the sales and sale_allocations policies apply.
create function public.record_sale(sale jsonb, portions jsonb default '[]'::jsonb)
returns public.sales
language plpgsql
security invoker
set search_path = ''
as $$
declare
  s public.sales;
begin
  insert into public.sales (sold_on, customer_id, buyer_name, product_id, quantity, unit_price, amount_paid, payment_method, notes, recorded_by)
  values (
    coalesce((sale ->> 'sold_on')::date, private.farm_today()),
    (sale ->> 'customer_id')::bigint,
    sale ->> 'buyer_name',
    (sale ->> 'product_id')::bigint,
    (sale ->> 'quantity')::numeric,
    (sale ->> 'unit_price')::numeric,
    coalesce((sale ->> 'amount_paid')::numeric, 0),
    (sale ->> 'payment_method')::public.payment_method,
    sale ->> 'notes',
    (select auth.uid())
  )
  returning * into s;

  insert into public.sale_allocations (sale_id, pen_id, flock_id, quantity)
  select s.id, c.pen_id, c.flock_id, c.quantity from private.checked_portions(s, portions) c;

  return s;
end;
$$;

-- ── Change a sale's portions ────────────────────────────────────────
create function public.set_sale_allocations(sale_id bigint, portions jsonb)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  s public.sales;
begin
  select * into s from public.sales where id = sale_id and deleted_at is null;
  if not found then
    raise exception 'Sale not found' using errcode = 'P0002';
  end if;
  if not private.can_change_sale(s.id) then
    raise exception 'permission denied to change this sale' using errcode = '42501';
  end if;
  delete from public.sale_allocations a where a.sale_id = s.id;
  insert into public.sale_allocations (sale_id, pen_id, flock_id, quantity)
  select s.id, c.pen_id, c.flock_id, c.quantity from private.checked_portions(s, portions) c;
end;
$$;

revoke execute on function public.record_sale(jsonb, jsonb) from public, anon;
revoke execute on function public.set_sale_allocations(bigint, jsonb) from public, anon;
grant execute on function public.record_sale(jsonb, jsonb) to authenticated;
grant execute on function public.set_sale_allocations(bigint, jsonb) to authenticated;

-- ── Bird counts come from portions ──────────────────────────────────
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

create function private.portion_changed()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op <> 'INSERT' and old.flock_id is not null then
    perform private.recalc_flock(old.flock_id);
  end if;
  if tg_op <> 'DELETE' and new.flock_id is not null
     and (tg_op = 'INSERT' or new.flock_id is distinct from old.flock_id or new.quantity is distinct from old.quantity) then
    perform private.recalc_flock(new.flock_id);
  end if;
  return null;
end;
$$;

create function private.sale_portions_changed()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  f bigint;
begin
  for f in select distinct a.flock_id from public.sale_allocations a where a.sale_id = new.id and a.flock_id is not null loop
    perform private.recalc_flock(f);
  end loop;
  return null;
end;
$$;

create trigger flock_birds after insert or update or delete on public.sale_allocations
  for each row execute function private.portion_changed();
create trigger portion_flocks after update of sold_on, deleted_at, approval, quantity, product_id on public.sales
  for each row execute function private.sale_portions_changed();
create trigger audit after insert or update or delete on public.sale_allocations
  for each row execute function private.audit();

-- Bird sales must be split across pens, whichever way they're saved (checked at commit, so
-- record_sale can add the portions after the sale).
create function private.bird_sale_has_portions()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  s public.sales;
  sid bigint;
  total numeric;
begin
  if tg_table_name = 'sales' then
    sid := (to_jsonb(new) ->> 'id')::bigint;
  else
    sid := (coalesce(to_jsonb(new), to_jsonb(old)) ->> 'sale_id')::bigint;
  end if;
  select * into s from public.sales where id = sid;
  if not found or s.deleted_at is not null then
    return null;
  end if;
  select coalesce(sum(a.quantity), 0) into total from public.sale_allocations a where a.sale_id = s.id;
  if (total > 0 or exists (select 1 from public.products p where p.id = s.product_id and p.kind = 'birds'))
     and total <> s.quantity then
    raise exception 'Pen portions add up to %, but sale % is %', total, s.ref, s.quantity using errcode = '23514';
  end if;
  return null;
end;
$$;

create constraint trigger portions_add_up after insert or update of quantity, product_id on public.sales
  deferrable initially deferred for each row execute function private.bird_sale_has_portions();
create constraint trigger portions_add_up after insert or update or delete on public.sale_allocations
  deferrable initially deferred for each row execute function private.bird_sale_has_portions();

grant execute on all functions in schema private to authenticated, service_role;
revoke execute on all functions in schema private from public, anon;
