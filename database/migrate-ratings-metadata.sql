-- Bring an existing ratings table up to date with the application schema.
-- This is safe to run more than once.

alter table public.ratings
  add column if not exists source text default 'app',
  add column if not exists synced_at timestamptz default now();

update public.ratings
set
  source = coalesce(source, 'app'),
  synced_at = coalesce(synced_at, now())
where source is null or synced_at is null;

alter table public.ratings
  alter column synced_at set default now(),
  alter column synced_at set not null;
