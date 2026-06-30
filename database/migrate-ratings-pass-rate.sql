-- Store each team's offensive pass rate so predictions and backtests can weight
-- pass/rush matchup advantages by team tendency instead of assuming 50/50.
-- Safe to run more than once.

alter table public.ratings
  add column if not exists pass_rate numeric;
