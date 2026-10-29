-- Shared alert status and saved reorder requests.
--
-- 1. alert_marks: acknowledging or resolving an alert is shared by everyone (it was kept on one
--    device). Alerts are still calculated from the records; a mark is keyed by the alert's id
--    (e.g. "mortality-2-2026-10-28"), so a new day's alert starts unmarked.
-- 2. reorder_requests: "Ask to reorder" is saved for the people who buy (it was only a message).
--    They mark it ordered (optionally linking the purchase) or dismiss it.

-- ── 1. Alert status ─────────────────────────────────────────────────
create table public.alert_marks (
  alert_id text primary key check (length(alert_id) between 1 and 200),
  status text not null check (status in ('acknowledged', 'resolved')),
  note text,
  marked_by uuid not null default auth.uid() references public.profiles (id),
  marked_at timestamptz not null default now()
);
alter table public.alert_marks enable row level security;
create policy "See alert status" on public.alert_marks for select to authenticated
  using ((select private.can('dashboard', 'view')));
create policy "Mark alerts" on public.alert_marks for insert to authenticated
  with check ((select private.can('dashboard', 'view')) and marked_by = (select auth.uid()));
create policy "Change alert status" on public.alert_marks for update to authenticated
  using ((select private.can('dashboard', 'view')))
  with check ((select private.can('dashboard', 'view')) and marked_by = (select auth.uid()));
create policy "Clear alert status" on public.alert_marks for delete to authenticated
  using ((select private.is_manager()));
grant select, insert, update, delete on public.alert_marks to authenticated;
create trigger audit after insert or update or delete on public.alert_marks for each row execute function private.audit();

-- ── 2. Reorder requests ─────────────────────────────────────────────
create table public.reorder_requests (
  id bigint generated always as identity primary key,
  item public.stock_item not null check (item in ('feed', 'medication')),
  feed_type_id bigint references public.feed_types (id),
  medication_id bigint references public.medications (id),
  quantity numeric(12,2) not null check (quantity > 0),
  unit text not null,
  needed_by date,
  note text,
  status text not null default 'open' check (status in ('open', 'ordered', 'dismissed')),
  purchase_id bigint references public.purchases (id),
  requested_by uuid not null default auth.uid() references public.profiles (id),
  created_at timestamptz not null default now(),
  decided_by uuid references public.profiles (id),
  decided_at timestamptz,
  check ((item = 'feed') = (feed_type_id is not null)),
  check ((item = 'medication') = (medication_id is not null))
);
create index reorder_requests_open_idx on public.reorder_requests (status, created_at) where status = 'open';
alter table public.reorder_requests enable row level security;

-- Whoever looks after stock asks; whoever buys decides.
create policy "See reorder requests" on public.reorder_requests for select to authenticated
  using ((select private.can('purchases', 'view')) or (select private.can('inventory', 'view')) or (select private.can('medication', 'view')));
create policy "Ask to reorder" on public.reorder_requests for insert to authenticated
  with check (
    requested_by = (select auth.uid()) and status = 'open'
    and case item when 'medication' then (select private.can('medication', 'add')) else (select private.can('inventory', 'add')) end
  );
create policy "Buyers decide reorder requests" on public.reorder_requests for update to authenticated
  using ((select private.access('purchases', 'add')) = 'all' and status = 'open')
  with check ((select private.access('purchases', 'add')) = 'all');
grant select, insert, update on public.reorder_requests to authenticated;

create function private.reorder_decided()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.status is distinct from old.status then
    new.decided_by := (select auth.uid());
    new.decided_at := now();
  end if;
  return new;
end;
$$;
create trigger decided before update on public.reorder_requests for each row execute function private.reorder_decided();
create trigger audit after insert or update or delete on public.reorder_requests for each row execute function private.audit();

grant execute on all functions in schema private to authenticated, service_role;
revoke execute on all functions in schema private from public, anon;
