import { getServiceSupabase } from '../db/client';
import { CfbdClient, type CfbdGame, type CfbdTeamGameStat } from '../data/cfbd';
import { computeOn3Composite, fetchOn3Roster } from '../data/on3';
import { evaluateRatedGames, summarizeEvaluatedGames, type EvaluatedGame, type RatedGame } from '../model/evaluate';
import { optimizeWeights } from '../model/optimizer';
import { DEFAULT_CALIBRATION, DEFAULT_WEIGHTS, formatSignedSpread, gradeModelVsVegas, predictGame } from '../model/predict';
import { calculateTeamRatings, type RawTeamGameStat } from '../model/ratings';
import type { ModelCalibration, ModelWeights, Rating } from '../model/types';

type UpdateOptions = {
  season: number;
  includeBacktest?: boolean;
};

export async function runModelUpdate(options: UpdateOptions) {
  const supabase = getServiceSupabase();
  const startedAt = new Date().toISOString();
  const jobName = `model-update-${options.season}`;

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
    const result = {
      teams: await fetchTeams(options.season),
      games: await fetchGames(options.season),
      stats: await fetchTeamGameStats(options.season),
      rosters: await fetchRosters(options.season),
      ratings: await calculateRatings(options.season),
      predictions: await generatePredictions(options.season),
      backtest: options.includeBacktest ? await runBacktest(options.season) : null
    };

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
        message: error instanceof Error ? error.message : String(error),
        finished_at: new Date().toISOString()
      })
      .eq('id', run.id);
    throw error;
  }
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

  const { error } = await supabase
    .from('teams')
    .upsert(rows, { onConflict: 'school' });

  if (error) throw error;
  return { season, status: 'success', count: rows.length };
}

async function fetchGames(season: number) {
  const supabase = getServiceSupabase();
  const cfbd = new CfbdClient();
  const games = await cfbd.getSeasonGamesAndPostseason(season);
  const rows = games
    .filter((game) => game.homeTeam && game.awayTeam)
    .map(mapGameRow);

  const { error } = await supabase
    .from('games')
    .upsert(rows, { onConflict: 'cfbd_game_id' });

  if (error) throw error;
  return { season, status: 'success', count: rows.length };
}

async function fetchTeamGameStats(season: number) {
  const supabase = getServiceSupabase();
  const cfbd = new CfbdClient();
  const games = await cfbd.getSeasonGamesAndPostseason(season);
  const regularWeeks = uniqueWeeks(games.filter((game) => game.seasonType !== 'postseason'));
  const postseasonWeeks = uniqueWeeks(games.filter((game) => game.seasonType === 'postseason'));
  const rows: ReturnType<typeof mapTeamGameStatRow>[] = [];

  for (const week of regularWeeks) {
    const stats = await cfbd.getTeamGameStats(season, 'regular', week);
    rows.push(...stats.map((stat) => mapTeamGameStatRow(stat, games)));
  }

  for (const week of postseasonWeeks) {
    const stats = await cfbd.getTeamGameStats(season, 'postseason', week);
    rows.push(...stats.map((stat) => mapTeamGameStatRow(stat, games)));
  }

  const { error } = await supabase
    .from('team_game_stats')
    .upsert(rows, { onConflict: 'season,week,team,opponent' });

  if (error) throw error;
  return { season, status: 'success', count: rows.length };
}

async function fetchRosters(season: number) {
  const supabase = getServiceSupabase();
  const { data: sources, error } = await supabase
    .from('on3_roster_sources')
    .select('season,team,url')
    .eq('season', season)
    .eq('enabled', true);

  if (error) throw error;
  if (!sources?.length) {
    return { season, status: 'skipped', reason: 'No enabled On3 roster sources found', count: 0 };
  }

  let playerCount = 0;
  for (const source of sources) {
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
    const { error: upsertError } = await supabase
      .from('roster_players')
      .upsert(rows, { onConflict: 'season,team,player_name,position' });

    if (upsertError) throw upsertError;
    playerCount += rows.length;
  }

  return { season, status: 'success', teams: sources.length, count: playerCount };
}

async function calculateRatings(season: number) {
  const supabase = getServiceSupabase();
  const { data: statRows, error: statError } = await supabase
    .from('team_game_stats')
    .select('*')
    .lte('season', season);

  if (statError) throw statError;

  const { data: rosterRows, error: rosterError } = await supabase
    .from('roster_players')
    .select('season,team,player_name,position,rating,source')
    .eq('season', season);

  if (rosterError) throw rosterError;

  const talentScores = buildTalentScores(rosterRows || [], season);
  const ratings = calculateTeamRatings(
    (statRows || []).map(mapRawStatRow),
    talentScores,
    {
      season,
      recencyWeight: 2.5,
      iterations: 20,
      talentWeight: 0.4
    }
  );

  const rows = ratings.map((rating) => ({
    season,
    team: rating.team,
    off_rating: rating.offRating,
    def_rating: rating.defRating,
    composite: rating.composite,
    games: rating.games,
    rush_off_rating: rating.rushOff,
    pass_off_rating: rating.passOff,
    rush_def_rating: rating.rushDef,
    pass_def_rating: rating.passDef,
    source: 'app',
    synced_at: new Date().toISOString()
  }));

  if (rows.length) {
    const { error } = await supabase
      .from('ratings')
      .upsert(rows, { onConflict: 'season,team' });

    if (error) throw error;
  }

  return { season, status: 'success', count: rows.length };
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
    const { error: upsertError } = await supabase
      .from('predictions')
      .upsert(rows, { onConflict: 'season,week,home_team,away_team' });

    if (upsertError) throw upsertError;
  }

  return { season, status: 'success', count: rows.length };
}

async function runBacktest(season: number) {
  const supabase = getServiceSupabase();
  const config = await loadActiveModelConfig();
  const games = await buildRatedGamesForSeason(season);
  const evaluated = evaluateRatedGames(games, config.weights, config.calibration).games;
  const gameRows = evaluated.map(mapBacktestGameRow);
  const summaryRows = buildBacktestSummaryRows(season, evaluated);

  if (gameRows.length) {
    const { error } = await supabase
      .from('backtest_games')
      .upsert(gameRows, { onConflict: 'season,week,home_team,away_team' });
    if (error) throw error;
  }

  if (summaryRows.length) {
    const { error } = await supabase
      .from('backtest_summary')
      .upsert(summaryRows, { onConflict: 'season,week' });
    if (error) throw error;
  }

  const optimizerRows = await runOptimizerThroughSeason(season);
  return {
    season,
    status: 'success',
    games: gameRows.length,
    summary: summaryRows.length,
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

function mapTeamGameStatRow(stat: CfbdTeamGameStat, games: CfbdGame[]) {
  const matchingGame = games.find((game) => game.id === stat.gameId);
  return {
    cfbd_game_id: stat.gameId,
    season: stat.season,
    week: stat.week,
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

async function runOptimizerThroughSeason(season: number) {
  const supabase = getServiceSupabase();
  const ratedGames: RatedGame[] = [];
  for (const s of [...new Set([2022, 2023, 2024, 2025, season])]) {
    if (s > season) continue;
    ratedGames.push(...await buildRatedGamesForSeason(s));
  }

  const results = optimizeWeights(ratedGames).slice(0, 250);
  if (!results.length) return { status: 'skipped', count: 0 };

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
    train_score: round2(row.trainScore),
    holdout_score: round2(row.holdoutScore),
    all_score: round2(row.allScore),
    stability_penalty: round2(row.stabilityPenalty),
    final_score: round2(row.finalScore),
    synced_at: new Date().toISOString()
  }));

  const { error } = await supabase
    .from('weight_optimizer')
    .upsert(rows, { onConflict: 'rank' });

  if (error) throw error;
  return { status: 'success', count: rows.length };
}

async function buildRatedGamesForSeason(season: number): Promise<RatedGame[]> {
  const supabase = getServiceSupabase();
  const ratings = await loadRatings(season);
  const cfbd = new CfbdClient();
  const lineMap = await buildVegasLineMap(cfbd, season);
  const { data: games, error } = await supabase
    .from('games')
    .select('*')
    .eq('season', season)
    .not('home_points', 'is', null)
    .not('away_points', 'is', null);

  if (error) throw error;

  return (games || [])
    .map((game): RatedGame | null => {
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
        passRate: 0.5,
        games: numberOrNull(row.games)
      } satisfies Rating
    ])
  );
}

async function loadActiveModelConfig(): Promise<{ weights: ModelWeights; calibration: ModelCalibration }> {
  const supabase = getServiceSupabase();
  const { data, error } = await supabase
    .from('model_configs')
    .select('*')
    .eq('is_active', true)
    .limit(1)
    .maybeSingle();

  if (error) throw error;
  if (!data) return { weights: DEFAULT_WEIGHTS, calibration: DEFAULT_CALIBRATION };

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
