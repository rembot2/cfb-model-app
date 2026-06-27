-- Add editable rating-progression controls to the active formula config.

alter table public.model_configs
  add column if not exists rating_recency_weight numeric not null default 2.5,
  add column if not exists rating_talent_weight numeric not null default 0.4,
  add column if not exists rating_historical_position_weight numeric not null default 0.3,
  add column if not exists rating_preseason_position_weight numeric not null default 0.7;

update public.model_configs
set
  rating_recency_weight = coalesce(rating_recency_weight, 2.5),
  rating_talent_weight = coalesce(rating_talent_weight, 0.4),
  rating_historical_position_weight = coalesce(rating_historical_position_weight, 0.3),
  rating_preseason_position_weight = coalesce(rating_preseason_position_weight, 0.7);
