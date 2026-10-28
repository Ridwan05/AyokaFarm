-- Default roles, permissions, settings and lists (BRD §4, §7). All editable later in Settings.

insert into public.roles (id, name, description, is_system) values
  ('owner', 'Admin', 'Everything, including staff, roles and settings. Can restore deleted records.', true),
  ('farm_manager', 'Farm Manager', 'Runs the farm day to day. Approves below-minimum sales and late entries.', true),
  ('pen_attendant', 'Pen Attendant', 'Records daily production for assigned pens. Sees only those pens.', true),
  ('pen_attendant_all', 'Pen Attendant · all pens', 'Records daily production and pen expenses for every pen.', true),
  ('store_keeper', 'Store Keeper', 'Receives deliveries and counts feed, eggs and medication.', true),
  ('sales_accounts', 'Sales & Accounts', 'Records sales, purchases, expenses and payments; sends statements.', true);

-- Owner: everything.
insert into public.role_permissions (role_id, module, can_view, can_add, can_edit, can_delete, scope_note)
select 'owner', m, 'all', 'all', 'all', 'all', 'All records'
from unnest(enum_range(null::public.app_module)) m;

-- Farm manager: works on every record, deletes nothing; in Settings, the staff list only.
insert into public.role_permissions (role_id, module, can_view, can_add, can_edit, can_delete, scope_note)
select 'farm_manager', m,
  case when m = 'admin' then 'own' else 'all' end::public.access_level,
  case when m = 'admin' then 'none' else 'all' end::public.access_level,
  case when m = 'admin' then 'none' else 'all' end::public.access_level,
  'none',
  case m when 'admin' then 'Staff list · assigns pens' when 'production' then 'All pens · corrections with a reason' else 'All records' end
from unnest(enum_range(null::public.app_module)) m;

insert into public.role_permissions (role_id, module, can_view, can_add, can_edit, can_delete, scope_note) values
  -- Pen attendant: own pens only.
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
  -- Pen attendant · all pens: the same job, on every pen (relief cover).
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
  -- Store keeper: receiving deliveries and stock counts only.
  ('store_keeper', 'inventory', 'all', 'all', 'all', 'none', 'Deliveries and counts'),
  ('store_keeper', 'medication', 'all', 'all', 'all', 'none', 'Deliveries and counts'),
  ('store_keeper', 'purchases', 'own', 'none', 'own', 'none', 'Receives feed and medication deliveries only'),
  ('store_keeper', 'production', 'none', 'none', 'none', 'none', 'Hidden'),
  ('store_keeper', 'expenses', 'none', 'none', 'none', 'none', 'Hidden'),
  ('store_keeper', 'dashboard', 'own', 'none', 'none', 'none', 'Stock tiles only'),
  ('store_keeper', 'sales', 'none', 'none', 'none', 'none', 'Hidden'),
  ('store_keeper', 'payments', 'none', 'none', 'none', 'none', 'Hidden'),
  ('store_keeper', 'parties', 'none', 'none', 'none', 'none', 'Hidden'),
  ('store_keeper', 'admin', 'none', 'none', 'none', 'none', 'Hidden'),
  -- Sales & accounts: the money side.
  ('sales_accounts', 'sales', 'all', 'all', 'all', 'none', 'All records · deletes need a reason'),
  ('sales_accounts', 'purchases', 'all', 'all', 'all', 'none', 'All records · deletes need a reason'),
  ('sales_accounts', 'expenses', 'all', 'all', 'all', 'none', 'All records · deletes need a reason'),
  ('sales_accounts', 'payments', 'all', 'all', 'all', 'none', 'All records · deletes need a reason'),
  ('sales_accounts', 'parties', 'all', 'all', 'all', 'none', 'All records · deletes need a reason'),
  ('sales_accounts', 'dashboard', 'own', 'none', 'none', 'none', 'Money tiles only'),
  ('sales_accounts', 'production', 'none', 'none', 'none', 'none', 'Hidden'),
  ('sales_accounts', 'inventory', 'none', 'none', 'none', 'none', 'Hidden'),
  ('sales_accounts', 'medication', 'none', 'none', 'none', 'none', 'Hidden'),
  ('sales_accounts', 'admin', 'none', 'none', 'none', 'none', 'Hidden');

insert into public.farm_settings (farm_name, address, go_live_date, receipt_footer)
values ('AyokaFarm', 'Oyo State', '2026-07-01', 'Thank you for buying from AyokaFarm.');

insert into public.bird_types (name, lays_eggs) values
  ('Layer', true),
  ('Broiler', false),
  ('Cockerel', false),
  ('Noiler', false);

insert into public.feed_types (name, bag_kg, reorder_level_bags) values
  ('Chick mash', 25, 20),
  ('Grower mash', 25, 40),
  ('Layer mash', 25, 100),
  ('Broiler starter', 25, 30),
  ('Broiler finisher', 25, 60);

-- Expected feed by age (BRD §7.2), for the breeds the farm keeps today.
insert into public.feed_targets (bird_type_id, breed, week_from, week_to, grams_per_bird_day, recommended_feed_type_id)
select bt.id, t.breed, t.week_from, t.week_to, t.grams, ft.id
from (values
  ('Layer', 'Isa Brown', 1, 2, 15, 'Chick mash'),
  ('Layer', 'Isa Brown', 3, 6, 32, 'Chick mash'),
  ('Layer', 'Isa Brown', 7, 10, 50, 'Grower mash'),
  ('Layer', 'Isa Brown', 11, 16, 68, 'Grower mash'),
  ('Layer', 'Isa Brown', 17, 18, 95, 'Layer mash'),
  ('Layer', 'Isa Brown', 19, null, 115, 'Layer mash'),
  ('Broiler', 'Ross 308', 1, 1, 20, 'Broiler starter'),
  ('Broiler', 'Ross 308', 2, 2, 45, 'Broiler starter'),
  ('Broiler', 'Ross 308', 3, 3, 75, 'Broiler starter'),
  ('Broiler', 'Ross 308', 4, 4, 110, 'Broiler finisher'),
  ('Broiler', 'Ross 308', 5, 5, 145, 'Broiler finisher'),
  ('Broiler', 'Ross 308', 6, null, 165, 'Broiler finisher')
) as t(bird_type, breed, week_from, week_to, grams, feed)
join public.bird_types bt on bt.name = t.bird_type
join public.feed_types ft on ft.name = t.feed;

insert into public.medications (name, category, default_mode, default_purpose, withdrawal_days, stock_unit, reorder_level) values
  ('Vitalyte (Vitamin C)', 'vitamin', 'water', 'vitamin', 0, 'g', 500),
  ('Amoxicillin 20%', 'antibiotic', 'water', 'treatment', 5, 'g', 200),
  ('Amprolium 20%', 'coccidiostat', 'water', 'prevention', 7, 'g', 250),
  ('Gumboro (IBD) vaccine', 'vaccine', 'water', 'vaccination', 0, 'vial', 2),
  ('Lasota (ND) vaccine', 'vaccine', 'eye_nose_drop', 'vaccination', 0, 'vial', 2),
  ('Piperazine', 'dewormer', 'water', 'treatment', 7, 'g', 300),
  ('Virkon S', 'disinfectant', 'spray', 'prevention', null, 'kg', 2);

insert into public.products (name, kind, unit, stock_item, stock_units_per_unit, min_price) values
  ('Eggs · crate of 30', 'eggs', 'crate', 'eggs', 30, 4000),
  ('Cracked eggs · crate', 'eggs', 'crate', 'cracked_eggs', 30, 2000),
  ('Spent layers', 'birds', 'bird', null, null, 5000),
  ('Live broilers', 'birds', 'bird', null, null, 6500),
  ('Droppings · 50 kg bag', 'droppings', 'bag', null, null, 1200),
  ('Empty feed sacks', 'sacks', 'sack', null, null, null);

insert into public.expense_categories (name) values
  ('Labour'), ('Fuel & power'), ('Vet services'), ('Transport'), ('Repairs'),
  ('Utilities'), ('Equipment'), ('Security'), ('Other');

insert into public.adjustment_reasons (name) values
  ('Bag torn, unusable'), ('Spilled'), ('Expired'), ('Theft suspected'), ('Recount'), ('Broken eggs');
