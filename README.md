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
- Job runner skeleton

## What Still Needs To Be Migrated

These are intentionally marked `TODO` in `lib/jobs/run-update.ts`:

```text
fetchTeams()
fetchGames()
fetchTeamGameStats()
fetchRosters()
calculateRatings()
generatePredictions()
runBacktest()
```

That is where the existing Apps Script code gets moved next.

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

At the moment, the job records a job run and returns placeholder statuses. The next implementation step is to move your real fetch/rating/backtest code into that pipeline.

## Deploy

Best target:

```text
Vercel
```

Add the same environment variables in Vercel Project Settings.

Then add a Vercel Cron Job that calls:

```text
/api/jobs/update
```

## Migration Plan From Current Sheets Version

1. Keep Version 2 running while this app is built.
2. Port CFBD fetch into `fetchGames()` and `fetchTeamGameStats()`.
3. Port On3 scraper into `fetchRosters()`.
4. Port `calculateRatingsCore()` into `calculateRatings()`.
5. Port `runBacktest()` into `runBacktest()`.
6. Port optimizer into a backend job.
7. Stop using Google Sheets once outputs match.

This avoids breaking the working model while moving toward the real standalone app.
