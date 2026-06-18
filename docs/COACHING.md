# Coaching configuration

The ratings engine reads one row per team from `public.coach_configs`. Coach
names and hire years are refreshed from CFBD. Tier, tendency, override, and
notes are preserved as editable model inputs.

## Fields

- `tier`: `Elite`, `Good`, `Average`, `Concerning`, or `Unknown`.
- `hire_year`: seasons before this year receive a 90% discount for the prior
  season and a 95% discount for older seasons.
- `off_tendency` and `def_tendency`: confidence levels from 1 through 5. They
  map to performance trust values of 0.55, 0.70, 0.82, 0.92, and 1.00.
- `preseason_override`: optional display-scale override for exceptional cases.
- `source`: set to `manual` to prevent CFBD from replacing coach identity and
  hire year. Other model inputs are always preserved.

## Tier behavior

- `Elite`: stronger trajectory effect and a positive coaching bonus.
- `Good`: moderately stronger trajectory effect and a smaller positive bonus.
- `Average`: neutral behavior.
- `Concerning`: no trajectory credit, a 15% mean pull, and a negative bonus.
- `Unknown`: reduced trajectory credit, a 25% mean pull, and a small negative
  uncertainty adjustment.

Edit these values in **Supabase > Table Editor > coach_configs**. Then run the
ratings and backtest refresh, or start the `Refresh CFB model` GitHub workflow.
