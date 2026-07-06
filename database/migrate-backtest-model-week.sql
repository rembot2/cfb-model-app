-- Keep CFBD's original week number while giving the model a chronological week.
-- Postseason games often come from CFBD as week 1/2, so model_week places them
-- after the regular season for backtests and prior-only weekly ratings.
-- Safe to run more than once.

alter table public.games
  add column if not exists model_week integer;

alter table public.team_game_stats
  add column if not exists model_week integer,
  add column if not exists season_type text not null default 'regular';

alter table public.backtest_games
  add column if not exists week_label text;

update public.games
set model_week = week
where model_week is null;

with regular_max as (
  select season, max(week) as max_regular_week
  from public.games
  where season_type = 'regular'
  group by season
)
update public.games g
set model_week = coalesce(r.max_regular_week, 15) + g.week
from regular_max r
where g.season = r.season
  and g.season_type = 'postseason';

update public.team_game_stats
set model_week = week
where model_week is null;

update public.team_game_stats s
set
  season_type = coalesce(g.season_type, s.season_type),
  model_week = coalesce(g.model_week, s.model_week)
from public.games g
where s.cfbd_game_id = g.cfbd_game_id;
