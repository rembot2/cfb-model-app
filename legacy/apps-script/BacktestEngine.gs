// ============================================================
// CFB RATINGS MODEL — ROLLING BACKTEST VALIDATION ENGINE
// ============================================================
// HOW IT WORKS:
//   For each week W in a season:
//     1. Build ratings using ONLY games from weeks 1..W-1
//     2. Predict each week W game using those ratings
//     3. Create a readable model spread, e.g. "Indiana -14.5"
//     4. Compare predicted margin vs actual margin and winner
//
// SHEETS CREATED:
//   Backtest        — one row per predicted game (detailed)
//   BacktestSummary — accuracy by week, season, and overall
//
// SCOPE: Power 4 conferences + Notre Dame only
//
// RATING SCALE: Same as main model (best ~95, worst ~60, avg ~75)
//
// HOW TO RUN:
//   Run runBacktest() from Apps Script editor.
// ============================================================

const BACKTEST_SEASONS = [2022, 2023, 2024, 2025];
const MIN_WEEKS_BEFORE_PREDICT = 1;
const BACKTEST_HFA = 2.5;

// Spread calibration: how many rating points = 1 point on the scoreboard.
// On the 60–95 scale, a 5-point rating gap ≈ 7 pts on field is reasonable.
// Tune this after seeing results — lower = tighter spreads, higher = wider.
const POINTS_PER_RATING = 1.4;

// Default matchup weights used by runBacktest().
// Optimizer tests alternate combinations and writes the best results.
const DEFAULT_PASS_ADV_WEIGHT = 0.30;
const DEFAULT_RUSH_ADV_WEIGHT = 0.20;
const DEFAULT_OVERALL_ADV_WEIGHT = 0.25;
const DEFAULT_COMPOSITE_ADV_WEIGHT = 0.25;
const WEIGHT_OPTIMIZER_STEP = 0.10;
const OPTIMIZER_MIN_PASS_WEIGHT = 0.20;
const OPTIMIZER_MIN_RUSH_WEIGHT = 0.20;
const OPTIMIZER_MIN_OVERALL_WEIGHT = 0.10;
const OPTIMIZER_MIN_MATCHUP_WEIGHT = 0.45;
const OPTIMIZER_MAX_OVERALL_WEIGHT = 0.40;
const OPTIMIZER_MAX_COMPOSITE_WEIGHT = 0.40;
const OPTIMIZER_TARGET_MATCHUP_WEIGHT = 0.55;
const OPTIMIZER_FOOTBALL_PRIOR_PENALTY = 1.25;
const OPTIMIZER_TRAIN_SCORE_WEIGHT = 0.30;
const OPTIMIZER_HOLDOUT_SCORE_WEIGHT = 0.50;
const OPTIMIZER_ALL_SCORE_WEIGHT = 0.20;
const OPTIMIZER_STABILITY_PENALTY_WEIGHT = 0.50;
const OPTIMIZER_POINTS_PER_RATING_OPTIONS = [1.1, 1.3, 1.5];
const OPTIMIZER_HFA_OPTIONS = [2.0, 2.5, 3.0];
const OPTIMIZER_MARGIN_SHRINK_OPTIONS = [0.65, 0.75, 0.85, 0.95];
const OPTIMIZER_MAX_MARGIN_OPTIONS = [21.5, 24.5, 28.5];
const BACKTEST_RATING_BASE = 75;
const BACKTEST_RATING_SCALE = 3.0;
const BACKTEST_RATING_MIN = 55;
const BACKTEST_RATING_MAX = 98;
const PRIOR_TALENT_SHARE = 0.65;
const PRIOR_PREVIOUS_SEASON_SHARE = 0.35;
const DEFAULT_MARGIN_SHRINK = 0.75;
const DEFAULT_MAX_MODEL_MARGIN = 24.5;
const SIMILAR_TEAM_COMPOSITE_THRESHOLD = 3.0;
const SIMILAR_TEAM_DAMPENER = 0.85;
const RECENT_FORM_WEIGHT = 0.15;

// Power 4 conferences (CFBD names) + Notre Dame
const P4_CONFERENCES = new Set([
  'SEC', 'Big Ten', 'Big 12', 'ACC'
]);
const EXTRA_TEAMS = new Set(['Notre Dame']);

// ── ENTRY POINT ──────────────────────────────────────────────
function runBacktest() {
  const ss     = SpreadsheetApp.getActiveSpreadsheet();
  const config = getConfig();

  // Always wipe and recreate sheets so headers/widths are fresh
  ['Backtest','BacktestSummary','SpreadBuckets','VegasDiffBuckets'].forEach(name => {
    const existing = ss.getSheetByName(name);
    if (existing) ss.deleteSheet(existing);
  });
  setupBacktestSheets(ss);

  const btSheet  = ss.getSheetByName('Backtest');
  const sumSheet = ss.getSheetByName('BacktestSummary');

  const allGameRows = [];
  const summaryRows = [];

  for (const season of BACKTEST_SEASONS) {
    Logger.log(`\n===== BACKTESTING ${season} =====`);
    const result = backtestSeason(season, config, ss);
    allGameRows.push(...result.games);
    summaryRows.push(...result.summary);
  }

  // Write game rows in batches to avoid timeout
  if (allGameRows.length > 0) {
    const CHUNK = 200;
    for (let i = 0; i < allGameRows.length; i += CHUNK) {
      const chunk = allGameRows.slice(i, i + CHUNK);
      btSheet.getRange(2 + i, 1, chunk.length, chunk[0].length).setValues(chunk);
    }
  }

  if (summaryRows.length > 0) {
    sumSheet.getRange(2, 1, summaryRows.length, summaryRows[0].length).setValues(summaryRows);
  }

  appendOverallSummary(sumSheet, summaryRows);
  colorCodeBacktestSheet(btSheet, allGameRows);
  colorCodeSummarySheet(sumSheet);
  writeBacktestBucketSheets(ss, allGameRows);
  formatBacktestSheet(btSheet);

  SpreadsheetApp.getUi().alert(
    `Backtest complete!\n\n` +
    `${allGameRows.length} P4+ND games predicted across ${BACKTEST_SEASONS.join(', ')}.\n\n` +
    `→ Backtest sheet: game-by-game results\n` +
    `→ BacktestSummary: accuracy by week & season\n` +
    `→ SpreadBuckets / VegasDiffBuckets: where the model is strong or weak`
  );
}

function runWeightOptimizer() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const config = getConfig();

  const existing = ss.getSheetByName('WeightOptimizer');
  if (existing) ss.deleteSheet(existing);
  setupWeightOptimizerSheet(ss);
  const optSheet = ss.getSheetByName('WeightOptimizer');

  const games = buildOptimizerGameDataset(config, ss);
  if (!games.length) {
    SpreadsheetApp.getUi().alert('No optimizer games found. Run/fix RawStats and roster talent first.');
    return;
  }

  const validationSeason = getOptimizerValidationSeason(games);
  const trainGames = games.filter(g => Number(g.season) < validationSeason);
  const validationGames = games.filter(g => Number(g.season) === validationSeason);
  Logger.log('Optimizer games by season: ' + JSON.stringify(countGamesBySeason(games)));

  if (!trainGames.length || !validationGames.length) {
    SpreadsheetApp.getUi().alert(
      `Not enough games for train/validation optimization.\n\n` +
      `Validation season: ${validationSeason}\n` +
      `Train games: ${trainGames.length}\n` +
      `Validation games: ${validationGames.length}`
    );
    return;
  }

  const rows = [];
  const step = WEIGHT_OPTIMIZER_STEP;
  const units = Math.round(1 / step);
  const estimatedCombos = countOptimizerCombinations();
  let testedCombos = 0;

  Logger.log(
    `Optimizer testing about ${estimatedCombos} combinations ` +
    `(${trainGames.length} train games, ${validationGames.length} holdout games).`
  );

  for (let p = 0; p <= units; p++) {
    for (let r = 0; r <= units - p; r++) {
      for (let o = 0; o <= units - p - r; o++) {
        const c = units - p - r - o;
        const weights = {
          pass: p * step,
          rush: r * step,
          overall: o * step,
          composite: c * step,
        };

        if (!isAllowedOptimizerWeightSet(weights)) continue;

        for (const pointsPerRating of OPTIMIZER_POINTS_PER_RATING_OPTIONS) {
          for (const homeField of OPTIMIZER_HFA_OPTIONS) {
            for (const marginShrink of OPTIMIZER_MARGIN_SHRINK_OPTIONS) {
              for (const maxMargin of OPTIMIZER_MAX_MARGIN_OPTIONS) {
                const calibration = { pointsPerRating, homeField, marginShrink, maxMargin };
                const train = evaluateWeightCombination(trainGames, weights, calibration);
                const validation = evaluateWeightCombination(validationGames, weights, calibration);
                const all = evaluateWeightCombination(games, weights, calibration);
                const trainScore = addFootballPriorPenalty(train.modelScore, weights);
                const validationScore = addFootballPriorPenalty(validation.modelScore, weights);
                const allScore = addFootballPriorPenalty(all.modelScore, weights);
                const stabilityPenalty = calculateOptimizerStabilityPenalty(trainScore, validationScore);
                const finalScore = calculateFinalOptimizerScore(trainScore, validationScore, allScore, stabilityPenalty);
                testedCombos++;
                if (testedCombos % 500 === 0) {
                  Logger.log(`Optimizer progress: ${testedCombos}/${estimatedCombos} combinations tested.`);
                }
                rows.push([
                  '',
                  '',
                  weights.pass,
                  weights.rush,
                  weights.overall,
                  weights.composite,
                  pointsPerRating,
                  homeField,
                  marginShrink,
                  maxMargin,
                  train.games,
                  train.pickPct,
                  train.avgMarginError,
                  train.rmse,
                  train.correlation,
                  trainScore,
                  validation.games,
                  validation.pickPct,
                  validation.avgMarginError,
                  validation.rmse,
                  validation.correlation,
                  validation.within3Pct,
                  validation.within7Pct,
                  validation.within10Pct,
                  validation.avgPredictedMargin,
                  validation.avgActualMargin,
                  validation.vegasGames,
                  validation.avgVegasDiff,
                  validationScore,
                  all.games,
                  all.pickPct,
                  all.avgMarginError,
                  all.rmse,
                  all.correlation,
                  allScore,
                  stabilityPenalty,
                  finalScore,
                ]);
              }
            }
          }
        }
      }
    }
  }

  if (!rows.length) {
    SpreadsheetApp.getUi().alert('No optimizer combinations were allowed. Check optimizer min/max weight settings.');
    return;
  }

  rows.sort((a, b) =>
    a[36] - b[36] ||    // lowest final score
    a[28] - b[28] ||    // lowest holdout blended score
    a[34] - b[34] ||    // lowest all-seasons score
    a[35] - b[35] ||    // lowest train/holdout stability penalty
    a[18] - b[18] ||    // lowest holdout avg margin error
    a[19] - b[19] ||    // lowest holdout RMSE
    b[17] - a[17] ||    // highest holdout pick %
    b[20] - a[20] ||    // highest holdout correlation
    b[21] - a[21]       // highest within 3 %
  );

  for (let i = 0; i < rows.length; i++) {
    rows[i][0] = i + 1;
    rows[i][1] = i === 0 ? 'BEST' : '';
  }

  optSheet.getRange(2, 1, rows.length, rows[0].length).setValues(rows);
  colorCodeWeightOptimizerSheet(optSheet);

  SpreadsheetApp.getUi().alert(
    `Weight optimization complete!\n\n` +
    `${rows.length} combinations tested.\n` +
    `Training games: ${trainGames.length}\n` +
    `Holdout ${validationSeason} games: ${validationGames.length}\n\n` +
    `Best weights:\n` +
    `Use row 2 in WeightOptimizer — marked BEST.\n\n` +
    `Pass: ${rows[0][2]}\n` +
    `Rush: ${rows[0][3]}\n` +
    `Overall: ${rows[0][4]}\n` +
    `Composite: ${rows[0][5]}\n\n` +
    `Points/rating: ${rows[0][6]}\n` +
    `Home field: ${rows[0][7]}\n` +
    `Margin shrink: ${rows[0][8]}\n` +
    `Max margin: ${rows[0][9]}\n\n` +
    `Final score: ${rows[0][36]}\n` +
    `Train score: ${rows[0][15]}\n` +
    `Holdout score: ${rows[0][28]}\n` +
    `All-seasons score: ${rows[0][34]}\n` +
    `Stability penalty: ${rows[0][35]}\n` +
    `Holdout avg margin error: ${rows[0][18]}\n` +
    `Holdout RMSE: ${rows[0][19]}\n` +
    `Holdout pick accuracy: ${rows[0][17]}%`
  );
}

function countOptimizerCombinations() {
  const step = WEIGHT_OPTIMIZER_STEP;
  const units = Math.round(1 / step);
  let weightSets = 0;

  for (let p = 0; p <= units; p++) {
    for (let r = 0; r <= units - p; r++) {
      for (let o = 0; o <= units - p - r; o++) {
        const c = units - p - r - o;
        const weights = {
          pass: p * step,
          rush: r * step,
          overall: o * step,
          composite: c * step,
        };
        if (isAllowedOptimizerWeightSet(weights)) weightSets++;
      }
    }
  }

  return weightSets *
    OPTIMIZER_POINTS_PER_RATING_OPTIONS.length *
    OPTIMIZER_HFA_OPTIONS.length *
    OPTIMIZER_MARGIN_SHRINK_OPTIONS.length *
    OPTIMIZER_MAX_MARGIN_OPTIONS.length;
}

function buildOptimizerGameDataset(config, ss) {
  const rawSheet = ss.getSheetByName('RawStats');
  const data     = rawSheet.getDataRange().getValues();
  const headers  = data[0];
  const col      = name => headers.indexOf(name);
  const out = [];

  for (const season of BACKTEST_SEASONS) {
    Logger.log(`Building optimizer dataset for ${season}...`);
    const p4Teams = fetchP4Teams(season, config.API_KEY);
    const fbsTeams = fetchFbsTeams(season, config.API_KEY);
    const ratingRows = data.slice(1).filter(r => {
      const s    = parseInt(r[col('season')], 10);
      const team = String(r[col('team')] || '').trim();
      return s === season && (!fbsTeams.size || fbsTeams.has(team));
    });

    if (!ratingRows.length) continue;

    const talentZ = loadOn3TalentZ(ss, season, null);
    const priorZ = buildPreviousSeasonPriorZ(data.slice(1), headers, season, fbsTeams);
    const coachMap = loadCoachMap(ss, config);
    const linesMap = fetchLinesForSeason(season, config.API_KEY);
    const scheduleMap = fetchScheduleForSeason(season, config.API_KEY, p4Teams);
    const unfilteredScheduleMap = Object.keys(scheduleMap).length
      ? scheduleMap
      : fetchScheduleForSeason(season, config.API_KEY, null);

    const weeksSet = new Set(ratingRows.map(r => parseInt(r[col('week')], 10)));
    weeksSet.delete(99);
    const weeks = [...weeksSet].sort((a, b) => a - b);

    for (let wIdx = 0; wIdx < weeks.length; wIdx++) {
      const predictWeek = weeks[wIdx];
      if (wIdx < MIN_WEEKS_BEFORE_PREDICT) continue;

      const priorRows = ratingRows.filter(r => parseInt(r[col('week')], 10) < predictWeek);
      const ratings = buildRollingRatings(priorRows, headers, coachMap, config, season, talentZ, predictWeek, priorZ);
      if (Object.keys(ratings).length === 0) continue;

      const weekGames = Object.values(unfilteredScheduleMap).filter(g => Number(g.week) === Number(predictWeek));
      for (const game of weekGames) {
        const { homeTeam, awayTeam, homePts, awayPts } = game;
        if (homePts === null || awayPts === null) continue;
        if (!ratings[homeTeam] || !ratings[awayTeam]) continue;
        if (Object.keys(scheduleMap).length === 0 && p4Teams.size > 1 &&
            (!p4Teams.has(homeTeam) || !p4Teams.has(awayTeam))) continue;

        const hR = ratings[homeTeam];
        const aR = ratings[awayTeam];
        const adv = calculateMatchupAdvantages(hR, aR);
        const lineKey = makeLineKey(homeTeam, awayTeam, season, predictWeek);
        const vegasLine = linesMap[lineKey];

        out.push({
          season,
          week: predictWeek,
          homeTeam,
          awayTeam,
          actualMargin: homePts - awayPts,
          actualWinner: homePts > awayPts ? homeTeam : awayPts > homePts ? awayTeam : 'TIE',
          actualWinMargin: Math.abs(homePts - awayPts),
          vegasLine: vegasLine !== undefined ? vegasLine : null,
          ...adv,
        });
      }
    }
  }

  return out;
}

function isAllowedOptimizerWeightSet(weights) {
  return weights.pass >= OPTIMIZER_MIN_PASS_WEIGHT &&
         weights.rush >= OPTIMIZER_MIN_RUSH_WEIGHT &&
         (weights.pass + weights.rush) >= OPTIMIZER_MIN_MATCHUP_WEIGHT &&
         weights.overall >= OPTIMIZER_MIN_OVERALL_WEIGHT &&
         weights.overall <= OPTIMIZER_MAX_OVERALL_WEIGHT &&
         weights.composite <= OPTIMIZER_MAX_COMPOSITE_WEIGHT;
}

function addFootballPriorPenalty(score, weights) {
  const matchupWeight = weights.pass + weights.rush;
  const shortfall = Math.max(0, OPTIMIZER_TARGET_MATCHUP_WEIGHT - matchupWeight);
  return round2(score + (shortfall * OPTIMIZER_FOOTBALL_PRIOR_PENALTY));
}

function calculateOptimizerStabilityPenalty(trainScore, validationScore) {
  return round2(Math.abs(trainScore - validationScore) * OPTIMIZER_STABILITY_PENALTY_WEIGHT);
}

function calculateFinalOptimizerScore(trainScore, validationScore, allScore, stabilityPenalty) {
  return round2(
    (trainScore * OPTIMIZER_TRAIN_SCORE_WEIGHT) +
    (validationScore * OPTIMIZER_HOLDOUT_SCORE_WEIGHT) +
    (allScore * OPTIMIZER_ALL_SCORE_WEIGHT) +
    stabilityPenalty
  );
}

function evaluateWeightCombination(games, weights, calibration) {
  let pickCorrect = 0;
  let within3 = 0, within7 = 0, within10 = 0;
  let predMarginSum = 0, actualMarginSum = 0;
  const errors = [];
  const squaredErrors = [];
  const predictedHomeMargins = [];
  const actualHomeMargins = [];
  const vegasDiffs = [];
  const absVegasDiffs = [];

  for (const g of games) {
    const weightedRatingGap =
      g.passAdv      * weights.pass +
      g.rushAdv      * weights.rush +
      g.overallAdv   * weights.overall +
      g.compositeAdv * weights.composite;

    const pointsPerRating = calibration && calibration.pointsPerRating !== undefined
      ? calibration.pointsPerRating
      : POINTS_PER_RATING;
    const homeField = calibration && calibration.homeField !== undefined
      ? calibration.homeField
      : BACKTEST_HFA;
    const marginShrink = calibration && calibration.marginShrink !== undefined
      ? calibration.marginShrink
      : DEFAULT_MARGIN_SHRINK;
    const maxMargin = calibration && calibration.maxMargin !== undefined
      ? calibration.maxMargin
      : DEFAULT_MAX_MODEL_MARGIN;
    const rawHomeMargin = weightedRatingGap * pointsPerRating + homeField;
    const modelHomeMargin = calibrateModelMargin(rawHomeMargin, g.compositeAdv, marginShrink, maxMargin);
    const predictedWinner = modelHomeMargin > 0 ? g.homeTeam : g.awayTeam;
    const marginError = Math.abs(modelHomeMargin - g.actualMargin);
    const predictedMargin = Math.abs(modelHomeMargin);

    if (predictedWinner === g.actualWinner) pickCorrect++;
    if (marginError <= 3) within3++;
    if (marginError <= 7) within7++;
    if (marginError <= 10) within10++;

    errors.push(marginError);
    squaredErrors.push(Math.pow(modelHomeMargin - g.actualMargin, 2));
    predictedHomeMargins.push(modelHomeMargin);
    actualHomeMargins.push(g.actualMargin);
    predMarginSum += predictedMargin;
    actualMarginSum += g.actualWinMargin;

    if (g.vegasLine !== null && g.vegasLine !== undefined) {
      const modelSpreadLine = -modelHomeMargin;
      const diff = Math.abs(modelSpreadLine - g.vegasLine);
      vegasDiffs.push(diff);
      absVegasDiffs.push(diff);
    }
  }

  const n = games.length;
  const avgMarginError = round2(mean(errors));
  const rmse = round2(Math.sqrt(mean(squaredErrors)));
  const pickPct = round2(pickCorrect / n * 100);
  const avgVegasDiff = vegasDiffs.length ? round2(mean(vegasDiffs)) : '';
  const modelScore = round2(
    avgMarginError +
    (0.35 * rmse) -
    (0.05 * pickPct) +
    (avgVegasDiff === '' ? 0 : 0.10 * avgVegasDiff)
  );

  return {
    games: n,
    pickCorrect,
    pickPct,
    avgMarginError,
    medianMarginError: round2(median(errors)),
    rmse,
    correlation: round2(correlation(predictedHomeMargins, actualHomeMargins)),
    within3,
    within3Pct: round2(within3 / n * 100),
    within7,
    within7Pct: round2(within7 / n * 100),
    within10,
    within10Pct: round2(within10 / n * 100),
    avgPredictedMargin: round2(predMarginSum / n),
    avgActualMargin: round2(actualMarginSum / n),
    vegasGames: vegasDiffs.length,
    avgVegasDiff,
    avgAbsVegasDiff: absVegasDiffs.length ? round2(mean(absVegasDiffs)) : '',
    modelScore,
  };
}


// ── P4 TEAM FILTER ────────────────────────────────────────────
// Returns a Set of P4+ND team names for a given season from CFBD
function fetchP4Teams(season, apiKey) {
  const p4Teams = new Set(EXTRA_TEAMS); // seed with Notre Dame

  for (const conf of P4_CONFERENCES) {
    const url = `https://api.collegefootballdata.com/teams?conference=${encodeURIComponent(conf)}&year=${season}`;
    const resp = fetchWithAuth(url, apiKey);
    if (!resp) continue;
    try {
      const teams = JSON.parse(resp);
      for (const t of teams) {
        if (t.school) p4Teams.add(t.school);
      }
    } catch(e) {
      Logger.log(`P4 teams parse error (${conf}): ${e.message}`);
    }
  }

  Logger.log(`P4+ND teams for ${season}: ${p4Teams.size}`);
  return p4Teams;
}

function fetchFbsTeams(season, apiKey) {
  const url = `https://api.collegefootballdata.com/teams/fbs?year=${season}`;
  const resp = fetchWithAuth(url, apiKey);
  if (!resp) return new Set();

  try {
    return new Set(JSON.parse(resp).map(t => t.school).filter(Boolean));
  } catch (e) {
    Logger.log(`FBS teams parse error (${season}): ${e.message}`);
    return new Set();
  }
}

function buildPreviousSeasonPriorZ(allRows, headers, season, fbsTeams) {
  const col = name => headers.indexOf(name);
  const prevSeason = Number(season) - 1;
  const byTeam = {};

  for (const row of allRows) {
    const s = parseInt(row[col('season')], 10);
    if (s !== prevSeason) continue;

    const team = String(row[col('team')] || '').trim();
    if (!team || (fbsTeams && fbsTeams.size && !fbsTeams.has(team))) continue;

    const ppaOff = parseFloat(row[col('ppa_off')]);
    const ppaDef = parseFloat(row[col('ppa_def')]);
    const sucOff = parseFloat(row[col('success_off')]);
    const sucDef = parseFloat(row[col('success_def')]);
    const ppdOff = parseFloat(row[col('pts_per_drive_off')]);
    const ppdDef = parseFloat(row[col('pts_per_drive_def')]);
    if (isNaN(ppaOff) || isNaN(ppaDef)) continue;

    if (!byTeam[team]) byTeam[team] = {
      off: [], def: [],
    };
    byTeam[team].off.push(mean([ppaOff, sucOff, ppdOff]));
    byTeam[team].def.push(mean([ppaDef, sucDef, ppdDef]));
  }

  const teams = Object.keys(byTeam);
  if (!teams.length) return {};

  const raw = {};
  for (const team of teams) {
    raw[team] = {
      offRaw: mean(byTeam[team].off),
      defRaw: mean(byTeam[team].def),
    };
  }

  const offVals = teams.map(t => raw[t].offRaw);
  const defVals = teams.map(t => raw[t].defRaw);
  const offM = mean(offVals), offS = stdDev(offVals) || 1;
  const defM = mean(defVals), defS = stdDev(defVals) || 1;

  const out = {};
  for (const team of teams) {
    const offZ = (raw[team].offRaw - offM) / offS;
    const defZ = -((raw[team].defRaw - defM) / defS);
    out[team] = {
      off: offZ,
      def: defZ,
      composite: (offZ + defZ) / 2,
    };
  }
  return out;
}


// ── PER-SEASON BACKTEST ───────────────────────────────────────
function backtestSeason(season, config, ss) {
  const rawSheet = ss.getSheetByName('RawStats');
  const data     = rawSheet.getDataRange().getValues();
  const headers  = data[0];
  const col      = name => headers.indexOf(name);

  const p4Teams = fetchP4Teams(season, config.API_KEY);
  const fbsTeams = fetchFbsTeams(season, config.API_KEY);

  // Build ratings from all FBS teams so strength of schedule is not distorted.
  const ratingRows = data.slice(1).filter(r => {
    const s    = parseInt(r[col('season')], 10);
    const team = String(r[col('team')] || '').trim();
    return s === season && (!fbsTeams.size || fbsTeams.has(team));
  });

  if (ratingRows.length === 0) {
    Logger.log(`No FBS RawStats rows for ${season}. Skipping.`);
    return { games: [], summary: [] };
  }

  const talentZ    = loadOn3TalentZ(ss, season, null);
  const priorZ     = buildPreviousSeasonPriorZ(data.slice(1), headers, season, fbsTeams);
  const coachMap   = loadCoachMap(ss, config);
  const linesMap   = fetchLinesForSeason(season, config.API_KEY);
  const scheduleMap = fetchScheduleForSeason(season, config.API_KEY, p4Teams);
  const unfilteredScheduleMap = Object.keys(scheduleMap).length
    ? scheduleMap
    : fetchScheduleForSeason(season, config.API_KEY, null);
  const backtestWeights = getBacktestWeights(config);
  const backtestCalibration = getBacktestCalibration(config);

  Logger.log(
    `${season}: ${ratingRows.length} FBS rating rows, ` +
    `${Object.keys(scheduleMap).length} P4+ND games, ` +
    `${Object.keys(unfilteredScheduleMap).length} fallback FBS games, ` +
    `${Object.keys(linesMap).length} Vegas lines`
  );

  const weeksSet = new Set(ratingRows.map(r => parseInt(r[col('week')], 10)));
  weeksSet.delete(99);
  const weeks = [...weeksSet].sort((a, b) => a - b);

  const gameRows    = [];
  const summaryRows = [];

  for (let wIdx = 0; wIdx < weeks.length; wIdx++) {
    const predictWeek = weeks[wIdx];

    if (wIdx < MIN_WEEKS_BEFORE_PREDICT) continue;

    const priorRows = ratingRows.filter(r =>
      parseInt(r[col('week')], 10) < predictWeek
    );

    const ratings = buildRollingRatings(
      priorRows, headers, coachMap, config, season, talentZ, predictWeek, priorZ
    );

    if (Object.keys(ratings).length === 0) continue;

    const weekGames = Object.values(unfilteredScheduleMap).filter(g =>
      Number(g.week) === Number(predictWeek)
    );

    let weekPredictions = 0, weekPickCorrect = 0;
    const weekMarginErrors = [];
    let weekWithin3 = 0, weekWithin7 = 0, weekWithin10 = 0;
    let weekPredMarginSum = 0, weekActualMarginSum = 0;
    const weekVegasDiffs = [];
    const weekAbsVegasDiffs = [];
    let weekVegasEdgePlays = 0;
    let weekVegasEdgeWins = 0;
    let weekVegasEdgeLosses = 0;
    let weekVegasEdgePushes = 0;
    let skippedNoScore = 0;
    let skippedMissingRatings = 0;
    let skippedNonP4Fallback = 0;

    for (const game of weekGames) {
      const { homeTeam, awayTeam, homePts, awayPts } = game;

      if (homePts === null || awayPts === null) {
        skippedNoScore++;
        continue;
      }
      if (!ratings[homeTeam] || !ratings[awayTeam]) {
        skippedMissingRatings++;
        continue;
      }
      if (Object.keys(scheduleMap).length === 0 && p4Teams.size > 1 &&
          (!p4Teams.has(homeTeam) || !p4Teams.has(awayTeam))) {
        skippedNonP4Fallback++;
        continue;
      }

      const hR = ratings[homeTeam];
      const aR = ratings[awayTeam];

      const prediction = predictGameFromRatings(hR, aR, homeTeam, awayTeam, backtestWeights, backtestCalibration);
      const modelHomeMargin = prediction.modelHomeMargin;
      const predictedMargin = Math.abs(modelHomeMargin);

      const predictedWinner = prediction.predictedWinner;
      const predictedFavorite = prediction.predictedFavorite;
      const modelSpread = prediction.modelSpread;
      const modelSpreadLine = prediction.modelSpreadLine;
      const lineKey = makeLineKey(homeTeam, awayTeam, season, predictWeek);
      const vegasLine = linesMap[lineKey];
      const vegasSpread = vegasLine !== undefined
        ? formatVegasSpread(homeTeam, awayTeam, vegasLine)
        : '';
      const modelVegasDiff = vegasLine !== undefined
        ? round2(Math.abs(modelSpreadLine - vegasLine))
        : '';
      const actualMargin    = homePts - awayPts;
      const vegasEdge = vegasLine !== undefined
        ? gradeModelVsVegas(homeTeam, awayTeam, vegasLine, modelSpreadLine, actualMargin)
        : { pick: '', result: '', atsMargin: '' };
      const actualWinner    = actualMargin > 0 ? homeTeam
                            : actualMargin < 0 ? awayTeam
                            : 'TIE';
      const actualWinMargin = Math.abs(actualMargin);
      const actualResult = actualWinner === 'TIE'
        ? 'TIE'
        : `${actualWinner} by ${actualWinMargin}`;

      const pickCorrect = predictedWinner === actualWinner;
      const marginError = round2(Math.abs(modelHomeMargin - actualMargin));
      const errorBucket = marginError <= 3 ? 'Within 3'
                        : marginError <= 7 ? 'Within 7'
                        : marginError <= 10 ? 'Within 10'
                        : 'Missed by 10+';

      weekPredictions++;
      if (pickCorrect) weekPickCorrect++;
      weekMarginErrors.push(marginError);
      if (marginError <= 3) weekWithin3++;
      if (marginError <= 7) weekWithin7++;
      if (marginError <= 10) weekWithin10++;
      weekPredMarginSum += predictedMargin;
      weekActualMarginSum += actualWinMargin;
      if (modelVegasDiff !== '') {
        weekVegasDiffs.push(modelVegasDiff);
        weekAbsVegasDiffs.push(modelVegasDiff);
      }
      if (vegasEdge.result) {
        weekVegasEdgePlays++;
        if (vegasEdge.result === 'WIN') weekVegasEdgeWins++;
        else if (vegasEdge.result === 'LOSS') weekVegasEdgeLosses++;
        else if (vegasEdge.result === 'PUSH') weekVegasEdgePushes++;
      }

      gameRows.push([
        season,
        predictWeek,
        homeTeam,
        awayTeam,
        vegasSpread,
        modelSpread,
        modelVegasDiff,
        vegasEdge.pick,
        vegasEdge.result,
        vegasEdge.atsMargin,
        // Actual score
        homePts,
        awayPts,
        actualMargin,
        actualResult,
        // Ratings
        hR.composite,
        aR.composite,
        hR.off_rating,
        hR.def_rating,
        hR.rush_off,
        hR.rush_def,
        hR.pass_off,
        hR.pass_def,
        aR.off_rating,
        aR.def_rating,
        aR.rush_off,
        aR.rush_def,
        aR.pass_off,
        aR.pass_def,
        // Spread prediction
        predictedFavorite,
        predictedMargin,
        modelHomeMargin,
        // Results
        actualWinner,
        actualWinMargin,
        marginError,
        errorBucket,
        pickCorrect ? 'CORRECT' : 'WRONG',
        // Games used to build these ratings
        priorRows.length > 0
          ? (priorRows.filter(r => String(r[col('team')]) === homeTeam).length)
          : 0,
        priorRows.length > 0
          ? (priorRows.filter(r => String(r[col('team')]) === awayTeam).length)
          : 0,
      ]);
    }

    if (weekPredictions === 0) {
      if (weekGames.length > 0) {
        Logger.log(
          `${season} Wk${predictWeek}: 0 predictions from ${weekGames.length} schedule games | ` +
          `rated teams ${Object.keys(ratings).length} | ` +
          `no score ${skippedNoScore} | missing ratings ${skippedMissingRatings} | ` +
          `non-P4 fallback ${skippedNonP4Fallback}`
        );
      }
      continue;
    }

    const pickPct = round2(weekPickCorrect / weekPredictions * 100);
    const avgMarginError = round2(mean(weekMarginErrors));
    const medMarginError = round2(median(weekMarginErrors));

    summaryRows.push([
      season,
      predictWeek,
      weekPredictions,
      weekPickCorrect,
      weekPredictions - weekPickCorrect,
      pickPct,
      avgMarginError,
      medMarginError,
      weekWithin3,
      round2(weekWithin3 / weekPredictions * 100),
      weekWithin7,
      round2(weekWithin7 / weekPredictions * 100),
      weekWithin10,
      round2(weekWithin10 / weekPredictions * 100),
      round2(weekPredMarginSum / weekPredictions),
      round2(weekActualMarginSum / weekPredictions),
      weekVegasDiffs.length,
      weekVegasDiffs.length ? round2(mean(weekVegasDiffs)) : '',
      weekAbsVegasDiffs.length ? round2(mean(weekAbsVegasDiffs)) : '',
      weekVegasEdgePlays,
      weekVegasEdgeWins,
      weekVegasEdgeLosses,
      weekVegasEdgePushes,
      weekVegasEdgePlays ? round2(weekVegasEdgeWins / weekVegasEdgePlays * 100) : '',
    ]);

    Logger.log(
      `${season} Wk${predictWeek}: Picks ${weekPickCorrect}/${weekPredictions} (${pickPct}%) | ` +
      `Avg margin error: ${avgMarginError}`
    );
  }

  // Season totals row
  if (summaryRows.length > 0) {
    const wRows = summaryRows.filter(r => typeof r[1] === 'number');
    const tG  = wRows.reduce((s,r) => s+r[2], 0);
    const tCorrect = wRows.reduce((s,r) => s+r[3], 0);
    const tWithin3 = wRows.reduce((s,r) => s+r[8], 0);
    const tWithin7 = wRows.reduce((s,r) => s+r[10], 0);
    const tWithin10 = wRows.reduce((s,r) => s+r[12], 0);
    const weightedAvgErr = wRows.reduce((s,r) => s + r[6] * r[2], 0) / tG;
    const weightedMedErr = wRows.reduce((s,r) => s + r[7] * r[2], 0) / tG;
    const avgPredMargin = wRows.reduce((s,r) => s + r[14] * r[2], 0) / tG;
    const avgActualMargin = wRows.reduce((s,r) => s + r[15] * r[2], 0) / tG;
    const vegasGames = wRows.reduce((s,r) => s + r[16], 0);
    const avgVegasDiff = vegasGames
      ? wRows.reduce((s,r) => s + (r[17] === '' ? 0 : r[17] * r[16]), 0) / vegasGames
      : '';
    const avgAbsVegasDiff = vegasGames
      ? wRows.reduce((s,r) => s + (r[18] === '' ? 0 : r[18] * r[16]), 0) / vegasGames
      : '';
    const vegasEdgePlays = wRows.reduce((s,r) => s + r[19], 0);
    const vegasEdgeWins = wRows.reduce((s,r) => s + r[20], 0);
    const vegasEdgeLosses = wRows.reduce((s,r) => s + r[21], 0);
    const vegasEdgePushes = wRows.reduce((s,r) => s + r[22], 0);

    summaryRows.push([
      season, `${season} TOTAL`,
      tG,
      tCorrect,
      tG - tCorrect,
      round2(tCorrect/tG*100),
      round2(weightedAvgErr),
      round2(weightedMedErr),
      tWithin3,
      round2(tWithin3/tG*100),
      tWithin7,
      round2(tWithin7/tG*100),
      tWithin10,
      round2(tWithin10/tG*100),
      round2(avgPredMargin),
      round2(avgActualMargin),
      vegasGames,
      vegasGames ? round2(avgVegasDiff) : '',
      vegasGames ? round2(avgAbsVegasDiff) : '',
      vegasEdgePlays,
      vegasEdgeWins,
      vegasEdgeLosses,
      vegasEdgePushes,
      vegasEdgePlays ? round2(vegasEdgeWins/vegasEdgePlays*100) : '',
    ]);
  }

  return { games: gameRows, summary: summaryRows };
}


// ── ON3 TALENT LOADER ─────────────────────────────────────────
function loadOn3TalentZ(ss, season, p4Teams) {
  // Use the same finalized year-specific roster composite that calculateRatingsCore()
  // uses. Reading staging directly mixes 75-100 player ratings with 600-1050 team
  // composites and makes historical backtests behave like a different formula.
  const sheetName = season === 2026 ? 'TalentOverride' : `TalentOverride${season}`;
  const sheet = ss.getSheetByName(sheetName);
  if (!sheet) {
    Logger.log(`${sheetName} not found — no talent blend for ${season}.`);
    return {};
  }

  const data = sheet.getDataRange().getValues();
  const talentRaw = {};
  // TalentOverride sheets write headers on row 4 and data from row 5.
  for (let i = 4; i < data.length; i++) {
    const team   = String(data[i][0] || '').trim();
    const score = parseFloat(data[i][1]);
    if (!team || isNaN(score) || score <= 0) continue;
    if (p4Teams && !p4Teams.has(team)) continue; // only P4+ND
    talentRaw[team] = score;
  }

  const vals = Object.values(talentRaw).filter(v => !isNaN(v));
  const m = mean(vals), s = stdDev(vals) || 1;
  const talentZ = {};
  for (const [team, v] of Object.entries(talentRaw)) {
    talentZ[team] = (v - m) / s;
  }

  Logger.log(`${sheetName}: talent z-scores for ${Object.keys(talentZ).length} P4+ND teams.`);
  return talentZ;
}


// ── ROLLING RATINGS BUILDER ───────────────────────────────────
// Mirrors the main model's 2026 formula path:
//   - Year-specific finalized roster talent from TalentOverride{year}
//   - Stats weight increases week by week (talent→perf transition)
//   - Rush/pass splits using the same talent/performance blend
//   - Output scaled to 60–95 range matching scaleRating2026()
function buildRollingRatings(rows, headers, coachMap, config, season, talentZ, currentWeek, previousSeasonPriorZ) {
  if (!rows || rows.length === 0) return {};

  talentZ = talentZ || {};
  previousSeasonPriorZ = previousSeasonPriorZ || {};
  const hasTalent = Object.keys(talentZ).length > 0;
  const col   = name => headers.indexOf(name);
  const num = (row, name) => {
    const idx = col(name);
    return idx >= 0 ? parseFloat(row[idx]) : NaN;
  };
  const ITERS = parseInt(config.ITERATIONS) || 20;
  const BASE_TW = parseFloat(config.TALENT_WEIGHT) || 0.40;

  const weeksPresent = [...new Set(rows.map(r => parseInt(r[col('week')], 10)))].sort((a,b)=>a-b);
  const maxWeek      = weeksPresent.length ? Math.max(...weeksPresent) : 1;

  // ── Pass 1: raw opp quality ─────────────────────────────
  const rawAvg = {};
  for (const row of rows) {
    const team    = row[col('team')];
    const ppa_off = parseFloat(row[col('ppa_off')]);
    const ppa_def = parseFloat(row[col('ppa_def')]);
    if (isNaN(ppa_off)) continue;
    if (!rawAvg[team]) rawAvg[team] = { off:0, def:0, w:0 };
    rawAvg[team].off += ppa_off;
    rawAvg[team].def += ppa_def;
    rawAvg[team].w++;
  }
  const rawRatings0 = {};
  for (const [t, v] of Object.entries(rawAvg)) {
    if (v.w > 0) rawRatings0[t] = { off: v.off/v.w, def: v.def/v.w };
  }
  const allOffVals   = Object.values(rawRatings0).map(r => r.off);
  const leagueAvgOff = mean(allOffVals);
  const leagueStdOff = stdDev(allOffVals) || 1;

  // ── Pass 2: accumulate all metrics ─────────────────────
  const teamStats = {};
  for (const row of rows) {
    const team      = row[col('team')];
    const opp       = row[col('opponent')];
    const week      = parseInt(row[col('week')], 10);
    const ppa_off   = num(row, 'ppa_off');
    const ppa_def   = num(row, 'ppa_def');
    const suc_off   = num(row, 'success_off');
    const suc_def   = num(row, 'success_def');
    const ppd_off   = num(row, 'pts_per_drive_off');
    const ppd_def   = num(row, 'pts_per_drive_def');
    const rush_ppa_off = num(row, 'rush_ppa_off');
    const rush_ppa_def = num(row, 'rush_ppa_def');
    const pass_ppa_off = num(row, 'pass_ppa_off');
    const pass_ppa_def = num(row, 'pass_ppa_def');
    const pass_rate_off = num(row, 'pass_rate_off');
    const rush_rate_off = num(row, 'rush_rate_off');

    if (isNaN(ppa_off)) continue;

    const momentumW = maxWeek > 1 ? 1 + ((week-1)/(maxWeek-1)) : 1;
    const oppR = rawRatings0[opp];
    let oppQ = 1.0;
    if (oppR) {
      const oz = (oppR.off - leagueAvgOff) / leagueStdOff;
      oppQ = Math.max(0.25, Math.min(2.5, Math.pow(2, oz)));
    }
    const gw = momentumW * oppQ;

    if (!teamStats[team]) teamStats[team] = {
      sum_ppa_off:0, sum_ppa_def:0, w_ppa:0,
      sum_suc_off:0, sum_suc_def:0, w_suc:0,
      sum_ppd_off:0, sum_ppd_def:0, w_ppd:0,
      sum_rush_off:0, sum_rush_def:0, w_rush:0,
      sum_pass_off:0, sum_pass_def:0, w_pass:0,
      sum_pass_rate:0, sum_rush_rate:0, w_rate:0,
      recentRows: [],
      games:0,
    };
    const t = teamStats[team];

    t.sum_ppa_off += ppa_off * gw; t.sum_ppa_def += ppa_def * gw; t.w_ppa += gw;
    if (!isNaN(suc_off)) { t.sum_suc_off += suc_off*gw; t.sum_suc_def += (suc_def||0)*gw; t.w_suc += gw; }
    if (!isNaN(ppd_off)) { t.sum_ppd_off += ppd_off*gw; t.sum_ppd_def += (ppd_def||0)*gw; t.w_ppd += gw; }
    if (!isNaN(rush_ppa_off) && !isNaN(rush_ppa_def)) {
      t.sum_rush_off += rush_ppa_off*gw; t.sum_rush_def += rush_ppa_def*gw; t.w_rush += gw;
    }
    if (!isNaN(pass_ppa_off) && !isNaN(pass_ppa_def)) {
      t.sum_pass_off += pass_ppa_off*gw; t.sum_pass_def += pass_ppa_def*gw; t.w_pass += gw;
    }
    if (!isNaN(pass_rate_off) || !isNaN(rush_rate_off)) {
      const pr = normalizeRate(!isNaN(pass_rate_off) ? pass_rate_off : 1 - rush_rate_off);
      t.sum_pass_rate += pr * gw;
      t.sum_rush_rate += (1 - pr) * gw;
      t.w_rate += gw;
    }
    t.recentRows.push({
      week,
      ppa_off,
      ppa_def,
      suc_off,
      suc_def,
      ppd_off,
      ppd_def,
      rush_ppa_off,
      rush_ppa_def,
      pass_ppa_off,
      pass_ppa_def,
    });
    t.games++;
  }

  const rawRatings = {};
  for (const [team, t] of Object.entries(teamStats)) {
    if (!t.w_ppa) continue;
    rawRatings[team] = {
      ppa_off: t.sum_ppa_off/t.w_ppa,
      ppa_def: t.sum_ppa_def/t.w_ppa,
      suc_off: t.w_suc>0 ? t.sum_suc_off/t.w_suc : 0,
      suc_def: t.w_suc>0 ? t.sum_suc_def/t.w_suc : 0,
      ppd_off: t.w_ppd>0 ? t.sum_ppd_off/t.w_ppd : 0,
      ppd_def: t.w_ppd>0 ? t.sum_ppd_def/t.w_ppd : 0,
      rush_off: t.w_rush>0 ? t.sum_rush_off/t.w_rush : t.sum_ppa_off/t.w_ppa,
      rush_def: t.w_rush>0 ? t.sum_rush_def/t.w_rush : t.sum_ppa_def/t.w_ppa,
      pass_off: t.w_pass>0 ? t.sum_pass_off/t.w_pass : t.sum_ppa_off/t.w_ppa,
      pass_def: t.w_pass>0 ? t.sum_pass_def/t.w_pass : t.sum_ppa_def/t.w_ppa,
      pass_rate: t.w_rate>0 ? t.sum_pass_rate/t.w_rate : 0.50,
      rush_rate: t.w_rate>0 ? t.sum_rush_rate/t.w_rate : 0.50,
      recent: computeRecentRawForm(t.recentRows),
      games: t.games,
    };
  }

  const teams = Object.keys(rawRatings);
  if (teams.length === 0) return {};

  // ── Iterative opponent adjustment (overall + splits) ────
  const teamOpponents = {};
  for (const row of rows) {
    const team = row[col('team')], opp = row[col('opponent')];
    if (!rawRatings[team] || !rawRatings[opp]) continue;
    if (!teamOpponents[team]) teamOpponents[team] = [];
    teamOpponents[team].push({ opp, w: 1 });
  }

  let adjOff={}, adjDef={}, adjRushOff={}, adjRushDef={}, adjPassOff={}, adjPassDef={};
  for (const [t, r] of Object.entries(rawRatings)) {
    adjOff[t]=r.ppa_off; adjDef[t]=r.ppa_def;
    adjRushOff[t]=r.rush_off; adjRushDef[t]=r.rush_def;
    adjPassOff[t]=r.pass_off; adjPassDef[t]=r.pass_def;
  }
  const avgOff     = mean(teams.map(t=>rawRatings[t].ppa_off));
  const avgDef     = mean(teams.map(t=>rawRatings[t].ppa_def));
  const avgRushOff = mean(teams.map(t=>rawRatings[t].rush_off));
  const avgRushDef = mean(teams.map(t=>rawRatings[t].rush_def));
  const avgPassOff = mean(teams.map(t=>rawRatings[t].pass_off));
  const avgPassDef = mean(teams.map(t=>rawRatings[t].pass_def));

  for (let iter = 0; iter < ITERS; iter++) {
    const nO={},nD={},nRO={},nRD={},nPO={},nPD={};
    for (const [team, r] of Object.entries(rawRatings)) {
      const opps = teamOpponents[team] || [];
      if (!opps.length) {
        nO[team]=r.ppa_off; nD[team]=r.ppa_def;
        nRO[team]=r.rush_off; nRD[team]=r.rush_def;
        nPO[team]=r.pass_off; nPD[team]=r.pass_def;
        continue;
      }
      let dS=0,oS=0,rdS=0,roS=0,pdS=0,poS=0,wS=0;
      for (const {opp,w} of opps) {
        if (adjDef[opp]!==undefined){dS+=adjDef[opp]*w;wS+=w;}
        if (adjOff[opp]!==undefined) oS+=adjOff[opp]*w;
        if (adjRushDef[opp]!==undefined) rdS+=adjRushDef[opp]*w;
        if (adjRushOff[opp]!==undefined) roS+=adjRushOff[opp]*w;
        if (adjPassDef[opp]!==undefined) pdS+=adjPassDef[opp]*w;
        if (adjPassOff[opp]!==undefined) poS+=adjPassOff[opp]*w;
      }
      const w=wS||1;
      nO[team]=r.ppa_off+(avgDef-dS/w)*0.5;
      nD[team]=r.ppa_def+(avgOff-oS/w)*0.5;
      nRO[team]=r.rush_off+(avgRushDef-rdS/w)*0.5;
      nRD[team]=r.rush_def+(avgRushOff-roS/w)*0.5;
      nPO[team]=r.pass_off+(avgPassDef-pdS/w)*0.5;
      nPD[team]=r.pass_def+(avgPassOff-poS/w)*0.5;
    }
    adjOff=nO;adjDef=nD;adjRushOff=nRO;adjRushDef=nRD;adjPassOff=nPO;adjPassDef=nPD;
  }

  // ── Z-scores ────────────────────────────────────────────
  const zPpaOff  = zScore(teams.map(t=>adjOff[t]));
  const zPpaDef  = zScore(teams.map(t=>adjDef[t])).map(z=>-z);
  const zSucOff  = zScore(teams.map(t=>rawRatings[t].suc_off));
  const zSucDef  = zScore(teams.map(t=>rawRatings[t].suc_def)).map(z=>-z);
  const zPpdOff  = zScore(teams.map(t=>rawRatings[t].ppd_off));
  const zPpdDef  = zScore(teams.map(t=>rawRatings[t].ppd_def)).map(z=>-z);
  const zRushOff = zScore(teams.map(t=>adjRushOff[t]));
  const zRushDef = zScore(teams.map(t=>adjRushDef[t])).map(z=>-z);
  const zPassOff = zScore(teams.map(t=>adjPassOff[t]));
  const zPassDef = zScore(teams.map(t=>adjPassDef[t])).map(z=>-z);
  const zRecentPpaOff  = zScore(teams.map(t=>rawRatings[t].recent ? rawRatings[t].recent.ppa_off : rawRatings[t].ppa_off));
  const zRecentPpaDef  = zScore(teams.map(t=>rawRatings[t].recent ? rawRatings[t].recent.ppa_def : rawRatings[t].ppa_def)).map(z=>-z);
  const zRecentSucOff  = zScore(teams.map(t=>rawRatings[t].recent ? rawRatings[t].recent.suc_off : rawRatings[t].suc_off));
  const zRecentSucDef  = zScore(teams.map(t=>rawRatings[t].recent ? rawRatings[t].recent.suc_def : rawRatings[t].suc_def)).map(z=>-z);
  const zRecentPpdOff  = zScore(teams.map(t=>rawRatings[t].recent ? rawRatings[t].recent.ppd_off : rawRatings[t].ppd_off));
  const zRecentPpdDef  = zScore(teams.map(t=>rawRatings[t].recent ? rawRatings[t].recent.ppd_def : rawRatings[t].ppd_def)).map(z=>-z);
  const zRecentRushOff = zScore(teams.map(t=>rawRatings[t].recent ? rawRatings[t].recent.rush_off : rawRatings[t].rush_off));
  const zRecentRushDef = zScore(teams.map(t=>rawRatings[t].recent ? rawRatings[t].recent.rush_def : rawRatings[t].rush_def)).map(z=>-z);
  const zRecentPassOff = zScore(teams.map(t=>rawRatings[t].recent ? rawRatings[t].recent.pass_off : rawRatings[t].pass_off));
  const zRecentPassDef = zScore(teams.map(t=>rawRatings[t].recent ? rawRatings[t].recent.pass_def : rawRatings[t].pass_def)).map(z=>-z);

  // ── Talent/perf weight transition ───────────────────────
  // Season 0-based week (week 1 of season = 0 games played before it).
  // Talent weight starts at BASE_TW preseason, decays to 0.15 by week 8+.
  // Mirrors the main model's tenure-based talentSplit logic.
  const seasonWeek = currentWeek || maxWeek; // week we are PREDICTING
  const perfSplit  = Math.min(0.85, Math.max(0.20, (seasonWeek - 1) / 10));
  const talentSplit = 1 - perfSplit;

  // Pre-compute raw display values for scaling
  const rawDisplayValues = teams.map((team, i) => {
    const coach    = coachMap[team];
    const offTrust = coach ? coach.offTrust : 0.82;
    const defTrust = coach ? coach.defTrust : 0.82;

    const seasonOffTendency = (zPpaOff[i]+zSucOff[i]+zPpdOff[i])/3;
    const seasonDefTendency = (zPpaDef[i]+zSucDef[i]+zPpdDef[i])/3;
    const recentOffTendency = (zRecentPpaOff[i]+zRecentSucOff[i]+zRecentPpdOff[i])/3;
    const recentDefTendency = (zRecentPpaDef[i]+zRecentSucDef[i]+zRecentPpdDef[i])/3;
    const offTendency = (seasonOffTendency * (1 - RECENT_FORM_WEIGHT)) + (recentOffTendency * RECENT_FORM_WEIGHT);
    const defTendency = (seasonDefTendency * (1 - RECENT_FORM_WEIGHT)) + (recentDefTendency * RECENT_FORM_WEIGHT);
    const rushOffSignal = (zRushOff[i] * (1 - RECENT_FORM_WEIGHT)) + (zRecentRushOff[i] * RECENT_FORM_WEIGHT);
    const passOffSignal = (zPassOff[i] * (1 - RECENT_FORM_WEIGHT)) + (zRecentPassOff[i] * RECENT_FORM_WEIGHT);
    const rushDefSignal = (zRushDef[i] * (1 - RECENT_FORM_WEIGHT)) + (zRecentRushDef[i] * RECENT_FORM_WEIGHT);
    const passDefSignal = (zPassDef[i] * (1 - RECENT_FORM_WEIGHT)) + (zRecentPassDef[i] * RECENT_FORM_WEIGHT);

    // Rush/pass splits using position-group style talent weights
    // (mirrors the main model's rushOffTalent / passOffTalent formula)
    // Performance component only — talent component added below
    const rushOffPerf = rushOffSignal * offTrust * perfSplit * 15;
    const passOffPerf = passOffSignal * offTrust * perfSplit * 15;
    const rushDefPerf = rushDefSignal * defTrust * perfSplit * 15;
    const passDefPerf = passDefSignal * defTrust * perfSplit * 15;

    // Overall perf
    const perfOffAdj = offTendency * offTrust * perfSplit * 15;
    const perfDefAdj = defTendency * defTrust * perfSplit * 15;

    // Talent component (z-score based, same as main model)
    const tz = hasTalent ? (talentZ[team] || 0) : 0;
    const prior = previousSeasonPriorZ[team] || { off:0, def:0, composite:0 };
    const priorOffZ = (tz * PRIOR_TALENT_SHARE) + ((prior.off || 0) * PRIOR_PREVIOUS_SEASON_SHARE);
    const priorDefZ = (tz * PRIOR_TALENT_SHARE) + ((prior.def || 0) * PRIOR_PREVIOUS_SEASON_SHARE);

    // Talent normalised to same scale as performance (×15, then /3 → display)
    const talentOff = priorOffZ * 10 * talentSplit;
    const talentDef = priorDefZ * 10 * talentSplit;

    // Display scale: 10 + x/3 (same formula as main model's SCALE=3)
    const offDisplay     = 10 + (perfOffAdj  + talentOff) / 3;
    const defDisplay     = 10 + (perfDefAdj  + talentDef) / 3;
    const rushOffDisplay = 10 + (rushOffPerf + talentOff) / 3;
    const passOffDisplay = 10 + (passOffPerf + talentOff) / 3;
    const rushDefDisplay = 10 + (rushDefPerf + talentDef) / 3;
    const passDefDisplay = 10 + (passDefPerf + talentDef) / 3;
    const composite      = (offDisplay + defDisplay) / 2;

    return { team, offDisplay, defDisplay, rushOffDisplay, passOffDisplay, rushDefDisplay, passDefDisplay, composite };
  });

  const output = {};
  for (const rv of rawDisplayValues) {
    const scale = v => round2(Math.max(
      BACKTEST_RATING_MIN,
      Math.min(BACKTEST_RATING_MAX, BACKTEST_RATING_BASE + ((v - 10) * BACKTEST_RATING_SCALE))
    ));
    output[rv.team] = {
      composite:  scale(rv.composite),
      off_rating: scale(rv.offDisplay),
      def_rating: scale(rv.defDisplay),
      rush_off:   scale(rv.rushOffDisplay),
      pass_off:   scale(rv.passOffDisplay),
      rush_def:   scale(rv.rushDefDisplay),
      pass_def:   scale(rv.passDefDisplay),
      pass_rate:  normalizeRate(rawRatings[rv.team].pass_rate),
      rush_rate:  1 - normalizeRate(rawRatings[rv.team].pass_rate),
    };
  }

  return output;
}


// ── CFBD API HELPERS ──────────────────────────────────────────
function fetchLinesForSeason(season, apiKey) {
  const linesMap = {};
  for (const seasonType of ['regular','postseason']) {
    const url = `https://api.collegefootballdata.com/lines?year=${season}&seasonType=${seasonType}&classification=fbs`;
    const resp = fetchWithAuth(url, apiKey);
    if (!resp) continue;
    let games;
    try { games = JSON.parse(resp); } catch(e) { continue; }
    for (const game of games) {
      if (!game.lines || !game.lines.length) continue;
      const homeTeam = game.homeTeam || game.home_team;
      const awayTeam = game.awayTeam || game.away_team;
      const week = game.week;
      if (!homeTeam || !awayTeam || week === undefined || week === null) continue;
      const line = game.lines.find(l => l.provider && l.provider.toLowerCase().includes('consensus'))
                || game.lines[0];
      if (!line || line.spread === null || line.spread === '') continue;
      const spread = parseFloat(line.spread);
      if (isNaN(spread)) continue;
      linesMap[makeLineKey(homeTeam, awayTeam, season, week)] = spread;
    }
  }
  return linesMap;
}

function fetchScheduleForSeason(season, apiKey, p4Teams) {
  const scheduleMap = {};
  for (const seasonType of ['regular','postseason']) {
    const url = `https://api.collegefootballdata.com/games?year=${season}&seasonType=${seasonType}&classification=fbs`;
    const resp = fetchWithAuth(url, apiKey);
    if (!resp) continue;
    let games;
    try { games = JSON.parse(resp); } catch(e) { continue; }
    let kept = 0;
    for (const g of games) {
      const homeTeam = g.homeTeam || g.home_team;
      const awayTeam = g.awayTeam || g.away_team;
      if (!homeTeam || !awayTeam) continue;
      // P4+ND filter: only include games where BOTH teams are P4+ND
      if (p4Teams && (!p4Teams.has(homeTeam) || !p4Teams.has(awayTeam))) continue;
      let week = g.week;
      if (seasonType === 'postseason') week = 99;
      if (g.notes && String(g.notes).toLowerCase().includes('playoff')) week = 99;
      const homePts = g.homePoints !== undefined ? g.homePoints
        : g.home_points !== undefined ? g.home_points
        : null;
      const awayPts = g.awayPoints !== undefined ? g.awayPoints
        : g.away_points !== undefined ? g.away_points
        : null;
      scheduleMap[`${season}_${homeTeam}_${awayTeam}`] = {
        week,
        homeTeam,
        awayTeam,
        homePts,
        awayPts,
      };
      kept++;
    }
    Logger.log(`${season} ${seasonType} schedule: raw ${games.length}, kept P4+ND ${kept}`);
  }
  return scheduleMap;
}

function makeLineKey(homeTeam, awayTeam, season, week) {
  return `${season}_${week}_${homeTeam}_${awayTeam}`;
}


// ── COACH MAP LOADER ──────────────────────────────────────────
function loadCoachMap(ss, config) {
  const sheet = ss.getSheetByName('Coaches');
  const map   = {};
  function tendencyToTrust(v) {
    const t = parseInt(v)||3;
    return [0,0.55,0.70,0.82,0.92,1.0][Math.min(Math.max(t,1),5)];
  }
  if (sheet) {
    for (const [team,,tier,,offT,defT] of sheet.getDataRange().getValues().slice(1)) {
      if (!team) continue;
      map[team] = { tier:tier||'Average', offTrust:tendencyToTrust(offT), defTrust:tendencyToTrust(defT) };
    }
  }
  return map;
}

function roundToHalf(v) {
  return Math.round(v * 2) / 2;
}

function formatModelSpread(team, margin) {
  const m = Math.abs(roundToHalf(margin));
  if (m === 0) return "Pick'em";
  return `${team} -${m.toFixed(1)}`;
}

function formatVegasSpread(homeTeam, awayTeam, homeSpread) {
  const spread = roundToHalf(parseFloat(homeSpread));
  if (isNaN(spread)) return '';
  if (spread === 0) return "Pick'em";

  const favorite = spread < 0 ? homeTeam : awayTeam;
  return `${favorite} -${Math.abs(spread).toFixed(1)}`;
}

function gradeModelVsVegas(homeTeam, awayTeam, vegasHomeSpread, modelHomeSpread, actualHomeMargin) {
  const vegas = parseFloat(vegasHomeSpread);
  const model = parseFloat(modelHomeSpread);
  const actual = parseFloat(actualHomeMargin);
  if (isNaN(vegas) || isNaN(model) || isNaN(actual)) {
    return { pick: '', result: '', atsMargin: '' };
  }

  const edge = round2(Math.abs(model - vegas));
  if (edge === 0) {
    return { pick: 'No Edge', result: '', atsMargin: '' };
  }

  const pickHome = model < vegas;
  const pick = pickHome
    ? `${homeTeam} ${formatSignedSpread(vegas)}`
    : `${awayTeam} ${formatSignedSpread(-vegas)}`;

  const homeAtsMargin = actual + vegas;
  const atsMargin = round2(pickHome ? homeAtsMargin : -homeAtsMargin);
  const result = atsMargin > 0 ? 'WIN'
    : atsMargin < 0 ? 'LOSS'
    : 'PUSH';

  return { pick, result, atsMargin };
}

function formatSignedSpread(spread) {
  const n = roundToHalf(parseFloat(spread));
  if (isNaN(n)) return '';
  if (n > 0) return `+${n.toFixed(1)}`;
  if (n < 0) return n.toFixed(1);
  return 'PK';
}

function getBacktestWeights(config) {
  function readWeight(key, fallback) {
    const v = config && config[key] !== undefined ? parseFloat(config[key]) : NaN;
    return !isNaN(v) ? v : fallback;
  }

  const raw = {
    pass:      readWeight('PASS_ADV_WEIGHT', DEFAULT_PASS_ADV_WEIGHT),
    rush:      readWeight('RUSH_ADV_WEIGHT', DEFAULT_RUSH_ADV_WEIGHT),
    overall:   readWeight('OVERALL_ADV_WEIGHT', DEFAULT_OVERALL_ADV_WEIGHT),
    composite: readWeight('COMPOSITE_ADV_WEIGHT', DEFAULT_COMPOSITE_ADV_WEIGHT),
  };

  const total = raw.pass + raw.rush + raw.overall + raw.composite;
  if (!total) {
    return { pass: 0.30, rush: 0.20, overall: 0.25, composite: 0.25 };
  }

  return {
    pass: raw.pass / total,
    rush: raw.rush / total,
    overall: raw.overall / total,
    composite: raw.composite / total,
  };
}

function getBacktestCalibration(config) {
  const ppr = config && config.POINTS_PER_RATING !== undefined
    ? parseFloat(config.POINTS_PER_RATING)
    : NaN;
  const hfa = config && config.BACKTEST_HFA !== undefined
    ? parseFloat(config.BACKTEST_HFA)
    : NaN;
  const shrink = config && config.MARGIN_SHRINK !== undefined
    ? parseFloat(config.MARGIN_SHRINK)
    : NaN;
  const maxMargin = config && config.MAX_MODEL_MARGIN !== undefined
    ? parseFloat(config.MAX_MODEL_MARGIN)
    : NaN;

  return {
    pointsPerRating: !isNaN(ppr) ? ppr : POINTS_PER_RATING,
    homeField: !isNaN(hfa) ? hfa : BACKTEST_HFA,
    marginShrink: !isNaN(shrink) ? shrink : DEFAULT_MARGIN_SHRINK,
    maxMargin: !isNaN(maxMargin) ? maxMargin : DEFAULT_MAX_MODEL_MARGIN,
  };
}

function getOptimizerValidationSeason(games) {
  const seasons = [...new Set(games.map(g => Number(g.season)).filter(s => !isNaN(s)))]
    .sort((a, b) => b - a);

  for (const season of seasons) {
    const trainN = games.filter(g => Number(g.season) < season).length;
    const holdoutN = games.filter(g => Number(g.season) === season).length;
    if (trainN > 0 && holdoutN > 0) return season;
  }

  return seasons.length ? seasons[0] : Math.max(...BACKTEST_SEASONS.map(s => Number(s)).filter(s => !isNaN(s)));
}

function countGamesBySeason(games) {
  const out = {};
  for (const g of games) {
    const s = String(g.season);
    out[s] = (out[s] || 0) + 1;
  }
  return out;
}

function normalizeRate(v) {
  let n = parseFloat(v);
  if (isNaN(n)) return 0.50;
  if (n > 1) n = n / 100;
  return Math.max(0.20, Math.min(0.80, n));
}

function computeRecentRawForm(rows) {
  const recent = (rows || [])
    .filter(r => !isNaN(parseInt(r.week, 10)))
    .sort((a, b) => parseInt(b.week, 10) - parseInt(a.week, 10))
    .slice(0, 3);

  if (!recent.length) return null;

  const avg = name => {
    const vals = recent.map(r => parseFloat(r[name])).filter(v => !isNaN(v));
    return vals.length ? mean(vals) : NaN;
  };
  const fallback = (value, fallbackValue) => !isNaN(value) ? value : fallbackValue;

  const ppaOff = avg('ppa_off');
  const ppaDef = avg('ppa_def');

  return {
    ppa_off: ppaOff,
    ppa_def: ppaDef,
    suc_off: fallback(avg('suc_off'), ppaOff),
    suc_def: fallback(avg('suc_def'), ppaDef),
    ppd_off: fallback(avg('ppd_off'), ppaOff),
    ppd_def: fallback(avg('ppd_def'), ppaDef),
    rush_off: fallback(avg('rush_ppa_off'), ppaOff),
    rush_def: fallback(avg('rush_ppa_def'), ppaDef),
    pass_off: fallback(avg('pass_ppa_off'), ppaOff),
    pass_def: fallback(avg('pass_ppa_def'), ppaDef),
  };
}

function correlation(xs, ys) {
  if (!xs || !ys || xs.length !== ys.length || xs.length < 2) return 0;
  const mx = mean(xs);
  const my = mean(ys);
  let num = 0, dx = 0, dy = 0;
  for (let i = 0; i < xs.length; i++) {
    const x = xs[i] - mx;
    const y = ys[i] - my;
    num += x * y;
    dx += x * x;
    dy += y * y;
  }
  const den = Math.sqrt(dx * dy);
  return den ? num / den : 0;
}

function calibrateModelMargin(rawHomeMargin, compositeAdv, marginShrink, maxMargin) {
  let margin = rawHomeMargin;

  if (Math.abs(compositeAdv || 0) < SIMILAR_TEAM_COMPOSITE_THRESHOLD) {
    margin *= SIMILAR_TEAM_DAMPENER;
  }

  margin *= marginShrink;
  margin = Math.max(-maxMargin, Math.min(maxMargin, margin));
  return roundToHalf(margin);
}

function calculateMatchupAdvantages(hR, aR) {
  const homePassRate = normalizeRate(hR.pass_rate);
  const awayPassRate = normalizeRate(aR.pass_rate);
  const homeRushRate = 1 - homePassRate;
  const awayRushRate = 1 - awayPassRate;

  const homePassEdge = hR.pass_off - aR.pass_def;
  const awayPassEdge = aR.pass_off - hR.pass_def;
  const homeRushEdge = hR.rush_off - aR.rush_def;
  const awayRushEdge = aR.rush_off - hR.rush_def;
  const homeOverallEdge = hR.off_rating - aR.def_rating;
  const awayOverallEdge = aR.off_rating - hR.def_rating;

  return {
    passAdv:      (homePassEdge * homePassRate) - (awayPassEdge * awayPassRate),
    rushAdv:      (homeRushEdge * homeRushRate) - (awayRushEdge * awayRushRate),
    overallAdv:   (homeOverallEdge - awayOverallEdge) / 2,
    compositeAdv: hR.composite - aR.composite,
    homePassRate,
    awayPassRate,
  };
}

function predictGameFromRatings(hR, aR, homeTeam, awayTeam, weights, calibration) {
  const adv = calculateMatchupAdvantages(hR, aR);
  const weightedRatingGap =
    adv.passAdv      * weights.pass +
    adv.rushAdv      * weights.rush +
    adv.overallAdv   * weights.overall +
    adv.compositeAdv * weights.composite;

  const cal = calibration || {
    pointsPerRating: POINTS_PER_RATING,
    homeField: BACKTEST_HFA,
    marginShrink: DEFAULT_MARGIN_SHRINK,
    maxMargin: DEFAULT_MAX_MODEL_MARGIN,
  };
  const rawModelHomeMargin = weightedRatingGap * cal.pointsPerRating + cal.homeField;
  const modelHomeMargin = calibrateModelMargin(
    rawModelHomeMargin,
    adv.compositeAdv,
    cal.marginShrink,
    cal.maxMargin
  );
  const predictedWinner = modelHomeMargin > 0 ? homeTeam : awayTeam;
  const predictedFavorite = predictedWinner;
  const predictedMargin = Math.abs(modelHomeMargin);

  return {
    ...adv,
    weightedRatingGap,
    modelHomeMargin,
    modelSpreadLine: round2(-modelHomeMargin),
    predictedWinner,
    predictedFavorite,
    predictedMargin,
    modelSpread: formatModelSpread(predictedFavorite, predictedMargin),
  };
}

function median(arr) {
  const vals = arr
    .map(v => parseFloat(v))
    .filter(v => !isNaN(v))
    .sort((a, b) => a - b);

  if (!vals.length) return 0;

  const mid = Math.floor(vals.length / 2);
  return vals.length % 2
    ? vals[mid]
    : (vals[mid - 1] + vals[mid]) / 2;
}


// ── SHEET SETUP ───────────────────────────────────────────────
function setupBacktestSheets(ss) {
  // ── Backtest sheet: one row per predicted game ───────────
  const bt = ss.insertSheet('Backtest');
  const btHeaders = [
    'Season','Week',
    'Home Team','Away Team',
    'Vegas Spread','Model Spread','Model-Vegas Diff',
    'Model Vegas Pick','Model Vegas Result','Model Vegas ATS Margin',
    'Home Pts','Away Pts','Home Margin','Actual Result',
    'Home Composite','Away Composite',
    'Home Off','Home Def',
    'Home Rush Off','Home Rush Def',
    'Home Pass Off','Home Pass Def',
    'Away Off','Away Def',
    'Away Rush Off','Away Rush Def',
    'Away Pass Off','Away Pass Def',
    'Predicted Favorite','Predicted Margin','Model Home Margin',
    'Actual Winner','Actual Win Margin',
    'Margin Error','Error Bucket','Pick Result',
    'Home Games Used','Away Games Used',
  ];
  bt.getRange(1, 1, 1, btHeaders.length).setValues([btHeaders]).setFontWeight('bold').setBackground('#1a1a2e').setFontColor('#ffffff');
  bt.setFrozenRows(1);

  // Column widths
  const btWidths = [70,55,150,150,140,140,120,170,130,150,75,75,100,150,120,120,85,85,95,95,95,95,85,85,95,95,95,95,150,120,130,150,125,110,110,95,115,115];
  btWidths.forEach((w, i) => bt.setColumnWidth(i+1, w));

  // ── BacktestSummary sheet ────────────────────────────────
  const bs = ss.insertSheet('BacktestSummary');
  const bsHeaders = [
    'Season','Week',
    'Games','Picks Correct','Picks Wrong','Pick %',
    'Avg Margin Error','Median Margin Error',
    'Within 3','Within 3 %',
    'Within 7','Within 7 %',
    'Within 10','Within 10 %',
    'Avg Predicted Margin','Avg Actual Margin',
    'Vegas Games','Avg Model-Vegas Diff','Avg Abs Model-Vegas Diff',
    'Vegas Edge Plays','Vegas Edge Wins','Vegas Edge Losses','Vegas Edge Pushes','Vegas Edge Win %',
  ];
  bs.getRange(1, 1, 1, bsHeaders.length).setValues([bsHeaders]).setFontWeight('bold').setBackground('#1a1a2e').setFontColor('#ffffff');
  bs.setFrozenRows(1);
  bs.setColumnWidths(1, bsHeaders.length, 130);

  for (const name of ['SpreadBuckets','VegasDiffBuckets']) {
    const sh = ss.insertSheet(name);
    const headers = [
      'Bucket','Games','Picks Correct','Picks Wrong','Pick %',
      'Avg Margin Error','Median Margin Error',
      'Within 3','Within 3 %',
      'Within 7','Within 7 %',
      'Within 10','Within 10 %',
      'Avg Predicted Margin','Avg Actual Margin',
    ];
    sh.getRange(1, 1, 1, headers.length)
      .setValues([headers])
      .setFontWeight('bold')
      .setBackground('#1a1a2e')
      .setFontColor('#ffffff');
    sh.setFrozenRows(1);
    sh.setColumnWidths(1, headers.length, 130);
  }
}

function setupWeightOptimizerSheet(ss) {
  const sh = ss.insertSheet('WeightOptimizer');
  const headers = [
    'Rank','Use This?',
    'Pass Weight','Rush Weight','Overall Weight','Composite Weight',
    'Points Per Rating','Home Field','Margin Shrink','Max Margin',
    'Train Games','Train Pick %','Train Avg Error','Train RMSE','Train Corr','Train Score',
    'Holdout Games','Holdout Pick %','Holdout Avg Error','Holdout RMSE','Holdout Corr',
    'Holdout Within 3 %','Holdout Within 7 %','Holdout Within 10 %',
    'Holdout Avg Pred Margin','Holdout Avg Actual Margin',
    'Holdout Vegas Games','Holdout Avg Model-Vegas Diff','Holdout Score',
    'All Games','All Pick %','All Avg Error','All RMSE','All Corr','All Score',
    'Stability Penalty','Final Score',
  ];
  sh.getRange(1, 1, 1, headers.length)
    .setValues([headers])
    .setFontWeight('bold')
    .setBackground('#1a1a2e')
    .setFontColor('#ffffff');
  sh.setFrozenRows(1);
  sh.setColumnWidths(1, headers.length, 130);
}


// ── OVERALL SUMMARY ROW ───────────────────────────────────────
function appendOverallSummary(sumSheet, summaryRows) {
  const weekRows = summaryRows.filter(r => typeof r[1] === 'number');
  if (!weekRows.length) return;

  const tG  = weekRows.reduce((s,r)=>s+r[2],0);
  const tCorrect = weekRows.reduce((s,r)=>s+r[3],0);
  const tWithin3 = weekRows.reduce((s,r)=>s+r[8],0);
  const tWithin7 = weekRows.reduce((s,r)=>s+r[10],0);
  const tWithin10 = weekRows.reduce((s,r)=>s+r[12],0);
  const weightedAvgErr = weekRows.reduce((s,r)=>s+r[6]*r[2],0) / tG;
  const weightedMedErr = weekRows.reduce((s,r)=>s+r[7]*r[2],0) / tG;
  const avgPredMargin = weekRows.reduce((s,r)=>s+r[14]*r[2],0) / tG;
  const avgActualMargin = weekRows.reduce((s,r)=>s+r[15]*r[2],0) / tG;
  const vegasGames = weekRows.reduce((s,r)=>s+r[16],0);
  const avgVegasDiff = vegasGames
    ? weekRows.reduce((s,r)=>s+(r[17] === '' ? 0 : r[17]*r[16]),0) / vegasGames
    : '';
  const avgAbsVegasDiff = vegasGames
    ? weekRows.reduce((s,r)=>s+(r[18] === '' ? 0 : r[18]*r[16]),0) / vegasGames
    : '';
  const vegasEdgePlays = weekRows.reduce((s,r)=>s+r[19],0);
  const vegasEdgeWins = weekRows.reduce((s,r)=>s+r[20],0);
  const vegasEdgeLosses = weekRows.reduce((s,r)=>s+r[21],0);
  const vegasEdgePushes = weekRows.reduce((s,r)=>s+r[22],0);

  const overallRow = [
    'ALL','OVERALL',
    tG,
    tCorrect,
    tG-tCorrect,
    round2(tCorrect/tG*100),
    round2(weightedAvgErr),
    round2(weightedMedErr),
    tWithin3,
    round2(tWithin3/tG*100),
    tWithin7,
    round2(tWithin7/tG*100),
    tWithin10,
    round2(tWithin10/tG*100),
    round2(avgPredMargin),
    round2(avgActualMargin),
    vegasGames,
    vegasGames ? round2(avgVegasDiff) : '',
    vegasGames ? round2(avgAbsVegasDiff) : '',
    vegasEdgePlays,
    vegasEdgeWins,
    vegasEdgeLosses,
    vegasEdgePushes,
    vegasEdgePlays ? round2(vegasEdgeWins/vegasEdgePlays*100) : '',
  ];

  sumSheet.getRange(sumSheet.getLastRow()+1, 1, 1, overallRow.length)
    .setValues([overallRow]).setFontWeight('bold').setBackground('#d9d2e9');
}

function writeBacktestBucketSheets(ss, gameRows) {
  writeBucketSheet(
    ss.getSheetByName('SpreadBuckets'),
    buildBacktestBucketRows(gameRows, row => {
      const margin = parseFloat(row[29]);
      if (isNaN(margin)) return '';
      if (margin <= 3.5) return '0-3.5';
      if (margin <= 7.5) return '4-7.5';
      if (margin <= 14.5) return '8-14.5';
      return '15+';
    }, ['0-3.5','4-7.5','8-14.5','15+'])
  );

  writeBucketSheet(
    ss.getSheetByName('VegasDiffBuckets'),
    buildBacktestBucketRows(gameRows, row => {
      const diff = parseFloat(row[6]);
      if (isNaN(diff)) return '';
      if (diff <= 3) return '0-3';
      if (diff <= 7) return '3.5-7';
      return '7.5+';
    }, ['0-3','3.5-7','7.5+'])
  );
}

function buildBacktestBucketRows(gameRows, bucketFn, orderedBuckets) {
  const buckets = {};
  for (const name of orderedBuckets) {
    buckets[name] = [];
  }

  for (const row of gameRows || []) {
    const bucket = bucketFn(row);
    if (!bucket) continue;
    if (!buckets[bucket]) buckets[bucket] = [];
    buckets[bucket].push(row);
  }

  const out = [];
  for (const bucket of orderedBuckets) {
    const rows = buckets[bucket] || [];
    if (!rows.length) {
      out.push([bucket,0,0,0,'','','',0,'',0,'',0,'','','']);
      continue;
    }

    const games = rows.length;
    const correct = rows.filter(r => r[35] === 'CORRECT').length;
    const errors = rows.map(r => parseFloat(r[33])).filter(v => !isNaN(v));
    const predMargins = rows.map(r => parseFloat(r[29])).filter(v => !isNaN(v));
    const actualMargins = rows.map(r => parseFloat(r[32])).filter(v => !isNaN(v));
    const within3 = errors.filter(v => v <= 3).length;
    const within7 = errors.filter(v => v <= 7).length;
    const within10 = errors.filter(v => v <= 10).length;

    out.push([
      bucket,
      games,
      correct,
      games - correct,
      round2(correct / games * 100),
      round2(mean(errors)),
      round2(median(errors)),
      within3,
      round2(within3 / games * 100),
      within7,
      round2(within7 / games * 100),
      within10,
      round2(within10 / games * 100),
      round2(mean(predMargins)),
      round2(mean(actualMargins)),
    ]);
  }

  return out;
}

function writeBucketSheet(sheet, rows) {
  if (!sheet || !rows || !rows.length) return;
  sheet.getRange(2, 1, rows.length, rows[0].length).setValues(rows);
  colorCodeBucketSheet(sheet);
}


// ── COLOR CODING ──────────────────────────────────────────────
function colorCodeBacktestSheet(sheet, gameRows) {
  if (!gameRows.length) return;
  const n = gameRows.length;

  // Rating columns (cols 15-28): color by value across all rows
  const ratingCols = [15,16,17,18,19,20,21,22,23,24,25,26,27,28];
  for (const c of ratingCols) {
    const vals = gameRows.map(r => parseFloat(r[c-1])).filter(v => !isNaN(v));
    if (!vals.length) continue;
    const sorted = [...vals].sort((a,b)=>b-a);
    const top10  = sorted[Math.floor(sorted.length*0.10)] || 90;
    const top25  = sorted[Math.floor(sorted.length*0.25)] || 85;
    const top50  = sorted[Math.floor(sorted.length*0.50)] || 75;

    const colors = gameRows.map(r => {
      const v = parseFloat(r[c-1]);
      if (isNaN(v)) return ['#ffffff'];
      if (v >= top10) return ['#b4c6e7'];
      if (v >= top25) return ['#c6efce'];
      if (v >= top50) return ['#fff2cc'];
      return ['#f4cccc'];
    });
    sheet.getRange(2, c, n, 1).setBackgrounds(colors);
  }

  // Pick Result col 36
  const pickColors = gameRows.map(r =>
    r[35]==='CORRECT' ? ['#c6efce'] : r[35]==='WRONG' ? ['#f4cccc'] : ['#ffffff']
  );
  sheet.getRange(2, 36, n, 1).setBackgrounds(pickColors);

  // Model Vegas Result col 9
  const vegasEdgeColors = gameRows.map(r =>
    r[8]==='WIN' ? ['#c6efce'] :
    r[8]==='LOSS' ? ['#f4cccc'] :
    r[8]==='PUSH' ? ['#fff2cc'] :
    ['#ffffff']
  );
  sheet.getRange(2, 9, n, 1).setBackgrounds(vegasEdgeColors);

  // Margin Error col 34: lower is better
  const errColors = gameRows.map(r => {
    const v = parseFloat(r[33]);
    if (isNaN(v)) return ['#ffffff'];
    if (Math.abs(v) <= 3)  return ['#c6efce'];
    if (Math.abs(v) <= 7)  return ['#fff2cc'];
    return ['#f4cccc'];
  });
  sheet.getRange(2, 34, n, 1).setBackgrounds(errColors);

  // Error Bucket col 35
  const bucketColors = gameRows.map(r => {
    const v = String(r[34] || '');
    if (v === 'Within 3') return ['#c6efce'];
    if (v === 'Within 7') return ['#fff2cc'];
    if (v === 'Within 10') return ['#fce5cd'];
    return ['#f4cccc'];
  });
  sheet.getRange(2, 35, n, 1).setBackgrounds(bucketColors);
}

function colorCodeSummarySheet(sheet) {
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return;

  // Pick % and within-margin percentage columns
  for (const c of [6, 10, 12, 14, 24]) {
    const vals = sheet.getRange(2, c, lastRow-1, 1).getValues();
    const colors = vals.map(([v]) => {
      const p = parseFloat(v);
      if (isNaN(p)) return ['#ffffff'];
      if (p >= 70)  return ['#b4c6e7'];
      if (p >= 60)  return ['#c6efce'];
      if (p >= 50)  return ['#fff2cc'];
      return ['#f4cccc'];
    });
    sheet.getRange(2, c, lastRow-1, 1).setBackgrounds(colors);
  }

  // Avg/median margin error columns: lower is better
  for (const c of [7, 8]) {
    const errVals = sheet.getRange(2, c, lastRow-1, 1).getValues();
    const errColors = errVals.map(([v]) => {
      const p = parseFloat(v);
      if (isNaN(p)) return ['#ffffff'];
      if (p <= 4)  return ['#b4c6e7'];
      if (p <= 7)  return ['#c6efce'];
      if (p <= 10) return ['#fff2cc'];
      return ['#f4cccc'];
    });
    sheet.getRange(2, c, lastRow-1, 1).setBackgrounds(errColors);
  }

  // Bold & highlight season-total and overall rows
  const labels = sheet.getRange(2, 2, lastRow-1, 1).getValues();
  for (let i = 0; i < labels.length; i++) {
    const v = String(labels[i][0]);
    if (v.includes('TOTAL')) {
      sheet.getRange(i+2, 1, 1, 24).setFontWeight('bold').setBackground('#ead1dc');
    } else if (v.includes('OVERALL')) {
      sheet.getRange(i+2, 1, 1, 24).setFontWeight('bold').setBackground('#d9d2e9');
    }
  }
}

function colorCodeBucketSheet(sheet) {
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return;

  for (const c of [5, 9, 11, 13]) {
    const vals = sheet.getRange(2, c, lastRow - 1, 1).getValues();
    const colors = vals.map(([v]) => {
      const p = parseFloat(v);
      if (isNaN(p)) return ['#ffffff'];
      if (p >= 70) return ['#b4c6e7'];
      if (p >= 60) return ['#c6efce'];
      if (p >= 50) return ['#fff2cc'];
      return ['#f4cccc'];
    });
    sheet.getRange(2, c, lastRow - 1, 1).setBackgrounds(colors);
  }

  for (const c of [6, 7]) {
    const vals = sheet.getRange(2, c, lastRow - 1, 1).getValues();
    const colors = vals.map(([v]) => {
      const p = parseFloat(v);
      if (isNaN(p)) return ['#ffffff'];
      if (p <= 4) return ['#b4c6e7'];
      if (p <= 7) return ['#c6efce'];
      if (p <= 10) return ['#fff2cc'];
      return ['#f4cccc'];
    });
    sheet.getRange(2, c, lastRow - 1, 1).setBackgrounds(colors);
  }
}

function colorCodeWeightOptimizerSheet(sheet) {
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return;

  // Pick % and within-margin percentage columns: higher is better.
  for (const c of [12, 18, 22, 23, 24, 31]) {
    const vals = sheet.getRange(2, c, lastRow - 1, 1).getValues();
    const colors = vals.map(([v]) => {
      const p = parseFloat(v);
      if (isNaN(p)) return ['#ffffff'];
      if (p >= 70) return ['#b4c6e7'];
      if (p >= 60) return ['#c6efce'];
      if (p >= 50) return ['#fff2cc'];
      return ['#f4cccc'];
    });
    sheet.getRange(2, c, lastRow - 1, 1).setBackgrounds(colors);
  }

  // Correlation columns: higher is better, but values are -1..1.
  for (const c of [15, 21, 34]) {
    const vals = sheet.getRange(2, c, lastRow - 1, 1).getValues();
    const colors = vals.map(([v]) => {
      const p = parseFloat(v);
      if (isNaN(p)) return ['#ffffff'];
      if (p >= 0.55) return ['#b4c6e7'];
      if (p >= 0.40) return ['#c6efce'];
      if (p >= 0.25) return ['#fff2cc'];
      return ['#f4cccc'];
    });
    sheet.getRange(2, c, lastRow - 1, 1).setBackgrounds(colors);
  }

  // Margin error and Vegas distance columns: lower is better.
  for (const c of [13, 14, 16, 19, 20, 28, 29, 32, 33, 35, 36, 37]) {
    const vals = sheet.getRange(2, c, lastRow - 1, 1).getValues();
    const colors = vals.map(([v]) => {
      const p = parseFloat(v);
      if (isNaN(p)) return ['#ffffff'];
      if (p <= 4) return ['#b4c6e7'];
      if (p <= 7) return ['#c6efce'];
      if (p <= 10) return ['#fff2cc'];
      return ['#f4cccc'];
    });
    sheet.getRange(2, c, lastRow - 1, 1).setBackgrounds(colors);
  }

  sheet.getRange(2, 1, Math.min(10, lastRow - 1), 37)
    .setFontWeight('bold')
    .setBackground('#e8f0fe');

  sheet.getRange(2, 1, 1, 37)
    .setFontWeight('bold')
    .setBackground('#d9ead3');
}

function formatBacktestSheet(sheet) {
  // Alternate row banding for readability
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return;
  for (let i = 2; i <= lastRow; i++) {
    const currentBg = sheet.getRange(i, 1).getBackground();
    // Only set banding on uncolored cells (don't override result colors)
    if (currentBg === '#ffffff' || currentBg === '#ffffffff') {
      if (i % 2 === 0) sheet.getRange(i, 1, 1, 2).setBackground('#f8f8f8');
    }
  }
  // Freeze team name columns too
  sheet.setFrozenColumns(2);
}


// ── DEBUG ─────────────────────────────────────────────────────
function debugBacktest() {
  const ss     = SpreadsheetApp.getActiveSpreadsheet();
  const config = getConfig();
  const season = BACKTEST_SEASONS[0];

  Logger.log('===== debugBacktest =====');
  const rawSheet = ss.getSheetByName('RawStats');
  if (!rawSheet) { Logger.log('ERROR: No RawStats sheet'); return; }
  const data    = rawSheet.getDataRange().getValues();
  const headers = data[0];
  const col     = name => headers.indexOf(name);
  const seasonRows = data.slice(1).filter(r => parseInt(r[col('season')],10)===season);
  Logger.log(`RawStats rows for ${season}: ${seasonRows.length}`);

  const p4Teams = fetchP4Teams(season, config.API_KEY);
  Logger.log(`P4+ND teams: ${p4Teams.size}`);

  const p4Rows = seasonRows.filter(r => p4Teams.has(String(r[col('team')]).trim()));
  Logger.log(`P4+ND RawStats rows: ${p4Rows.length}`);

  const scheduleMap = fetchScheduleForSeason(season, config.API_KEY, p4Teams);
  Logger.log(`P4+ND games in schedule: ${Object.keys(scheduleMap).length}`);
  if (Object.keys(scheduleMap).length > 0) {
    Logger.log('Sample game: ' + JSON.stringify(Object.values(scheduleMap)[0]));
  }

  const talentZ = loadOn3TalentZ(ss, season, p4Teams);
  Logger.log(`Talent z-scores loaded: ${Object.keys(talentZ).length}`);

  const coachMap = loadCoachMap(ss, config);
  const week1Rows = p4Rows.filter(r => Number(r[col('week')]) === 1);
  const ratings   = buildRollingRatings(week1Rows, headers, coachMap, config, season, talentZ, 2);
  Logger.log(`Teams rated after week 1: ${Object.keys(ratings).length}`);
  if (Object.keys(ratings).length > 0) {
    Logger.log('Sample: ' + JSON.stringify(Object.entries(ratings).slice(0,2)));
  }
  Logger.log('===== done =====');
}

function debugBacktest2025() {
  debugBacktestSeason(2025);
}

function debugBacktestSeason(season) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const config = getConfig();
  const rawSheet = ss.getSheetByName('RawStats');
  if (!rawSheet) { Logger.log('ERROR: No RawStats sheet'); return; }

  const data = rawSheet.getDataRange().getValues();
  const headers = data[0];
  const col = name => headers.indexOf(name);
  const fbsTeams = fetchFbsTeams(season, config.API_KEY);
  const p4Teams = fetchP4Teams(season, config.API_KEY);
  const ratingRows = data.slice(1).filter(r => {
    const s = parseInt(r[col('season')], 10);
    const team = String(r[col('team')] || '').trim();
    return s === Number(season) && (!fbsTeams.size || fbsTeams.has(team));
  });

  Logger.log(`DEBUG ${season}: RawStats rating rows ${ratingRows.length}`);
  Logger.log(`DEBUG ${season}: FBS teams ${fbsTeams.size}, P4+ND teams ${p4Teams.size}`);

  const p4Schedule = fetchScheduleForSeason(season, config.API_KEY, p4Teams);
  const allSchedule = fetchScheduleForSeason(season, config.API_KEY, null);
  Logger.log(`DEBUG ${season}: P4 schedule games ${Object.keys(p4Schedule).length}`);
  Logger.log(`DEBUG ${season}: all FBS schedule games ${Object.keys(allSchedule).length}`);

  const weeks = [...new Set(ratingRows.map(r => parseInt(r[col('week')], 10)))]
    .filter(w => !isNaN(w) && w !== 99)
    .sort((a, b) => a - b);
  Logger.log(`DEBUG ${season}: RawStats weeks ${weeks.join(', ')}`);

  const talentZ = loadOn3TalentZ(ss, season, null);
  const priorZ = buildPreviousSeasonPriorZ(data.slice(1), headers, season, fbsTeams);
  const coachMap = loadCoachMap(ss, config);

  for (const predictWeek of weeks.slice(1, 5)) {
    const priorRows = ratingRows.filter(r => parseInt(r[col('week')], 10) < predictWeek);
    const ratings = buildRollingRatings(priorRows, headers, coachMap, config, season, talentZ, predictWeek, priorZ);
    const games = Object.values(Object.keys(p4Schedule).length ? p4Schedule : allSchedule)
      .filter(g => Number(g.week) === Number(predictWeek));
    let scored = 0, bothRated = 0;
    const missing = [];
    for (const g of games) {
      if (g.homePts !== null && g.awayPts !== null) scored++;
      if (ratings[g.homeTeam] && ratings[g.awayTeam]) {
        bothRated++;
      } else if (missing.length < 8) {
        missing.push(`${g.homeTeam}/${!!ratings[g.homeTeam]} vs ${g.awayTeam}/${!!ratings[g.awayTeam]}`);
      }
    }
    Logger.log(
      `DEBUG ${season} Wk${predictWeek}: priorRows ${priorRows.length}, ratings ${Object.keys(ratings).length}, ` +
      `games ${games.length}, scored ${scored}, bothRated ${bothRated}`
    );
    if (missing.length) Logger.log(`DEBUG missing examples: ${missing.join(' | ')}`);
  }
}
