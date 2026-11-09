-- Daily entries are due by the end of the day, not 6pm.
--
-- The missing-entry cut-off only sets the "Due by" label and when a pen with no entry
-- today raises an alert; it never stopped anyone saving. At 18:00 it read as a deadline,
-- so staff thought they couldn't record in the evening.

alter table public.farm_settings alter column missing_entry_cutoff set default '23:59';
update public.farm_settings set missing_entry_cutoff = '23:59' where missing_entry_cutoff = '18:00';
