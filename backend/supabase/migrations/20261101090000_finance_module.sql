-- Financial statements and finance records get their own permission area. Run this before
-- 20261101090100_finance.sql: a new enum value can't be used in the transaction that adds it.
alter type public.app_module add value if not exists 'finance';
