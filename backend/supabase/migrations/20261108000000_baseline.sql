-- AyokaFarm database: baseline
--
-- One script that builds everything the app needs on an empty Supabase project:
-- types, functions, tables, views, indexes, triggers, row-level security, grants,
-- the receipts storage bucket and the reference lists. Generated from the live
-- database on 2026-11-04; it replaces the earlier step-by-step migrations.
--
-- Run it once, in the Supabase SQL Editor, on a new project. Then create the
-- Owner login with: node backend/scripts/setup.mjs
--
-- Not in here (set in the Supabase dashboard): Auth providers and phone sign-in,
-- SMTP/SMS settings, and the API keys.

-- ════════════════════════════════════════════════════════════════════
-- 1. Extensions and schemas
-- pgcrypto and uuid-ossp come with every Supabase project; listed so a bare Postgres works too.
-- The private schema holds helper and trigger functions. It is not exposed through the Data API.
-- Column types and view bodies below name public objects without the schema, so public goes first on the path.
-- ════════════════════════════════════════════════════════════════════

set search_path = public, extensions;

create extension if not exists pgcrypto with schema extensions;
create extension if not exists "uuid-ossp" with schema extensions;

create schema if not exists private;
grant usage on schema private to authenticated, service_role;

-- ════════════════════════════════════════════════════════════════════
-- 2. Reference-number sequences
-- Feed the human-readable refs (S-0001, E-0001, PF-0001 …) built by private.next_ref().
-- ════════════════════════════════════════════════════════════════════

create sequence public.advance_ref_seq;
create sequence public.expense_ref_seq;
create sequence public.finance_ref_seq;
create sequence public.loan_ref_seq;
create sequence public.payment_in_ref_seq;
create sequence public.payment_out_ref_seq;
create sequence public.purchase_bird_ref_seq;
create sequence public.purchase_feed_ref_seq;
create sequence public.purchase_med_ref_seq;
create sequence public.sale_ref_seq;

-- ════════════════════════════════════════════════════════════════════
-- 3. Enum types
-- ════════════════════════════════════════════════════════════════════

create type public.access_level as enum ('none', 'own', 'all');

create type public.app_module as enum ('production', 'inventory', 'medication', 'expenses', 'dashboard', 'sales', 'purchases', 'payments', 'parties', 'admin', 'payroll', 'finance');

create type public.asset_category as enum ('land', 'buildings', 'equipment', 'machinery', 'vehicles');

create type public.customer_type as enum ('regular', 'one_off');

create type public.finance_kind as enum ('opening_cash', 'capital_in', 'drawing', 'loan_received', 'loan_repaid', 'other_income');

create type public.flock_status as enum ('active', 'closed');

create type public.loan_kind as enum ('advance', 'loan');

create type public.loan_status as enum ('pending', 'active', 'repaid', 'cancelled');

create type public.medication_category as enum ('vaccine', 'antibiotic', 'vitamin', 'dewormer', 'coccidiostat', 'disinfectant', 'other');

create type public.medication_mode as enum ('water', 'feed', 'injection', 'spray', 'eye_nose_drop');

create type public.medication_purpose as enum ('treatment', 'prevention', 'vaccination', 'vitamin');

create type public.pay_basis as enum ('monthly', 'daily', 'weekly');

create type public.payment_direction as enum ('in', 'out');

create type public.payment_method as enum ('cash', 'transfer', 'pos');

create type public.payroll_status as enum ('draft', 'approved');

create type public.payslip_item_kind as enum ('earning', 'deduction', 'loan', 'statutory');

create type public.product_kind as enum ('eggs', 'birds', 'droppings', 'sacks');

create type public.purchase_kind as enum ('feed', 'birds', 'medication');

create type public.purchase_status as enum ('ordered', 'received');

create type public.sale_approval as enum ('approved', 'pending', 'rejected');

create type public.stock_item as enum ('feed', 'medication', 'eggs', 'cracked_eggs');

create type public.stock_movement_type as enum ('opening', 'received', 'used', 'collected', 'sold', 'adjusted');

create type public.supplier_kind as enum ('feed', 'birds', 'medication', 'equipment');

-- ════════════════════════════════════════════════════════════════════
-- 4. Functions
-- Created before the tables because column defaults call private.farm_today() and private.next_ref().
-- Bodies are not checked until they run, so the order inside this section does not matter.
-- private.* = helpers, permission checks and trigger functions; public.* = RPCs the app calls.
-- ════════════════════════════════════════════════════════════════════

set check_function_bodies = off;

create or replace function private.access(m app_module, action text)
 RETURNS access_level
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select coalesce((
    select case action
      when 'view' then rp.can_view
      when 'add' then rp.can_add
      when 'edit' then rp.can_edit
      when 'delete' then rp.can_delete
    end
    from public.profiles p
    join public.role_permissions rp on rp.role_id = p.role_id and rp.module = m
    where p.id = (select auth.uid()) and p.is_active
  ), 'none'::public.access_level)
$function$;

-- Only applied adjustments move stock.
create or replace function private.adjustment_stock()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  a public.stock_adjustments := coalesce(new, old);
begin
  perform private.clear_movements('stock_adjustments', a.id);
  if tg_op <> 'DELETE' and a.status = 'applied' and a.quantity_change <> 0 then
    insert into public.stock_movements (moved_on, item, feed_type_id, medication_id, purchase_id, movement, quantity, source_table, source_id)
    values (a.adjusted_on, a.item, a.feed_type_id, a.medication_id, a.purchase_id,
            case when a.is_opening then 'opening'::public.stock_movement_type else 'adjusted'::public.stock_movement_type end,
            a.quantity_change, 'stock_adjustments', a.id);
  end if;
  return null;
end;
$function$;

create or replace function private.audit()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  j jsonb := coalesce(to_jsonb(new), to_jsonb(old));
  -- Bookkeeping columns that change without anyone editing the record.
  noise text[] := array['updated_at', 'opening_birds', 'closing_birds'];
begin
  if tg_op = 'UPDATE' and to_jsonb(new) - noise = to_jsonb(old) - noise then
    return null;
  end if;
  insert into public.audit_log (actor_id, table_name, record_id, action, old_data, new_data)
  values (
    (select auth.uid()),
    tg_table_name,
    coalesce(j ->> 'id', concat_ws('/', j ->> 'role_id', j ->> 'module', j ->> 'profile_id', j ->> 'pen_id')),
    lower(tg_op),
    case when tg_op <> 'INSERT' then to_jsonb(old) end,
    case when tg_op <> 'DELETE' then to_jsonb(new) end
  );
  return null;
end;
$function$;

-- Bird sales must be split across pens, whichever way they're saved (checked at commit, so
-- record_sale can add the portions after the sale).
create or replace function private.bird_sale_has_portions()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
$function$;

create or replace function private.can(m app_module, action text)
 RETURNS boolean
 LANGUAGE sql
 STABLE
 SET search_path TO ''
AS $function$ select private.access(m, action) <> 'none' $function$;

-- Portions follow their sale: whoever can see the sale sees them; whoever may change the sale
-- (recorder within the edit window, sales editors, managers on a pending sale) may change them.
create or replace function private.can_change_sale(sale bigint)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select exists (
    select 1 from public.sales s
    where s.id = sale and s.deleted_at is null
      and (
        ((select private.can('sales', 'add')) and s.recorded_by = (select auth.uid()) and private.within_edit_window(s.recorded_by, s.created_at))
        or ((select private.can('sales', 'edit')) and private.within_edit_window(s.recorded_by, s.created_at))
        or ((select private.is_manager()) and s.approval = 'pending')
      )
  )
$function$;

-- Pens this user may work with for a module: every pen with 'all' access, assigned pens with 'own'.
create or replace function private.can_pen(m app_module, action text, pen bigint)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select case private.access(m, action)
    when 'all' then true
    when 'own' then pen is not null and exists (
      select 1 from public.staff_pens sp where sp.profile_id = (select auth.uid()) and sp.pen_id = pen
    )
    else false
  end
$function$;

-- Every placement is checked here, however it's written.
create or replace function private.check_placement()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
$function$;

-- Raises a plain-language error (23514) if the portions don't fit the sale; otherwise returns
-- them as rows to insert.
create or replace function private.checked_portions(s sales, portions jsonb)
 RETURNS TABLE(pen_id bigint, flock_id bigint, quantity numeric)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
$function$;

create or replace function private.clear_movements(src text, src_id bigint)
 RETURNS void
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$ delete from public.stock_movements where source_table = src and source_id = src_id $function$;

create or replace function private.entry_medication_restock()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  m record;
begin
  if new.deleted_at is distinct from old.deleted_at then
    -- Re-run the medication stock rule for each line; it skips deleted entries.
    for m in select id from public.production_medications where production_record_id = new.id loop
      update public.production_medications set quantity = quantity where id = m.id;
    end loop;
  end if;
  return null;
end;
$function$;

-- Today on the farm, not in UTC.
create or replace function private.farm_today()
 RETURNS date
 LANGUAGE sql
 STABLE
 SET search_path TO ''
AS $function$ select (now() at time zone 'Africa/Lagos')::date $function$;

-- Placed + bought in − deaths recorded up to that day − birds already sold up to that day
-- (leaving out one sale, so editing a sale doesn't count its own birds twice).
create or replace function private.flock_birds_on(f bigint, d date, except_sale bigint DEFAULT NULL::bigint)
 RETURNS integer
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
$function$;

create or replace function private.flock_changed()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  if new.birds_placed is distinct from old.birds_placed or new.placed_on is distinct from old.placed_on then
    perform private.recalc_flock(new.id);
  end if;
  return null;
end;
$function$;

create or replace function private.flock_inputs_changed()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  if tg_op <> 'INSERT' and old.flock_id is not null then
    perform private.recalc_flock(old.flock_id);
  end if;
  if tg_op <> 'DELETE' and new.flock_id is not null and (tg_op = 'INSERT' or new.flock_id is distinct from old.flock_id) then
    perform private.recalc_flock(new.flock_id);
  end if;
  return null;
end;
$function$;

-- Managers approve or reject a pending difference; nothing else about an adjustment changes.
create or replace function private.guard_adjustment_change()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  if old.status <> 'pending' then
    raise exception 'This stock adjustment is already settled' using errcode = '23514';
  end if;
  if (to_jsonb(new) - array['status', 'decided_by', 'decided_at']) is distinct from (to_jsonb(old) - array['status', 'decided_by', 'decided_at']) then
    raise exception 'Only the decision on a pending count can change' using errcode = '23514';
  end if;
  if new.status not in ('applied', 'rejected') then
    raise exception 'Approve or reject the count' using errcode = '23514';
  end if;
  new.decided_by := (select auth.uid());
  new.decided_at := now();
  return new;
end;
$function$;

-- Managers may edit flocks (existing policy); closing or re-opening one is for the owner only.
create or replace function private.guard_flock_change()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
$function$;

-- Loans: only the owner can approve, cancel or change one that's running.
create or replace function private.guard_loan_change()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  if (select auth.uid()) is null or private.is_owner() then
    if new.status = 'active' and (tg_op = 'INSERT' or old.status = 'pending') then
      new.approved_by := coalesce(new.approved_by, (select auth.uid()));
      new.approved_at := coalesce(new.approved_at, now());
    end if;
    return new;
  end if;
  if tg_op = 'INSERT' then
    if new.status <> 'pending' then
      raise exception 'Advances and loans need the owner''s approval' using errcode = '42501';
    end if;
    return new;
  end if;
  if old.status <> 'pending' or new.status <> 'pending' then
    raise exception 'Only the owner can approve or change a running advance or loan' using errcode = '42501';
  end if;
  return new;
end;
$function$;

create or replace function private.guard_owner_permissions()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  if coalesce(new.role_id, old.role_id) = 'owner' and (select auth.uid()) is not null then
    raise exception 'The owner role’s permissions can’t be changed' using errcode = '42501';
  end if;
  return coalesce(new, old);
end;
$function$;

-- An approved month is locked; only the payment details of a line can still be recorded.
create or replace function private.guard_payroll_change()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  run_status public.payroll_status;
begin
  if tg_table_name = 'payroll_runs' then
    if old.status = 'approved' and (new.status <> 'approved' or new.period <> old.period or new.expense_id is distinct from old.expense_id) then
      raise exception 'That payroll month is approved and locked' using errcode = '23514';
    end if;
    return new;
  end if;
  if tg_table_name = 'payroll_lines' then
    select status into run_status from public.payroll_runs where id = coalesce(new.run_id, old.run_id);
    if run_status = 'approved' and (tg_op <> 'UPDATE'
        or (new.rate, new.units, new.employee_id, new.pay_basis) is distinct from (old.rate, old.units, old.employee_id, old.pay_basis)) then
      -- Only the payment details can still be recorded.
      raise exception 'That payroll month is approved and locked' using errcode = '23514';
    end if;
  else
    select r.status into run_status from public.payroll_lines l join public.payroll_runs r on r.id = l.run_id
    where l.id = coalesce(new.line_id, old.line_id);
    if run_status = 'approved' then
      raise exception 'That payroll month is approved and locked' using errcode = '23514';
    end if;
  end if;
  return coalesce(new, old);
end;
$function$;

create or replace function private.guard_pen_change()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  if old.is_active and not new.is_active
     and exists (select 1 from public.flocks f where f.pen_id = new.id and f.status = 'active') then
    raise exception '% still has a flock; close it before making the pen inactive', new.name using errcode = '23514';
  end if;
  return new;
end;
$function$;

-- Only the owner (admin module edit) can change someone's role or active flag.
create or replace function private.guard_profile_update()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
begin
  if (new.role_id is distinct from old.role_id or new.is_active is distinct from old.is_active)
     and not private.can('admin', 'edit')
     and current_user = 'authenticated' then
    raise exception 'Only the owner can change roles or deactivate staff' using errcode = '42501';
  end if;
  return new;
end;
$function$;

-- Store keepers receive deliveries but can't change what was bought or its price.
create or replace function private.guard_purchase_update()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
begin
  if current_user = 'authenticated' and private.access('purchases', 'edit') = 'own'
     and (new.kind, new.supplier_id, new.feed_type_id, new.medication_id, new.flock_id, new.quantity, new.unit,
          new.stock_units_per_unit, new.unit_price, new.amount_paid, new.purchased_on, new.deleted_at)
         is distinct from
         (old.kind, old.supplier_id, old.feed_type_id, old.medication_id, old.flock_id, old.quantity, old.unit,
          old.stock_units_per_unit, old.unit_price, old.amount_paid, old.purchased_on, old.deleted_at) then
    raise exception 'You can record receipt of this delivery but not change the purchase' using errcode = '42501';
  end if;
  if new.status = 'received' and old.status = 'ordered' then
    new.received_by := coalesce(new.received_by, (select auth.uid()));
  end if;
  return new;
end;
$function$;

-- New sign-ups get a profile with no role (so no access) until the owner assigns one.
-- The role comes from app_metadata, which only the server can set — never user_metadata.
create or replace function private.handle_new_user()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  insert into public.profiles (id, full_name, phone, role_id)
  values (
    new.id,
    coalesce(nullif(trim(new.raw_user_meta_data ->> 'full_name'), ''), split_part(coalesce(new.email, new.phone, 'New user'), '@', 1)),
    new.phone,
    (select r.id from public.roles r where r.id = new.raw_app_meta_data ->> 'role')
  );
  return new;
end;
$function$;

create or replace function private.has_my_payslip(run bigint)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select exists (
    select 1 from public.payroll_lines l
    where l.run_id = run and l.employee_id = private.my_employee_id()
  )
$function$;

-- Managers approve sales, correct old records and see the audit log.
create or replace function private.is_manager()
 RETURNS boolean
 LANGUAGE sql
 STABLE
 SET search_path TO ''
AS $function$ select coalesce(private.my_role() in ('owner', 'farm_manager'), false) $function$;

create or replace function private.is_owner()
 RETURNS boolean
 LANGUAGE sql
 STABLE
 SET search_path TO ''
AS $function$ select coalesce(private.my_role() = 'owner', false) $function$;

create or replace function private.loan_ref()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
begin
  if new.ref is null then
    new.ref := case new.kind when 'advance' then private.next_ref('ADV-', 'public.advance_ref_seq')
                             else private.next_ref('LN-', 'public.loan_ref_seq') end;
  end if;
  return new;
end;
$function$;

-- Payroll staff see everything; everyone else sees only their own employee record, loans and
-- payslips from approved months.
create or replace function private.my_employee_id()
 RETURNS bigint
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$ select e.id from public.employees e where e.profile_id = (select auth.uid()) $function$;

create or replace function private.my_role()
 RETURNS text
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select p.role_id from public.profiles p
  where p.id = (select auth.uid()) and p.is_active
$function$;

create or replace function private.next_ref(prefix text, seq regclass)
 RETURNS text
 LANGUAGE sql
 SET search_path TO ''
AS $function$ select prefix || lpad(nextval(seq)::text, 4, '0') $function$;

create or replace function private.payment_ref()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
begin
  if new.ref is null then
    new.ref := case new.direction
      when 'in' then private.next_ref('P-', 'public.payment_in_ref_seq')
      else private.next_ref('PP-', 'public.payment_out_ref_seq')
    end;
  end if;
  return new;
end;
$function$;

create or replace function private.payroll_line_changed()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  if new.rate is distinct from old.rate or new.units is distinct from old.units then
    perform private.recalc_payslip(new.id);
  end if;
  return null;
end;
$function$;

create or replace function private.payroll_run_approved(run bigint)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$ select exists (select 1 from public.payroll_runs r where r.id = run and r.status = 'approved') $function$;

create or replace function private.payslip_item_changed()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  perform private.recalc_payslip(coalesce(new.line_id, old.line_id));
  return null;
end;
$function$;

create or replace function private.placement_changed()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  perform private.recalc_flock(coalesce(new.flock_id, old.flock_id));
  return null;
end;
$function$;

create or replace function private.portion_changed()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
$function$;

create or replace function private.production_birds()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  -- The recalculation itself updates opening_birds; don't recurse on that.
  if pg_trigger_depth() > 1 then
    return null;
  end if;
  if tg_op <> 'INSERT' then
    perform private.recalc_flock(old.flock_id);
  end if;
  if tg_op <> 'DELETE' and (tg_op = 'INSERT' or new.flock_id is distinct from old.flock_id
     or new.record_date is distinct from old.record_date or new.mortality is distinct from old.mortality
     or new.deleted_at is distinct from old.deleted_at) then
    perform private.recalc_flock(new.flock_id);
  end if;
  return null;
end;
$function$;

-- Daily entries must belong to the pen's flock and fall within its life.
create or replace function private.production_flock_matches_pen()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
$function$;

create or replace function private.production_medication_stock()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  m public.production_medications := coalesce(new, old);
  pr public.production_records;
  remaining numeric;
  take numeric;
  b record;
begin
  perform private.clear_movements('production_medications', m.id);
  if tg_op = 'DELETE' then
    return null;
  end if;
  select * into pr from public.production_records where id = m.production_record_id;
  if pr.deleted_at is not null then
    return null;
  end if;

  -- Take from the chosen batch, or first-expiry-first-out across batches (FR-MED-2).
  -- Stock without a batch (e.g. opening stock) is used last.
  remaining := m.quantity;
  for b in
    select sm.purchase_id, sum(sm.quantity) as on_hand
    from public.stock_movements sm
    left join public.purchases pu on pu.id = sm.purchase_id
    where sm.item = 'medication' and sm.medication_id = m.medication_id
      and (m.purchase_id is null or sm.purchase_id = m.purchase_id)
    group by sm.purchase_id, pu.expiry_date
    having sum(sm.quantity) > 0
    order by pu.expiry_date nulls last, sm.purchase_id nulls last
  loop
    take := least(remaining, b.on_hand);
    insert into public.stock_movements (moved_on, item, medication_id, purchase_id, movement, quantity, source_table, source_id, pen_id)
    values (pr.record_date, 'medication', m.medication_id, b.purchase_id, 'used', -take, 'production_medications', m.id, pr.pen_id);
    remaining := remaining - take;
    exit when remaining <= 0;
  end loop;

  -- FR-MED-1: can't use more than is in the store.
  if remaining > 0 then
    raise exception 'Only % in stock for this medication', m.quantity - remaining using errcode = '23514';
  end if;
  return null;
end;
$function$;

create or replace function private.production_stock()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  r public.production_records := coalesce(new, old);
begin
  perform private.clear_movements('production_records', r.id);
  if tg_op <> 'DELETE' and r.deleted_at is null then
    if r.feed_bags > 0 then
      insert into public.stock_movements (moved_on, item, feed_type_id, movement, quantity, source_table, source_id, pen_id)
      values (r.record_date, 'feed', r.feed_type_id, 'used', -r.feed_bags, 'production_records', r.id, r.pen_id);
    end if;
    if coalesce(r.eggs_collected, 0) > 0 then
      insert into public.stock_movements (moved_on, item, movement, quantity, source_table, source_id, pen_id)
      values (r.record_date, 'eggs', 'collected', r.eggs_collected - coalesce(r.eggs_cracked, 0), 'production_records', r.id, r.pen_id);
    end if;
    if coalesce(r.eggs_cracked, 0) > 0 then
      insert into public.stock_movements (moved_on, item, movement, quantity, source_table, source_id, pen_id)
      values (r.record_date, 'cracked_eggs', 'collected', r.eggs_cracked, 'production_records', r.id, r.pen_id);
    end if;
  end if;
  -- A soft-deleted record also takes its medication out of the ledger.
  if tg_op = 'UPDATE' and (new.deleted_at is distinct from old.deleted_at or new.record_date is distinct from old.record_date) then
    update public.production_medications set quantity = quantity where production_record_id = r.id;
  end if;
  return null;
end;
$function$;

create or replace function private.profile_employee()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  insert into public.employees (full_name, phone, job_title, profile_id, pay_basis, pay_rate, started_on, is_active)
  select new.full_name, new.phone, (select r.name from public.roles r where r.id = new.role_id), new.id,
         'monthly', 0, private.farm_today(), new.is_active
  where not exists (select 1 from public.employees e where e.profile_id = new.id);
  return null;
end;
$function$;

-- Keep the employee's name, phone and job in step with the login.
create or replace function private.profile_employee_sync()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
$function$;

-- Birds received on a purchase and how many are still in stock.
create or replace function private.purchase_birds_left(purchase bigint, except_placement bigint DEFAULT NULL::bigint)
 RETURNS integer
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select (coalesce(p.received_quantity, p.quantity) - p.returned_quantity)::integer
       - coalesce((select sum(fp.birds) from public.flock_placements fp
                   where fp.purchase_id = p.id and fp.id is distinct from except_placement), 0)::integer
  from public.purchases p where p.id = purchase
$function$;

create or replace function private.purchase_ref()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
begin
  if new.ref is null then
    new.ref := case new.kind
      when 'feed' then private.next_ref('PF-', 'public.purchase_feed_ref_seq')
      when 'birds' then private.next_ref('PB-', 'public.purchase_bird_ref_seq')
      else private.next_ref('PM-', 'public.purchase_med_ref_seq')
    end;
  end if;
  return new;
end;
$function$;

create or replace function private.purchase_stock()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  r public.purchases := coalesce(new, old);
begin
  perform private.clear_movements('purchases', r.id);
  if tg_op <> 'DELETE' and r.deleted_at is null and r.status = 'received' and r.kind <> 'birds' then
    insert into public.stock_movements (moved_on, item, feed_type_id, medication_id, purchase_id, movement, quantity, source_table, source_id)
    values (
      r.received_on,
      case r.kind when 'feed' then 'feed'::public.stock_item else 'medication'::public.stock_item end,
      r.feed_type_id, r.medication_id,
      case when r.kind = 'medication' then r.id end,
      'received',
      (coalesce(r.received_quantity, r.quantity) - r.returned_quantity) * r.stock_units_per_unit,
      'purchases', r.id
    );
  end if;
  return null;
end;
$function$;

create or replace function private.recalc_flock(f bigint)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
$function$;

create or replace function private.recalc_payslip(line bigint)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  l public.payroll_lines;
  extra numeric;
  taken numeric;
  pay numeric;
begin
  select * into l from public.payroll_lines where id = line;
  if not found then
    return;
  end if;
  pay := round(l.rate * l.units, 2);
  select coalesce(sum(amount) filter (where kind = 'earning'), 0),
         coalesce(sum(amount) filter (where kind <> 'earning'), 0)
    into extra, taken
  from public.payslip_items where line_id = line;
  update public.payroll_lines pl
  set basic = pay, gross = pay + extra, deductions = taken, net = pay + extra - taken
  where pl.id = line
    and (pl.basic, pl.gross, pl.deductions, pl.net) is distinct from (pay, pay + extra, taken, pay + extra - taken);
end;
$function$;

create or replace function private.reorder_decided()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  if new.status is distinct from old.status then
    new.decided_by := (select auth.uid());
    new.decided_at := now();
  end if;
  return new;
end;
$function$;

-- Sales below the product's minimum price wait for approval (FR-SAL-5); approvals are managers' only.
create or replace function private.sale_approval()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare
  min_price numeric;
begin
  select p.min_price into min_price from public.products p where p.id = new.product_id;

  if tg_op = 'INSERT' then
    new.approval := case when min_price is not null and new.unit_price < min_price then 'pending' else 'approved' end;
    new.approved_by := null;
    new.approved_at := null;
  elsif new.approval is distinct from old.approval then
    if not private.is_manager() and current_user = 'authenticated' then
      raise exception 'Only the farm manager or owner can approve or reject a sale' using errcode = '42501';
    end if;
    new.approved_by := (select auth.uid());
    new.approved_at := now();
  elsif new.unit_price is distinct from old.unit_price and min_price is not null and new.unit_price < min_price then
    new.approval := 'pending';
    new.approved_by := null;
    new.approved_at := null;
  end if;
  return new;
end;
$function$;

create or replace function private.sale_date_allowed()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
$function$;

create or replace function private.sale_portions_changed()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  f bigint;
begin
  for f in select distinct a.flock_id from public.sale_allocations a where a.sale_id = new.id and a.flock_id is not null loop
    perform private.recalc_flock(f);
  end loop;
  return null;
end;
$function$;

create or replace function private.sale_stock()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  s public.sales := coalesce(new, old);
  p public.products;
  available numeric;
begin
  perform private.clear_movements('sales', s.id);
  if tg_op = 'DELETE' or s.deleted_at is not null or s.approval = 'rejected' then
    return null;
  end if;
  select * into p from public.products where id = s.product_id;
  if p.stock_item is null then
    return null;
  end if;

  -- FR-SAL-2: can't sell more eggs than are in the store.
  select coalesce(sum(sm.quantity), 0) into available
  from public.stock_movements sm where sm.item = p.stock_item;
  if s.quantity * p.stock_units_per_unit > available then
    raise exception 'Only % % in the store', available, replace(p.stock_item::text, '_', ' ') using errcode = '23514';
  end if;

  insert into public.stock_movements (moved_on, item, movement, quantity, source_table, source_id, pen_id)
  values (s.sold_on, p.stock_item, 'sold', -(s.quantity * p.stock_units_per_unit), 'sales', s.id, s.pen_id);
  return null;
end;
$function$;

create or replace function private.set_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
begin
  new.updated_at := now();
  return new;
end;
$function$;

-- Soft deletes. Deleting or restoring a record needs delete permission for its module (passed as
-- the trigger argument) — editing rights alone aren't enough.
create or replace function private.soft_delete()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
begin
  if new.deleted_at is not distinct from old.deleted_at then
    return new;
  end if;
  if current_user = 'authenticated' and not private.can(tg_argv[0]::public.app_module, 'delete') then
    raise exception 'Only roles with delete permission can delete or restore records' using errcode = '42501';
  end if;
  if new.deleted_at is not null then
    new.deleted_by := (select auth.uid());
  else
    -- Restored: the audit log keeps who deleted it and why.
    new.deleted_by := null;
    new.delete_reason := null;
  end if;
  return new;
end;
$function$;

-- Sources: [{"purchase_id": 12, "birds": 1000}, {"purchase_id": null, "birds": 50, "cost_per_bird": 900}]
create or replace function private.sources_total(sources jsonb)
 RETURNS integer
 LANGUAGE plpgsql
 IMMUTABLE
 SET search_path TO ''
AS $function$
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
$function$;

create or replace function private.staff_names()
 RETURNS TABLE(id uuid, full_name text, role_id text, is_active boolean)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select p.id, p.full_name, p.role_id, p.is_active
  from public.profiles p
  where (select auth.uid()) is not null
$function$;

-- Non-managers can change their own records only within the edit window (BRD §4 rules).
create or replace function private.within_edit_window(recorded_by uuid, created_at timestamp with time zone)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select private.is_manager() or (
    recorded_by = (select auth.uid())
    and (created_at at time zone 'Africa/Lagos')::date
        >= private.farm_today() - (select fs.edit_window_days from public.farm_settings fs)
  )
$function$;

-- Birds added to a flock after it was placed (top-ups). They join the flock's count on that day.
create or replace function public.add_birds_to_flock(flock_id bigint, placed_on date, sources jsonb)
 RETURNS void
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
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
$function$;

-- Owner: lock the month, post one Labour expense for total gross pay, close repaid loans.
create or replace function public.approve_payroll(run_id bigint)
 RETURNS payroll_runs
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare
  run public.payroll_runs;
  total numeric;
  staff integer;
  expense bigint;
  category bigint;
begin
  if not private.is_owner() then
    raise exception 'Only the owner can approve payroll' using errcode = '42501';
  end if;
  select * into run from public.payroll_runs r where r.id = run_id;
  if not found or run.status <> 'draft' then
    raise exception 'That payroll month isn''t a draft' using errcode = '23514';
  end if;
  if exists (select 1 from public.payroll_lines l where l.run_id = run.id and l.net < 0) then
    raise exception 'A payslip has deductions larger than its pay; reduce them first' using errcode = '23514';
  end if;
  select coalesce(sum(gross), 0), count(*) into total, staff from public.payroll_lines l where l.run_id = run.id;
  if total > 0 then
    select id into category from public.expense_categories where name = 'Labour';
    insert into public.expenses (spent_on, category_id, description, amount, amount_paid, recorded_by)
    values (
      least((run.period + interval '1 month - 1 day')::date, private.farm_today()),
      category,
      'Payroll · ' || to_char(run.period, 'FMMonth YYYY') || ' (' || staff || ' staff)',
      total, total, (select auth.uid())
    )
    returning id into expense;
  end if;
  update public.payroll_runs r
  set status = 'approved', approved_by = (select auth.uid()), approved_at = now(), expense_id = expense
  where r.id = run.id
  returning * into run;
  update public.employee_loans ln set status = 'repaid'
  where ln.status = 'active' and exists (select 1 from public.employee_loan_balances b where b.loan_id = ln.id and b.balance <= 0);
  return run;
end;
$function$;

-- Record net pay going out for one or more payslips of an approved month.
create or replace function public.pay_payroll_lines(line_ids bigint[], paid_on date, method payment_method, reference text DEFAULT NULL::text)
 RETURNS void
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
begin
  if not private.can('payroll', 'edit') then
    raise exception 'permission denied to record pay' using errcode = '42501';
  end if;
  if exists (select 1 from public.payroll_lines l join public.payroll_runs r on r.id = l.run_id
             where l.id = any(line_ids) and r.status <> 'approved') then
    raise exception 'Approve the month before recording pay' using errcode = '23514';
  end if;
  update public.payroll_lines l
  set paid_on = pay_payroll_lines.paid_on, payment_method = method, payment_ref = reference
  where l.id = any(line_ids);
end;
$function$;

create or replace function public.place_flock(flock jsonb, sources jsonb)
 RETURNS flocks
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
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
$function$;

-- Adds a line for each employee working that month and this month's loan repayments. Running it
-- again only adds what's missing, so changes made to the draft are kept.
create or replace function public.prepare_payroll(period date)
 RETURNS payroll_runs
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare
  run public.payroll_runs;
  month_end date := (date_trunc('month', period) + interval '1 month - 1 day')::date;
  days_in_month integer := extract(day from (date_trunc('month', period) + interval '1 month - 1 day'))::integer;
  e record;
  ln record;
  line_id bigint;
begin
  if not private.can('payroll', 'add') then
    raise exception 'permission denied to prepare payroll' using errcode = '42501';
  end if;
  period := date_trunc('month', period)::date;
  select * into run from public.payroll_runs r where r.period = prepare_payroll.period;
  if not found then
    insert into public.payroll_runs (period) values (prepare_payroll.period) returning * into run;
  elsif run.status = 'approved' then
    raise exception 'That payroll month is approved and locked' using errcode = '23514';
  end if;

  for e in
    select * from public.employees x
    where x.started_on <= month_end and (x.left_on is null or x.left_on >= prepare_payroll.period)
      and (x.is_active or x.left_on is not null)
  loop
    if not exists (select 1 from public.payroll_lines pl where pl.run_id = run.id and pl.employee_id = e.id) then
      insert into public.payroll_lines (run_id, employee_id, pay_basis, rate, units)
      values (
        run.id, e.id, e.pay_basis, e.pay_rate,
        case e.pay_basis
          -- Monthly staff: the share of the month they were employed.
          when 'monthly' then round(((least(coalesce(e.left_on, month_end), month_end) - greatest(e.started_on, prepare_payroll.period) + 1)::numeric / days_in_month), 4)
          -- Casuals: days or weeks are entered by hand.
          else 0
        end
      )
      returning id into line_id;
      perform private.recalc_payslip(line_id);
    end if;
  end loop;

  -- This month's repayment on each running advance or loan, never more than what's left.
  for ln in
    select b.*, pl.id as pl_id from public.employee_loan_balances b
    join public.payroll_lines pl on pl.run_id = run.id and pl.employee_id = b.employee_id
    where b.status = 'active' and b.first_month <= prepare_payroll.period and b.balance > 0
      and not exists (select 1 from public.payslip_items i where i.line_id = pl.id and i.loan_id = b.loan_id)
  loop
    insert into public.payslip_items (line_id, kind, label, amount, loan_id)
    values (ln.pl_id, 'loan', case ln.kind when 'advance' then 'Salary advance ' else 'Loan repayment ' end || ln.ref,
            least(ln.monthly_repayment, ln.balance), ln.loan_id);
  end loop;
  return run;
end;
$function$;

-- Runs as the caller, so the sales and sale_allocations policies apply.
create or replace function public.record_sale(sale jsonb, portions jsonb DEFAULT '[]'::jsonb)
 RETURNS sales
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
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
$function$;

-- entry: {"pen_id", "flock_id", "record_date", "mortality", "feed_type_id", "feed_bags",
--         "eggs_collected", "eggs_cracked", "notes"}
-- medications: [{"medication_id", "quantity", "mode", "purpose"}]
create or replace function public.save_daily_entry(entry jsonb, medications jsonb DEFAULT '[]'::jsonb, entry_id bigint DEFAULT NULL::bigint)
 RETURNS bigint
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare
  rid bigint;
  changed integer;
begin
  if entry_id is null then
    insert into public.production_records (pen_id, flock_id, record_date, mortality, feed_type_id, feed_bags, eggs_collected, eggs_cracked, notes, recorded_by)
    values (
      (entry ->> 'pen_id')::bigint,
      (entry ->> 'flock_id')::bigint,
      coalesce((entry ->> 'record_date')::date, private.farm_today()),
      coalesce((entry ->> 'mortality')::integer, 0),
      (entry ->> 'feed_type_id')::bigint,
      coalesce((entry ->> 'feed_bags')::numeric, 0),
      (entry ->> 'eggs_collected')::integer,
      (entry ->> 'eggs_cracked')::integer,
      nullif(trim(entry ->> 'notes'), ''),
      (select auth.uid())
    )
    returning id into rid;
  else
    update public.production_records pr set
      mortality = coalesce((entry ->> 'mortality')::integer, 0),
      feed_type_id = (entry ->> 'feed_type_id')::bigint,
      feed_bags = coalesce((entry ->> 'feed_bags')::numeric, 0),
      eggs_collected = (entry ->> 'eggs_collected')::integer,
      eggs_cracked = (entry ->> 'eggs_cracked')::integer,
      notes = nullif(trim(entry ->> 'notes'), '')
    where pr.id = entry_id and pr.deleted_at is null;
    get diagnostics changed = row_count;
    if changed = 0 then
      -- The edit rule refused it, or it's gone: say so instead of pretending it saved.
      raise exception 'This entry can no longer be changed here — ask the farm manager or owner' using errcode = '42501';
    end if;
    rid := entry_id;
    delete from public.production_medications pm where pm.production_record_id = rid;
  end if;

  insert into public.production_medications (production_record_id, medication_id, quantity, mode, purpose)
  select rid, (m ->> 'medication_id')::bigint, (m ->> 'quantity')::numeric,
         (m ->> 'mode')::public.medication_mode, (m ->> 'purpose')::public.medication_purpose
  from jsonb_array_elements(coalesce(medications, '[]'::jsonb)) m;
  return rid;
end;
$function$;

-- Owner: change where a flock's first-day birds came from (and so how many were placed).
create or replace function public.set_flock_sources(flock_id bigint, sources jsonb)
 RETURNS void
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
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
$function$;

create or replace function public.set_sale_allocations(sale_id bigint, portions jsonb)
 RETURNS void
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
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
$function$;

create or replace function public.staff_names()
 RETURNS TABLE(id uuid, full_name text, role_id text, is_active boolean)
 LANGUAGE sql
 STABLE
 SET search_path TO ''
AS $function$
  select * from private.staff_names()
$function$;

-- ════════════════════════════════════════════════════════════════════
-- 5. Tables
-- Primary keys, unique and check constraints are inline; foreign keys follow in section 6
-- so the tables can be created in any order.
-- ════════════════════════════════════════════════════════════════════

create table public.adjustment_reasons (
  id bigint generated always as identity,
  name text not null,
  is_active boolean default true not null,
  constraint adjustment_reasons_pkey PRIMARY KEY (id),
  constraint adjustment_reasons_name_key UNIQUE (name)
);

create table public.alert_marks (
  alert_id text not null,
  status text not null,
  note text,
  marked_by uuid default auth.uid() not null,
  marked_at timestamp with time zone default now() not null,
  constraint alert_marks_alert_id_check CHECK (((length(alert_id) >= 1) AND (length(alert_id) <= 200))),
  constraint alert_marks_status_check CHECK ((status = ANY (ARRAY['acknowledged'::text, 'resolved'::text]))),
  constraint alert_marks_pkey PRIMARY KEY (alert_id)
);

create table public.audit_log (
  id bigint generated always as identity,
  occurred_at timestamp with time zone default now() not null,
  actor_id uuid,
  table_name text not null,
  record_id text not null,
  action text not null,
  old_data jsonb,
  new_data jsonb,
  constraint audit_log_action_check CHECK ((action = ANY (ARRAY['insert'::text, 'update'::text, 'delete'::text]))),
  constraint audit_log_pkey PRIMARY KEY (id)
);

create table public.bird_types (
  id bigint generated always as identity,
  name text not null,
  lays_eggs boolean default false not null,
  is_active boolean default true not null,
  constraint bird_types_pkey PRIMARY KEY (id),
  constraint bird_types_name_key UNIQUE (name)
);

create table public.customers (
  id bigint generated always as identity,
  name text not null,
  short_name text,
  phone text,
  address text,
  area text,
  customer_type customer_type default 'regular'::customer_type not null,
  buys product_kind[] default '{}'::product_kind[] not null,
  whatsapp_opt_in boolean default false not null,
  opening_balance numeric(14,2) default 0 not null,
  opening_balance_source text,
  opening_balance_checked boolean default false not null,
  is_active boolean default true not null,
  created_by uuid default auth.uid(),
  created_at timestamp with time zone default now() not null,
  updated_at timestamp with time zone default now() not null,
  constraint customers_name_check CHECK ((length(TRIM(BOTH FROM name)) > 0)),
  constraint customers_pkey PRIMARY KEY (id)
);

create table public.employee_loans (
  id bigint generated always as identity,
  ref text not null,
  employee_id bigint not null,
  kind loan_kind not null,
  amount numeric(14,2) not null,
  issued_on date default private.farm_today() not null,
  payment_method payment_method,
  reason text,
  monthly_repayment numeric(14,2) not null,
  first_month date not null,
  status loan_status default 'pending'::loan_status not null,
  requested_by uuid default auth.uid(),
  approved_by uuid,
  approved_at timestamp with time zone,
  created_at timestamp with time zone default now() not null,
  constraint employee_loans_amount_check CHECK ((amount > (0)::numeric)),
  constraint employee_loans_check CHECK (((kind = 'loan'::loan_kind) OR (monthly_repayment = amount))),
  constraint employee_loans_first_month_check CHECK ((EXTRACT(day FROM first_month) = (1)::numeric)),
  constraint employee_loans_monthly_repayment_check CHECK ((monthly_repayment > (0)::numeric)),
  constraint employee_loans_pkey PRIMARY KEY (id),
  constraint employee_loans_ref_key UNIQUE (ref)
);

create table public.employees (
  id bigint generated always as identity,
  full_name text not null,
  phone text,
  job_title text,
  profile_id uuid,
  pay_basis pay_basis default 'monthly'::pay_basis not null,
  pay_rate numeric(14,2) default 0 not null,
  started_on date default private.farm_today() not null,
  left_on date,
  bank_name text,
  account_number text,
  account_name text,
  notes text,
  is_active boolean default true not null,
  created_by uuid default auth.uid(),
  created_at timestamp with time zone default now() not null,
  updated_at timestamp with time zone default now() not null,
  constraint employees_check CHECK (((left_on IS NULL) OR (left_on >= started_on))),
  constraint employees_full_name_check CHECK ((length(TRIM(BOTH FROM full_name)) > 0)),
  constraint employees_pay_rate_check CHECK ((pay_rate >= (0)::numeric)),
  constraint employees_pkey PRIMARY KEY (id),
  constraint employees_profile_id_key UNIQUE (profile_id)
);

create table public.expense_categories (
  id bigint generated always as identity,
  name text not null,
  is_active boolean default true not null,
  statement_line text default 'misc'::text not null,
  constraint expense_categories_statement_line_check CHECK ((statement_line = ANY (ARRAY['labour'::text, 'utilities'::text, 'supplies'::text, 'healthcare'::text, 'maintenance'::text, 'transport'::text, 'marketing'::text, 'permits'::text, 'misc'::text]))),
  constraint expense_categories_pkey PRIMARY KEY (id),
  constraint expense_categories_name_key UNIQUE (name)
);
comment on column public.expense_categories.statement_line is 'Income Statement line: labour, utilities, supplies, healthcare, maintenance (operating); transport, marketing, permits, misc (overheads).';

create table public.expenses (
  id bigint generated always as identity,
  ref text default private.next_ref('E-'::text, 'expense_ref_seq'::regclass) not null,
  spent_on date default private.farm_today() not null,
  category_id bigint not null,
  description text not null,
  amount numeric(14,2) not null,
  supplier_id bigint,
  amount_paid numeric(14,2) not null,
  payment_method payment_method,
  pen_id bigint,
  receipt_path text,
  recorded_by uuid default auth.uid() not null,
  created_at timestamp with time zone default now() not null,
  updated_at timestamp with time zone default now() not null,
  deleted_at timestamp with time zone,
  deleted_by uuid,
  delete_reason text,
  constraint expenses_amount_check CHECK ((amount > (0)::numeric)),
  constraint expenses_amount_paid_check CHECK ((amount_paid >= (0)::numeric)),
  constraint expenses_check CHECK (((supplier_id IS NOT NULL) OR (amount_paid = amount))),
  constraint expenses_check1 CHECK (((deleted_at IS NULL) OR (delete_reason IS NOT NULL))),
  constraint expenses_description_check CHECK ((length(TRIM(BOTH FROM description)) > 0)),
  constraint expenses_pkey PRIMARY KEY (id),
  constraint expenses_ref_key UNIQUE (ref)
);

create table public.farm_settings (
  id boolean default true not null,
  farm_name text not null,
  trading_as text,
  address text,
  phone text,
  email text,
  logo_path text,
  currency text default 'NGN'::text not null,
  time_zone text default 'Africa/Lagos'::text not null,
  financial_year_start_month smallint default 1 not null,
  go_live_date date,
  receipt_footer text,
  whatsapp_sender text,
  whatsapp_monthly_limit integer,
  mortality_alert_pct numeric(5,2) default 0.5 not null,
  feed_variance_pct numeric(5,2) default 10 not null,
  low_stock_days smallint default 5 not null,
  expiry_warning_days smallint default 30 not null,
  missing_entry_cutoff time without time zone default '18:00:00'::time without time zone not null,
  overdue_debt_days smallint default 60 not null,
  eggs_per_crate smallint default 30 not null,
  edit_window_days smallint default 0 not null,
  updated_at timestamp with time zone default now() not null,
  spread_rearing_cost boolean default false not null,
  layer_laying_weeks integer default 60 not null,
  constraint farm_settings_edit_window_days_check CHECK ((edit_window_days >= 0)),
  constraint farm_settings_eggs_per_crate_check CHECK ((eggs_per_crate > 0)),
  constraint farm_settings_expiry_warning_days_check CHECK ((expiry_warning_days >= 0)),
  constraint farm_settings_feed_variance_pct_check CHECK ((feed_variance_pct >= (0)::numeric)),
  constraint farm_settings_financial_year_start_month_check CHECK (((financial_year_start_month >= 1) AND (financial_year_start_month <= 12))),
  constraint farm_settings_id_check CHECK (id),
  constraint farm_settings_layer_laying_weeks_check CHECK ((layer_laying_weeks > 0)),
  constraint farm_settings_low_stock_days_check CHECK ((low_stock_days >= 0)),
  constraint farm_settings_mortality_alert_pct_check CHECK ((mortality_alert_pct >= (0)::numeric)),
  constraint farm_settings_overdue_debt_days_check CHECK ((overdue_debt_days >= 0)),
  constraint farm_settings_whatsapp_monthly_limit_check CHECK ((whatsapp_monthly_limit >= 0)),
  constraint farm_settings_pkey PRIMARY KEY (id)
);
comment on column public.farm_settings.spread_rearing_cost is 'P&L opens in the view that spreads each layer flock''s rearing cost over its laying period.';
comment on column public.farm_settings.layer_laying_weeks is 'Expected laying life of a layer flock, in weeks, for spreading its rearing cost.';

-- Expected feed per bird per day by age band (BRD §7.2).
create table public.feed_targets (
  id bigint generated always as identity,
  bird_type_id bigint not null,
  breed text,
  week_from smallint not null,
  week_to smallint,
  grams_per_bird_day numeric(7,2) not null,
  recommended_feed_type_id bigint,
  constraint feed_targets_check CHECK (((week_to IS NULL) OR (week_to >= week_from))),
  constraint feed_targets_grams_per_bird_day_check CHECK ((grams_per_bird_day > (0)::numeric)),
  constraint feed_targets_week_from_check CHECK ((week_from >= 1)),
  constraint feed_targets_pkey PRIMARY KEY (id)
);

create table public.feed_types (
  id bigint generated always as identity,
  name text not null,
  bag_kg numeric(6,2) default 25 not null,
  reorder_level_bags numeric(10,2) default 0 not null,
  is_active boolean default true not null,
  constraint feed_types_bag_kg_check CHECK ((bag_kg > (0)::numeric)),
  constraint feed_types_reorder_level_bags_check CHECK ((reorder_level_bags >= (0)::numeric)),
  constraint feed_types_pkey PRIMARY KEY (id),
  constraint feed_types_name_key UNIQUE (name)
);

create table public.finance_entries (
  id bigint generated always as identity,
  ref text default private.next_ref('FE-'::text, 'finance_ref_seq'::regclass) not null,
  entry_on date default private.farm_today() not null,
  kind finance_kind not null,
  amount numeric(14,2) not null,
  account text not null,
  counterparty text,
  loan_term text,
  notes text,
  recorded_by uuid default auth.uid(),
  created_at timestamp with time zone default now() not null,
  constraint finance_entries_account_check CHECK ((account = ANY (ARRAY['cash'::text, 'bank'::text]))),
  constraint finance_entries_amount_check CHECK ((amount > (0)::numeric)),
  constraint finance_entries_check CHECK (((kind <> ALL (ARRAY['loan_received'::finance_kind, 'loan_repaid'::finance_kind])) OR ((counterparty IS NOT NULL) AND (loan_term IS NOT NULL)))),
  constraint finance_entries_loan_term_check CHECK ((loan_term = ANY (ARRAY['short'::text, 'long'::text]))),
  constraint finance_entries_pkey PRIMARY KEY (id),
  constraint finance_entries_ref_key UNIQUE (ref)
);

create table public.fixed_assets (
  id bigint generated always as identity,
  name text not null,
  category asset_category not null,
  acquired_on date not null,
  cost numeric(14,2) not null,
  useful_life_months integer,
  salvage_value numeric(14,2) default 0 not null,
  paid_from text,
  disposed_on date,
  disposal_amount numeric(14,2),
  disposal_account text,
  notes text,
  created_by uuid default auth.uid(),
  created_at timestamp with time zone default now() not null,
  constraint fixed_assets_check CHECK (((disposed_on IS NULL) OR (disposed_on >= acquired_on))),
  constraint fixed_assets_check1 CHECK (((category <> 'land'::asset_category) OR (useful_life_months IS NULL))),
  constraint fixed_assets_check2 CHECK ((salvage_value <= cost)),
  constraint fixed_assets_cost_check CHECK ((cost >= (0)::numeric)),
  constraint fixed_assets_disposal_account_check CHECK ((disposal_account = ANY (ARRAY['cash'::text, 'bank'::text]))),
  constraint fixed_assets_disposal_amount_check CHECK (((disposal_amount IS NULL) OR (disposal_amount >= (0)::numeric))),
  constraint fixed_assets_name_check CHECK ((length(TRIM(BOTH FROM name)) > 0)),
  constraint fixed_assets_paid_from_check CHECK ((paid_from = ANY (ARRAY['cash'::text, 'bank'::text]))),
  constraint fixed_assets_salvage_value_check CHECK ((salvage_value >= (0)::numeric)),
  constraint fixed_assets_useful_life_months_check CHECK (((useful_life_months IS NULL) OR (useful_life_months > 0))),
  constraint fixed_assets_pkey PRIMARY KEY (id)
);

create table public.flock_placements (
  id bigint generated always as identity,
  flock_id bigint not null,
  purchase_id bigint,
  placed_on date not null,
  birds integer not null,
  cost_per_bird numeric(14,2),
  created_by uuid default auth.uid(),
  created_at timestamp with time zone default now() not null,
  constraint flock_placements_birds_check CHECK ((birds > 0)),
  constraint flock_placements_cost_per_bird_check CHECK (((cost_per_bird IS NULL) OR (cost_per_bird >= (0)::numeric))),
  constraint flock_placements_pkey PRIMARY KEY (id)
);

create table public.flocks (
  id bigint generated always as identity,
  code text not null,
  pen_id bigint not null,
  bird_type_id bigint not null,
  breed text,
  placed_on date not null,
  age_at_placement_days integer default 0 not null,
  birds_placed integer not null,
  status flock_status default 'active'::flock_status not null,
  closed_on date,
  notes text,
  created_by uuid default auth.uid(),
  created_at timestamp with time zone default now() not null,
  updated_at timestamp with time zone default now() not null,
  laying_started_on date,
  close_reason text,
  close_note text,
  constraint flocks_age_at_placement_days_check CHECK ((age_at_placement_days >= 0)),
  constraint flocks_birds_placed_check CHECK ((birds_placed > 0)),
  constraint flocks_check CHECK (((closed_on IS NULL) OR (closed_on >= placed_on))),
  constraint flocks_check1 CHECK (((status = 'closed'::flock_status) = (closed_on IS NOT NULL))),
  constraint flocks_close_reason_check CHECK ((close_reason = ANY (ARRAY['sold_out'::text, 'culled'::text, 'moved'::text, 'died'::text, 'other'::text]))),
  constraint flocks_pkey PRIMARY KEY (id),
  constraint flocks_code_key UNIQUE (code)
);
comment on column public.flocks.laying_started_on is 'Point of lay: first day counted as laying. Rearing cost runs from placed_on to the day before.';
comment on column public.flocks.close_reason is 'Why the flock was closed: sold_out, culled, moved, died or other.';

create table public.medications (
  id bigint generated always as identity,
  name text not null,
  category medication_category not null,
  default_mode medication_mode,
  default_purpose medication_purpose,
  dosage_note text,
  withdrawal_days smallint,
  stock_unit text not null,
  reorder_level numeric(12,2) default 0 not null,
  is_active boolean default true not null,
  constraint medications_reorder_level_check CHECK ((reorder_level >= (0)::numeric)),
  constraint medications_stock_unit_check CHECK ((stock_unit = ANY (ARRAY['ml'::text, 'g'::text, 'kg'::text, 'vial'::text, 'sachet'::text, 'dose'::text]))),
  constraint medications_withdrawal_days_check CHECK ((withdrawal_days >= 0)),
  constraint medications_pkey PRIMARY KEY (id),
  constraint medications_name_key UNIQUE (name)
);

create table public.payments (
  id bigint generated always as identity,
  ref text not null,
  paid_on date default private.farm_today() not null,
  direction payment_direction not null,
  customer_id bigint,
  supplier_id bigint,
  amount numeric(14,2) not null,
  method payment_method not null,
  reference text,
  notes text,
  recorded_by uuid default auth.uid() not null,
  created_at timestamp with time zone default now() not null,
  updated_at timestamp with time zone default now() not null,
  deleted_at timestamp with time zone,
  deleted_by uuid,
  delete_reason text,
  sale_id bigint,
  constraint payments_amount_check CHECK ((amount > (0)::numeric)),
  constraint payments_check CHECK ((((direction = 'in'::payment_direction) AND (customer_id IS NOT NULL) AND (supplier_id IS NULL)) OR ((direction = 'out'::payment_direction) AND (supplier_id IS NOT NULL) AND (customer_id IS NULL)))),
  constraint payments_check1 CHECK (((deleted_at IS NULL) OR (delete_reason IS NOT NULL))),
  constraint payments_sale_is_money_in CHECK (((sale_id IS NULL) OR (direction = 'in'::payment_direction))),
  constraint payments_pkey PRIMARY KEY (id),
  constraint payments_ref_key UNIQUE (ref)
);
comment on column public.payments.sale_id is 'The sale this payment was taken for (applied to it first); null for general payments that clear the oldest bills.';

create table public.payroll_lines (
  id bigint generated always as identity,
  run_id bigint not null,
  employee_id bigint not null,
  pay_basis pay_basis not null,
  rate numeric(14,2) not null,
  units numeric(8,4) default 0 not null,
  basic numeric(14,2) default 0 not null,
  gross numeric(14,2) default 0 not null,
  deductions numeric(14,2) default 0 not null,
  net numeric(14,2) default 0 not null,
  paid_on date,
  payment_method payment_method,
  payment_ref text,
  constraint payroll_lines_rate_check CHECK ((rate >= (0)::numeric)),
  constraint payroll_lines_units_check CHECK ((units >= (0)::numeric)),
  constraint payroll_lines_pkey PRIMARY KEY (id),
  constraint payroll_lines_run_id_employee_id_key UNIQUE (run_id, employee_id)
);

create table public.payroll_runs (
  id bigint generated always as identity,
  period date not null,
  status payroll_status default 'draft'::payroll_status not null,
  prepared_by uuid default auth.uid(),
  approved_by uuid,
  approved_at timestamp with time zone,
  expense_id bigint,
  notes text,
  created_at timestamp with time zone default now() not null,
  constraint payroll_runs_period_check CHECK ((EXTRACT(day FROM period) = (1)::numeric)),
  constraint payroll_runs_pkey PRIMARY KEY (id),
  constraint payroll_runs_period_key UNIQUE (period)
);

create table public.payslip_items (
  id bigint generated always as identity,
  line_id bigint not null,
  kind payslip_item_kind not null,
  label text not null,
  amount numeric(14,2) not null,
  loan_id bigint,
  constraint payslip_items_amount_check CHECK ((amount >= (0)::numeric)),
  constraint payslip_items_check CHECK (((kind = 'loan'::payslip_item_kind) = (loan_id IS NOT NULL))),
  constraint payslip_items_label_check CHECK ((length(TRIM(BOTH FROM label)) > 0)),
  constraint payslip_items_pkey PRIMARY KEY (id)
);

create table public.pens (
  id bigint generated always as identity,
  name text not null,
  capacity integer not null,
  bird_type_id bigint,
  is_active boolean default true not null,
  created_at timestamp with time zone default now() not null,
  description text,
  constraint pens_capacity_check CHECK ((capacity > 0)),
  constraint pens_pkey PRIMARY KEY (id),
  constraint pens_name_key UNIQUE (name)
);
comment on column public.pens.bird_type_id is 'Superseded: the flock placed in a pen decides its bird type.';

-- Several medications a day are allowed (FR-PRD-2).
create table public.production_medications (
  id bigint generated always as identity,
  production_record_id bigint not null,
  medication_id bigint not null,
  purchase_id bigint,
  quantity numeric(12,2) not null,
  mode medication_mode not null,
  purpose medication_purpose not null,
  created_at timestamp with time zone default now() not null,
  constraint production_medications_quantity_check CHECK ((quantity > (0)::numeric)),
  constraint production_medications_pkey PRIMARY KEY (id)
);

create table public.production_records (
  id bigint generated always as identity,
  pen_id bigint not null,
  flock_id bigint not null,
  record_date date default private.farm_today() not null,
  opening_birds integer default 0 not null,
  mortality integer default 0 not null,
  closing_birds integer generated always as ((opening_birds - mortality)) stored,
  feed_type_id bigint,
  feed_bags numeric(8,2) default 0 not null,
  eggs_collected integer,
  eggs_cracked integer,
  notes text,
  recorded_by uuid default auth.uid() not null,
  created_at timestamp with time zone default now() not null,
  updated_at timestamp with time zone default now() not null,
  deleted_at timestamp with time zone,
  deleted_by uuid,
  delete_reason text,
  constraint production_records_check CHECK (((eggs_cracked IS NULL) OR (eggs_cracked <= COALESCE(eggs_collected, 0)))),
  constraint production_records_check1 CHECK (((feed_bags = (0)::numeric) OR (feed_type_id IS NOT NULL))),
  constraint production_records_check2 CHECK (((deleted_at IS NULL) OR (delete_reason IS NOT NULL))),
  constraint production_records_eggs_collected_check CHECK ((eggs_collected >= 0)),
  constraint production_records_eggs_cracked_check CHECK ((eggs_cracked >= 0)),
  constraint production_records_feed_bags_check CHECK ((feed_bags >= (0)::numeric)),
  constraint production_records_mortality_check CHECK ((mortality >= 0)),
  constraint production_records_pkey PRIMARY KEY (id)
);

create table public.products (
  id bigint generated always as identity,
  name text not null,
  kind product_kind not null,
  unit text not null,
  stock_item stock_item,
  stock_units_per_unit numeric(10,2),
  min_price numeric(14,2),
  is_active boolean default true not null,
  bird_type_id bigint,
  constraint products_check CHECK (((stock_item IS NULL) = (stock_units_per_unit IS NULL))),
  constraint products_min_price_check CHECK ((min_price >= (0)::numeric)),
  constraint products_stock_item_check CHECK (((stock_item IS NULL) OR (stock_item = ANY (ARRAY['eggs'::stock_item, 'cracked_eggs'::stock_item])))),
  constraint products_stock_units_per_unit_check CHECK ((stock_units_per_unit > (0)::numeric)),
  constraint products_pkey PRIMARY KEY (id),
  constraint products_name_key UNIQUE (name)
);
comment on column public.products.bird_type_id is 'For bird products: the bird type a portion''s flock must be (spent layers → Layer).';

create table public.profiles (
  id uuid not null,
  full_name text not null,
  phone text,
  role_id text,
  is_active boolean default true not null,
  whatsapp_opt_in boolean default false not null,
  last_active_at timestamp with time zone,
  created_at timestamp with time zone default now() not null,
  updated_at timestamp with time zone default now() not null,
  constraint profiles_full_name_check CHECK ((length(TRIM(BOTH FROM full_name)) > 0)),
  constraint profiles_pkey PRIMARY KEY (id)
);

create table public.purchases (
  id bigint generated always as identity,
  ref text not null,
  kind purchase_kind not null,
  purchased_on date default private.farm_today() not null,
  supplier_id bigint not null,
  feed_type_id bigint,
  medication_id bigint,
  flock_id bigint,
  quantity numeric(12,2) not null,
  unit text not null,
  stock_units_per_unit numeric(12,2) default 1 not null,
  unit_price numeric(14,2) not null,
  total numeric(14,2) generated always as (round((quantity * unit_price), 2)) stored,
  amount_paid numeric(14,2) default 0 not null,
  payment_method payment_method,
  batch_no text,
  expiry_date date,
  status purchase_status default 'received'::purchase_status not null,
  received_on date,
  received_quantity numeric(12,2),
  returned_quantity numeric(12,2) default 0 not null,
  delivery_note text,
  received_by uuid,
  notes text,
  recorded_by uuid default auth.uid() not null,
  created_at timestamp with time zone default now() not null,
  updated_at timestamp with time zone default now() not null,
  deleted_at timestamp with time zone,
  deleted_by uuid,
  delete_reason text,
  bird_type_id bigint,
  breed text,
  bird_age_days integer default 0 not null,
  constraint purchases_amount_paid_check CHECK ((amount_paid >= (0)::numeric)),
  constraint purchases_bird_age_days_check CHECK ((bird_age_days >= 0)),
  constraint purchases_birds_have_type CHECK (((kind <> 'birds'::purchase_kind) OR (bird_type_id IS NOT NULL))) NOT VALID,
  constraint purchases_check CHECK (((kind = 'feed'::purchase_kind) = (feed_type_id IS NOT NULL))),
  constraint purchases_check1 CHECK (((kind = 'medication'::purchase_kind) = (medication_id IS NOT NULL))),
  constraint purchases_check2 CHECK (((kind = 'birds'::purchase_kind) OR (flock_id IS NULL))),
  constraint purchases_check3 CHECK (((status = 'ordered'::purchase_status) OR (received_on IS NOT NULL))),
  constraint purchases_check4 CHECK ((returned_quantity <= COALESCE(received_quantity, quantity))),
  constraint purchases_check5 CHECK (((deleted_at IS NULL) OR (delete_reason IS NOT NULL))),
  constraint purchases_quantity_check CHECK ((quantity > (0)::numeric)),
  constraint purchases_received_quantity_check CHECK ((received_quantity >= (0)::numeric)),
  constraint purchases_returned_quantity_check CHECK ((returned_quantity >= (0)::numeric)),
  constraint purchases_stock_units_per_unit_check CHECK ((stock_units_per_unit > (0)::numeric)),
  constraint purchases_unit_price_check CHECK ((unit_price >= (0)::numeric)),
  constraint purchases_pkey PRIMARY KEY (id),
  constraint purchases_ref_key UNIQUE (ref)
);
comment on column public.purchases.flock_id is 'Superseded by flock_placements for bird purchases.';

create table public.reorder_requests (
  id bigint generated always as identity,
  item stock_item not null,
  feed_type_id bigint,
  medication_id bigint,
  quantity numeric(12,2) not null,
  unit text not null,
  needed_by date,
  note text,
  status text default 'open'::text not null,
  purchase_id bigint,
  requested_by uuid default auth.uid() not null,
  created_at timestamp with time zone default now() not null,
  decided_by uuid,
  decided_at timestamp with time zone,
  constraint reorder_requests_check CHECK (((item = 'feed'::stock_item) = (feed_type_id IS NOT NULL))),
  constraint reorder_requests_check1 CHECK (((item = 'medication'::stock_item) = (medication_id IS NOT NULL))),
  constraint reorder_requests_item_check CHECK ((item = ANY (ARRAY['feed'::stock_item, 'medication'::stock_item]))),
  constraint reorder_requests_quantity_check CHECK ((quantity > (0)::numeric)),
  constraint reorder_requests_status_check CHECK ((status = ANY (ARRAY['open'::text, 'ordered'::text, 'dismissed'::text]))),
  constraint reorder_requests_pkey PRIMARY KEY (id)
);

create table public.role_permissions (
  role_id text not null,
  module app_module not null,
  can_view access_level default 'none'::access_level not null,
  can_add access_level default 'none'::access_level not null,
  can_edit access_level default 'none'::access_level not null,
  can_delete access_level default 'none'::access_level not null,
  scope_note text default ''::text not null,
  constraint role_permissions_pkey PRIMARY KEY (role_id, module)
);

create table public.roles (
  id text not null,
  name text not null,
  description text default ''::text not null,
  is_system boolean default false not null,
  created_at timestamp with time zone default now() not null,
  constraint roles_id_check CHECK ((id ~ '^[a-z][a-z0-9_]*$'::text)),
  constraint roles_pkey PRIMARY KEY (id),
  constraint roles_name_key UNIQUE (name)
);

create table public.sale_allocations (
  id bigint generated always as identity,
  sale_id bigint not null,
  pen_id bigint not null,
  flock_id bigint,
  quantity numeric(12,2) not null,
  constraint sale_allocations_quantity_check CHECK ((quantity > (0)::numeric)),
  constraint sale_allocations_pkey PRIMARY KEY (id),
  constraint portions_add_up TRIGGER DEFERRABLE INITIALLY DEFERRED,
  constraint sale_allocations_sale_id_pen_id_key UNIQUE (sale_id, pen_id)
);

create table public.sales (
  id bigint generated always as identity,
  ref text default private.next_ref('S-'::text, 'sale_ref_seq'::regclass) not null,
  sold_on date default private.farm_today() not null,
  customer_id bigint,
  buyer_name text,
  pen_id bigint,
  flock_id bigint,
  product_id bigint not null,
  quantity numeric(12,2) not null,
  unit_price numeric(14,2) not null,
  total numeric(14,2) generated always as (round((quantity * unit_price), 2)) stored,
  amount_paid numeric(14,2) default 0 not null,
  payment_method payment_method,
  approval sale_approval default 'approved'::sale_approval not null,
  approved_by uuid,
  approved_at timestamp with time zone,
  notes text,
  recorded_by uuid default auth.uid() not null,
  created_at timestamp with time zone default now() not null,
  updated_at timestamp with time zone default now() not null,
  deleted_at timestamp with time zone,
  deleted_by uuid,
  delete_reason text,
  constraint sales_amount_paid_check CHECK ((amount_paid >= (0)::numeric)),
  constraint sales_check CHECK (((customer_id IS NOT NULL) OR (length(TRIM(BOTH FROM COALESCE(buyer_name, ''::text))) > 0))),
  constraint sales_check1 CHECK (((customer_id IS NOT NULL) OR (amount_paid = total))),
  constraint sales_check2 CHECK (((deleted_at IS NULL) OR (delete_reason IS NOT NULL))),
  constraint sales_quantity_check CHECK ((quantity > (0)::numeric)),
  constraint sales_unit_price_check CHECK ((unit_price >= (0)::numeric)),
  constraint sales_pkey PRIMARY KEY (id),
  constraint portions_add_up TRIGGER DEFERRABLE INITIALLY DEFERRED,
  constraint sales_ref_key UNIQUE (ref)
);
comment on column public.sales.pen_id is 'Superseded by sale_allocations; not written by the app.';
comment on column public.sales.flock_id is 'Superseded by sale_allocations; not written by the app.';

-- Pens a staff member works in. Pen attendants only see these (BRD §4).
create table public.staff_pens (
  profile_id uuid not null,
  pen_id bigint not null,
  constraint staff_pens_pkey PRIMARY KEY (profile_id, pen_id)
);

create table public.stock_adjustments (
  id bigint generated always as identity,
  adjusted_on date default private.farm_today() not null,
  item stock_item not null,
  feed_type_id bigint,
  medication_id bigint,
  purchase_id bigint,
  is_opening boolean default false not null,
  counted_quantity numeric(12,2),
  quantity_change numeric(12,2) not null,
  reason_id bigint,
  note text,
  recorded_by uuid default auth.uid() not null,
  created_at timestamp with time zone default now() not null,
  status text default 'applied'::text not null,
  decided_by uuid,
  decided_at timestamp with time zone,
  constraint stock_adjustments_check CHECK (((item = 'feed'::stock_item) = (feed_type_id IS NOT NULL))),
  constraint stock_adjustments_check1 CHECK (((item = 'medication'::stock_item) = (medication_id IS NOT NULL))),
  constraint stock_adjustments_check2 CHECK ((is_opening OR (reason_id IS NOT NULL))),
  constraint stock_adjustments_counted_quantity_check CHECK ((counted_quantity >= (0)::numeric)),
  constraint stock_adjustments_status_check CHECK ((status = ANY (ARRAY['applied'::text, 'pending'::text, 'rejected'::text]))),
  constraint stock_adjustments_pkey PRIMARY KEY (id)
);
comment on column public.stock_adjustments.status is 'applied changes stock; pending waits for a manager (big count differences); rejected never changes stock.';

create table public.stock_movements (
  id bigint generated always as identity,
  moved_on date not null,
  item stock_item not null,
  feed_type_id bigint,
  medication_id bigint,
  purchase_id bigint,
  movement stock_movement_type not null,
  quantity numeric(12,2) not null,
  source_table text not null,
  source_id bigint not null,
  pen_id bigint,
  created_at timestamp with time zone default now() not null,
  constraint stock_movements_check CHECK (((item = 'feed'::stock_item) = (feed_type_id IS NOT NULL))),
  constraint stock_movements_check1 CHECK (((item = 'medication'::stock_item) = (medication_id IS NOT NULL))),
  constraint stock_movements_pkey PRIMARY KEY (id)
);

create table public.suppliers (
  id bigint generated always as identity,
  name text not null,
  short_name text,
  phone text,
  address text,
  supplies supplier_kind[] default '{}'::supplier_kind[] not null,
  payment_terms_days smallint,
  opening_balance numeric(14,2) default 0 not null,
  opening_balance_source text,
  opening_balance_checked boolean default false not null,
  is_active boolean default true not null,
  created_by uuid default auth.uid(),
  created_at timestamp with time zone default now() not null,
  updated_at timestamp with time zone default now() not null,
  constraint suppliers_name_check CHECK ((length(TRIM(BOTH FROM name)) > 0)),
  constraint suppliers_payment_terms_days_check CHECK ((payment_terms_days >= 0)),
  constraint suppliers_pkey PRIMARY KEY (id),
  constraint suppliers_name_key UNIQUE (name)
);

-- ════════════════════════════════════════════════════════════════════
-- 6. Foreign keys
-- ════════════════════════════════════════════════════════════════════

alter table public.alert_marks add constraint alert_marks_marked_by_fkey FOREIGN KEY (marked_by) REFERENCES profiles(id);

alter table public.audit_log add constraint audit_log_actor_id_fkey FOREIGN KEY (actor_id) REFERENCES profiles(id) ON DELETE SET NULL;

alter table public.customers add constraint customers_created_by_fkey FOREIGN KEY (created_by) REFERENCES profiles(id);

alter table public.employee_loans add constraint employee_loans_approved_by_fkey FOREIGN KEY (approved_by) REFERENCES profiles(id);
alter table public.employee_loans add constraint employee_loans_employee_id_fkey FOREIGN KEY (employee_id) REFERENCES employees(id);
alter table public.employee_loans add constraint employee_loans_requested_by_fkey FOREIGN KEY (requested_by) REFERENCES profiles(id);

alter table public.employees add constraint employees_created_by_fkey FOREIGN KEY (created_by) REFERENCES profiles(id);
alter table public.employees add constraint employees_profile_id_fkey FOREIGN KEY (profile_id) REFERENCES profiles(id);

alter table public.expenses add constraint expenses_category_id_fkey FOREIGN KEY (category_id) REFERENCES expense_categories(id);
alter table public.expenses add constraint expenses_deleted_by_fkey FOREIGN KEY (deleted_by) REFERENCES profiles(id);
alter table public.expenses add constraint expenses_pen_id_fkey FOREIGN KEY (pen_id) REFERENCES pens(id);
alter table public.expenses add constraint expenses_recorded_by_fkey FOREIGN KEY (recorded_by) REFERENCES profiles(id);
alter table public.expenses add constraint expenses_supplier_id_fkey FOREIGN KEY (supplier_id) REFERENCES suppliers(id);

alter table public.feed_targets add constraint feed_targets_bird_type_id_fkey FOREIGN KEY (bird_type_id) REFERENCES bird_types(id);
alter table public.feed_targets add constraint feed_targets_recommended_feed_type_id_fkey FOREIGN KEY (recommended_feed_type_id) REFERENCES feed_types(id);

alter table public.finance_entries add constraint finance_entries_recorded_by_fkey FOREIGN KEY (recorded_by) REFERENCES profiles(id);

alter table public.fixed_assets add constraint fixed_assets_created_by_fkey FOREIGN KEY (created_by) REFERENCES profiles(id);

alter table public.flock_placements add constraint flock_placements_created_by_fkey FOREIGN KEY (created_by) REFERENCES profiles(id);
alter table public.flock_placements add constraint flock_placements_flock_id_fkey FOREIGN KEY (flock_id) REFERENCES flocks(id) ON DELETE CASCADE;
alter table public.flock_placements add constraint flock_placements_purchase_id_fkey FOREIGN KEY (purchase_id) REFERENCES purchases(id);

alter table public.flocks add constraint flocks_bird_type_id_fkey FOREIGN KEY (bird_type_id) REFERENCES bird_types(id);
alter table public.flocks add constraint flocks_created_by_fkey FOREIGN KEY (created_by) REFERENCES profiles(id);
alter table public.flocks add constraint flocks_pen_id_fkey FOREIGN KEY (pen_id) REFERENCES pens(id);

alter table public.payments add constraint payments_customer_id_fkey FOREIGN KEY (customer_id) REFERENCES customers(id);
alter table public.payments add constraint payments_deleted_by_fkey FOREIGN KEY (deleted_by) REFERENCES profiles(id);
alter table public.payments add constraint payments_recorded_by_fkey FOREIGN KEY (recorded_by) REFERENCES profiles(id);
alter table public.payments add constraint payments_sale_id_fkey FOREIGN KEY (sale_id) REFERENCES sales(id);
alter table public.payments add constraint payments_supplier_id_fkey FOREIGN KEY (supplier_id) REFERENCES suppliers(id);

alter table public.payroll_lines add constraint payroll_lines_employee_id_fkey FOREIGN KEY (employee_id) REFERENCES employees(id);
alter table public.payroll_lines add constraint payroll_lines_run_id_fkey FOREIGN KEY (run_id) REFERENCES payroll_runs(id) ON DELETE CASCADE;

alter table public.payroll_runs add constraint payroll_runs_approved_by_fkey FOREIGN KEY (approved_by) REFERENCES profiles(id);
alter table public.payroll_runs add constraint payroll_runs_expense_id_fkey FOREIGN KEY (expense_id) REFERENCES expenses(id);
alter table public.payroll_runs add constraint payroll_runs_prepared_by_fkey FOREIGN KEY (prepared_by) REFERENCES profiles(id);

alter table public.payslip_items add constraint payslip_items_line_id_fkey FOREIGN KEY (line_id) REFERENCES payroll_lines(id) ON DELETE CASCADE;
alter table public.payslip_items add constraint payslip_items_loan_id_fkey FOREIGN KEY (loan_id) REFERENCES employee_loans(id);

alter table public.pens add constraint pens_bird_type_id_fkey FOREIGN KEY (bird_type_id) REFERENCES bird_types(id);

alter table public.production_medications add constraint production_medications_medication_id_fkey FOREIGN KEY (medication_id) REFERENCES medications(id);
alter table public.production_medications add constraint production_medications_production_record_id_fkey FOREIGN KEY (production_record_id) REFERENCES production_records(id) ON DELETE CASCADE;
alter table public.production_medications add constraint production_medications_purchase_id_fkey FOREIGN KEY (purchase_id) REFERENCES purchases(id);

alter table public.production_records add constraint production_records_deleted_by_fkey FOREIGN KEY (deleted_by) REFERENCES profiles(id);
alter table public.production_records add constraint production_records_feed_type_id_fkey FOREIGN KEY (feed_type_id) REFERENCES feed_types(id);
alter table public.production_records add constraint production_records_flock_id_fkey FOREIGN KEY (flock_id) REFERENCES flocks(id);
alter table public.production_records add constraint production_records_pen_id_fkey FOREIGN KEY (pen_id) REFERENCES pens(id);
alter table public.production_records add constraint production_records_recorded_by_fkey FOREIGN KEY (recorded_by) REFERENCES profiles(id);

alter table public.products add constraint products_bird_type_id_fkey FOREIGN KEY (bird_type_id) REFERENCES bird_types(id);

alter table public.profiles add constraint profiles_id_fkey FOREIGN KEY (id) REFERENCES auth.users(id) ON DELETE CASCADE;
alter table public.profiles add constraint profiles_role_id_fkey FOREIGN KEY (role_id) REFERENCES roles(id);

alter table public.purchases add constraint purchases_bird_type_id_fkey FOREIGN KEY (bird_type_id) REFERENCES bird_types(id);
alter table public.purchases add constraint purchases_deleted_by_fkey FOREIGN KEY (deleted_by) REFERENCES profiles(id);
alter table public.purchases add constraint purchases_feed_type_id_fkey FOREIGN KEY (feed_type_id) REFERENCES feed_types(id);
alter table public.purchases add constraint purchases_flock_id_fkey FOREIGN KEY (flock_id) REFERENCES flocks(id);
alter table public.purchases add constraint purchases_medication_id_fkey FOREIGN KEY (medication_id) REFERENCES medications(id);
alter table public.purchases add constraint purchases_received_by_fkey FOREIGN KEY (received_by) REFERENCES profiles(id);
alter table public.purchases add constraint purchases_recorded_by_fkey FOREIGN KEY (recorded_by) REFERENCES profiles(id);
alter table public.purchases add constraint purchases_supplier_id_fkey FOREIGN KEY (supplier_id) REFERENCES suppliers(id);

alter table public.reorder_requests add constraint reorder_requests_decided_by_fkey FOREIGN KEY (decided_by) REFERENCES profiles(id);
alter table public.reorder_requests add constraint reorder_requests_feed_type_id_fkey FOREIGN KEY (feed_type_id) REFERENCES feed_types(id);
alter table public.reorder_requests add constraint reorder_requests_medication_id_fkey FOREIGN KEY (medication_id) REFERENCES medications(id);
alter table public.reorder_requests add constraint reorder_requests_purchase_id_fkey FOREIGN KEY (purchase_id) REFERENCES purchases(id);
alter table public.reorder_requests add constraint reorder_requests_requested_by_fkey FOREIGN KEY (requested_by) REFERENCES profiles(id);

alter table public.role_permissions add constraint role_permissions_role_id_fkey FOREIGN KEY (role_id) REFERENCES roles(id) ON DELETE CASCADE;

alter table public.sale_allocations add constraint sale_allocations_flock_id_fkey FOREIGN KEY (flock_id) REFERENCES flocks(id);
alter table public.sale_allocations add constraint sale_allocations_pen_id_fkey FOREIGN KEY (pen_id) REFERENCES pens(id);
alter table public.sale_allocations add constraint sale_allocations_sale_id_fkey FOREIGN KEY (sale_id) REFERENCES sales(id) ON DELETE CASCADE;

alter table public.sales add constraint sales_approved_by_fkey FOREIGN KEY (approved_by) REFERENCES profiles(id);
alter table public.sales add constraint sales_customer_id_fkey FOREIGN KEY (customer_id) REFERENCES customers(id);
alter table public.sales add constraint sales_deleted_by_fkey FOREIGN KEY (deleted_by) REFERENCES profiles(id);
alter table public.sales add constraint sales_flock_id_fkey FOREIGN KEY (flock_id) REFERENCES flocks(id);
alter table public.sales add constraint sales_pen_id_fkey FOREIGN KEY (pen_id) REFERENCES pens(id);
alter table public.sales add constraint sales_product_id_fkey FOREIGN KEY (product_id) REFERENCES products(id);
alter table public.sales add constraint sales_recorded_by_fkey FOREIGN KEY (recorded_by) REFERENCES profiles(id);

alter table public.staff_pens add constraint staff_pens_pen_id_fkey FOREIGN KEY (pen_id) REFERENCES pens(id) ON DELETE CASCADE;
alter table public.staff_pens add constraint staff_pens_profile_id_fkey FOREIGN KEY (profile_id) REFERENCES profiles(id) ON DELETE CASCADE;

alter table public.stock_adjustments add constraint stock_adjustments_decided_by_fkey FOREIGN KEY (decided_by) REFERENCES profiles(id);
alter table public.stock_adjustments add constraint stock_adjustments_feed_type_id_fkey FOREIGN KEY (feed_type_id) REFERENCES feed_types(id);
alter table public.stock_adjustments add constraint stock_adjustments_medication_id_fkey FOREIGN KEY (medication_id) REFERENCES medications(id);
alter table public.stock_adjustments add constraint stock_adjustments_purchase_id_fkey FOREIGN KEY (purchase_id) REFERENCES purchases(id);
alter table public.stock_adjustments add constraint stock_adjustments_reason_id_fkey FOREIGN KEY (reason_id) REFERENCES adjustment_reasons(id);
alter table public.stock_adjustments add constraint stock_adjustments_recorded_by_fkey FOREIGN KEY (recorded_by) REFERENCES profiles(id);

alter table public.stock_movements add constraint stock_movements_feed_type_id_fkey FOREIGN KEY (feed_type_id) REFERENCES feed_types(id);
alter table public.stock_movements add constraint stock_movements_medication_id_fkey FOREIGN KEY (medication_id) REFERENCES medications(id);
alter table public.stock_movements add constraint stock_movements_pen_id_fkey FOREIGN KEY (pen_id) REFERENCES pens(id);
alter table public.stock_movements add constraint stock_movements_purchase_id_fkey FOREIGN KEY (purchase_id) REFERENCES purchases(id);

alter table public.suppliers add constraint suppliers_created_by_fkey FOREIGN KEY (created_by) REFERENCES profiles(id);

-- ════════════════════════════════════════════════════════════════════
-- 7. Views
-- Every view is security_invoker: it shows only rows the signed-in user may see.
-- ════════════════════════════════════════════════════════════════════

-- Bird stock: one row per received bird purchase.
create view public.bird_stock with (security_invoker=true) as
SELECT p.id AS purchase_id,
    p.ref,
    p.supplier_id,
    s.name AS supplier,
    p.bird_type_id,
    bt.name AS bird_type,
    p.breed,
    p.bird_age_days,
    p.received_on,
    (COALESCE(p.received_quantity, p.quantity) - p.returned_quantity)::integer AS received,
    COALESCE(( SELECT sum(fp.birds) AS sum
           FROM flock_placements fp
          WHERE fp.purchase_id = p.id), 0::bigint)::integer AS placed,
    (COALESCE(p.received_quantity, p.quantity) - p.returned_quantity - COALESCE(( SELECT sum(fp.birds) AS sum
           FROM flock_placements fp
          WHERE fp.purchase_id = p.id), 0::bigint)::numeric)::integer AS in_stock,
        CASE
            WHEN (COALESCE(p.received_quantity, p.quantity) - p.returned_quantity) > 0::numeric THEN round(COALESCE(p.total, p.quantity * p.unit_price) / (COALESCE(p.received_quantity, p.quantity) - p.returned_quantity), 2)
            ELSE NULL::numeric
        END AS cost_per_bird
   FROM purchases p
     JOIN suppliers s ON s.id = p.supplier_id
     LEFT JOIN bird_types bt ON bt.id = p.bird_type_id
  WHERE p.kind = 'birds'::purchase_kind AND p.status = 'received'::purchase_status AND p.deleted_at IS NULL;

create view public.customer_balances with (security_invoker=true) as
SELECT id AS customer_id,
    name,
    opening_balance + COALESCE(( SELECT sum(s.total - s.amount_paid) AS sum
           FROM sales s
          WHERE s.customer_id = c.id AND s.deleted_at IS NULL AND s.approval <> 'rejected'::sale_approval), 0::numeric) - COALESCE(( SELECT sum(p.amount) AS sum
           FROM payments p
          WHERE p.customer_id = c.id AND p.direction = 'in'::payment_direction AND p.deleted_at IS NULL), 0::numeric) AS balance
   FROM customers c;

-- Running statement per customer (BRD §6, FR-CUS-2). Positive balance = they owe the farm.
create view public.customer_statement with (security_invoker=true) as
WITH lines AS (
         SELECT c.id AS customer_id,
            COALESCE(fs.go_live_date, c.created_at::date) AS entry_date,
            c.created_at AS entered_at,
            'opening'::text AS entry_type,
            NULL::text AS ref,
            c.opening_balance AS charged,
            0::numeric AS paid
           FROM customers c
             LEFT JOIN farm_settings fs ON true
          WHERE c.opening_balance <> 0::numeric
        UNION ALL
         SELECT s.customer_id,
            s.sold_on,
            s.created_at,
            'sale'::text,
            s.ref,
            s.total,
            s.amount_paid
           FROM sales s
          WHERE s.customer_id IS NOT NULL AND s.deleted_at IS NULL AND s.approval <> 'rejected'::sale_approval
        UNION ALL
         SELECT p.customer_id,
            p.paid_on,
            p.created_at,
            'payment'::text,
            p.ref,
            0,
            p.amount
           FROM payments p
          WHERE p.direction = 'in'::payment_direction AND p.deleted_at IS NULL
        )
 SELECT customer_id,
    entry_date,
    entered_at,
    entry_type,
    ref,
    charged,
    paid,
    sum(charged - paid) OVER w - (charged - paid) AS previous_balance,
    sum(charged - paid) OVER w AS balance
   FROM lines
  WINDOW w AS (PARTITION BY customer_id ORDER BY entry_date, entered_at, ref ROWS UNBOUNDED PRECEDING);

create view public.employee_loan_balances with (security_invoker=true) as
SELECT ln.id AS loan_id,
    ln.ref,
    ln.employee_id,
    ln.kind,
    ln.status,
    ln.amount,
    ln.monthly_repayment,
    ln.first_month,
    ln.issued_on,
    COALESCE(sum(i.amount) FILTER (WHERE r.status = 'approved'::payroll_status), 0::numeric) AS repaid,
    ln.amount - COALESCE(sum(i.amount) FILTER (WHERE r.status = 'approved'::payroll_status), 0::numeric) AS balance,
    ceil((ln.amount - COALESCE(sum(i.amount) FILTER (WHERE r.status = 'approved'::payroll_status), 0::numeric)) / ln.monthly_repayment)::integer AS months_left
   FROM employee_loans ln
     LEFT JOIN payslip_items i ON i.loan_id = ln.id
     LEFT JOIN payroll_lines l ON l.id = i.line_id
     LEFT JOIN payroll_runs r ON r.id = l.run_id
  GROUP BY ln.id;

-- Medication batches still in stock, earliest expiry first (FR-MED-2, FR-MED-3).
create view public.medication_batches with (security_invoker=true) as
SELECT pu.id AS purchase_id,
    pu.medication_id,
    pu.batch_no,
    pu.expiry_date,
    sum(sm.quantity) AS on_hand
   FROM purchases pu
     JOIN stock_movements sm ON sm.purchase_id = pu.id
  WHERE pu.kind = 'medication'::purchase_kind
  GROUP BY pu.id, pu.medication_id, pu.batch_no, pu.expiry_date
 HAVING sum(sm.quantity) > 0::numeric;

-- Daily production with the calculated fields from BRD §5.6.
create view public.production_daily with (security_invoker=true) as
SELECT pr.id,
    pr.pen_id,
    pr.flock_id,
    pr.record_date,
    pr.record_date - f.placed_on + f.age_at_placement_days AS age_days,
    pr.opening_birds,
    pr.mortality,
    pr.closing_birds,
        CASE
            WHEN pr.opening_birds > 0 THEN round(pr.mortality::numeric * 100.0 / pr.opening_birds::numeric, 2)
            ELSE NULL::numeric
        END AS mortality_pct,
    pr.feed_type_id,
    pr.feed_bags,
    round(pr.feed_bags * COALESCE(ft.bag_kg, 25::numeric), 2) AS feed_kg,
    round(pr.closing_birds::numeric * tgt.grams_per_bird_day / 1000.0, 2) AS expected_feed_kg,
        CASE
            WHEN tgt.grams_per_bird_day > 0::numeric AND pr.closing_birds > 0 THEN round((pr.feed_bags * COALESCE(ft.bag_kg, 25::numeric) - pr.closing_birds::numeric * tgt.grams_per_bird_day / 1000.0) * 100.0 / (pr.closing_birds::numeric * tgt.grams_per_bird_day / 1000.0), 2)
            ELSE NULL::numeric
        END AS feed_variance_pct,
    pr.eggs_collected,
    pr.eggs_cracked,
        CASE
            WHEN pr.eggs_collected IS NOT NULL AND pr.closing_birds > 0 THEN round(pr.eggs_collected::numeric * 100.0 / pr.closing_birds::numeric, 2)
            ELSE NULL::numeric
        END AS laying_rate_pct,
    pr.recorded_by,
    pr.created_at
   FROM production_records pr
     JOIN flocks f ON f.id = pr.flock_id
     LEFT JOIN feed_types ft ON ft.id = pr.feed_type_id
     LEFT JOIN LATERAL ( SELECT t.grams_per_bird_day
           FROM feed_targets t
          WHERE t.bird_type_id = f.bird_type_id AND (t.breed IS NULL OR t.breed = f.breed) AND ((pr.record_date - f.placed_on + f.age_at_placement_days) / 7 + 1) >= t.week_from AND (t.week_to IS NULL OR ((pr.record_date - f.placed_on + f.age_at_placement_days) / 7 + 1) <= t.week_to)
          ORDER BY (t.breed IS NULL), t.week_from DESC
         LIMIT 1) tgt ON true
  WHERE pr.deleted_at IS NULL;

-- Daily stock ledger per item: opening, in, out, adjustments, closing (FR-INV-1, §5.10).
create view public.stock_daily with (security_invoker=true) as
WITH days AS (
         SELECT stock_movements.item,
            stock_movements.feed_type_id,
            stock_movements.medication_id,
            stock_movements.moved_on,
            sum(stock_movements.quantity) FILTER (WHERE stock_movements.movement = ANY (ARRAY['received'::stock_movement_type, 'collected'::stock_movement_type])) AS received,
            - sum(stock_movements.quantity) FILTER (WHERE stock_movements.movement = ANY (ARRAY['used'::stock_movement_type, 'sold'::stock_movement_type])) AS used,
            sum(stock_movements.quantity) FILTER (WHERE stock_movements.movement = ANY (ARRAY['adjusted'::stock_movement_type, 'opening'::stock_movement_type])) AS adjusted,
            sum(stock_movements.quantity) AS net
           FROM stock_movements
          GROUP BY stock_movements.item, stock_movements.feed_type_id, stock_movements.medication_id, stock_movements.moved_on
        )
 SELECT item,
    feed_type_id,
    medication_id,
    moved_on,
    sum(net) OVER w - net AS opening,
    COALESCE(received, 0::numeric) AS received,
    COALESCE(used, 0::numeric) AS used,
    COALESCE(adjusted, 0::numeric) AS adjusted,
    sum(net) OVER w AS closing
   FROM days
  WINDOW w AS (PARTITION BY item, feed_type_id, medication_id ORDER BY moved_on ROWS UNBOUNDED PRECEDING);

-- Stock on hand now.
create view public.stock_levels with (security_invoker=true) as
SELECT item,
    feed_type_id,
    medication_id,
    sum(quantity) AS on_hand
   FROM stock_movements
  GROUP BY item, feed_type_id, medication_id;

create view public.supplier_balances with (security_invoker=true) as
SELECT id AS supplier_id,
    name,
    opening_balance + COALESCE(( SELECT sum(pu.total - pu.amount_paid) AS sum
           FROM purchases pu
          WHERE pu.supplier_id = s.id AND pu.deleted_at IS NULL), 0::numeric) + COALESCE(( SELECT sum(e.amount - e.amount_paid) AS sum
           FROM expenses e
          WHERE e.supplier_id = s.id AND e.deleted_at IS NULL), 0::numeric) - COALESCE(( SELECT sum(p.amount) AS sum
           FROM payments p
          WHERE p.supplier_id = s.id AND p.direction = 'out'::payment_direction AND p.deleted_at IS NULL), 0::numeric) AS balance
   FROM suppliers s;

-- Running statement per supplier, including equipment bought as an expense (FR-SUP-3).
-- Positive balance = the farm owes them.
create view public.supplier_statement with (security_invoker=true) as
WITH lines AS (
         SELECT s.id AS supplier_id,
            COALESCE(fs.go_live_date, s.created_at::date) AS entry_date,
            s.created_at AS entered_at,
            'opening'::text AS entry_type,
            NULL::text AS ref,
            s.opening_balance AS charged,
            0::numeric AS paid
           FROM suppliers s
             LEFT JOIN farm_settings fs ON true
          WHERE s.opening_balance <> 0::numeric
        UNION ALL
         SELECT pu.supplier_id,
            pu.purchased_on,
            pu.created_at,
            'purchase'::text,
            pu.ref,
            pu.total,
            pu.amount_paid
           FROM purchases pu
          WHERE pu.deleted_at IS NULL
        UNION ALL
         SELECT e.supplier_id,
            e.spent_on,
            e.created_at,
            'expense'::text,
            e.ref,
            e.amount,
            e.amount_paid
           FROM expenses e
          WHERE e.supplier_id IS NOT NULL AND e.deleted_at IS NULL
        UNION ALL
         SELECT p.supplier_id,
            p.paid_on,
            p.created_at,
            'payment'::text,
            p.ref,
            0,
            p.amount
           FROM payments p
          WHERE p.direction = 'out'::payment_direction AND p.deleted_at IS NULL
        )
 SELECT supplier_id,
    entry_date,
    entered_at,
    entry_type,
    ref,
    charged,
    paid,
    sum(charged - paid) OVER w - (charged - paid) AS previous_balance,
    sum(charged - paid) OVER w AS balance
   FROM lines
  WINDOW w AS (PARTITION BY supplier_id ORDER BY entry_date, entered_at, ref ROWS UNBOUNDED PRECEDING);

-- ════════════════════════════════════════════════════════════════════
-- 8. Indexes
-- Indexes that back primary keys and unique constraints are created with their tables.
-- ════════════════════════════════════════════════════════════════════

create index audit_log_actor_idx ON public.audit_log USING btree (actor_id);
create index audit_log_occurred_idx ON public.audit_log USING btree (occurred_at DESC);
create index audit_log_record_idx ON public.audit_log USING btree (table_name, record_id, occurred_at DESC);
create index customers_created_by_idx ON public.customers USING btree (created_by);
create index customers_name_idx ON public.customers USING btree (lower(name));
create index employee_loans_employee_idx ON public.employee_loans USING btree (employee_id);
create index expenses_category_idx ON public.expenses USING btree (category_id);
create index expenses_deleted_by_idx ON public.expenses USING btree (deleted_by);
create index expenses_pen_idx ON public.expenses USING btree (pen_id) WHERE (pen_id IS NOT NULL);
create index expenses_recorded_by_idx ON public.expenses USING btree (recorded_by);
create index expenses_spent_on_idx ON public.expenses USING btree (spent_on);
create index expenses_supplier_idx ON public.expenses USING btree (supplier_id, spent_on) WHERE (supplier_id IS NOT NULL);
create index feed_targets_bird_type_idx ON public.feed_targets USING btree (bird_type_id, week_from);
create index feed_targets_feed_type_idx ON public.feed_targets USING btree (recommended_feed_type_id);
create index finance_entries_kind_idx ON public.finance_entries USING btree (kind, entry_on);
create index flock_placements_flock_idx ON public.flock_placements USING btree (flock_id);
create index flock_placements_purchase_idx ON public.flock_placements USING btree (purchase_id) WHERE (purchase_id IS NOT NULL);
create index flocks_bird_type_idx ON public.flocks USING btree (bird_type_id);
create index flocks_created_by_idx ON public.flocks USING btree (created_by);
create unique index flocks_one_active_per_pen ON public.flocks USING btree (pen_id) WHERE (status = 'active'::flock_status);
create index flocks_pen_idx ON public.flocks USING btree (pen_id, placed_on DESC);
create index payments_customer_idx ON public.payments USING btree (customer_id, paid_on) WHERE (customer_id IS NOT NULL);
create index payments_deleted_by_idx ON public.payments USING btree (deleted_by);
create index payments_recorded_by_idx ON public.payments USING btree (recorded_by);
create index payments_sale_idx ON public.payments USING btree (sale_id) WHERE (sale_id IS NOT NULL);
create index payments_supplier_idx ON public.payments USING btree (supplier_id, paid_on) WHERE (supplier_id IS NOT NULL);
create index payroll_lines_employee_idx ON public.payroll_lines USING btree (employee_id);
create index payslip_items_line_idx ON public.payslip_items USING btree (line_id);
create index payslip_items_loan_idx ON public.payslip_items USING btree (loan_id) WHERE (loan_id IS NOT NULL);
create index pens_bird_type_idx ON public.pens USING btree (bird_type_id);
create index production_medications_medication_idx ON public.production_medications USING btree (medication_id);
create index production_medications_purchase_idx ON public.production_medications USING btree (purchase_id);
create index production_medications_record_idx ON public.production_medications USING btree (production_record_id);
create index production_deleted_by_idx ON public.production_records USING btree (deleted_by);
create index production_feed_type_idx ON public.production_records USING btree (feed_type_id);
create index production_flock_idx ON public.production_records USING btree (flock_id, record_date);
create unique index production_one_per_pen_day ON public.production_records USING btree (pen_id, record_date) WHERE (deleted_at IS NULL);
create index production_recorded_by_idx ON public.production_records USING btree (recorded_by);
create index profiles_role_id_idx ON public.profiles USING btree (role_id);
create index purchases_bird_type_idx ON public.purchases USING btree (bird_type_id) WHERE (bird_type_id IS NOT NULL);
create index purchases_deleted_by_idx ON public.purchases USING btree (deleted_by);
create index purchases_feed_type_idx ON public.purchases USING btree (feed_type_id) WHERE (feed_type_id IS NOT NULL);
create index purchases_flock_idx ON public.purchases USING btree (flock_id) WHERE (flock_id IS NOT NULL);
create index purchases_medication_idx ON public.purchases USING btree (medication_id, expiry_date) WHERE (medication_id IS NOT NULL);
create index purchases_open_orders_idx ON public.purchases USING btree (purchased_on) WHERE ((status = 'ordered'::purchase_status) AND (deleted_at IS NULL));
create index purchases_received_by_idx ON public.purchases USING btree (received_by);
create index purchases_recorded_by_idx ON public.purchases USING btree (recorded_by);
create index purchases_supplier_idx ON public.purchases USING btree (supplier_id, purchased_on);
create index reorder_requests_open_idx ON public.reorder_requests USING btree (status, created_at) WHERE (status = 'open'::text);
create index sale_allocations_flock_idx ON public.sale_allocations USING btree (flock_id) WHERE (flock_id IS NOT NULL);
create index sale_allocations_pen_idx ON public.sale_allocations USING btree (pen_id);
create index sales_approved_by_idx ON public.sales USING btree (approved_by);
create index sales_customer_idx ON public.sales USING btree (customer_id, sold_on) WHERE (customer_id IS NOT NULL);
create index sales_deleted_by_idx ON public.sales USING btree (deleted_by);
create index sales_flock_idx ON public.sales USING btree (flock_id) WHERE (flock_id IS NOT NULL);
create index sales_pen_idx ON public.sales USING btree (pen_id) WHERE (pen_id IS NOT NULL);
create index sales_pending_idx ON public.sales USING btree (created_at) WHERE ((approval = 'pending'::sale_approval) AND (deleted_at IS NULL));
create index sales_product_idx ON public.sales USING btree (product_id);
create index sales_recorded_by_idx ON public.sales USING btree (recorded_by);
create index sales_sold_on_idx ON public.sales USING btree (sold_on);
create index staff_pens_pen_idx ON public.staff_pens USING btree (pen_id);
create index stock_adjustments_feed_idx ON public.stock_adjustments USING btree (feed_type_id) WHERE (feed_type_id IS NOT NULL);
create index stock_adjustments_medication_idx ON public.stock_adjustments USING btree (medication_id) WHERE (medication_id IS NOT NULL);
create index stock_adjustments_purchase_idx ON public.stock_adjustments USING btree (purchase_id);
create index stock_adjustments_reason_idx ON public.stock_adjustments USING btree (reason_id);
create index stock_adjustments_recorded_by_idx ON public.stock_adjustments USING btree (recorded_by);
create index stock_movements_feed_idx ON public.stock_movements USING btree (feed_type_id, moved_on) WHERE (feed_type_id IS NOT NULL);
create index stock_movements_item_idx ON public.stock_movements USING btree (item, moved_on);
create index stock_movements_medication_idx ON public.stock_movements USING btree (medication_id, moved_on) WHERE (medication_id IS NOT NULL);
create index stock_movements_pen_idx ON public.stock_movements USING btree (pen_id);
create index stock_movements_purchase_idx ON public.stock_movements USING btree (purchase_id);
create index stock_movements_source_idx ON public.stock_movements USING btree (source_table, source_id);
create index suppliers_created_by_idx ON public.suppliers USING btree (created_by);

-- ════════════════════════════════════════════════════════════════════
-- 9. Triggers
-- audit = writes every change to audit_log. on_auth_user_created = makes a profile for each new login.
-- ════════════════════════════════════════════════════════════════════

create trigger on_auth_user_created AFTER INSERT ON auth.users FOR EACH ROW EXECUTE FUNCTION private.handle_new_user();

create trigger audit AFTER INSERT OR DELETE OR UPDATE ON public.adjustment_reasons FOR EACH ROW EXECUTE FUNCTION private.audit();

create trigger audit AFTER INSERT OR DELETE OR UPDATE ON public.alert_marks FOR EACH ROW EXECUTE FUNCTION private.audit();

create trigger audit AFTER INSERT OR DELETE OR UPDATE ON public.bird_types FOR EACH ROW EXECUTE FUNCTION private.audit();

create trigger audit AFTER INSERT OR DELETE OR UPDATE ON public.customers FOR EACH ROW EXECUTE FUNCTION private.audit();

create trigger set_updated_at BEFORE UPDATE ON public.customers FOR EACH ROW EXECUTE FUNCTION private.set_updated_at();

create trigger audit AFTER INSERT OR DELETE OR UPDATE ON public.employee_loans FOR EACH ROW EXECUTE FUNCTION private.audit();

create trigger guard_change BEFORE INSERT OR UPDATE ON public.employee_loans FOR EACH ROW EXECUTE FUNCTION private.guard_loan_change();

create trigger set_ref BEFORE INSERT ON public.employee_loans FOR EACH ROW EXECUTE FUNCTION private.loan_ref();

create trigger audit AFTER INSERT OR DELETE OR UPDATE ON public.employees FOR EACH ROW EXECUTE FUNCTION private.audit();

create trigger set_updated_at BEFORE UPDATE ON public.employees FOR EACH ROW EXECUTE FUNCTION private.set_updated_at();

create trigger audit AFTER INSERT OR DELETE OR UPDATE ON public.expense_categories FOR EACH ROW EXECUTE FUNCTION private.audit();

create trigger audit AFTER INSERT OR DELETE OR UPDATE ON public.expenses FOR EACH ROW EXECUTE FUNCTION private.audit();

create trigger set_updated_at BEFORE UPDATE ON public.expenses FOR EACH ROW EXECUTE FUNCTION private.set_updated_at();

create trigger soft_delete BEFORE UPDATE OF deleted_at ON public.expenses FOR EACH ROW EXECUTE FUNCTION private.soft_delete('expenses');

create trigger audit AFTER INSERT OR DELETE OR UPDATE ON public.farm_settings FOR EACH ROW EXECUTE FUNCTION private.audit();

create trigger set_updated_at BEFORE UPDATE ON public.farm_settings FOR EACH ROW EXECUTE FUNCTION private.set_updated_at();

create trigger audit AFTER INSERT OR DELETE OR UPDATE ON public.feed_targets FOR EACH ROW EXECUTE FUNCTION private.audit();

create trigger audit AFTER INSERT OR DELETE OR UPDATE ON public.feed_types FOR EACH ROW EXECUTE FUNCTION private.audit();

create trigger audit AFTER INSERT OR DELETE OR UPDATE ON public.finance_entries FOR EACH ROW EXECUTE FUNCTION private.audit();

create trigger audit AFTER INSERT OR DELETE OR UPDATE ON public.fixed_assets FOR EACH ROW EXECUTE FUNCTION private.audit();

create trigger audit AFTER INSERT OR DELETE OR UPDATE ON public.flock_placements FOR EACH ROW EXECUTE FUNCTION private.audit();

create trigger check_placement BEFORE INSERT OR UPDATE ON public.flock_placements FOR EACH ROW EXECUTE FUNCTION private.check_placement();

create trigger flock_birds AFTER INSERT OR DELETE OR UPDATE ON public.flock_placements FOR EACH ROW EXECUTE FUNCTION private.placement_changed();

create trigger audit AFTER INSERT OR DELETE OR UPDATE ON public.flocks FOR EACH ROW EXECUTE FUNCTION private.audit();

create trigger guard_change BEFORE UPDATE ON public.flocks FOR EACH ROW EXECUTE FUNCTION private.guard_flock_change();

create trigger recalc AFTER UPDATE ON public.flocks FOR EACH ROW EXECUTE FUNCTION private.flock_changed();

create trigger set_updated_at BEFORE UPDATE ON public.flocks FOR EACH ROW EXECUTE FUNCTION private.set_updated_at();

create trigger audit AFTER INSERT OR DELETE OR UPDATE ON public.medications FOR EACH ROW EXECUTE FUNCTION private.audit();

create trigger audit AFTER INSERT OR DELETE OR UPDATE ON public.payments FOR EACH ROW EXECUTE FUNCTION private.audit();

create trigger set_ref BEFORE INSERT ON public.payments FOR EACH ROW EXECUTE FUNCTION private.payment_ref();

create trigger set_updated_at BEFORE UPDATE ON public.payments FOR EACH ROW EXECUTE FUNCTION private.set_updated_at();

create trigger soft_delete BEFORE UPDATE OF deleted_at ON public.payments FOR EACH ROW EXECUTE FUNCTION private.soft_delete('payments');

create trigger audit AFTER INSERT OR DELETE OR UPDATE ON public.payroll_lines FOR EACH ROW EXECUTE FUNCTION private.audit();

create trigger guard_change BEFORE INSERT OR DELETE OR UPDATE ON public.payroll_lines FOR EACH ROW EXECUTE FUNCTION private.guard_payroll_change();

create trigger totals AFTER UPDATE OF rate, units ON public.payroll_lines FOR EACH ROW EXECUTE FUNCTION private.payroll_line_changed();

create trigger audit AFTER INSERT OR DELETE OR UPDATE ON public.payroll_runs FOR EACH ROW EXECUTE FUNCTION private.audit();

create trigger guard_change BEFORE UPDATE ON public.payroll_runs FOR EACH ROW EXECUTE FUNCTION private.guard_payroll_change();

create trigger audit AFTER INSERT OR DELETE OR UPDATE ON public.payslip_items FOR EACH ROW EXECUTE FUNCTION private.audit();

create trigger guard_change BEFORE INSERT OR DELETE OR UPDATE ON public.payslip_items FOR EACH ROW EXECUTE FUNCTION private.guard_payroll_change();

create trigger totals AFTER INSERT OR DELETE OR UPDATE ON public.payslip_items FOR EACH ROW EXECUTE FUNCTION private.payslip_item_changed();

create trigger audit AFTER INSERT OR DELETE OR UPDATE ON public.pens FOR EACH ROW EXECUTE FUNCTION private.audit();

create trigger guard_change BEFORE UPDATE ON public.pens FOR EACH ROW EXECUTE FUNCTION private.guard_pen_change();

create trigger audit AFTER INSERT OR DELETE OR UPDATE ON public.production_medications FOR EACH ROW EXECUTE FUNCTION private.audit();

create trigger stock AFTER INSERT OR DELETE OR UPDATE ON public.production_medications FOR EACH ROW EXECUTE FUNCTION private.production_medication_stock();

create trigger audit AFTER INSERT OR DELETE OR UPDATE ON public.production_records FOR EACH ROW EXECUTE FUNCTION private.audit();

create trigger birds AFTER INSERT OR DELETE OR UPDATE ON public.production_records FOR EACH ROW EXECUTE FUNCTION private.production_birds();

create trigger flock_matches_pen BEFORE INSERT OR UPDATE OF pen_id, flock_id ON public.production_records FOR EACH ROW EXECUTE FUNCTION private.production_flock_matches_pen();

create trigger medication_restock AFTER UPDATE OF deleted_at ON public.production_records FOR EACH ROW EXECUTE FUNCTION private.entry_medication_restock();

create trigger set_updated_at BEFORE UPDATE ON public.production_records FOR EACH ROW EXECUTE FUNCTION private.set_updated_at();

create trigger soft_delete BEFORE UPDATE OF deleted_at ON public.production_records FOR EACH ROW EXECUTE FUNCTION private.soft_delete('production');

create trigger stock AFTER INSERT OR DELETE OR UPDATE ON public.production_records FOR EACH ROW EXECUTE FUNCTION private.production_stock();

create trigger audit AFTER INSERT OR DELETE OR UPDATE ON public.products FOR EACH ROW EXECUTE FUNCTION private.audit();

create trigger audit AFTER INSERT OR DELETE OR UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION private.audit();

create trigger employee AFTER INSERT ON public.profiles FOR EACH ROW EXECUTE FUNCTION private.profile_employee();

create trigger employee_sync AFTER UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION private.profile_employee_sync();

create trigger guard_role_change BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION private.guard_profile_update();

create trigger set_updated_at BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION private.set_updated_at();

create trigger audit AFTER INSERT OR DELETE OR UPDATE ON public.purchases FOR EACH ROW EXECUTE FUNCTION private.audit();

create trigger flock_birds AFTER INSERT OR DELETE OR UPDATE ON public.purchases FOR EACH ROW EXECUTE FUNCTION private.flock_inputs_changed();

create trigger guard_receive_only BEFORE UPDATE ON public.purchases FOR EACH ROW EXECUTE FUNCTION private.guard_purchase_update();

create trigger set_ref BEFORE INSERT ON public.purchases FOR EACH ROW EXECUTE FUNCTION private.purchase_ref();

create trigger set_updated_at BEFORE UPDATE ON public.purchases FOR EACH ROW EXECUTE FUNCTION private.set_updated_at();

create trigger soft_delete BEFORE UPDATE OF deleted_at ON public.purchases FOR EACH ROW EXECUTE FUNCTION private.soft_delete('purchases');

create trigger stock AFTER INSERT OR DELETE OR UPDATE ON public.purchases FOR EACH ROW EXECUTE FUNCTION private.purchase_stock();

create trigger audit AFTER INSERT OR DELETE OR UPDATE ON public.reorder_requests FOR EACH ROW EXECUTE FUNCTION private.audit();

create trigger decided BEFORE UPDATE ON public.reorder_requests FOR EACH ROW EXECUTE FUNCTION private.reorder_decided();

create trigger audit AFTER INSERT OR DELETE OR UPDATE ON public.role_permissions FOR EACH ROW EXECUTE FUNCTION private.audit();

create trigger owner_locked BEFORE INSERT OR DELETE OR UPDATE ON public.role_permissions FOR EACH ROW EXECUTE FUNCTION private.guard_owner_permissions();

create trigger audit AFTER INSERT OR DELETE OR UPDATE ON public.roles FOR EACH ROW EXECUTE FUNCTION private.audit();

create trigger audit AFTER INSERT OR DELETE OR UPDATE ON public.sale_allocations FOR EACH ROW EXECUTE FUNCTION private.audit();

create trigger flock_birds AFTER INSERT OR DELETE OR UPDATE ON public.sale_allocations FOR EACH ROW EXECUTE FUNCTION private.portion_changed();

create constraint trigger portions_add_up AFTER INSERT OR DELETE OR UPDATE ON public.sale_allocations DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION private.bird_sale_has_portions();

create trigger approval BEFORE INSERT OR UPDATE ON public.sales FOR EACH ROW EXECUTE FUNCTION private.sale_approval();

create trigger audit AFTER INSERT OR DELETE OR UPDATE ON public.sales FOR EACH ROW EXECUTE FUNCTION private.audit();

create trigger flock_birds AFTER INSERT OR DELETE OR UPDATE ON public.sales FOR EACH ROW EXECUTE FUNCTION private.flock_inputs_changed();

create trigger portion_flocks AFTER UPDATE OF sold_on, deleted_at, approval, quantity, product_id ON public.sales FOR EACH ROW EXECUTE FUNCTION private.sale_portions_changed();

create constraint trigger portions_add_up AFTER INSERT OR UPDATE OF quantity, product_id ON public.sales DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION private.bird_sale_has_portions();

create trigger sale_date BEFORE INSERT OR UPDATE OF sold_on ON public.sales FOR EACH ROW EXECUTE FUNCTION private.sale_date_allowed();

create trigger set_updated_at BEFORE UPDATE ON public.sales FOR EACH ROW EXECUTE FUNCTION private.set_updated_at();

create trigger soft_delete BEFORE UPDATE OF deleted_at ON public.sales FOR EACH ROW EXECUTE FUNCTION private.soft_delete('sales');

create trigger stock AFTER INSERT OR DELETE OR UPDATE ON public.sales FOR EACH ROW EXECUTE FUNCTION private.sale_stock();

create trigger audit AFTER INSERT OR DELETE OR UPDATE ON public.staff_pens FOR EACH ROW EXECUTE FUNCTION private.audit();

create trigger audit AFTER INSERT OR DELETE OR UPDATE ON public.stock_adjustments FOR EACH ROW EXECUTE FUNCTION private.audit();

create trigger guard_change BEFORE UPDATE ON public.stock_adjustments FOR EACH ROW EXECUTE FUNCTION private.guard_adjustment_change();

create trigger stock AFTER INSERT OR DELETE OR UPDATE ON public.stock_adjustments FOR EACH ROW EXECUTE FUNCTION private.adjustment_stock();

create trigger audit AFTER INSERT OR DELETE OR UPDATE ON public.suppliers FOR EACH ROW EXECUTE FUNCTION private.audit();

create trigger set_updated_at BEFORE UPDATE ON public.suppliers FOR EACH ROW EXECUTE FUNCTION private.set_updated_at();

-- ════════════════════════════════════════════════════════════════════
-- 10. Row-level security
-- RLS is on for every table. Policies call private.can(), private.can_pen(), private.is_owner() …
-- so one permissions table (role_permissions) drives what each role may see and do.
-- ════════════════════════════════════════════════════════════════════

alter table public.adjustment_reasons enable row level security;
alter table public.alert_marks enable row level security;
alter table public.audit_log enable row level security;
alter table public.bird_types enable row level security;
alter table public.customers enable row level security;
alter table public.employee_loans enable row level security;
alter table public.employees enable row level security;
alter table public.expense_categories enable row level security;
alter table public.expenses enable row level security;
alter table public.farm_settings enable row level security;
alter table public.feed_targets enable row level security;
alter table public.feed_types enable row level security;
alter table public.finance_entries enable row level security;
alter table public.fixed_assets enable row level security;
alter table public.flock_placements enable row level security;
alter table public.flocks enable row level security;
alter table public.medications enable row level security;
alter table public.payments enable row level security;
alter table public.payroll_lines enable row level security;
alter table public.payroll_runs enable row level security;
alter table public.payslip_items enable row level security;
alter table public.pens enable row level security;
alter table public.production_medications enable row level security;
alter table public.production_records enable row level security;
alter table public.products enable row level security;
alter table public.profiles enable row level security;
alter table public.purchases enable row level security;
alter table public.reorder_requests enable row level security;
alter table public.role_permissions enable row level security;
alter table public.roles enable row level security;
alter table public.sale_allocations enable row level security;
alter table public.sales enable row level security;
alter table public.staff_pens enable row level security;
alter table public.stock_adjustments enable row level security;
alter table public.stock_movements enable row level security;
alter table public.suppliers enable row level security;

create policy "Owner can add" on public.adjustment_reasons
  for insert to authenticated
  with check (( SELECT private.can('admin'::app_module, 'add'::text) AS can));

create policy "Owner can delete" on public.adjustment_reasons
  for delete to authenticated
  using (( SELECT private.can('admin'::app_module, 'delete'::text) AS can));

create policy "Owner can edit" on public.adjustment_reasons
  for update to authenticated
  using (( SELECT private.can('admin'::app_module, 'edit'::text) AS can))
  with check (( SELECT private.can('admin'::app_module, 'edit'::text) AS can));

create policy "Staff can read" on public.adjustment_reasons
  for select to authenticated
  using ((( SELECT private.my_role() AS my_role) IS NOT NULL));

create policy "Change alert status" on public.alert_marks
  for update to authenticated
  using (( SELECT private.can('dashboard'::app_module, 'view'::text) AS can))
  with check ((( SELECT private.can('dashboard'::app_module, 'view'::text) AS can) AND (marked_by = ( SELECT auth.uid() AS uid))));

create policy "Clear alert status" on public.alert_marks
  for delete to authenticated
  using (( SELECT private.is_manager() AS is_manager));

create policy "Mark alerts" on public.alert_marks
  for insert to authenticated
  with check ((( SELECT private.can('dashboard'::app_module, 'view'::text) AS can) AND (marked_by = ( SELECT auth.uid() AS uid))));

create policy "See alert status" on public.alert_marks
  for select to authenticated
  using (( SELECT private.can('dashboard'::app_module, 'view'::text) AS can));

-- Audit log: managers and the owner only. Written by triggers.
create policy "Managers see the audit log" on public.audit_log
  for select to authenticated
  using ((( SELECT private.is_manager() AS is_manager) AND
CASE
    WHEN (table_name = ANY (ARRAY['employees'::text, 'employee_loans'::text, 'payroll_runs'::text, 'payroll_lines'::text, 'payslip_items'::text])) THEN ( SELECT private.can('payroll'::app_module, 'view'::text) AS can)
    WHEN (table_name = ANY (ARRAY['fixed_assets'::text, 'finance_entries'::text])) THEN ( SELECT private.can('finance'::app_module, 'view'::text) AS can)
    ELSE true
END));

create policy "Owner can add" on public.bird_types
  for insert to authenticated
  with check (( SELECT private.can('admin'::app_module, 'add'::text) AS can));

create policy "Owner can delete" on public.bird_types
  for delete to authenticated
  using (( SELECT private.can('admin'::app_module, 'delete'::text) AS can));

create policy "Owner can edit" on public.bird_types
  for update to authenticated
  using (( SELECT private.can('admin'::app_module, 'edit'::text) AS can))
  with check (( SELECT private.can('admin'::app_module, 'edit'::text) AS can));

create policy "Staff can read" on public.bird_types
  for select to authenticated
  using ((( SELECT private.my_role() AS my_role) IS NOT NULL));

create policy "Add customers" on public.customers
  for insert to authenticated
  with check ((( SELECT private.can('parties'::app_module, 'add'::text) AS can) OR ( SELECT private.can('sales'::app_module, 'add'::text) AS can)));

create policy "Edit customers" on public.customers
  for update to authenticated
  using (( SELECT private.can('parties'::app_module, 'edit'::text) AS can))
  with check (( SELECT private.can('parties'::app_module, 'edit'::text) AS can));

-- Customers and suppliers. Store keepers need supplier names to receive deliveries.
create policy "See customers" on public.customers
  for select to authenticated
  using ((( SELECT private.can('parties'::app_module, 'view'::text) AS can) OR ( SELECT private.can('sales'::app_module, 'view'::text) AS can)));

create policy "Change loans" on public.employee_loans
  for update to authenticated
  using (( SELECT private.can('payroll'::app_module, 'edit'::text) AS can))
  with check (( SELECT private.can('payroll'::app_module, 'edit'::text) AS can));

create policy "Request loans" on public.employee_loans
  for insert to authenticated
  with check (( SELECT private.can('payroll'::app_module, 'add'::text) AS can));

create policy "See loans" on public.employee_loans
  for select to authenticated
  using ((( SELECT private.can('payroll'::app_module, 'view'::text) AS can) OR (employee_id = ( SELECT private.my_employee_id() AS my_employee_id))));

create policy "Add employees" on public.employees
  for insert to authenticated
  with check (( SELECT private.can('payroll'::app_module, 'add'::text) AS can));

create policy "Edit employees" on public.employees
  for update to authenticated
  using (( SELECT private.can('payroll'::app_module, 'edit'::text) AS can))
  with check (( SELECT private.can('payroll'::app_module, 'edit'::text) AS can));

create policy "See employees" on public.employees
  for select to authenticated
  using ((( SELECT private.can('payroll'::app_module, 'view'::text) AS can) OR (profile_id = ( SELECT auth.uid() AS uid))));

create policy "Owner can add" on public.expense_categories
  for insert to authenticated
  with check (( SELECT private.can('admin'::app_module, 'add'::text) AS can));

create policy "Owner can delete" on public.expense_categories
  for delete to authenticated
  using (( SELECT private.can('admin'::app_module, 'delete'::text) AS can));

create policy "Owner can edit" on public.expense_categories
  for update to authenticated
  using (( SELECT private.can('admin'::app_module, 'edit'::text) AS can))
  with check (( SELECT private.can('admin'::app_module, 'edit'::text) AS can));

create policy "Staff can read" on public.expense_categories
  for select to authenticated
  using ((( SELECT private.my_role() AS my_role) IS NOT NULL));

create policy "Add expenses" on public.expenses
  for insert to authenticated
  with check (((recorded_by = ( SELECT auth.uid() AS uid)) AND ((( SELECT private.access('expenses'::app_module, 'add'::text) AS access) = 'all'::access_level) OR ((( SELECT private.access('expenses'::app_module, 'add'::text) AS access) = 'own'::access_level) AND (supplier_id IS NULL) AND (pen_id IS NOT NULL) AND private.can_pen('production'::app_module, 'add'::text, pen_id)))));

create policy "Edit expenses" on public.expenses
  for update to authenticated
  using (((( SELECT private.can('expenses'::app_module, 'edit'::text) AS can) AND private.within_edit_window(recorded_by, created_at)) OR (( SELECT private.can('expenses'::app_module, 'delete'::text) AS can) AND (deleted_at IS NULL))))
  with check ((( SELECT private.can('expenses'::app_module, 'edit'::text) AS can) OR ( SELECT private.can('expenses'::app_module, 'delete'::text) AS can)));

-- Expenses: attendants add (and see their own) expenses for the pens they record production for.
create policy "See expenses" on public.expenses
  for select to authenticated
  using ((((deleted_at IS NULL) OR ( SELECT private.is_manager() AS is_manager)) AND ((( SELECT private.access('expenses'::app_module, 'view'::text) AS access) = 'all'::access_level) OR (recorded_by = ( SELECT auth.uid() AS uid)))));

create policy "Owner can add" on public.farm_settings
  for insert to authenticated
  with check (( SELECT private.can('admin'::app_module, 'add'::text) AS can));

create policy "Owner can delete" on public.farm_settings
  for delete to authenticated
  using (( SELECT private.can('admin'::app_module, 'delete'::text) AS can));

create policy "Owner can edit" on public.farm_settings
  for update to authenticated
  using (( SELECT private.can('admin'::app_module, 'edit'::text) AS can))
  with check (( SELECT private.can('admin'::app_module, 'edit'::text) AS can));

create policy "Staff can read" on public.farm_settings
  for select to authenticated
  using ((( SELECT private.my_role() AS my_role) IS NOT NULL));

create policy "Owner can add" on public.feed_targets
  for insert to authenticated
  with check (( SELECT private.can('admin'::app_module, 'add'::text) AS can));

create policy "Owner can delete" on public.feed_targets
  for delete to authenticated
  using (( SELECT private.can('admin'::app_module, 'delete'::text) AS can));

create policy "Owner can edit" on public.feed_targets
  for update to authenticated
  using (( SELECT private.can('admin'::app_module, 'edit'::text) AS can))
  with check (( SELECT private.can('admin'::app_module, 'edit'::text) AS can));

create policy "Staff can read" on public.feed_targets
  for select to authenticated
  using ((( SELECT private.my_role() AS my_role) IS NOT NULL));

create policy "Owner can add" on public.feed_types
  for insert to authenticated
  with check (( SELECT private.can('admin'::app_module, 'add'::text) AS can));

create policy "Owner can delete" on public.feed_types
  for delete to authenticated
  using (( SELECT private.can('admin'::app_module, 'delete'::text) AS can));

create policy "Owner can edit" on public.feed_types
  for update to authenticated
  using (( SELECT private.can('admin'::app_module, 'edit'::text) AS can))
  with check (( SELECT private.can('admin'::app_module, 'edit'::text) AS can));

create policy "Staff can read" on public.feed_types
  for select to authenticated
  using ((( SELECT private.my_role() AS my_role) IS NOT NULL));

create policy "Add finance entries" on public.finance_entries
  for insert to authenticated
  with check (( SELECT private.can('finance'::app_module, 'add'::text) AS can));

create policy "Edit finance entries" on public.finance_entries
  for update to authenticated
  using (( SELECT private.can('finance'::app_module, 'edit'::text) AS can))
  with check (( SELECT private.can('finance'::app_module, 'edit'::text) AS can));

create policy "Remove finance entries" on public.finance_entries
  for delete to authenticated
  using (( SELECT private.can('finance'::app_module, 'delete'::text) AS can));

create policy "See finance entries" on public.finance_entries
  for select to authenticated
  using (( SELECT private.can('finance'::app_module, 'view'::text) AS can));

create policy "Add fixed assets" on public.fixed_assets
  for insert to authenticated
  with check (( SELECT private.can('finance'::app_module, 'add'::text) AS can));

create policy "Edit fixed assets" on public.fixed_assets
  for update to authenticated
  using (( SELECT private.can('finance'::app_module, 'edit'::text) AS can))
  with check (( SELECT private.can('finance'::app_module, 'edit'::text) AS can));

create policy "Remove fixed assets" on public.fixed_assets
  for delete to authenticated
  using (( SELECT private.can('finance'::app_module, 'delete'::text) AS can));

create policy "See fixed assets" on public.fixed_assets
  for select to authenticated
  using (( SELECT private.can('finance'::app_module, 'view'::text) AS can));

create policy "Managers place birds" on public.flock_placements
  for insert to authenticated
  with check (( SELECT private.is_manager() AS is_manager));

create policy "Owner edits placements" on public.flock_placements
  for update to authenticated
  using (( SELECT private.is_owner() AS is_owner))
  with check (( SELECT private.is_owner() AS is_owner));

create policy "Owner removes placements" on public.flock_placements
  for delete to authenticated
  using (( SELECT private.is_owner() AS is_owner));

create policy "See placements of visible flocks" on public.flock_placements
  for select to authenticated
  using ((EXISTS ( SELECT 1
   FROM flocks f
  WHERE (f.id = flock_placements.flock_id))));

create policy "Managers edit flocks" on public.flocks
  for update to authenticated
  using (( SELECT private.is_manager() AS is_manager))
  with check (( SELECT private.is_manager() AS is_manager));

create policy "Managers place flocks" on public.flocks
  for insert to authenticated
  with check (( SELECT private.is_manager() AS is_manager));

create policy "See flocks in scope" on public.flocks
  for select to authenticated
  using ((private.can_pen('production'::app_module, 'view'::text, pen_id) OR ( SELECT private.can('sales'::app_module, 'view'::text) AS can) OR ( SELECT private.can('purchases'::app_module, 'view'::text) AS can)));

create policy "Owner can add" on public.medications
  for insert to authenticated
  with check (( SELECT private.can('admin'::app_module, 'add'::text) AS can));

create policy "Owner can delete" on public.medications
  for delete to authenticated
  using (( SELECT private.can('admin'::app_module, 'delete'::text) AS can));

create policy "Owner can edit" on public.medications
  for update to authenticated
  using (( SELECT private.can('admin'::app_module, 'edit'::text) AS can))
  with check (( SELECT private.can('admin'::app_module, 'edit'::text) AS can));

create policy "Staff can read" on public.medications
  for select to authenticated
  using ((( SELECT private.my_role() AS my_role) IS NOT NULL));

create policy "Edit payments" on public.payments
  for update to authenticated
  using (((( SELECT private.can('payments'::app_module, 'edit'::text) AS can) AND private.within_edit_window(recorded_by, created_at)) OR (( SELECT private.can('payments'::app_module, 'delete'::text) AS can) AND (deleted_at IS NULL))))
  with check ((( SELECT private.can('payments'::app_module, 'edit'::text) AS can) OR ( SELECT private.can('payments'::app_module, 'delete'::text) AS can)));

create policy "Record payments" on public.payments
  for insert to authenticated
  with check ((( SELECT private.can('payments'::app_module, 'add'::text) AS can) AND (recorded_by = ( SELECT auth.uid() AS uid))));

create policy "See payments" on public.payments
  for select to authenticated
  using ((((deleted_at IS NULL) OR ( SELECT private.is_manager() AS is_manager)) AND ( SELECT private.can('payments'::app_module, 'view'::text) AS can)));

create policy "Add payslips" on public.payroll_lines
  for insert to authenticated
  with check (( SELECT private.can('payroll'::app_module, 'add'::text) AS can));

create policy "Edit payslips" on public.payroll_lines
  for update to authenticated
  using (( SELECT private.can('payroll'::app_module, 'edit'::text) AS can))
  with check (( SELECT private.can('payroll'::app_module, 'edit'::text) AS can));

create policy "Remove payslips" on public.payroll_lines
  for delete to authenticated
  using (( SELECT private.can('payroll'::app_module, 'edit'::text) AS can));

create policy "See payslips" on public.payroll_lines
  for select to authenticated
  using ((( SELECT private.can('payroll'::app_module, 'view'::text) AS can) OR ((employee_id = ( SELECT private.my_employee_id() AS my_employee_id)) AND private.payroll_run_approved(run_id))));

create policy "Edit payroll months" on public.payroll_runs
  for update to authenticated
  using (( SELECT private.can('payroll'::app_module, 'edit'::text) AS can))
  with check (((status = 'draft'::payroll_status) OR ( SELECT private.is_owner() AS is_owner)));

create policy "Prepare payroll months" on public.payroll_runs
  for insert to authenticated
  with check ((( SELECT private.can('payroll'::app_module, 'add'::text) AS can) AND (status = 'draft'::payroll_status)));

create policy "See payroll months" on public.payroll_runs
  for select to authenticated
  using ((( SELECT private.can('payroll'::app_module, 'view'::text) AS can) OR ((status = 'approved'::payroll_status) AND private.has_my_payslip(id))));

create policy "Add payslip items" on public.payslip_items
  for insert to authenticated
  with check (( SELECT private.can('payroll'::app_module, 'edit'::text) AS can));

create policy "Edit payslip items" on public.payslip_items
  for update to authenticated
  using (( SELECT private.can('payroll'::app_module, 'edit'::text) AS can))
  with check (( SELECT private.can('payroll'::app_module, 'edit'::text) AS can));

create policy "Remove payslip items" on public.payslip_items
  for delete to authenticated
  using (( SELECT private.can('payroll'::app_module, 'edit'::text) AS can));

create policy "See payslip items" on public.payslip_items
  for select to authenticated
  using ((EXISTS ( SELECT 1
   FROM payroll_lines l
  WHERE (l.id = payslip_items.line_id))));

create policy "Managers add pens" on public.pens
  for insert to authenticated
  with check (( SELECT private.is_manager() AS is_manager));

create policy "Owner edits pens" on public.pens
  for update to authenticated
  using (( SELECT private.is_owner() AS is_owner))
  with check (( SELECT private.is_owner() AS is_owner));

-- Pens and flocks: everyone working with production, stock or expenses sees the pens their scope
-- allows; managers manage them.
create policy "See pens in scope" on public.pens
  for select to authenticated
  using ((private.can_pen('production'::app_module, 'view'::text, id) OR ( SELECT private.can('sales'::app_module, 'view'::text) AS can) OR (( SELECT private.can('inventory'::app_module, 'view'::text) AS can) AND (( SELECT private.access('production'::app_module, 'view'::text) AS access) = 'none'::access_level))));

create policy "Add medication lines in scope" on public.production_medications
  for insert to authenticated
  with check ((EXISTS ( SELECT 1
   FROM production_records pr
  WHERE ((pr.id = production_medications.production_record_id) AND private.can_pen('production'::app_module, 'add'::text, pr.pen_id) AND private.within_edit_window(pr.recorded_by, pr.created_at)))));

create policy "Edit medication lines in scope" on public.production_medications
  for update to authenticated
  using ((EXISTS ( SELECT 1
   FROM production_records pr
  WHERE ((pr.id = production_medications.production_record_id) AND private.can_pen('production'::app_module, 'edit'::text, pr.pen_id) AND private.within_edit_window(pr.recorded_by, pr.created_at)))))
  with check ((EXISTS ( SELECT 1
   FROM production_records pr
  WHERE ((pr.id = production_medications.production_record_id) AND private.can_pen('production'::app_module, 'edit'::text, pr.pen_id)))));

create policy "Remove medication lines in scope" on public.production_medications
  for delete to authenticated
  using ((EXISTS ( SELECT 1
   FROM production_records pr
  WHERE ((pr.id = production_medications.production_record_id) AND private.can_pen('production'::app_module, 'edit'::text, pr.pen_id) AND private.within_edit_window(pr.recorded_by, pr.created_at)))));

create policy "See medication given in scope" on public.production_medications
  for select to authenticated
  using ((EXISTS ( SELECT 1
   FROM production_records pr
  WHERE ((pr.id = production_medications.production_record_id) AND private.can_pen('production'::app_module, 'view'::text, pr.pen_id)))));

create policy "Edit production in scope" on public.production_records
  for update to authenticated
  using (((private.can_pen('production'::app_module, 'edit'::text, pen_id) AND private.within_edit_window(recorded_by, created_at)) OR (( SELECT private.can('production'::app_module, 'delete'::text) AS can) AND (deleted_at IS NULL))))
  with check ((private.can_pen('production'::app_module, 'edit'::text, pen_id) OR ( SELECT private.can('production'::app_module, 'delete'::text) AS can)));

create policy "Record production for pens in scope" on public.production_records
  for insert to authenticated
  with check ((private.can_pen('production'::app_module, 'add'::text, pen_id) AND (recorded_by = ( SELECT auth.uid() AS uid))));

-- Production: pen attendants see and record their own pens; edits within the edit window.
create policy "See production in scope" on public.production_records
  for select to authenticated
  using ((((deleted_at IS NULL) OR ( SELECT private.is_manager() AS is_manager)) AND private.can_pen('production'::app_module, 'view'::text, pen_id)));

create policy "Owner can add" on public.products
  for insert to authenticated
  with check (( SELECT private.can('admin'::app_module, 'add'::text) AS can));

create policy "Owner can delete" on public.products
  for delete to authenticated
  using (( SELECT private.can('admin'::app_module, 'delete'::text) AS can));

create policy "Owner can edit" on public.products
  for update to authenticated
  using (( SELECT private.can('admin'::app_module, 'edit'::text) AS can))
  with check (( SELECT private.can('admin'::app_module, 'edit'::text) AS can));

create policy "Staff can read" on public.products
  for select to authenticated
  using ((( SELECT private.my_role() AS my_role) IS NOT NULL));

create policy "Edit own profile or anyone as owner" on public.profiles
  for update to authenticated
  using (((id = ( SELECT auth.uid() AS uid)) OR ( SELECT private.can('admin'::app_module, 'edit'::text) AS can)))
  with check (((id = ( SELECT auth.uid() AS uid)) OR ( SELECT private.can('admin'::app_module, 'edit'::text) AS can)));

create policy "Owner adds staff" on public.profiles
  for insert to authenticated
  with check (( SELECT private.can('admin'::app_module, 'add'::text) AS can));

-- Profiles: you see yourself; managers and the owner see all staff; the owner edits anyone.
create policy "See own profile or all as admin viewer" on public.profiles
  for select to authenticated
  using (((id = ( SELECT auth.uid() AS uid)) OR ( SELECT private.can('admin'::app_module, 'view'::text) AS can)));

create policy "Edit or receive purchases" on public.purchases
  for update to authenticated
  using ((((( SELECT private.access('purchases'::app_module, 'edit'::text) AS access) = 'all'::access_level) AND private.within_edit_window(recorded_by, created_at)) OR ((( SELECT private.access('purchases'::app_module, 'edit'::text) AS access) = 'own'::access_level) AND (kind = ANY (ARRAY['feed'::purchase_kind, 'medication'::purchase_kind])) AND (deleted_at IS NULL)) OR (( SELECT private.can('purchases'::app_module, 'delete'::text) AS can) AND (deleted_at IS NULL))))
  with check (((( SELECT private.access('purchases'::app_module, 'edit'::text) AS access) <> 'none'::access_level) OR ( SELECT private.can('purchases'::app_module, 'delete'::text) AS can)));

create policy "Record purchases" on public.purchases
  for insert to authenticated
  with check (((( SELECT private.access('purchases'::app_module, 'add'::text) AS access) = 'all'::access_level) AND (recorded_by = ( SELECT auth.uid() AS uid))));

create policy "See purchases" on public.purchases
  for select to authenticated
  using ((((deleted_at IS NULL) OR ( SELECT private.is_manager() AS is_manager)) AND ((( SELECT private.access('purchases'::app_module, 'view'::text) AS access) = 'all'::access_level) OR ((( SELECT private.access('purchases'::app_module, 'view'::text) AS access) = 'own'::access_level) AND (kind = ANY (ARRAY['feed'::purchase_kind, 'medication'::purchase_kind]))))));

create policy "Ask to reorder" on public.reorder_requests
  for insert to authenticated
  with check (((requested_by = ( SELECT auth.uid() AS uid)) AND (status = 'open'::text) AND
CASE item
    WHEN 'medication'::stock_item THEN ( SELECT private.can('medication'::app_module, 'add'::text) AS can)
    ELSE ( SELECT private.can('inventory'::app_module, 'add'::text) AS can)
END));

create policy "Buyers decide reorder requests" on public.reorder_requests
  for update to authenticated
  using (((( SELECT private.access('purchases'::app_module, 'add'::text) AS access) = 'all'::access_level) AND (status = 'open'::text)))
  with check ((( SELECT private.access('purchases'::app_module, 'add'::text) AS access) = 'all'::access_level));

-- Whoever looks after stock asks; whoever buys decides.
create policy "See reorder requests" on public.reorder_requests
  for select to authenticated
  using ((( SELECT private.can('purchases'::app_module, 'view'::text) AS can) OR ( SELECT private.can('inventory'::app_module, 'view'::text) AS can) OR ( SELECT private.can('medication'::app_module, 'view'::text) AS can)));

create policy "Owner can add" on public.role_permissions
  for insert to authenticated
  with check (( SELECT private.can('admin'::app_module, 'add'::text) AS can));

create policy "Owner can delete" on public.role_permissions
  for delete to authenticated
  using (( SELECT private.can('admin'::app_module, 'delete'::text) AS can));

create policy "Owner can edit" on public.role_permissions
  for update to authenticated
  using (( SELECT private.can('admin'::app_module, 'edit'::text) AS can))
  with check (( SELECT private.can('admin'::app_module, 'edit'::text) AS can));

create policy "Staff can read" on public.role_permissions
  for select to authenticated
  using ((( SELECT private.my_role() AS my_role) IS NOT NULL));

create policy "Owner can add" on public.roles
  for insert to authenticated
  with check (( SELECT private.can('admin'::app_module, 'add'::text) AS can));

create policy "Owner can delete" on public.roles
  for delete to authenticated
  using (( SELECT private.can('admin'::app_module, 'delete'::text) AS can));

create policy "Owner can edit" on public.roles
  for update to authenticated
  using (( SELECT private.can('admin'::app_module, 'edit'::text) AS can))
  with check (( SELECT private.can('admin'::app_module, 'edit'::text) AS can));

create policy "Staff can read" on public.roles
  for select to authenticated
  using ((( SELECT private.my_role() AS my_role) IS NOT NULL));

create policy "Add sale portions" on public.sale_allocations
  for insert to authenticated
  with check (private.can_change_sale(sale_id));

create policy "Edit sale portions" on public.sale_allocations
  for update to authenticated
  using (private.can_change_sale(sale_id))
  with check (private.can_change_sale(sale_id));

create policy "Remove sale portions" on public.sale_allocations
  for delete to authenticated
  using (private.can_change_sale(sale_id));

create policy "See sale portions" on public.sale_allocations
  for select to authenticated
  using (( SELECT private.can('sales'::app_module, 'view'::text) AS can));

create policy "Edit sales" on public.sales
  for update to authenticated
  using (((( SELECT private.can('sales'::app_module, 'edit'::text) AS can) AND private.within_edit_window(recorded_by, created_at)) OR (( SELECT private.can('sales'::app_module, 'delete'::text) AS can) AND (deleted_at IS NULL)) OR (( SELECT private.is_manager() AS is_manager) AND (approval = 'pending'::sale_approval))))
  with check ((( SELECT private.can('sales'::app_module, 'edit'::text) AS can) OR ( SELECT private.can('sales'::app_module, 'delete'::text) AS can) OR ( SELECT private.is_manager() AS is_manager)));

create policy "Record sales" on public.sales
  for insert to authenticated
  with check ((( SELECT private.can('sales'::app_module, 'add'::text) AS can) AND (recorded_by = ( SELECT auth.uid() AS uid))));

create policy "See sales" on public.sales
  for select to authenticated
  using ((((deleted_at IS NULL) OR ( SELECT private.is_manager() AS is_manager)) AND ( SELECT private.can('sales'::app_module, 'view'::text) AS can)));

-- The owner and the farm manager assign pens to attendants.
create policy "Managers assign pens" on public.staff_pens
  for insert to authenticated
  with check (( SELECT private.is_manager() AS is_manager));

create policy "Managers unassign pens" on public.staff_pens
  for delete to authenticated
  using (( SELECT private.is_manager() AS is_manager));

create policy "See own pen assignments or all as admin viewer" on public.staff_pens
  for select to authenticated
  using (((profile_id = ( SELECT auth.uid() AS uid)) OR ( SELECT private.can('admin'::app_module, 'view'::text) AS can)));

create policy "Managers decide pending counts" on public.stock_adjustments
  for update to authenticated
  using ((( SELECT private.is_manager() AS is_manager) AND (status = 'pending'::text)))
  with check (( SELECT private.is_manager() AS is_manager));

create policy "Record counts and adjustments" on public.stock_adjustments
  for insert to authenticated
  with check (((recorded_by = ( SELECT auth.uid() AS uid)) AND
CASE item
    WHEN 'medication'::stock_item THEN ( SELECT private.can('medication'::app_module, 'add'::text) AS can)
    ELSE ( SELECT private.can('inventory'::app_module, 'add'::text) AS can)
END));

-- Stock: anyone who can view inventory or medication stock sees the ledger.
create policy "See stock adjustments" on public.stock_adjustments
  for select to authenticated
  using (
CASE item
    WHEN 'medication'::stock_item THEN ( SELECT private.can('medication'::app_module, 'view'::text) AS can)
    ELSE ( SELECT private.can('inventory'::app_module, 'view'::text) AS can)
END);

create policy "See stock movements" on public.stock_movements
  for select to authenticated
  using (
CASE item
    WHEN 'medication'::stock_item THEN ( SELECT private.can('medication'::app_module, 'view'::text) AS can)
    ELSE ( SELECT private.can('inventory'::app_module, 'view'::text) AS can)
END);

create policy "Add suppliers" on public.suppliers
  for insert to authenticated
  with check (( SELECT private.can('parties'::app_module, 'add'::text) AS can));

create policy "Edit suppliers" on public.suppliers
  for update to authenticated
  using (( SELECT private.can('parties'::app_module, 'edit'::text) AS can))
  with check (( SELECT private.can('parties'::app_module, 'edit'::text) AS can));

create policy "See suppliers" on public.suppliers
  for select to authenticated
  using ((( SELECT private.can('parties'::app_module, 'view'::text) AS can) OR ( SELECT private.can('purchases'::app_module, 'view'::text) AS can)));

-- ════════════════════════════════════════════════════════════════════
-- 11. Grants
-- Signed-out visitors (anon) get nothing. Signed-in users reach tables, views and RPCs, and RLS decides which rows.
-- ════════════════════════════════════════════════════════════════════

-- Tables and views
revoke all on all tables in schema public from anon, public;
grant all on all tables in schema public to authenticated, service_role;
alter default privileges for role postgres in schema public revoke all on tables from anon;

-- Sequences
revoke all on all sequences in schema public from anon, public;
grant usage, select, update on all sequences in schema public to authenticated, service_role;

-- Functions: only signed-in users may call the RPCs and helpers
revoke execute on all functions in schema public from anon, public;
revoke execute on all functions in schema private from anon, public;
grant execute on all functions in schema public to authenticated, service_role;
grant execute on all functions in schema private to authenticated, service_role;

-- ════════════════════════════════════════════════════════════════════
-- 12. Storage
-- Expense receipts: private bucket, 10 MB max, images or PDF. Access follows the expenses permissions.
-- ════════════════════════════════════════════════════════════════════

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('receipts', 'receipts', false, 10485760, array['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'application/pdf'])
on conflict (id) do nothing;

create policy "Owner removes receipts" on storage.objects
  for delete to authenticated
  using (((bucket_id = 'receipts'::text) AND ( SELECT private.can('expenses'::app_module, 'delete'::text) AS can)));

create policy "Staff who add expenses upload receipts" on storage.objects
  for insert to authenticated
  with check (((bucket_id = 'receipts'::text) AND ( SELECT private.can('expenses'::app_module, 'add'::text) AS can)));

create policy "Staff who edit expenses replace receipts" on storage.objects
  for update to authenticated
  using (((bucket_id = 'receipts'::text) AND ( SELECT private.can('expenses'::app_module, 'edit'::text) AS can)))
  with check (((bucket_id = 'receipts'::text) AND ( SELECT private.can('expenses'::app_module, 'edit'::text) AS can)));

create policy "Staff who see expenses view receipts" on storage.objects
  for select to authenticated
  using (((bucket_id = 'receipts'::text) AND ( SELECT private.can('expenses'::app_module, 'view'::text) AS can)));

-- ════════════════════════════════════════════════════════════════════
-- 13. Reference data
-- The lookup lists the app needs to work, copied from the live farm. No farm records.
-- Re-running is safe: rows that already exist are left alone.
-- ════════════════════════════════════════════════════════════════════

insert into public.roles (id, name, description, is_system) values
  ('farm_manager', 'Farm Manager', 'Runs the farm day to day. Approves below-minimum sales and late entries.', true),
  ('owner', 'Admin', 'Everything, including staff, roles and settings. Can restore deleted records.', true),
  ('pen_attendant', 'Pen Attendant', 'Records daily production for assigned pens. Sees only those pens.', true),
  ('pen_attendant_all', 'Pen Attendant · all pens', 'Records daily production and pen expenses for every pen.', true),
  ('sales_accounts', 'Sales & Accounts', 'Records sales, purchases, expenses and payments; sends statements.', true),
  ('store_keeper', 'Store Keeper', 'Receives deliveries and counts feed, eggs and medication.', true)
on conflict do nothing;

insert into public.role_permissions (role_id, module, can_view, can_add, can_edit, can_delete, scope_note) values
  ('farm_manager', 'production', 'all', 'all', 'all', 'none', 'All pens · corrections with a reason'),
  ('farm_manager', 'inventory', 'all', 'all', 'all', 'none', 'All records'),
  ('farm_manager', 'medication', 'all', 'all', 'all', 'none', 'All records'),
  ('farm_manager', 'expenses', 'all', 'all', 'all', 'none', 'All records'),
  ('farm_manager', 'dashboard', 'all', 'all', 'all', 'none', 'All records'),
  ('farm_manager', 'sales', 'all', 'all', 'all', 'none', 'All records'),
  ('farm_manager', 'purchases', 'all', 'all', 'all', 'none', 'All records'),
  ('farm_manager', 'payments', 'all', 'all', 'all', 'none', 'All records'),
  ('farm_manager', 'parties', 'all', 'all', 'all', 'none', 'All records'),
  ('farm_manager', 'admin', 'own', 'none', 'none', 'none', 'Staff list · assigns pens'),
  ('farm_manager', 'payroll', 'none', 'none', 'none', 'none', 'Own payslips and loans only'),
  ('farm_manager', 'finance', 'none', 'none', 'none', 'none', 'No access'),
  ('owner', 'production', 'all', 'all', 'all', 'all', 'All records'),
  ('owner', 'inventory', 'all', 'all', 'all', 'all', 'All records'),
  ('owner', 'medication', 'all', 'all', 'all', 'all', 'All records'),
  ('owner', 'expenses', 'all', 'all', 'all', 'all', 'All records'),
  ('owner', 'dashboard', 'all', 'all', 'all', 'all', 'All records'),
  ('owner', 'sales', 'all', 'all', 'all', 'all', 'All records'),
  ('owner', 'purchases', 'all', 'all', 'all', 'all', 'All records'),
  ('owner', 'payments', 'all', 'all', 'all', 'all', 'All records'),
  ('owner', 'parties', 'all', 'all', 'all', 'all', 'All records'),
  ('owner', 'admin', 'all', 'all', 'all', 'all', 'All records'),
  ('owner', 'payroll', 'all', 'all', 'all', 'all', 'Sets pay, approves loans and payroll'),
  ('owner', 'finance', 'all', 'all', 'all', 'all', 'Financial statements, assets, capital and loans'),
  ('pen_attendant', 'production', 'own', 'own', 'own', 'none', 'Own pens · edit until 23:59'),
  ('pen_attendant', 'inventory', 'all', 'none', 'none', 'none', 'Read only'),
  ('pen_attendant', 'medication', 'all', 'none', 'none', 'none', 'Read only'),
  ('pen_attendant', 'expenses', 'none', 'own', 'none', 'none', 'Own pens · add only'),
  ('pen_attendant', 'dashboard', 'own', 'none', 'none', 'none', 'Production tiles only'),
  ('pen_attendant', 'sales', 'none', 'none', 'none', 'none', 'Hidden'),
  ('pen_attendant', 'purchases', 'none', 'none', 'none', 'none', 'Hidden'),
  ('pen_attendant', 'payments', 'none', 'none', 'none', 'none', 'Hidden'),
  ('pen_attendant', 'parties', 'none', 'none', 'none', 'none', 'Hidden'),
  ('pen_attendant', 'admin', 'none', 'none', 'none', 'none', 'Hidden'),
  ('pen_attendant', 'payroll', 'none', 'none', 'none', 'none', 'Own payslips and loans only'),
  ('pen_attendant', 'finance', 'none', 'none', 'none', 'none', 'No access'),
  ('pen_attendant_all', 'production', 'all', 'all', 'all', 'none', 'All pens · edit until 23:59'),
  ('pen_attendant_all', 'inventory', 'all', 'none', 'none', 'none', 'Read only'),
  ('pen_attendant_all', 'medication', 'all', 'none', 'none', 'none', 'Read only'),
  ('pen_attendant_all', 'expenses', 'none', 'own', 'none', 'none', 'Any pen · add only'),
  ('pen_attendant_all', 'dashboard', 'own', 'none', 'none', 'none', 'Production tiles only'),
  ('pen_attendant_all', 'sales', 'none', 'none', 'none', 'none', 'Hidden'),
  ('pen_attendant_all', 'purchases', 'none', 'none', 'none', 'none', 'Hidden'),
  ('pen_attendant_all', 'payments', 'none', 'none', 'none', 'none', 'Hidden'),
  ('pen_attendant_all', 'parties', 'none', 'none', 'none', 'none', 'Hidden'),
  ('pen_attendant_all', 'admin', 'none', 'none', 'none', 'none', 'Hidden'),
  ('pen_attendant_all', 'payroll', 'none', 'none', 'none', 'none', 'Own payslips and loans only'),
  ('pen_attendant_all', 'finance', 'none', 'none', 'none', 'none', 'No access'),
  ('sales_accounts', 'production', 'all', 'none', 'none', 'none', 'Read only, for reports and statements'),
  ('sales_accounts', 'inventory', 'all', 'none', 'none', 'none', 'Read only, for reports and statements'),
  ('sales_accounts', 'medication', 'all', 'none', 'none', 'none', 'Read only, for reports and statements'),
  ('sales_accounts', 'expenses', 'all', 'all', 'all', 'none', 'All records · deletes need a reason'),
  ('sales_accounts', 'dashboard', 'own', 'none', 'none', 'none', 'Money tiles only'),
  ('sales_accounts', 'sales', 'all', 'all', 'all', 'none', 'All records · deletes need a reason'),
  ('sales_accounts', 'purchases', 'all', 'all', 'all', 'none', 'All records · deletes need a reason'),
  ('sales_accounts', 'payments', 'all', 'all', 'all', 'none', 'All records · deletes need a reason'),
  ('sales_accounts', 'parties', 'all', 'all', 'all', 'none', 'All records · deletes need a reason'),
  ('sales_accounts', 'admin', 'none', 'none', 'none', 'none', 'Hidden'),
  ('sales_accounts', 'payroll', 'all', 'all', 'all', 'none', 'Prepares payroll, records pay; loans need the owner'),
  ('sales_accounts', 'finance', 'all', 'all', 'all', 'none', 'Financial statements; records assets, capital and loans'),
  ('store_keeper', 'production', 'none', 'none', 'none', 'none', 'Hidden'),
  ('store_keeper', 'inventory', 'all', 'all', 'all', 'none', 'Deliveries and counts'),
  ('store_keeper', 'medication', 'all', 'all', 'all', 'none', 'Deliveries and counts'),
  ('store_keeper', 'expenses', 'none', 'none', 'none', 'none', 'Hidden'),
  ('store_keeper', 'dashboard', 'own', 'none', 'none', 'none', 'Stock tiles only'),
  ('store_keeper', 'sales', 'none', 'none', 'none', 'none', 'Hidden'),
  ('store_keeper', 'purchases', 'own', 'none', 'own', 'none', 'Receives feed and medication deliveries only'),
  ('store_keeper', 'payments', 'none', 'none', 'none', 'none', 'Hidden'),
  ('store_keeper', 'parties', 'none', 'none', 'none', 'none', 'Hidden'),
  ('store_keeper', 'admin', 'none', 'none', 'none', 'none', 'Hidden'),
  ('store_keeper', 'payroll', 'none', 'none', 'none', 'none', 'Own payslips and loans only'),
  ('store_keeper', 'finance', 'none', 'none', 'none', 'none', 'No access')
on conflict do nothing;

insert into public.bird_types (id, name, lays_eggs, is_active) overriding system value values
  (1, 'Layer', true, true),
  (2, 'Broiler', false, true),
  (3, 'Cockerel', false, true),
  (4, 'Noiler', false, true)
on conflict do nothing;
select setval(pg_get_serial_sequence('public.bird_types', 'id'), (select max(id) from public.bird_types));

insert into public.feed_types (id, name, bag_kg, reorder_level_bags, is_active) overriding system value values
  (1, 'Chick mash-Chikun', 25, 6, true),
  (2, 'Grower mash-Chikun', 25, 10, true),
  (3, 'Layer mash-Chikun', 25, 10, true),
  (4, 'BSST-Broiler Super-starter-Chikun', 25, 2, true),
  (5, 'Broiler finisher-Chikun', 25, 2, true),
  (6, 'Grower Pelet-Chikun', 25, 6, true),
  (7, 'Layer Pelet-Chikun', 25, 10, true),
  (8, 'Adva-Chick Mash', 25, 5, true),
  (9, 'Adva-Grower Mash', 25, 10, true),
  (10, 'Adva-Layer Mash', 25, 10, true),
  (11, 'Utimal Starter', 25, 2, true),
  (12, 'Utimal Finisher', 25, 2, true),
  (13, 'Adva Grower Pelet', 25, 10, true),
  (14, 'Adva Layer Pelet', 25, 10, true),
  (15, 'Adva Chick Pelet', 25, 4, true)
on conflict do nothing;
select setval(pg_get_serial_sequence('public.feed_types', 'id'), (select max(id) from public.feed_types));

insert into public.feed_targets (id, bird_type_id, breed, week_from, week_to, grams_per_bird_day, recommended_feed_type_id) overriding system value values
  (1, 1, 'Isa Brown', 1, 2, 15, 1),
  (2, 1, 'Isa Brown', 3, 6, 32, 1),
  (3, 1, 'Isa Brown', 7, 10, 50, 2),
  (4, 1, 'Isa Brown', 11, 16, 68, 2),
  (5, 1, 'Isa Brown', 17, 18, 95, 3),
  (6, 1, 'Isa Brown', 19, null, 115, 3),
  (7, 2, 'Ross 308', 1, 1, 20, 4),
  (8, 2, 'Ross 308', 2, 2, 45, 4),
  (9, 2, 'Ross 308', 3, 3, 75, 4),
  (10, 2, 'Ross 308', 4, 4, 110, 5),
  (11, 2, 'Ross 308', 5, 5, 145, 5),
  (12, 2, 'Ross 308', 6, null, 165, 5)
on conflict do nothing;
select setval(pg_get_serial_sequence('public.feed_targets', 'id'), (select max(id) from public.feed_targets));

insert into public.expense_categories (id, name, is_active, statement_line) overriding system value values
  (1, 'Labour', true, 'labour'),
  (2, 'Fuel & power', true, 'utilities'),
  (3, 'Vet services', true, 'healthcare'),
  (4, 'Transport', true, 'transport'),
  (5, 'Repairs', true, 'maintenance'),
  (6, 'Utilities', true, 'utilities'),
  (7, 'Equipment', true, 'supplies'),
  (8, 'Security', true, 'misc'),
  (9, 'Other', true, 'misc'),
  (10, 'Broiler Expenses', true, 'misc'),
  (11, 'Generator Fuelling', true, 'transport'),
  (12, 'Sawdust', true, 'maintenance')
on conflict do nothing;
select setval(pg_get_serial_sequence('public.expense_categories', 'id'), (select max(id) from public.expense_categories));

insert into public.adjustment_reasons (id, name, is_active) overriding system value values
  (1, 'Bag torn, unusable', true),
  (2, 'Spilled', true),
  (3, 'Expired', true),
  (4, 'Theft suspected', true),
  (5, 'Recount', true),
  (6, 'Broken eggs', true)
on conflict do nothing;
select setval(pg_get_serial_sequence('public.adjustment_reasons', 'id'), (select max(id) from public.adjustment_reasons));

insert into public.medications (id, name, category, default_mode, default_purpose, dosage_note, withdrawal_days, stock_unit, reorder_level, is_active) overriding system value values
  (1, 'Vitalyte (Vitamin C)', 'vitamin', 'water', 'vitamin', null, 0, 'g', 500, true),
  (2, 'Amoxicillin 20%', 'antibiotic', 'water', 'treatment', null, 5, 'g', 200, true),
  (3, 'Amprolium 20%', 'coccidiostat', 'water', 'prevention', null, 7, 'g', 250, true),
  (4, 'Gumboro (IBD) vaccine', 'vaccine', 'water', 'vaccination', null, 0, 'vial', 2, true),
  (5, 'Lasota (ND) vaccine', 'vaccine', 'eye_nose_drop', 'vaccination', null, 0, 'vial', 2, true),
  (6, 'Piperazine', 'dewormer', 'water', 'treatment', null, 7, 'g', 300, true),
  (7, 'Virkon S', 'disinfectant', 'spray', 'prevention', null, null, 'kg', 2, true),
  (8, 'Anti stress', 'vitamin', null, null, null, 0, 'g', 0, true),
  (9, 'Electrolyte', 'vitamin', null, null, null, 0, 'g', 0, true),
  (11, 'Komarov vaccine', 'vaccine', null, null, null, 0, 'g', 0, true),
  (12, 'Kepromec  Oral', 'dewormer', null, null, null, 0, 'ml', 0, true),
  (13, 'Adamechine', 'dewormer', null, null, null, 0, 'ml', 0, true),
  (14, 'Other brand of dewormer', 'dewormer', null, null, null, 0, 'ml', 0, true)
on conflict do nothing;
select setval(pg_get_serial_sequence('public.medications', 'id'), (select max(id) from public.medications));

insert into public.products (id, name, kind, unit, stock_item, stock_units_per_unit, min_price, is_active, bird_type_id) overriding system value values
  (1, 'Eggs · crate of 30', 'eggs', 'crate', 'eggs', 30, 4000, true, null),
  (2, 'Cracked eggs · crate', 'eggs', 'crate', 'cracked_eggs', 30, 2000, true, null),
  (3, 'Spent layers', 'birds', 'bird', null, null, 5000, true, 1),
  (4, 'Live broilers', 'birds', 'bird', null, null, 6500, true, 2),
  (5, 'Droppings · 50 kg bag', 'droppings', 'bag', null, null, 1200, true, null),
  (6, 'Empty feed sacks', 'sacks', 'sack', null, null, null, true, null)
on conflict do nothing;
select setval(pg_get_serial_sequence('public.products', 'id'), (select max(id) from public.products));

insert into public.farm_settings (id, farm_name, trading_as, address, phone, email, logo_path, currency, time_zone, financial_year_start_month, go_live_date, receipt_footer, whatsapp_sender, whatsapp_monthly_limit, mortality_alert_pct, feed_variance_pct, low_stock_days, expiry_warning_days, missing_entry_cutoff, overdue_debt_days, eggs_per_crate, edit_window_days, spread_rearing_cost, layer_laying_weeks) values
  (true, 'AyokaFarm', null, 'Kwara State', null, null, null, 'NGN', 'Africa/Lagos', 1, '2026-07-01', 'Thank you for buying from AyokaFarm.', null, null, 0.5, 10, 5, 30, '18:00:00', 60, 30, 0, false, 60)
on conflict do nothing;
