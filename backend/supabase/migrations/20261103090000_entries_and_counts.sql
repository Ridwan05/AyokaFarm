-- Daily entries saved and corrected in one step, and stock counts that wait for a manager.
--
-- 1. save_daily_entry(): the entry and its medication lines are written together (before, a failed
--    medication insert left the entry without its doses). Passing an id corrects an existing entry
--    (within the edit window, or by a manager), replacing its medication lines.
-- 2. Deleting an entry (deleted_at + reason) now also gives its medication back to stock; before,
--    only the feed was returned.
-- 3. Stock counts: big differences are saved as "pending" and only change stock when a manager
--    approves them; matching counts are kept too (quantity_change 0) so "last count" is right.

-- ── 1. One call for an entry and its medication ─────────────────────
-- entry: {"pen_id", "flock_id", "record_date", "mortality", "feed_type_id", "feed_bags",
--         "eggs_collected", "eggs_cracked", "notes"}
-- medications: [{"medication_id", "quantity", "mode", "purpose"}]
create function public.save_daily_entry(entry jsonb, medications jsonb default '[]'::jsonb, entry_id bigint default null)
returns bigint
language plpgsql
security invoker
set search_path = ''
as $$
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
$$;
revoke execute on function public.save_daily_entry(jsonb, jsonb, bigint) from public, anon;
grant execute on function public.save_daily_entry(jsonb, jsonb, bigint) to authenticated;

-- ── 2. Deleting or restoring an entry moves its medication too ──────
create function private.entry_medication_restock()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
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
$$;
create trigger medication_restock after update of deleted_at on public.production_records
  for each row execute function private.entry_medication_restock();

-- ── 3. Counts that wait for a manager ───────────────────────────────
alter table public.stock_adjustments
  add column status text not null default 'applied' check (status in ('applied', 'pending', 'rejected')),
  add column decided_by uuid references public.profiles (id),
  add column decided_at timestamptz;
comment on column public.stock_adjustments.status is 'applied changes stock; pending waits for a manager (big count differences); rejected never changes stock.';

-- Only applied adjustments move stock.
create or replace function private.adjustment_stock()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
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
$$;

-- Managers approve or reject a pending difference; nothing else about an adjustment changes.
create function private.guard_adjustment_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
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
$$;
create trigger guard_change before update on public.stock_adjustments
  for each row execute function private.guard_adjustment_change();

create policy "Managers decide pending counts" on public.stock_adjustments for update to authenticated
  using ((select private.is_manager()) and status = 'pending')
  with check ((select private.is_manager()));
grant update on public.stock_adjustments to authenticated;

grant execute on all functions in schema private to authenticated, service_role;
revoke execute on all functions in schema private from public, anon;
