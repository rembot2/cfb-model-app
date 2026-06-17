# Apps Script Port

This repo now contains the full pasted Apps Script source under `legacy/apps-script/`.

## Legacy Source Files

- `legacy/apps-script/RatingsRunPass.gs` - ratings model with run/pass splits and raw stats fetching.
- `legacy/apps-script/CoachStats.gs` - coach/team stat helper code.
- `legacy/apps-script/On3TalentOverride.gs` - On3 roster scraper, parser, staging, and talent composite builder.
- `legacy/apps-script/BacktestEngine.gs` - rolling backtest, spread generation, Vegas edge grading, and optimizer.
- `legacy/apps-script/Api.gs` - old Apps Script web API.
- `legacy/apps-script/Index.html` - old Apps Script web UI.
- `legacy/apps-script/SupabaseSync.gs` - old spreadsheet-to-Supabase sync.

## TypeScript Ports Started

- `lib/data/cfbd.ts` - backend CollegeFootballData API client.
- `lib/data/on3.ts` - On3 roster parser, rating scaler, and team composite builder.
- `lib/data/coach-stats.ts` - coach stats cache/ranking helpers.
- `lib/model/predict.ts` - prediction/spread logic already ported from the backtest model.

## Migration Order

1. Preserve original Apps Script files in GitHub.
2. Move pure data/model functions into TypeScript modules.
3. Wire `lib/jobs/run-update.ts` to fetch CFBD/On3 data into Supabase.
4. Port ratings calculation from `RatingsRunPass.gs`.
5. Port rolling backtest and optimizer from `BacktestEngine.gs`.
6. Retire spreadsheet sync once Supabase is produced directly by the backend.

## Notes

The old Apps Script files still depend on Google-specific services such as `SpreadsheetApp`, `UrlFetchApp`, `HtmlService`, `PropertiesService`, and `Logger`. Those cannot run directly in Next.js. Each dependency should be replaced with:

- Supabase table reads/writes for `SpreadsheetApp`
- standard `fetch` for `UrlFetchApp`
- environment variables for `PropertiesService`
- server logs/job run rows for `Logger`
- React/Next.js pages for `HtmlService`

