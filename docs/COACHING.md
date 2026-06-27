# Coaching configuration

The ratings engine reads one row per team from `public.coach_configs`.

The active coaching inputs are:

- `coach_name`: refreshed from CFBD unless you manually lock the row.
- `hire_year`: editable on the Coaches page.
- `offense_rating`: 1 through 10.
- `defense_rating`: 1 through 10.
- `development_rating`: `Elite`, `Good`, `Average`, `Poor`, or `Terrible`.

The old `tier`, `off_tendency`, `def_tendency`, and `preseason_override`
columns are kept only for database compatibility. They are no longer used by
the ratings formula.

## Formula controls

The active row in `public.model_configs` controls how much coaching matters:

- `coach_offense_boost`: added to pass/rush offense as
  `(offense_rating - 5.5) * coach_offense_boost`.
- `coach_defense_boost`: added to pass/rush defense as
  `(defense_rating - 5.5) * coach_defense_boost`.
- `coach_development_boost`: added to composite only.

Development scores are:

- `Elite`: `+2`
- `Good`: `+1`
- `Average`: `0`
- `Poor`: `-1`
- `Terrible`: `-2`

Example: if `coach_development_boost` is `1.0`, an `Elite` development coach
adds `+2.0` to the team's composite rating and a `Terrible` development coach
subtracts `2.0`.

After editing coaches or formula boost values, run the ratings/predictions
update job so the ratings table is recalculated.
