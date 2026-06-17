# CFB Model App - Version 3

This is the clean full-stack version meant to eventually replace Google Sheets and Apps Script.

## Architecture

```text
Next.js on Vercel
  - website pages
  - API routes
  - scheduled update endpoint
  - model code

Supabase Postgres
  - teams
  - games
  - team_game_stats
  - roster_players
  - ratings
  - predictions
  - backtests
  - optimizer results
```

## What Works In This Scaffold

- Next.js app structure
- Supabase database schema
- Public dashboard pages
- Ratings page
- Games/model-vs-Vegas page
- Backtest summary page
- Optimizer page
- Core prediction formula ported to TypeScript
- Protected update job endpoint
- Backend update job for CFBD teams, games, team stats, On3 roster sources, ratings, predictions, backtests, and optimizer output

## Migration Status

The Apps Script source has been preserved in `legacy/apps-script/`.

The main backend ports are now in:

```text
lib/data/cfbd.ts
lib/data/on3.ts
lib/data/coach-stats.ts
lib/model/ratings.ts
lib/model/predict.ts
lib/model/evaluate.ts
lib/model/optimizer.ts
lib/jobs/run-update.ts
```

The next step is live validation: run the backend job against Supabase and compare output rows to the old spreadsheet for the same season.

## Setup

1. Create/keep a Supabase project.
2. Run `database/schema.sql` in Supabase SQL Editor.
3. Copy `.env.example` to `.env.local`.
4. Fill in:

```text
NEXT_PUBLIC_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_ANON_KEY
SUPABASE_SERVICE_ROLE_KEY
CFBD_API_KEY
CRON_SECRET
```

5. Install dependencies:

```bash
npm install
```

6. Run locally:

```bash
npm run dev
```

7. Open:

```text
http://localhost:3000
```

## Update Job

Protected endpoint:

```text
POST /api/jobs/update
Authorization: Bearer YOUR_CRON_SECRET
```

Local command:

```bash
npm run job:update -- --season=2026
```

The job now fetches CFBD teams, games, and team-game stats, reads On3 roster source URLs from Supabase, calculates ratings, creates predictions, and can write backtest and optimizer output when requested.

## Deploy

Best target:

```text
Vercel
```

Add the same environment variables in Vercel Project Settings.

The repo includes a Vercel Cron Job that calls:

```text
/api/jobs/update
```

## Migration Plan From Current Sheets Version

1. Keep Version 2 running while this app is built.
2. Run `database/schema.sql` again so the new `on3_roster_sources` table exists.
3. Add one row per team/year to `on3_roster_sources`.
4. Run the update job for a historical season.
5. Compare Supabase ratings/backtests/optimizer rows to the old spreadsheet output.
6. Tighten any formula differences found during validation.
7. Stop using Google Sheets once outputs match.

This avoids breaking the working model while moving toward the real standalone app.
