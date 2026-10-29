-- Payroll gets its own permission area. Run this before 20261031090100_payroll.sql: a new enum
-- value can't be used in the same transaction that adds it.
alter type public.app_module add value if not exists 'payroll';
