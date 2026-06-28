import { getServiceSupabase } from '../db/client';
import { CfbdClient, type CfbdGame, type CfbdTeamGameStat } from '../data/cfbd';
import { computeOn3Composite, fetchOn3Roster } from '../data/on3';
import { evaluateRatedGames, summarizeEvaluatedGames, type EvaluatedGame, type RatedGame } from '../model/evaluate';
import { optimizeWeights } from '../model/optimizer';
import { DEFAULT_CALIBRATION, DEFAULT_WEIGHTS, formatSignedSpread, gradeModelVsVegas, predictGame } from '../model/predict';
import { calculateTeamRatings, type RawTeamGameStat } from '../model/ratings';
import type { CoachInfluence, ModelCalibration, ModelWeights, Rating, RatingFormula } from '../model/types';

type UpdateOptions = {
  season: number;
  includeBacktest?: boolean;
  steps?: UpdateStep[];
  rosterLimit?: number | null;
  rosterOffset?: number;
  optimizeBacktest?: boolean;
};

export type UpdateStep = 'teams' | 'games' | 'stats' | 'rosters' | 'coaches' | 'ratings' | 'predictions' | 'backtest' | 'optimizer';

type WeeklyRatingSource = {
  rawStats: RawTeamGameStat[];
  rosterRows: any[];
  coachRows: any[];
  talentScores: Record<string, number>;
};

const weeklyRatingSourceCache = new Map<number, Promise<WeeklyRatingSource>>();
const vegasLineCache = new Map<number, Promise<Map<string, number>>>();

export async function runModelUpdate(options: UpdateOptions) {
  const supabase = getServiceSupabase();
  const startedAt = new Date().toISOString();
  const jobName = `model-update-${options.season}`;
  const steps = normalizeSteps(options);

  const { data: run, error: insertError } = await supabase
    .from('job_runs')
    .insert({
      job_name: jobName,
      status: 'running',
      message: 'Model update started',
      metadata: options,
      started_at: startedAt
    })
    .select('id')
    .single();

  if (insertError) throw insertError;

  try {
    const result: Partial<Record<UpdateStep, unknown>> = {};
    if (steps.has('teams')) result.teams = await fetchTeams(options.season);
    if (steps.has('games')) result.games = await fetchGames(options.season);
    if (steps.has('stats')) result.stats = await fetchTeamGameStats(options.season);
    if (steps.has('coaches')) result.coaches = await fetchCoaches(options.season);
    if (steps.has('rosters')) {
      result.rosters = await fetchRosters(options.season, {
        limit: options.rosterLimit,
        offset: options.rosterOffset ?? 0
      });
    }
    if (steps.has('ratings')) result.ratings = await calculateRatings(options.season);
    if (steps.has('predictions')) result.predictions = await generatePredictions(options.season);
    if (steps.has('optimizer')) result.optimizer = await runOptimizerThroughSeason(await getLatestCompletedSeason() ?? options.season);
    if (steps.has('backtest')) result.backtest = await runBacktest(options.season, options.optimizeBacktest !== false);

    await supabase
      .from('job_runs')
      .update({
        status: 'success',
        message: 'Model update completed',
        metadata: result,
        finished_at: new Date().toISOString()
      })
      .eq('id', run.id);

    return result;
  } catch (error) {
    await supabase
      .from('job_runs')
      .update({
        status: 'error',
        message: errorMessage(error),
        finished_at: new Date().toISOString()
      })
      .eq('id', run.id);
    throw error;
  }
}

function normalizeSteps(options: UpdateOptions) {
  if (options.steps?.length) return new Set(options.steps);
  const defaults: UpdateStep[] = ['teams', 'games', 'stats', 'rosters', 'coaches', 'ratings', 'predictions'];
  if (options.includeBacktest) defaults.push('backtest');
  return new Set(defaults);
}

async function fetchTeams(season: number) {
  const supabase = getServiceSupabase();
  const cfbd = new CfbdClient();
  const teams = await cfbd.getTeams(season);

  const rows = teams
    .filter((team) => team?.school)
    .map((team) => ({
      school: team.school,
      conference: team.conference || null,
      classification: team.classification || team.division || null,
      is_power: ['SEC', 'Big Ten', 'Big 12', 'ACC'].includes(team.conference),
      updated_at: new Date().toISOString()
    }));

  await upsertRows(supabase, 'teams', rows, 'school');
  return { season, status: 'success', count: rows.length };
}

async function fetchCoaches(season: number) {
  const supabase = getServiceSupabase();
  const cfbd = new CfbdClient();
  let coaches = [] as Awaited<ReturnType<CfbdClient['getCoaches']>>;
  let sourceSeason = season;
  try {
    coaches = await cfbd.getCoaches(season);
  } catch (error) {
    if (season <= 2022) throw error;
  }
  if (!coaches.length && season > 2022) {
    sourceSeason = season - 1;
    coaches = await cfbd.getCoaches(sourceSeason);
  }

  const [{ data: existingRows, error: existingError }, { data: teamRows, error: teamError }] = await Promise.all([
    supabase.from('coach_configs').select('*'),
    supabase.from('teams').select('school').order('school', { ascending: true })
  ]);
  if (existingError) throw existingError;
  if (teamError) throw teamError;

  const existing = new Map((existingRows || []).map((row) => [String(row.team), row]));
  const imported = new Map<string, { coachName: string; hireYear: number | null }>();

  for (const coach of coaches) {
    const seasons = Array.isArray(coach.seasons) ? coach.seasons : [];
    const targetSeason = seasons.find((row) => Number(row.year ?? row.season) === sourceSeason) ||
      seasons
        .filter((row) => Number(row.year ?? row.season) <= sourceSeason)
        .sort((a, b) => Number(b.year ?? b.season) - Number(a.year ?? a.season))[0];
    const team = String(targetSeason?.school || '').trim();
    if (!team) continue;

    const teamYears = seasons
      .filter((row) => String(row.school || '').trim() === team)
      .map((row) => Number(row.year ?? row.season))
      .filter(Number.isFinite);
    const dateYear = coach.hireDate ? new Date(coach.hireDate).getUTCFullYear() : NaN;
    const hireYear = teamYears.length ? Math.min(...teamYears) : Number.isFinite(dateYear) ? dateYear : null;
    const coachName = `${coach.firstName || ''} ${coach.lastName || ''}`.trim();
    imported.set(team, { coachName, hireYear });
  }

  const rows = (teamRows || []).map((teamRow) => {
    const team = String(teamRow.school);
    const prior = existing.get(team);
    const fromCfbd = imported.get(team);
    const lockIdentity = prior?.source === 'manual' && Boolean(prior?.coach_name);
    return {
      team,
      coach_name: lockIdentity ? prior.coach_name : fromCfbd?.coachName || prior?.coach_name || null,
      tier: prior?.tier || 'Average',
      hire_year: lockIdentity ? prior.hire_year : fromCfbd?.hireYear ?? prior?.hire_year ?? null,
      off_tendency: prior?.off_tendency ?? 3,
      def_tendency: prior?.def_tendency ?? 3,
      offense_rating: prior?.offense_rating ?? 5,
      defense_rating: prior?.defense_rating ?? 5,
      development_rating: prior?.development_rating ?? 'Average',
      preseason_override: prior?.preseason_override ?? null,
      notes: prior?.notes ?? null,
      source: lockIdentity ? 'manual' : fromCfbd ? 'cfbd' : prior?.source || 'manual',
      updated_at: new Date().toISOString()
    };
  });

  await upsertRows(supabase, 'coach_configs', rows, 'team');
  return {
    season,
    sourceSeason,
    status: 'success',
    count: rows.length,
    matched: imported.size
  };
}

async function fetchGames(season: number) {
  const supabase = getServiceSupabase();
  const cfbd = new CfbdClient();
  const games = await cfbd.getSeasonGamesAndPostseason(season);
  const rows = games
    .filter((game) => game.homeTeam && game.awayTeam)
    .map(mapGameRow);

  await upsertRows(supabase, 'games', rows, 'cfbd_game_id');
  return { season, status: 'success', count: rows.length };
}

async function fetchTeamGameStats(season: number) {
  const supabase = getServiceSupabase();
  const cfbd = new CfbdClient();
  const games = await cfbd.getSeasonGamesAndPostseason(season);
  const rows: ReturnType<typeof mapTeamGameStatRow>[] = [];

  for (const seasonType of ['regular', 'postseason'] as const) {
    const stats = await cfbd.getAdvancedGameStats(season, seasonType);
    rows.push(...stats.map((stat) => mapTeamGameStatRow(stat, games, season)));
  }

  const validRows = rows.filter(row => row.season && row.week && row.team && row.opponent);
  await upsertRows(supabase, 'team_game_stats', validRows, 'season,week,team,opponent');
  return { season, status: 'success', count: validRows.length, skipped: rows.length - validRows.length };
}

async function fetchRosters(
  season: number,
  options: { limit?: number | null; offset?: number } = {}
) {
  const supabase = getServiceSupabase();
  const { data: sources, error } = await supabase
    .from('on3_roster_sources')
    .select('season,team,url')
    .eq('season', season)
    .eq('enabled', true)
    .order('team', { ascending: true });

  if (error) throw error;
  if (!sources?.length) {
    return { season, status: 'skipped', reason: 'No enabled On3 roster sources found', count: 0 };
  }

  const offset = Math.max(0, options.offset ?? 0);
  const selectedSources = Number.isFinite(Number(options.limit)) && Number(options.limit) > 0
    ? sources.slice(offset, offset + Number(options.limit))
    : sources.slice(offset);

  let playerCount = 0;
  for (const source of selectedSources) {
    const players = await fetchOn3Roster(source.url, source.team, season);
    const rows = players.map((player) => ({
      season,
      team: source.team,
      player_name: player.name,
      position: player.position,
      rating: player.rating,
      source: player.source,
      raw: player,
      updated_at: new Date().toISOString()
    }));

    if (!rows.length) continue;
    await upsertRows(supabase, 'roster_players', rows, 'season,team,player_name,position');
    playerCount += rows.length;
  }

  return {
    season,
    status: 'success',
    teams: selectedSources.length,
    totalTeams: sources.length,
    offset,
    limit: options.limit ?? null,
    count: playerCount
  };
}

async function calculateRatings(season: number) {
  const supabase = getServiceSupabase();
  const statRows: any[] = [];
  const rosterRows: any[] = [];
  const pageSize = 1000;

  for (let from = 0; ; from += pageSize) {
    const { data, error } = await supabase
      .from('team_game_stats')
      .select('*')
      .lte('season', season)
      .order('season', { ascending: true })
      .order('team', { ascending: true })
      .order('week', { ascending: true })
      .range(from, from + pageSize - 1);

    if (error) throw error;
    statRows.push(...(data || []));
    if (!data || data.length < pageSize) break;
  }

  for (let from = 0; ; from += pageSize) {
    const { data, error } = await supabase
      .from('roster_players')
      .select('season,team,player_name,position,rating,source')
      .eq('season', season)
      .order('team', { ascending: true })
      .order('player_name', { ascending: true })
      .range(from, from + pageSize - 1);

    if (error) throw error;
    rosterRows.push(...(data || []));
    if (!data || data.length < pageSize) break;
  }

  const { data: coachRows, error: coachError } = await supabase
    .from('coach_configs')
    .select('team,coach_name,hire_year,offense_rating,defense_rating,development_rating');
  if (coachError) throw coachError;
  const activeConfig = await loadActiveModelConfig();

  const talentScores = buildTalentScores(rosterRows, season);
  const coachDiagnostics = buildCoachDiagnostics(coachRows || [], talentScores, activeConfig.coachInfluence);
  const ratings = calculateTeamRatings(
    statRows.map(mapRawStatRow),
    talentScores,
    {
      season,
      recencyWeight: activeConfig.ratingFormula.recencyWeight,
      iterations: 20,
      talentWeight: activeConfig.ratingFormula.talentWeight,
      // Historical ratings should retain every team with performance data.
      // The preseason 2026 model is intentionally limited to seeded rosters.
      requireTalent: season >= 2026,
      rosterPlayers: rosterRows,
      historicalPositionTalentWeight: activeConfig.ratingFormula.historicalPositionTalentWeight,
      preseasonPositionTalentWeight: activeConfig.ratingFormula.preseasonPositionTalentWeight,
      talentRampWeeks: activeConfig.ratingFormula.talentRampWeeks,
      coachInfluence: activeConfig.coachInfluence,
      coaches: coachRows || []
    }
  );
  const { data: existingRatings, error: existingRatingsError } = await supabase
    .from('ratings')
    .select('team,off_rating,def_rating,composite')
    .eq('season', season);
  if (existingRatingsError) throw existingRatingsError;
  const existingRatingMap = new Map((existingRatings || []).map((row) => [String(row.team), row]));

  const rows = ratings.map((rating) => ({
    season,
    team: rating.team,
    off_rating: rating.offRating,
    def_rating: rating.defRating,
    composite: rating.composite,
    off_rating_delta: ratingDelta(rating.offRating, existingRatingMap.get(rating.team)?.off_rating),
    def_rating_delta: ratingDelta(rating.defRating, existingRatingMap.get(rating.team)?.def_rating),
    composite_delta: ratingDelta(rating.composite, existingRatingMap.get(rating.team)?.composite),
    games: rating.games,
    rush_off_rating: rating.rushOff,
    pass_off_rating: rating.passOff,
    rush_def_rating: rating.rushDef,
    pass_def_rating: rating.passDef,
    qb_rating: rating.qbRating,
    rb_rating: rating.rbRating,
    wr_rating: rating.wrRating,
    te_rating: rating.teRating,
    ol_rating: rating.olRating,
    dl_rating: rating.dlRating,
    lb_rating: rating.lbRating,
    cb_rating: rating.cbRating,
    s_rating: rating.sRating,
    k_rating: rating.kRating,
    p_rating: rating.pRating,
    source: 'app',
    synced_at: new Date().toISOString()
  }));

  if (rows.length) {
    await upsertRows(supabase, 'ratings', rows, 'season,team');
  }

  return { season, status: 'success', count: rows.length, coachDiagnostics };
}

function buildCoachDiagnostics(
  coachRows: Array<Record<string, unknown>>,
  talentScores: Record<string, number>,
  coachInfluence: CoachInfluence
) {
  const ratingTeams = new Set(Object.keys(talentScores));
  const matched = coachRows.filter((row) => ratingTeams.has(String(row.team)));
  const nonNeutral = matched.filter((row) =>
    numberOrNull(row.offense_rating) !== 5 ||
    numberOrNull(row.defense_rating) !== 5 ||
    String(row.development_rating || 'Average') !== 'Average'
  );

  return {
    coachRows: coachRows.length,
    matchedToRatingTeams: matched.length,
    nonNeutralMatched: nonNeutral.length,
    coachInfluence,
    sampleNonNeutral: nonNeutral.slice(0, 5).map((row) => ({
      team: row.team,
      offense_rating: row.offense_rating,
      defense_rating: row.defense_rating,
      development_rating: row.development_rating
    }))
  };
}

async function generatePredictions(season: number) {
  const supabase = getServiceSupabase();
  const cfbd = new CfbdClient();
  const ratings = await loadRatings(season);
  const config = await loadActiveModelConfig();
  const lineMap = await buildVegasLineMap(cfbd, season);

  const { data: games, error } = await supabase
    .from('games')
    .select('*')
    .eq('season', season)
    .order('week', { ascending: true });

  if (error) throw error;

  const rows = (games || [])
    .map((game) => {
      const home = ratings.get(String(game.home_team));
      const away = ratings.get(String(game.away_team));
      if (!home || !away) return null;

      const prediction = predictGame(home, away, config.weights, config.calibration);
      const vegasHomeSpread = lineMap.get(makeLineKey(game.season, game.week, game.home_team, game.away_team)) ?? null;
      const modelVegasDiff = vegasHomeSpread === null
        ? null
        : Math.abs(prediction.modelSpreadLine - vegasHomeSpread);
      const actualHomeMargin = game.home_points != null && game.away_points != null
        ? Number(game.home_points) - Number(game.away_points)
        : null;
      const vegasGrade = vegasHomeSpread !== null && actualHomeMargin !== null
        ? gradeModelVsVegas(game.home_team, game.away_team, vegasHomeSpread, prediction.modelSpreadLine, actualHomeMargin)
        : { pick: '', result: '', atsMargin: null };

      return {
        season: game.season,
        week: game.week,
        home_team: game.home_team,
        away_team: game.away_team,
        model_spread: prediction.modelSpread,
        model_home_margin: prediction.modelHomeMargin,
        predicted_favorite: prediction.predictedFavorite,
        predicted_margin: prediction.predictedMargin,
        pass_adv: prediction.passAdv,
        rush_adv: prediction.rushAdv,
        overall_adv: prediction.overallAdv,
        composite_adv: prediction.compositeAdv,
        vegas_spread: vegasHomeSpread === null ? null : formatVegasSpread(game.home_team, game.away_team, vegasHomeSpread),
        model_vegas_diff: modelVegasDiff === null ? null : round2(modelVegasDiff),
        model_vegas_pick: vegasGrade.pick,
        updated_at: new Date().toISOString()
      };
    })
    .filter((row): row is NonNullable<typeof row> => row !== null);

  if (rows.length) {
    await upsertRows(supabase, 'predictions', rows, 'season,week,home_team,away_team');
  }

  return { season, status: 'success', count: rows.length };
}

async function runBacktest(season: number, optimize = true) {
  const supabase = getServiceSupabase();
  const optimizationSeason = optimize ? await getLatestCompletedSeason() : null;
  const optimizerRows = optimize
    ? await runOptimizerThroughSeason(optimizationSeason ?? season)
    : { status: 'reused' as const, count: 0, best: null };
  const config = optimizerRows.best
    ? { weights: optimizerRows.best.weights, calibration: optimizerRows.best.calibration }
    : await loadActiveModelConfig();
  const games = await buildRatedGamesForSeason(season);
  const evaluated = evaluateRatedGames(games, config.weights, config.calibration).games;
  const gameRows = evaluated.map(mapBacktestGameRow);
  const summaryRows = buildBacktestSummaryRows(season, evaluated);

  if (gameRows.length) {
    await upsertRows(supabase, 'backtest_games', gameRows, 'season,week,home_team,away_team');
  }

  if (summaryRows.length) {
    await upsertRows(supabase, 'backtest_summary', summaryRows, 'season,week');
  }

  return {
    season,
    status: 'success',
    games: gameRows.length,
    summary: summaryRows.length,
    optimizedThrough: optimizationSeason,
    weightsUsed: config.weights,
    calibrationUsed: config.calibration,
    optimizer: optimizerRows
  };
}

function mapGameRow(game: CfbdGame) {
  return {
    cfbd_game_id: game.id,
    season: game.season,
    week: game.week,
    season_type: game.seasonType || 'regular',
    home_team: game.homeTeam,
    away_team: game.awayTeam,
    home_points: game.homePoints ?? null,
    away_points: game.awayPoints ?? null,
    start_date: game.startDate || null,
    neutral_site: Boolean(game.neutralSite),
    completed: game.homePoints != null && game.awayPoints != null,
    updated_at: new Date().toISOString()
  };
}

function mapTeamGameStatRow(stat: CfbdTeamGameStat, games: CfbdGame[], requestedSeason: number) {
  const matchingGame = games.find((game) => game.id === stat.gameId);
  return {
    cfbd_game_id: stat.gameId ?? matchingGame?.id ?? null,
    season: stat.season ?? matchingGame?.season ?? requestedSeason,
    week: stat.week ?? matchingGame?.week ?? null,
    team: stat.team,
    opponent: stat.opponent,
    is_home: matchingGame ? matchingGame.homeTeam === stat.team : null,
    ppa_off: numberOrNull(stat.offense?.ppa),
    ppa_def: numberOrNull(stat.defense?.ppa),
    success_off: numberOrNull(stat.offense?.successRate),
    success_def: numberOrNull(stat.defense?.successRate),
    pts_per_drive_off: numberOrNull(stat.offense?.pointsPerDrive),
    pts_per_drive_def: numberOrNull(stat.defense?.pointsPerDrive),
    rush_ppa_off: numberOrNull(stat.offense?.rushingPlays?.ppa),
    rush_ppa_def: numberOrNull(stat.defense?.rushingPlays?.ppa),
    pass_ppa_off: numberOrNull(stat.offense?.passingPlays?.ppa),
    pass_ppa_def: numberOrNull(stat.defense?.passingPlays?.ppa),
    rush_rate_off: deriveRushRate(stat.offense),
    pass_rate_off: derivePassRate(stat.offense),
    raw: stat,
    updated_at: new Date().toISOString()
  };
}

function uniqueWeeks(games: CfbdGame[]) {
  return [...new Set(games.map((game) => game.week).filter((week) => Number.isFinite(week)))].sort((a, b) => a - b);
}

function numberOrNull(value: unknown) {
  const numberValue = Number(value);
  return Number.isFinite(numberValue) ? numberValue : null;
}

function deriveRushRate(offense: Record<string, any> | undefined) {
  const rushTotal = numberOrNull(offense?.rushingPlays?.totalPPA);
  const passTotal = numberOrNull(offense?.passingPlays?.totalPPA);
  const rushPpa = numberOrNull(offense?.rushingPlays?.ppa);
  const passPpa = numberOrNull(offense?.passingPlays?.ppa);
  if (rushTotal === null || passTotal === null || rushPpa === null || passPpa === null || rushPpa === 0 || passPpa === 0) {
    return null;
  }
  const rushPlays = Math.abs(rushTotal / rushPpa);
  const passPlays = Math.abs(passTotal / passPpa);
  const total = rushPlays + passPlays;
  return total > 0 ? rushPlays / total : null;
}

function derivePassRate(offense: Record<string, any> | undefined) {
  const rushRate = deriveRushRate(offense);
  return rushRate === null ? null : 1 - rushRate;
}

function buildTalentScores(
  rows: Array<{ team: string; rating: number | string | null }>,
  season: number
) {
  const grouped = new Map<string, number[]>();
  for (const row of rows) {
    const rating = numberOrNull(row.rating);
    if (!row.team || rating === null) continue;
    if (!grouped.has(row.team)) grouped.set(row.team, []);
    grouped.get(row.team)!.push(rating);
  }

  return Object.fromEntries(
    [...grouped.entries()].map(([team, ratings]) => [team, computeOn3Composite(ratings, season)])
  );
}

function mapRawStatRow(row: Record<string, any>): RawTeamGameStat {
  return {
    season: Number(row.season),
    week: Number(row.week),
    team: String(row.team),
    opponent: String(row.opponent),
    ppa_off: numberOrNull(row.ppa_off),
    ppa_def: numberOrNull(row.ppa_def),
    success_off: numberOrNull(row.success_off),
    success_def: numberOrNull(row.success_def),
    pts_per_drive_off: numberOrNull(row.pts_per_drive_off),
    pts_per_drive_def: numberOrNull(row.pts_per_drive_def),
    rush_ppa_off: numberOrNull(row.rush_ppa_off),
    rush_ppa_def: numberOrNull(row.rush_ppa_def),
    pass_ppa_off: numberOrNull(row.pass_ppa_off),
    pass_ppa_def: numberOrNull(row.pass_ppa_def),
    rush_rate_off: numberOrNull(row.rush_rate_off),
    pass_rate_off: numberOrNull(row.pass_rate_off)
  };
}

function buildCoachInfluenceCandidates(current: CoachInfluence) {
  const candidates: CoachInfluence[] = [
    current,
    { offenseBoost: 0.25, defenseBoost: 0.25, developmentBoost: 0.5 },
    { offenseBoost: 0.6, defenseBoost: 0.6, developmentBoost: 1.0 },
    { offenseBoost: 1.0, defenseBoost: 1.0, developmentBoost: 1.5 }
  ];
  const seen = new Set<string>();
  return candidates.filter((candidate) => {
    const key = `${candidate.offenseBoost}:${candidate.defenseBoost}:${candidate.developmentBoost}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function uniqueNumbers(values: number[]) {
  return [...new Set(values.map((value) => Math.round(Number(value))).filter((value) => Number.isFinite(value) && value > 0))];
}

async function loadCoachRows() {
  const supabase = getServiceSupabase();
  const { data, error } = await supabase
    .from('coach_configs')
    .select('team,coach_name,hire_year,offense_rating,defense_rating,development_rating');
  if (error) throw error;
  return data || [];
}

function applyCoachInfluenceToRatedGames(
  games: RatedGame[],
  coachRows: any[],
  currentInfluence: CoachInfluence,
  candidateInfluence: CoachInfluence
) {
  const coachMap = new Map(coachRows.map((row) => [String(row.team), row]));
  return games.map((game) => ({
    ...game,
    home: applyCoachInfluenceToRating(game.home, game.season, coachMap.get(game.home.team), currentInfluence, candidateInfluence),
    away: applyCoachInfluenceToRating(game.away, game.season, coachMap.get(game.away.team), currentInfluence, candidateInfluence)
  }));
}

function applyCoachInfluenceToRating(
  rating: Rating,
  season: number,
  coachRow: any,
  currentInfluence: CoachInfluence,
  candidateInfluence: CoachInfluence
): Rating {
  if (!coachRow) return rating;
  const hireYear = numberOrNull(coachRow.hire_year) ?? 0;
  if (hireYear > season) return rating;

  const offenseRating = numberOrNull(coachRow.offense_rating) ?? 5.5;
  const defenseRating = numberOrNull(coachRow.defense_rating) ?? 5.5;
  const developmentRating = String(coachRow.development_rating || 'Average');
  const offenseDelta = (offenseRating - 5.5) * (candidateInfluence.offenseBoost - currentInfluence.offenseBoost);
  const defenseDelta = (defenseRating - 5.5) * (candidateInfluence.defenseBoost - currentInfluence.defenseBoost);
  const developmentDelta = developmentScore(developmentRating) * (candidateInfluence.developmentBoost - currentInfluence.developmentBoost);
  const offRating = clampModelRating((rating.offRating || 0) + offenseDelta);
  const defRating = clampModelRating((rating.defRating || 0) + defenseDelta);

  return {
    ...rating,
    offRating,
    defRating,
    rushOff: clampModelRating((rating.rushOff || 0) + offenseDelta),
    passOff: clampModelRating((rating.passOff || 0) + offenseDelta),
    rushDef: clampModelRating((rating.rushDef || 0) + defenseDelta),
    passDef: clampModelRating((rating.passDef || 0) + defenseDelta),
    composite: clampModelRating((rating.composite || 0) + (offenseDelta + defenseDelta) / 2 + developmentDelta)
  };
}

function optimizeRampWeeksForHoldout(
  season: number,
  ratingFormula: RatingFormula,
  games: RatedGame[],
  weights: ModelWeights,
  calibration: ModelCalibration
) {
  const holdoutGames = games.filter((game) => game.season === season);
  const early = evaluateRatedGames(holdoutGames.filter((game) => game.week <= 4), weights, calibration).summary;
  const middle = evaluateRatedGames(holdoutGames.filter((game) => game.week > 4 && game.week <= 9), weights, calibration).summary;
  const late = evaluateRatedGames(holdoutGames.filter((game) => game.week > 9), weights, calibration).summary;
  const currentRamp = Math.round(ratingFormula.talentRampWeeks || 8);

  if (!early.games || !late.games) return currentRamp;
  if (early.modelScore > late.modelScore + 1.5) return Math.max(currentRamp, 10);
  if (late.modelScore > middle.modelScore + 1.5) return Math.min(currentRamp, 6);
  return currentRamp;
}

export async function runFullOptimizerThroughSeason(season: number) {
  const supabase = getServiceSupabase();
  const currentConfig = await loadActiveModelConfig();
  const coachOptions = buildCoachInfluenceCandidates(currentConfig.coachInfluence);
  const rampOptions = uniqueNumbers([currentConfig.ratingFormula.talentRampWeeks, 4, 6, 8, 10, 12]);
  const seasons = [...new Set([2022, 2023, 2024, 2025, season])].filter((s) => s <= season);
  const allResults: Array<{
    row: ReturnType<typeof optimizeWeights>[number];
    coachInfluence: CoachInfluence;
    ratingFormula: RatingFormula;
  }> = [];

  for (const coachInfluence of coachOptions) {
    for (const rampWeeks of rampOptions) {
      const ratingFormula = {
        ...currentConfig.ratingFormula,
        talentRampWeeks: rampWeeks
      };
      const ratedGames: RatedGame[] = [];

      for (const s of seasons) {
        ratedGames.push(...await buildRatedGamesForSeason(s, {
          dynamicRatings: true,
          ratingFormula,
          coachInfluence,
          includeVegasLines: false
        }));
      }

      const candidateResults = optimizeWeights(ratedGames);
      const candidateBest = candidateResults[0];
      if (!candidateBest) continue;
      allResults.push(...candidateResults.slice(0, 50).map((row) => ({
        row,
        coachInfluence,
        ratingFormula
      })));
      console.log(JSON.stringify({
        coachInfluence,
        rampWeeks,
        games: ratedGames.length,
        finalScore: round2(candidateBest.finalScore)
      }));
    }
  }

  allResults.sort((a, b) =>
    a.row.finalScore - b.row.finalScore ||
    a.row.holdoutScore - b.row.holdoutScore ||
    a.row.allScore - b.row.allScore ||
    a.row.stabilityPenalty - b.row.stabilityPenalty ||
    a.row.holdoutAvgError - b.row.holdoutAvgError ||
    a.row.holdoutRmse - b.row.holdoutRmse
  );

  const results = allResults.slice(0, 250);
  if (!results.length) return { status: 'skipped' as const, count: 0, best: null };

  const rows = results.map(({ row, coachInfluence, ratingFormula }, index) => ({
    rank: index + 1,
    use_this: index === 0 ? 'BEST' : '',
    pass_weight: row.weights.pass,
    rush_weight: row.weights.rush,
    overall_weight: row.weights.overall,
    composite_weight: row.weights.composite,
    points_per_rating: row.calibration.pointsPerRating,
    home_field: row.calibration.homeField,
    margin_shrink: row.calibration.marginShrink,
    max_margin: row.calibration.maxMargin,
    coach_offense_boost: coachInfluence.offenseBoost,
    coach_defense_boost: coachInfluence.defenseBoost,
    coach_development_boost: coachInfluence.developmentBoost,
    rating_talent_ramp_weeks: ratingFormula.talentRampWeeks,
    train_score: round2(row.trainScore),
    holdout_score: round2(row.holdoutScore),
    all_score: round2(row.allScore),
    stability_penalty: round2(row.stabilityPenalty),
    final_score: round2(row.finalScore),
    synced_at: new Date().toISOString()
  }));

  await upsertRows(supabase, 'weight_optimizer', rows, 'rank');
  const best = results[0];
  await activateOptimizedConfig(
    supabase,
    season,
    best.row.weights,
    best.row.calibration,
    best.coachInfluence,
    best.ratingFormula
  );

  return {
    status: 'success' as const,
    count: rows.length,
    best: {
      weights: best.row.weights,
      calibration: best.row.calibration,
      coachInfluence: best.coachInfluence,
      ratingFormula: best.ratingFormula,
      finalScore: round2(best.row.finalScore)
    }
  };
}

function developmentScore(value: string) {
  switch (value) {
    case 'Elite':
      return 2;
    case 'Good':
      return 1;
    case 'Poor':
      return -1;
    case 'Terrible':
      return -2;
    default:
      return 0;
  }
}

function clampModelRating(value: number) {
  return Math.max(0, Math.min(100, round2(value)));
}

async function runOptimizerThroughSeason(season: number) {
  const supabase = getServiceSupabase();
  const currentConfig = await loadActiveModelConfig();
  const ratedGames: RatedGame[] = [];
  const coachRows = await loadCoachRows();
  const coachOptions = buildCoachInfluenceCandidates(currentConfig.coachInfluence);
  let selectedCoachInfluence = currentConfig.coachInfluence;
  let selectedCoachGames: RatedGame[] = ratedGames;
  let selectedCoachScore = Infinity;

  for (const s of [...new Set([2022, 2023, 2024, 2025, season])]) {
    if (s > season) continue;
    ratedGames.push(...await buildRatedGamesForSeason(s, { includeVegasLines: false }));
  }

  for (const coachInfluence of coachOptions) {
    const adjustedGames = applyCoachInfluenceToRatedGames(
      ratedGames,
      coachRows,
      currentConfig.coachInfluence,
      coachInfluence
    );
    const score = evaluateRatedGames(adjustedGames, currentConfig.weights, currentConfig.calibration).summary.modelScore;
    if (score < selectedCoachScore) {
      selectedCoachScore = score;
      selectedCoachGames = adjustedGames;
      selectedCoachInfluence = coachInfluence;
    }
  }

  const selectedResults = optimizeWeights(selectedCoachGames);
  const bestCandidate = selectedResults[0];
  const selectedRampWeeks = bestCandidate
    ? optimizeRampWeeksForHoldout(
      season,
      currentConfig.ratingFormula,
      selectedCoachGames,
      bestCandidate.weights,
      bestCandidate.calibration
    )
    : currentConfig.ratingFormula.talentRampWeeks;
  const selectedRatingFormula = {
    ...currentConfig.ratingFormula,
    talentRampWeeks: selectedRampWeeks
  };
  const results = selectedResults.slice(0, 250);
  if (!results.length) return { status: 'skipped' as const, count: 0, best: null };

  const rows = results.map((row) => ({
    rank: row.rank,
    use_this: row.useThis,
    pass_weight: row.weights.pass,
    rush_weight: row.weights.rush,
    overall_weight: row.weights.overall,
    composite_weight: row.weights.composite,
    points_per_rating: row.calibration.pointsPerRating,
    home_field: row.calibration.homeField,
    margin_shrink: row.calibration.marginShrink,
    max_margin: row.calibration.maxMargin,
    coach_offense_boost: selectedCoachInfluence.offenseBoost,
    coach_defense_boost: selectedCoachInfluence.defenseBoost,
    coach_development_boost: selectedCoachInfluence.developmentBoost,
    rating_talent_ramp_weeks: selectedRampWeeks,
    train_score: round2(row.trainScore),
    holdout_score: round2(row.holdoutScore),
    all_score: round2(row.allScore),
    stability_penalty: round2(row.stabilityPenalty),
    final_score: round2(row.finalScore),
    synced_at: new Date().toISOString()
  }));

  await upsertRows(supabase, 'weight_optimizer', rows, 'rank');
  const best = results[0];
  await activateOptimizedConfig(supabase, season, best.weights, best.calibration, selectedCoachInfluence, selectedRatingFormula);
  return {
    status: 'success' as const,
    count: rows.length,
    best: {
      weights: best.weights,
      calibration: best.calibration,
      coachInfluence: selectedCoachInfluence,
      ratingFormula: selectedRatingFormula,
      finalScore: round2(best.finalScore)
    }
  };
}

async function getLatestCompletedSeason() {
  const supabase = getServiceSupabase();
  const { data, error } = await supabase
    .from('games')
    .select('season')
    .eq('completed', true)
    .order('season', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) throw error;
  return data ? Number(data.season) : null;
}

async function activateOptimizedConfig(
  supabase: ReturnType<typeof getServiceSupabase>,
  season: number,
  weights: ModelWeights,
  calibration: ModelCalibration,
  coachInfluence: CoachInfluence,
  ratingFormula: RatingFormula
) {
  const { error: deactivateError } = await supabase
    .from('model_configs')
    .update({ is_active: false, updated_at: new Date().toISOString() })
    .eq('is_active', true);
  if (deactivateError) throw deactivateError;

  const { error: activateError } = await supabase
    .from('model_configs')
    .upsert({
      name: `optimized-through-${season}`,
      pass_weight: weights.pass,
      rush_weight: weights.rush,
      overall_weight: weights.overall,
      composite_weight: weights.composite,
      points_per_rating: calibration.pointsPerRating,
      home_field: calibration.homeField,
      margin_shrink: calibration.marginShrink,
      max_margin: calibration.maxMargin,
      coach_offense_boost: coachInfluence.offenseBoost,
      coach_defense_boost: coachInfluence.defenseBoost,
      coach_development_boost: coachInfluence.developmentBoost,
      rating_recency_weight: ratingFormula.recencyWeight,
      rating_talent_weight: ratingFormula.talentWeight,
      rating_historical_position_weight: ratingFormula.historicalPositionTalentWeight,
      rating_preseason_position_weight: ratingFormula.preseasonPositionTalentWeight,
      rating_talent_ramp_weeks: ratingFormula.talentRampWeeks,
      is_active: true,
      updated_at: new Date().toISOString()
    }, { onConflict: 'name' });
  if (activateError) throw activateError;
}

type RatedGameBuildOptions = {
  dynamicRatings?: boolean;
  ratingFormula?: RatingFormula;
  coachInfluence?: CoachInfluence;
  includeVegasLines?: boolean;
  ratingWeeks?: number[];
};

async function buildRatedGamesForSeason(season: number, options: RatedGameBuildOptions = {}): Promise<RatedGame[]> {
  const supabase = getServiceSupabase();
  const storedRatings = options.dynamicRatings ? null : await loadRatings(season);
  const activeConfig = options.dynamicRatings ? await loadActiveModelConfig() : null;
  const lineMap = options.includeVegasLines === false
    ? new Map<string, number>()
    : await getCachedVegasLineMap(new CfbdClient(), season);
  const { data: games, error } = await supabase
    .from('games')
    .select('*')
    .eq('season', season)
    .not('home_points', 'is', null)
    .not('away_points', 'is', null);

  if (error) throw error;

  const weeklyRatings = options.dynamicRatings && activeConfig
    ? await buildWeeklyRatingMaps(
      season,
      options.ratingFormula || activeConfig.ratingFormula,
      options.coachInfluence || activeConfig.coachInfluence,
      options.ratingWeeks
    )
    : null;

  return (games || [])
    .map((game): RatedGame | null => {
      const ratings = weeklyRatings?.get(Number(game.week)) || storedRatings;
      if (!ratings) return null;
      const home = ratings.get(String(game.home_team));
      const away = ratings.get(String(game.away_team));
      if (!home || !away) return null;
      return {
        season: Number(game.season),
        week: Number(game.week),
        homeTeam: String(game.home_team),
        awayTeam: String(game.away_team),
        home,
        away,
        homePoints: Number(game.home_points),
        awayPoints: Number(game.away_points),
        vegasHomeSpread: lineMap.get(makeLineKey(game.season, game.week, game.home_team, game.away_team)) ?? null
      };
    })
    .filter((game): game is RatedGame => game !== null);
}

async function buildWeeklyRatingMaps(
  season: number,
  ratingFormula: RatingFormula,
  coachInfluence: CoachInfluence,
  ratingWeeks?: number[]
) {
  const { rawStats, rosterRows, coachRows, talentScores } = await getWeeklyRatingSource(season);
  const allowedWeeks = ratingWeeks?.length ? new Set(ratingWeeks.map(Number)) : null;
  const weeks = [...new Set(rawStats.filter((row) => row.season === season).map((row) => row.week))]
    .filter((week) => Number.isFinite(week))
    .filter((week) => !allowedWeeks || allowedWeeks.has(Number(week)))
    .sort((a, b) => a - b);
  const ratingMaps = new Map<number, Map<string, Rating>>();

  for (const week of weeks) {
    const availableStats = rawStats.filter((row) =>
      row.season < season || (row.season === season && row.week < week)
    );
    const ratings = calculateTeamRatings(availableStats, talentScores, {
      season,
      recencyWeight: ratingFormula.recencyWeight,
      iterations: 20,
      talentWeight: ratingFormula.talentWeight,
      requireTalent: season >= 2026,
      rosterPlayers: rosterRows,
      historicalPositionTalentWeight: ratingFormula.historicalPositionTalentWeight,
      preseasonPositionTalentWeight: ratingFormula.preseasonPositionTalentWeight,
      talentRampWeeks: ratingFormula.talentRampWeeks,
      ratingEvaluationWeek: week,
      coachInfluence,
      coaches: coachRows
    });
    if (ratings.length) {
      ratingMaps.set(week, new Map(ratings.map((rating) => [rating.team, rating])));
    }
  }

  return ratingMaps;
}

async function getCachedVegasLineMap(cfbd: CfbdClient, season: number) {
  const existing = vegasLineCache.get(season);
  if (existing) return existing;
  const promise = buildVegasLineMap(cfbd, season);
  vegasLineCache.set(season, promise);
  return promise;
}

async function getWeeklyRatingSource(season: number) {
  const existing = weeklyRatingSourceCache.get(season);
  if (existing) return existing;

  const promise = loadWeeklyRatingSource(season);
  weeklyRatingSourceCache.set(season, promise);
  return promise;
}

async function loadWeeklyRatingSource(season: number): Promise<WeeklyRatingSource> {
  const supabase = getServiceSupabase();
  const statRows: any[] = [];
  const rosterRows: any[] = [];
  const pageSize = 1000;

  for (let from = 0; ; from += pageSize) {
    const { data, error } = await supabase
      .from('team_game_stats')
      .select('*')
      .lte('season', season)
      .order('season', { ascending: true })
      .order('team', { ascending: true })
      .order('week', { ascending: true })
      .range(from, from + pageSize - 1);

    if (error) throw error;
    statRows.push(...(data || []));
    if (!data || data.length < pageSize) break;
  }

  for (let from = 0; ; from += pageSize) {
    const { data, error } = await supabase
      .from('roster_players')
      .select('season,team,player_name,position,rating,source')
      .eq('season', season)
      .order('team', { ascending: true })
      .order('player_name', { ascending: true })
      .range(from, from + pageSize - 1);

    if (error) throw error;
    rosterRows.push(...(data || []));
    if (!data || data.length < pageSize) break;
  }

  const { data: coachRows, error: coachError } = await supabase
    .from('coach_configs')
    .select('team,coach_name,hire_year,offense_rating,defense_rating,development_rating');
  if (coachError) throw coachError;

  return {
    rawStats: statRows.map(mapRawStatRow),
    rosterRows,
    coachRows: coachRows || [],
    talentScores: buildTalentScores(rosterRows, season)
  };
}

async function loadRatings(season: number) {
  const supabase = getServiceSupabase();
  const { data, error } = await supabase
    .from('ratings')
    .select('*')
    .eq('season', season);

  if (error) throw error;

  return new Map(
    (data || []).map((row) => [
      String(row.team),
      {
        team: String(row.team),
        composite: numberOrNull(row.composite) ?? 75,
        offRating: numberOrNull(row.off_rating) ?? 75,
        defRating: numberOrNull(row.def_rating) ?? 75,
        rushOff: numberOrNull(row.rush_off_rating) ?? numberOrNull(row.off_rating) ?? 75,
        passOff: numberOrNull(row.pass_off_rating) ?? numberOrNull(row.off_rating) ?? 75,
        rushDef: numberOrNull(row.rush_def_rating) ?? numberOrNull(row.def_rating) ?? 75,
        passDef: numberOrNull(row.pass_def_rating) ?? numberOrNull(row.def_rating) ?? 75,
        qbRating: numberOrNull(row.qb_rating),
        rbRating: numberOrNull(row.rb_rating),
        wrRating: numberOrNull(row.wr_rating),
        teRating: numberOrNull(row.te_rating),
        olRating: numberOrNull(row.ol_rating),
        dlRating: numberOrNull(row.dl_rating),
        lbRating: numberOrNull(row.lb_rating),
        cbRating: numberOrNull(row.cb_rating),
        sRating: numberOrNull(row.s_rating),
        kRating: numberOrNull(row.k_rating),
        pRating: numberOrNull(row.p_rating),
        passRate: 0.5,
        games: numberOrNull(row.games)
      } satisfies Rating
    ])
  );
}

async function loadActiveModelConfig(): Promise<{ weights: ModelWeights; calibration: ModelCalibration; coachInfluence: CoachInfluence; ratingFormula: RatingFormula }> {
  const supabase = getServiceSupabase();
  const { data, error } = await supabase
    .from('model_configs')
    .select('*')
    .eq('is_active', true)
    .limit(1)
    .maybeSingle();

  if (error) throw error;
  if (!data) return {
    weights: DEFAULT_WEIGHTS,
    calibration: DEFAULT_CALIBRATION,
    coachInfluence: {
      offenseBoost: 0.6,
      defenseBoost: 0.6,
      developmentBoost: 1.0
    },
    ratingFormula: {
      recencyWeight: 2.5,
      talentWeight: 0.4,
      historicalPositionTalentWeight: 0.3,
      preseasonPositionTalentWeight: 0.7,
      talentRampWeeks: 8
    }
  };

  return {
    weights: {
      pass: numberOrNull(data.pass_weight) ?? DEFAULT_WEIGHTS.pass,
      rush: numberOrNull(data.rush_weight) ?? DEFAULT_WEIGHTS.rush,
      overall: numberOrNull(data.overall_weight) ?? DEFAULT_WEIGHTS.overall,
      composite: numberOrNull(data.composite_weight) ?? DEFAULT_WEIGHTS.composite
    },
    calibration: {
      pointsPerRating: numberOrNull(data.points_per_rating) ?? DEFAULT_CALIBRATION.pointsPerRating,
      homeField: numberOrNull(data.home_field) ?? DEFAULT_CALIBRATION.homeField,
      marginShrink: numberOrNull(data.margin_shrink) ?? DEFAULT_CALIBRATION.marginShrink,
      maxMargin: numberOrNull(data.max_margin) ?? DEFAULT_CALIBRATION.maxMargin
    },
    coachInfluence: {
      offenseBoost: numberOrNull(data.coach_offense_boost) ?? 0.6,
      defenseBoost: numberOrNull(data.coach_defense_boost) ?? 0.6,
      developmentBoost: numberOrNull(data.coach_development_boost) ?? 1.0
    },
    ratingFormula: {
      recencyWeight: numberOrNull(data.rating_recency_weight) ?? 2.5,
      talentWeight: numberOrNull(data.rating_talent_weight) ?? 0.4,
      historicalPositionTalentWeight: numberOrNull(data.rating_historical_position_weight) ?? 0.3,
      preseasonPositionTalentWeight: numberOrNull(data.rating_preseason_position_weight) ?? 0.7,
      talentRampWeeks: numberOrNull(data.rating_talent_ramp_weeks) ?? 8
    }
  };
}

async function buildVegasLineMap(cfbd: CfbdClient, season: number) {
  const lines = [
    ...await cfbd.getBettingLines(season, 'regular'),
    ...await cfbd.getBettingLines(season, 'postseason')
  ];
  const map = new Map<string, number>();
  for (const game of lines) {
    const spread = pickVegasSpread(game.lines || []);
    if (spread === null || !game.homeTeam || !game.awayTeam || !game.week) continue;
    map.set(makeLineKey(season, game.week, game.homeTeam, game.awayTeam), spread);
  }
  return map;
}

function pickVegasSpread(lines: Array<{ provider?: string; spread?: number | null }>) {
  const preferred = lines.find((line) => /consensus|average/i.test(line.provider || '') && Number.isFinite(Number(line.spread)));
  const fallback = preferred || lines.find((line) => Number.isFinite(Number(line.spread)));
  return fallback ? Number(fallback.spread) : null;
}

function makeLineKey(season: number, week: number, homeTeam: string, awayTeam: string) {
  return `${season}|${week}|${homeTeam}|${awayTeam}`.toLowerCase();
}

function formatVegasSpread(homeTeam: string, awayTeam: string, homeSpread: number) {
  if (homeSpread === 0) return "Pick'em";
  const favorite = homeSpread < 0 ? homeTeam : awayTeam;
  return `${favorite} ${formatSignedSpread(homeSpread < 0 ? homeSpread : -homeSpread)}`;
}

function mapBacktestGameRow(game: EvaluatedGame) {
  const vegasGrade = game.vegasHomeSpread === null
    ? { pick: '', result: '', atsMargin: null }
    : gradeModelVsVegas(game.homeTeam, game.awayTeam, game.vegasHomeSpread, game.modelHomeSpread, game.actualHomeMargin);
  const actualResult = game.actualWinner === 'TIE'
    ? 'TIE'
    : `${game.actualWinner} by ${game.actualWinMargin}`;

  return {
    season: game.season,
    week: game.week,
    home_team: game.homeTeam,
    away_team: game.awayTeam,
    vegas_spread: game.vegasHomeSpread === null ? null : formatVegasSpread(game.homeTeam, game.awayTeam, game.vegasHomeSpread),
    model_spread: game.modelHomeMargin === 0 ? "Pick'em" : `${game.predictedWinner} -${Math.abs(game.modelHomeMargin).toFixed(1)}`,
    model_vegas_diff: game.modelVegasDiff,
    model_vegas_pick: vegasGrade.pick,
    model_vegas_result: vegasGrade.result,
    model_vegas_ats_margin: vegasGrade.atsMargin,
    home_pts: game.homePoints,
    away_pts: game.awayPoints,
    home_margin: game.actualHomeMargin,
    actual_result: actualResult,
    predicted_favorite: game.predictedWinner,
    predicted_margin: game.predictedMargin,
    model_home_margin: game.modelHomeMargin,
    actual_winner: game.actualWinner,
    actual_win_margin: game.actualWinMargin,
    margin_error: game.marginError,
    error_bucket: game.marginError <= 3 ? 'Within 3' : game.marginError <= 7 ? 'Within 7' : game.marginError <= 10 ? 'Within 10' : 'Missed by 10+',
    pick_result: game.pickCorrect ? 'CORRECT' : 'WRONG',
    synced_at: new Date().toISOString()
  };
}

function buildBacktestSummaryRows(season: number, games: EvaluatedGame[]) {
  const rows = [...new Set(games.map((game) => game.week))]
    .sort((a, b) => a - b)
    .map((week) => buildSummaryRow(String(season), String(week), games.filter((game) => game.week === week)));

  if (games.length) {
    rows.push(buildSummaryRow(String(season), `${season} TOTAL`, games));
  }
  return rows;
}

function buildSummaryRow(season: string, week: string, games: EvaluatedGame[]) {
  const summary = summarizeEvaluatedGames(games);
  const vegasGrades = games
    .filter((game) => game.vegasHomeSpread !== null)
    .map((game) => gradeModelVsVegas(game.homeTeam, game.awayTeam, game.vegasHomeSpread!, game.modelHomeSpread, game.actualHomeMargin));
  const wins = vegasGrades.filter((grade) => grade.result === 'WIN').length;
  const losses = vegasGrades.filter((grade) => grade.result === 'LOSS').length;
  const pushes = vegasGrades.filter((grade) => grade.result === 'PUSH').length;

  return {
    season,
    week,
    games: summary.games,
    picks_correct: summary.pickCorrect,
    picks_wrong: summary.games - summary.pickCorrect,
    pick_pct: summary.pickPct,
    avg_margin_error: summary.avgMarginError,
    median_margin_error: summary.medianMarginError,
    vegas_edge_plays: wins + losses + pushes,
    vegas_edge_wins: wins,
    vegas_edge_losses: losses,
    vegas_edge_pushes: pushes,
    vegas_edge_win_pct: wins + losses + pushes ? round2((wins / (wins + losses + pushes)) * 100) : null,
    synced_at: new Date().toISOString()
  };
}

function round2(value: number) {
  return Math.round(value * 100) / 100;
}

function ratingDelta(nextValue: unknown, previousValue: unknown) {
  const next = numberOrNull(nextValue);
  const previous = numberOrNull(previousValue);
  if (next === null || previous === null) return null;
  const delta = round2(next - previous);
  return Math.abs(delta) < 0.01 ? 0 : delta;
}

async function upsertRows(
  supabase: ReturnType<typeof getServiceSupabase>,
  table: string,
  rows: Record<string, unknown>[],
  onConflict: string,
  chunkSize = 500
) {
  for (let i = 0; i < rows.length; i += chunkSize) {
    const chunk = rows.slice(i, i + chunkSize);
    const { error } = await supabase
      .from(table)
      .upsert(chunk, { onConflict });
    if (error) {
      throw new Error(`${table} upsert failed: ${errorMessage(error)}`);
    }
  }
}

function errorMessage(error: unknown) {
  if (error instanceof Error) return error.message;
  if (error && typeof error === 'object') {
    const record = error as Record<string, unknown>;
    const message = record.message || record.error || record.details || record.hint || record.code;
    if (message) return String(message);
    try {
      return JSON.stringify(record);
    } catch {
      return String(error);
    }
  }
  return String(error);
}
