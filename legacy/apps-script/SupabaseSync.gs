// ============================================================
// CFB MODEL -> SUPABASE SYNC
// ============================================================
// Paste this into Apps Script as SupabaseSync.gs.
//
// Required Script Properties:
//   SUPABASE_URL
//   SUPABASE_SERVICE_ROLE_KEY
//
// Run once:
//   setupSupabaseConfig()
//
// Then set values in Apps Script:
//   Project Settings > Script Properties
//
// Main sync:
//   syncModelToSupabase()
// ============================================================

function setupSupabaseConfig() {
  const props = PropertiesService.getScriptProperties();
  const existing = props.getProperties();

  if (!existing.SUPABASE_URL) props.setProperty('SUPABASE_URL', 'https://YOUR_PROJECT_REF.supabase.co');
  if (!existing.SUPABASE_SERVICE_ROLE_KEY) props.setProperty('SUPABASE_SERVICE_ROLE_KEY', 'PASTE_SERVICE_ROLE_KEY_HERE');

  SpreadsheetApp.getUi().alert(
    'Supabase config placeholders added.\n\n' +
    'Open Apps Script > Project Settings > Script Properties and set:\n' +
    'SUPABASE_URL\n' +
    'SUPABASE_SERVICE_ROLE_KEY'
  );
}

function syncModelToSupabase() {
  const startedAt = new Date();
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const counts = {
    ratings_count: 0,
    backtest_games_count: 0,
    summary_count: 0,
    optimizer_count: 0,
    buckets_count: 0,
  };

  let runId = null;
  try {
    Logger.log('Starting Supabase sync...');
    runId = insertSyncRun_('running', 'Sync started', counts, startedAt);

    Logger.log('Syncing ratings...');
    counts.ratings_count = syncRatings_(ss);
    Logger.log('Ratings synced: ' + counts.ratings_count);

    Logger.log('Syncing backtest summary...');
    counts.summary_count = syncBacktestSummary_(ss);
    Logger.log('Summary rows synced: ' + counts.summary_count);

    Logger.log('Syncing optimizer...');
    counts.optimizer_count = syncWeightOptimizer_(ss);
    Logger.log('Optimizer rows synced: ' + counts.optimizer_count);

    Logger.log('Syncing buckets...');
    counts.buckets_count = syncBuckets_(ss);
    Logger.log('Bucket rows synced: ' + counts.buckets_count);

    Logger.log('Syncing backtest games. This is the largest table...');
    counts.backtest_games_count = syncBacktestGames_(ss);
    Logger.log('Backtest games synced: ' + counts.backtest_games_count);

    updateSyncRun_(runId, 'success', 'Sync completed', counts);
    SpreadsheetApp.getUi().alert(
      'Supabase sync complete.\n\n' +
      `Ratings: ${counts.ratings_count}\n` +
      `Backtest games: ${counts.backtest_games_count}\n` +
      `Summary rows: ${counts.summary_count}\n` +
      `Optimizer rows: ${counts.optimizer_count}\n` +
      `Bucket rows: ${counts.buckets_count}`
    );
  } catch (err) {
    if (runId) updateSyncRun_(runId, 'error', err.message || String(err), counts);
    throw err;
  }
}

function testSupabaseConnection() {
  const result = supabaseRequest_('sync_runs?select=id,status,started_at&limit=1', 'GET', undefined, 'return=representation');
  Logger.log('Supabase connection OK: ' + JSON.stringify(result));
  SpreadsheetApp.getUi().alert('Supabase connection OK. Now try syncCoreModelToSupabase().');
}

function syncCoreModelToSupabase() {
  const startedAt = new Date();
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const counts = {
    ratings_count: 0,
    backtest_games_count: 0,
    summary_count: 0,
    optimizer_count: 0,
    buckets_count: 0,
  };

  let runId = null;
  try {
    Logger.log('Starting core Supabase sync. This skips the large Backtest game table.');
    runId = insertSyncRun_('running', 'Core sync started', counts, startedAt);
    counts.ratings_count = syncRatings_(ss);
    Logger.log('Ratings synced: ' + counts.ratings_count);
    counts.summary_count = syncBacktestSummary_(ss);
    Logger.log('Summary rows synced: ' + counts.summary_count);
    counts.optimizer_count = syncWeightOptimizer_(ss);
    Logger.log('Optimizer rows synced: ' + counts.optimizer_count);
    counts.buckets_count = syncBuckets_(ss);
    Logger.log('Bucket rows synced: ' + counts.buckets_count);
    updateSyncRun_(runId, 'success', 'Core sync completed', counts);
    SpreadsheetApp.getUi().alert(
      'Core Supabase sync complete.\n\n' +
      `Ratings: ${counts.ratings_count}\n` +
      `Summary rows: ${counts.summary_count}\n` +
      `Optimizer rows: ${counts.optimizer_count}\n` +
      `Bucket rows: ${counts.buckets_count}\n\n` +
      'Next, run syncBacktestGamesToSupabase() if you want game-by-game rows.'
    );
  } catch (err) {
    if (runId) updateSyncRun_(runId, 'error', err.message || String(err), counts);
    throw err;
  }
}

function syncRatingsToSupabase() {
  const count = syncRatings_(SpreadsheetApp.getActiveSpreadsheet());
  SpreadsheetApp.getUi().alert('Ratings synced: ' + count);
}

function syncBacktestSummaryToSupabase() {
  const count = syncBacktestSummary_(SpreadsheetApp.getActiveSpreadsheet());
  SpreadsheetApp.getUi().alert('Backtest summary synced: ' + count);
}

function syncOptimizerToSupabase() {
  const count = syncWeightOptimizer_(SpreadsheetApp.getActiveSpreadsheet());
  SpreadsheetApp.getUi().alert('Optimizer synced: ' + count);
}

function syncBucketsToSupabase() {
  const count = syncBuckets_(SpreadsheetApp.getActiveSpreadsheet());
  SpreadsheetApp.getUi().alert('Buckets synced: ' + count);
}

function syncBacktestGamesToSupabase() {
  const count = syncBacktestGames_(SpreadsheetApp.getActiveSpreadsheet());
  SpreadsheetApp.getUi().alert('Backtest games synced: ' + count);
}

function syncRatings_(ss) {
  const sheets = ss.getSheets()
    .map(s => s.getName())
    .filter(name => /^Ratings\d{4}$/.test(name) || name === 'Ratings');

  const rows = [];
  for (const sheetName of sheets) {
    const seasonMatch = sheetName.match(/^Ratings(\d{4})$/);
    const season = seasonMatch ? parseInt(seasonMatch[1], 10) : null;
    if (!season) continue;

    const payload = readSheetObjects_(sheetName);
    for (const row of payload.rows) {
      if (!row.team) continue;
      rows.push({
        season,
        team: row.team,
        off_rating: numOrNull_(row.offRating),
        def_rating: numOrNull_(row.defRating),
        composite: numOrNull_(row.composite),
        games: intOrNull_(row.games),
        rush_off_rating: numOrNull_(row.rushOffRating),
        pass_off_rating: numOrNull_(row.passOffRating),
        rush_def_rating: numOrNull_(row.rushDefRating),
        pass_def_rating: numOrNull_(row.passDefRating),
        qb_rating: numOrNull_(row.qbRating),
        rb_rating: numOrNull_(row.rbRating),
        wr_rating: numOrNull_(row.wrRating),
        te_rating: numOrNull_(row.teRating),
        ol_rating: numOrNull_(row.olRating),
        dl_rating: numOrNull_(row.dlRating),
        lb_rating: numOrNull_(row.lbRating),
        cb_rating: numOrNull_(row.cbRating),
        s_rating: numOrNull_(row.sRating),
        k_rating: numOrNull_(row.kRating),
        p_rating: numOrNull_(row.pRating),
        source_sheet: sheetName,
        synced_at: new Date().toISOString(),
      });
    }
  }

  return upsertSupabase_('ratings', rows, 'season,team');
}

function syncBacktestGames_(ss) {
  const payload = readSheetObjects_('Backtest');
  const rows = payload.rows
    .filter(row => row.season && row.week && row.homeTeam && row.awayTeam)
    .map(row => ({
      season: intOrNull_(row.season),
      week: intOrNull_(row.week),
      home_team: row.homeTeam,
      away_team: row.awayTeam,
      vegas_spread: strOrNull_(row.vegasSpread),
      model_spread: strOrNull_(row.modelSpread),
      model_vegas_diff: numOrNull_(row.modelVegasDiff),
      model_vegas_pick: strOrNull_(row.modelVegasPick),
      model_vegas_result: strOrNull_(row.modelVegasResult),
      model_vegas_ats_margin: numOrNull_(row.modelVegasAtsMargin),
      home_pts: intOrNull_(row.homePts),
      away_pts: intOrNull_(row.awayPts),
      home_margin: intOrNull_(row.homeMargin),
      actual_result: strOrNull_(row.actualResult),
      home_composite: numOrNull_(row.homeComposite),
      away_composite: numOrNull_(row.awayComposite),
      home_off: numOrNull_(row.homeOff),
      home_def: numOrNull_(row.homeDef),
      home_rush_off: numOrNull_(row.homeRushOff),
      home_rush_def: numOrNull_(row.homeRushDef),
      home_pass_off: numOrNull_(row.homePassOff),
      home_pass_def: numOrNull_(row.homePassDef),
      away_off: numOrNull_(row.awayOff),
      away_def: numOrNull_(row.awayDef),
      away_rush_off: numOrNull_(row.awayRushOff),
      away_rush_def: numOrNull_(row.awayRushDef),
      away_pass_off: numOrNull_(row.awayPassOff),
      away_pass_def: numOrNull_(row.awayPassDef),
      predicted_favorite: strOrNull_(row.predictedFavorite),
      predicted_margin: numOrNull_(row.predictedMargin),
      model_home_margin: numOrNull_(row.modelHomeMargin),
      actual_winner: strOrNull_(row.actualWinner),
      actual_win_margin: numOrNull_(row.actualWinMargin),
      margin_error: numOrNull_(row.marginError),
      error_bucket: strOrNull_(row.errorBucket),
      pick_result: strOrNull_(row.pickResult),
      home_games_used: intOrNull_(row.homeGamesUsed),
      away_games_used: intOrNull_(row.awayGamesUsed),
      synced_at: new Date().toISOString(),
    }));

  return upsertSupabase_('backtest_games', rows, 'season,week,home_team,away_team');
}

function syncBacktestSummary_(ss) {
  const payload = readSheetObjects_('BacktestSummary');
  const rows = payload.rows
    .filter(row => row.season !== '' && row.week !== '')
    .map(row => ({
      season: String(row.season),
      week: String(row.week),
      games: intOrNull_(row.games),
      picks_correct: intOrNull_(row.picksCorrect),
      picks_wrong: intOrNull_(row.picksWrong),
      pick_pct: numOrNull_(row.pickPct),
      avg_margin_error: numOrNull_(row.avgMarginError),
      median_margin_error: numOrNull_(row.medianMarginError),
      within_3: intOrNull_(row.within3),
      within_3_pct: numOrNull_(row.within3Pct),
      within_7: intOrNull_(row.within7),
      within_7_pct: numOrNull_(row.within7Pct),
      within_10: intOrNull_(row.within10),
      within_10_pct: numOrNull_(row.within10Pct),
      avg_predicted_margin: numOrNull_(row.avgPredictedMargin),
      avg_actual_margin: numOrNull_(row.avgActualMargin),
      vegas_games: intOrNull_(row.vegasGames),
      avg_model_vegas_diff: numOrNull_(row.avgModelVegasDiff),
      avg_abs_model_vegas_diff: numOrNull_(row.avgAbsModelVegasDiff),
      vegas_edge_plays: intOrNull_(row.vegasEdgePlays),
      vegas_edge_wins: intOrNull_(row.vegasEdgeWins),
      vegas_edge_losses: intOrNull_(row.vegasEdgeLosses),
      vegas_edge_pushes: intOrNull_(row.vegasEdgePushes),
      vegas_edge_win_pct: numOrNull_(row.vegasEdgeWinPct),
      synced_at: new Date().toISOString(),
    }));

  return upsertSupabase_('backtest_summary', rows, 'season,week');
}

function syncWeightOptimizer_(ss) {
  const payload = readSheetObjects_('WeightOptimizer');
  const rows = payload.rows
    .filter(row => row.rank !== '')
    .map(row => ({
      rank: intOrNull_(row.rank),
      use_this: strOrNull_(row.useThis),
      pass_weight: numOrNull_(row.passWeight),
      rush_weight: numOrNull_(row.rushWeight),
      overall_weight: numOrNull_(row.overallWeight),
      composite_weight: numOrNull_(row.compositeWeight),
      points_per_rating: numOrNull_(row.pointsPerRating),
      home_field: numOrNull_(row.homeField),
      margin_shrink: numOrNull_(row.marginShrink),
      max_margin: numOrNull_(row.maxMargin),
      train_games: intOrNull_(row.trainGames),
      train_pick_pct: numOrNull_(row.trainPickPct),
      train_avg_error: numOrNull_(row.trainAvgError),
      train_rmse: numOrNull_(row.trainRmse),
      train_corr: numOrNull_(row.trainCorr),
      train_score: numOrNull_(row.trainScore),
      holdout_games: intOrNull_(row.holdoutGames),
      holdout_pick_pct: numOrNull_(row.holdoutPickPct),
      holdout_avg_error: numOrNull_(row.holdoutAvgError),
      holdout_rmse: numOrNull_(row.holdoutRmse),
      holdout_corr: numOrNull_(row.holdoutCorr),
      holdout_within_3_pct: numOrNull_(row.holdoutWithin3Pct),
      holdout_within_7_pct: numOrNull_(row.holdoutWithin7Pct),
      holdout_within_10_pct: numOrNull_(row.holdoutWithin10Pct),
      holdout_avg_pred_margin: numOrNull_(row.holdoutAvgPredMargin),
      holdout_avg_actual_margin: numOrNull_(row.holdoutAvgActualMargin),
      holdout_vegas_games: intOrNull_(row.holdoutVegasGames),
      holdout_avg_model_vegas_diff: numOrNull_(row.holdoutAvgModelVegasDiff),
      holdout_score: numOrNull_(row.holdoutScore),
      all_games: intOrNull_(row.allGames),
      all_pick_pct: numOrNull_(row.allPickPct),
      all_avg_error: numOrNull_(row.allAvgError),
      all_rmse: numOrNull_(row.allRmse),
      all_corr: numOrNull_(row.allCorr),
      all_score: numOrNull_(row.allScore),
      stability_penalty: numOrNull_(row.stabilityPenalty),
      final_score: numOrNull_(row.finalScore),
      synced_at: new Date().toISOString(),
    }));

  return upsertSupabase_('weight_optimizer', rows, 'rank');
}

function syncBuckets_(ss) {
  const rows = [];
  rows.push(...readBucketRows_('SpreadBuckets', 'spread'));
  rows.push(...readBucketRows_('VegasDiffBuckets', 'vegas_diff'));
  return upsertSupabase_('model_buckets', rows, 'bucket_type,bucket');
}

function readBucketRows_(sheetName, bucketType) {
  const payload = readSheetObjects_(sheetName);
  return payload.rows
    .filter(row => row.bucket)
    .map(row => ({
      bucket_type: bucketType,
      bucket: row.bucket,
      games: intOrNull_(row.games),
      picks_correct: intOrNull_(row.picksCorrect),
      picks_wrong: intOrNull_(row.picksWrong),
      pick_pct: numOrNull_(row.pickPct),
      avg_margin_error: numOrNull_(row.avgMarginError),
      median_margin_error: numOrNull_(row.medianMarginError),
      within_3: intOrNull_(row.within3),
      within_3_pct: numOrNull_(row.within3Pct),
      within_7: intOrNull_(row.within7),
      within_7_pct: numOrNull_(row.within7Pct),
      within_10: intOrNull_(row.within10),
      within_10_pct: numOrNull_(row.within10Pct),
      avg_predicted_margin: numOrNull_(row.avgPredictedMargin),
      avg_actual_margin: numOrNull_(row.avgActualMargin),
      synced_at: new Date().toISOString(),
    }));
}

function insertSyncRun_(status, message, counts, startedAt) {
  const rows = [{
    status,
    message,
    ratings_count: counts.ratings_count || 0,
    backtest_games_count: counts.backtest_games_count || 0,
    summary_count: counts.summary_count || 0,
    optimizer_count: counts.optimizer_count || 0,
    buckets_count: counts.buckets_count || 0,
    started_at: startedAt.toISOString(),
  }];
  const result = supabaseRequest_('sync_runs', 'POST', rows, 'return=representation');
  return result && result[0] ? result[0].id : null;
}

function updateSyncRun_(id, status, message, counts) {
  if (!id) return;
  supabaseRequest_(
    'sync_runs?id=eq.' + encodeURIComponent(id),
    'PATCH',
    {
      status,
      message,
      ratings_count: counts.ratings_count || 0,
      backtest_games_count: counts.backtest_games_count || 0,
      summary_count: counts.summary_count || 0,
      optimizer_count: counts.optimizer_count || 0,
      buckets_count: counts.buckets_count || 0,
      finished_at: new Date().toISOString(),
    },
    'return=minimal'
  );
}

function upsertSupabase_(table, rows, onConflict) {
  if (!rows.length) return 0;
  const chunkSize = table === 'backtest_games' ? 100 : 250;
  let synced = 0;
  Logger.log(`Upserting ${rows.length} rows into ${table} in chunks of ${chunkSize}...`);
  for (let i = 0; i < rows.length; i += chunkSize) {
    const chunk = rows.slice(i, i + chunkSize);
    supabaseRequest_(table + '?on_conflict=' + encodeURIComponent(onConflict), 'POST', chunk, 'resolution=merge-duplicates,return=minimal');
    synced += chunk.length;
    Logger.log(`${table}: synced ${synced}/${rows.length}`);
  }
  return synced;
}

function supabaseRequest_(path, method, body, prefer) {
  const props = PropertiesService.getScriptProperties();
  const baseUrl = normalizeSupabaseUrl_(props.getProperty('SUPABASE_URL'));
  const key = props.getProperty('SUPABASE_SERVICE_ROLE_KEY');
  if (!baseUrl || !key || key === 'PASTE_SERVICE_ROLE_KEY_HERE') {
    throw new Error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in Script Properties.');
  }

  const url = baseUrl + '/rest/v1/' + path;
  const options = {
    method,
    muteHttpExceptions: true,
    contentType: 'application/json',
    headers: {
      apikey: key,
      Authorization: 'Bearer ' + key,
      Prefer: prefer || 'return=minimal',
    },
    payload: body === undefined ? undefined : JSON.stringify(body),
    escaping: false,
  };

  const resp = UrlFetchApp.fetch(url, options);
  const code = resp.getResponseCode();
  const text = resp.getContentText();
  if (code < 200 || code >= 300) {
    throw new Error('Supabase ' + method + ' ' + path + ' failed: ' + code + ' | ' + text);
  }

  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch (err) {
    return text;
  }
}

function normalizeSupabaseUrl_(rawUrl) {
  let url = String(rawUrl || '').trim();
  if (!url) return '';

  url = url.replace(/\/+$/, '');
  url = url.replace(/\/rest\/v1.*$/i, '');
  url = url.replace(/\/project\/[^/]+.*$/i, '');

  const match = url.match(/^https:\/\/([a-z0-9-]+)\.supabase\.co/i);
  if (!match) {
    throw new Error(
      'SUPABASE_URL must be the bare Project URL, like https://YOUR_PROJECT_REF.supabase.co. ' +
      'Do not use the dashboard URL or a URL ending in /rest/v1.'
    );
  }

  return 'https://' + match[1] + '.supabase.co';
}

function readSheetObjects_(sheetName) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(sheetName);
  if (!sheet) return { sheetName, headers: [], rows: [] };

  const values = sheet.getDataRange().getValues();
  if (!values.length) return { sheetName, headers: [], rows: [] };

  const headers = values[0].map(h => String(h || '').trim());
  const keys = headers.map(normalizeSyncHeaderKey_);
  const rows = values.slice(1)
    .filter(row => row.some(v => v !== '' && v !== null))
    .map(row => {
      const out = {};
      for (let i = 0; i < keys.length; i++) {
        if (!keys[i]) continue;
        out[keys[i]] = row[i] instanceof Date ? row[i].toISOString() : row[i];
      }
      return out;
    });

  return { sheetName, headers, rows };
}

function normalizeSyncHeaderKey_(header) {
  const clean = String(header || '')
    .replace(/%/g, ' pct ')
    .replace(/\+/g, ' plus ')
    .replace(/-/g, ' ')
    .replace(/\?/g, '')
    .replace(/_/g, ' ')
    .replace(/[^A-Za-z0-9 ]/g, ' ')
    .trim()
    .toLowerCase();
  if (!clean) return '';
  const parts = clean.split(/\s+/);
  return parts[0] + parts.slice(1).map(part => part.charAt(0).toUpperCase() + part.slice(1)).join('');
}

function numOrNull_(value) {
  const n = Number(value);
  return isNaN(n) || value === '' || value === null ? null : n;
}

function intOrNull_(value) {
  const n = parseInt(value, 10);
  return isNaN(n) || value === '' || value === null ? null : n;
}

function strOrNull_(value) {
  return value === '' || value === null || value === undefined ? null : String(value);
}
