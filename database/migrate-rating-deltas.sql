alter table public.ratings
  add column if not exists off_rating_delta numeric,
  add column if not exists def_rating_delta numeric,
  add column if not exists composite_delta numeric;
