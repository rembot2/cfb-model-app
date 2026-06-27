-- Revamp coaching inputs and add formula-controlled coach boost multipliers.
-- Run this in Supabase SQL Editor before deploying the app changes.

alter table public.coach_configs
  add column if not exists offense_rating integer not null default 5,
  add column if not exists defense_rating integer not null default 5,
  add column if not exists development_rating text not null default 'Average';

alter table public.coach_configs
  drop constraint if exists coach_configs_offense_rating_check,
  drop constraint if exists coach_configs_defense_rating_check,
  drop constraint if exists coach_configs_development_rating_check;

alter table public.coach_configs
  add constraint coach_configs_offense_rating_check check (offense_rating between 1 and 10),
  add constraint coach_configs_defense_rating_check check (defense_rating between 1 and 10),
  add constraint coach_configs_development_rating_check check (development_rating in ('Elite', 'Good', 'Average', 'Poor', 'Terrible'));

alter table public.model_configs
  add column if not exists coach_offense_boost numeric not null default 0.6,
  add column if not exists coach_defense_boost numeric not null default 0.6,
  add column if not exists coach_development_boost numeric not null default 1.0;

update public.model_configs
set
  coach_offense_boost = coalesce(coach_offense_boost, 0.6),
  coach_defense_boost = coalesce(coach_defense_boost, 0.6),
  coach_development_boost = coalesce(coach_development_boost, 1.0);
