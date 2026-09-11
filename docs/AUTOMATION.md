# Model refresh automation

The `Refresh CFB model` GitHub Actions workflow runs every Monday at 11:00 UTC
(6:00 AM Central during daylight-saving time). It can also be started manually
from the repository's Actions tab.

## Required secret

The workflow sends authenticated POST requests to the deployed update API. Add
the same `CRON_SECRET` value in both places:

1. Vercel project: **Settings > Environment Variables > CRON_SECRET**.
2. GitHub repository: **Settings > Secrets and variables > Actions > New
   repository secret**. Name it `CRON_SECRET`.

Never put the secret directly in the workflow file or a browser URL.

## What the workflow does

1. Refreshes 2026 games and stats for whatever games were played since the last run.
2. Recalculates 2026 ratings and predictions using the same formula as the backtest engine.

Teams, coaches, and rosters/talent composites are no longer refreshed on this weekly
schedule — those don't change meaningfully week to week during the season. Run the
`Recalculate all ratings`, `Rebuild backtests`, or `Full optimizer` workflows manually
(Actions tab, `workflow_dispatch`) when you actually need to refresh historical seasons,
rebuild backtests, or re-optimize weights.

## Run it now

Open **GitHub > Actions > Refresh CFB model > Run workflow**. Open the running
workflow to inspect each step. A green check means every API call completed.
