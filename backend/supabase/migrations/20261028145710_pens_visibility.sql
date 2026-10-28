-- Pen attendants could read every pen's row (name, capacity) because they have read-only stock
-- access, and pens were visible to anyone who can view inventory. Stock viewers who don't work on
-- production (the store keeper) still see every pen; attendants now see only the pens they work on.

drop policy "See pens in scope" on public.pens;

create policy "See pens in scope" on public.pens for select to authenticated
  using (
    private.can_pen('production', 'view', id)
    or (select private.can('sales', 'view'))
    or ((select private.can('inventory', 'view')) and (select private.access('production', 'view')) = 'none')
  );
