# CFB Model App Instructions

## Project Goal

This app is a standalone college football model website. It should eventually replace the old Google Sheets / Apps Script workflow with:

- Supabase as the database
- Next.js as the website and backend
- TypeScript model logic for ratings, predictions, backtests, and optimizer runs
- Scheduled backend update jobs for data refreshes

## Current Architecture

- `app/` contains the Next.js pages and API routes.
- `components/` contains shared UI components.
- `database/schema.sql` defines the Supabase tables, indexes, policies, and grants.
- `lib/db/` contains Supabase clients, queries, and database mappers.
- `lib/model/` contains model math, prediction logic, and shared model types.
- `lib/jobs/run-update.ts` is the main backend update pipeline entry point.
- `scripts/run-update.ts` runs the update job from a local/dev command.

## Important Rules

- Do not put real API keys, Supabase service-role keys, or secrets in source files.
- Use `.env.local` locally and Vercel environment variables in production.
- Keep the public Supabase anon key public only when it is the actual anon key.
- Keep the Supabase service-role key server-only.
- Do not expose service-role operations from public client components.
- Keep Google Sheets out of the runtime path unless a migration/export script explicitly needs it.

## Main Commands

Use these commands from the project root:

```bash
npm install
npm run dev
npm run build
npm run lint
```

For the backend update job:

```bash
npm run update
npm run update:backtest
```

## Database

Before running the app against a new Supabase project, run:

```text
database/schema.sql
```

in the Supabase SQL Editor.

Schema changes should be made in `database/schema.sql` first, then mirrored in TypeScript types/mappers if needed.

## Model Notes

The current prediction entry point is `lib/model/predict.ts`.

The intended model inputs are:

- pass advantage
- rush advantage
- overall offense/defense advantage
- composite rating advantage
- home field
- margin shrink
- max margin cap

The update job should eventually:

1. Fetch teams, schedules, spreads, and team stats.
2. Fetch or import roster/talent data.
3. Calculate team ratings.
4. Generate game predictions.
5. Run backtests and Vegas-edge grading.
6. Run optimizer sweeps and save results.

## UX Direction

This is a working model dashboard, not a marketing site. Keep the design:

- dense but readable
- sports analytics focused
- easy to scan
- useful for comparing teams/games quickly

Avoid decorative landing-page sections unless explicitly requested.

