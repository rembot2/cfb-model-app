-- Add position-group outputs required by the roster-aware ratings model.
-- Safe to run more than once.

alter table public.ratings
  add column if not exists qb_rating numeric,
  add column if not exists rb_rating numeric,
  add column if not exists wr_rating numeric,
  add column if not exists te_rating numeric,
  add column if not exists ol_rating numeric,
  add column if not exists dl_rating numeric,
  add column if not exists lb_rating numeric,
  add column if not exists cb_rating numeric,
  add column if not exists s_rating numeric,
  add column if not exists k_rating numeric,
  add column if not exists p_rating numeric;
