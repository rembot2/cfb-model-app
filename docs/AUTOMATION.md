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

1. Refreshes 2026 teams, games, advanced stats, and four roster batches.
2. Recalculates ratings and predictions for 2022 through 2026.
3. Runs the optimizer once using all completed seasons and activates rank 1.
4. Rebuilds every historical backtest with that active optimized configuration.
5. Regenerates 2026 predictions with the optimized configuration.

## Run it now

Open **GitHub > Actions > Refresh CFB model > Run workflow**. Open the running
workflow to inspect each step. A green check means every API call completed.
