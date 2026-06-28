import { getPublicSupabase } from './client';

export async function fetchDashboardData() {
  const supabase = getPublicSupabase();

  const [
    ratings,
    optimizer,
    buckets,
    predictions,
    backtestGames
  ] = await Promise.all([
    supabase.from('ratings').select('*').order('season', { ascending: false }).order('composite', { ascending: false }).limit(300),
    supabase.from('weight_optimizer').select('*').order('rank', { ascending: true }).limit(25),
    supabase.from('model_buckets').select('*').order('bucket_type').order('id'),
    supabase.from('predictions').select('*').order('season', { ascending: false }).order('week', { ascending: true }).limit(100),
    fetchAllBacktestGames()
  ]);

  for (const result of [ratings, optimizer, buckets, predictions]) {
    if (result.error) throw new Error(result.error.message);
  }

  return {
    ratings: ratings.data ?? [],
    backtestGames,
    optimizer: optimizer.data ?? [],
    buckets: buckets.data ?? [],
    predictions: predictions.data ?? []
  };
}

export async function fetchTable(table: string, limit = 500) {
  const supabase = getPublicSupabase();
  const { data, error } = await supabase.from(table).select('*').limit(limit);
  if (error) throw new Error(error.message);
  return data ?? [];
}

export type BacktestSummaryStats = {
  games: number;
  picks_correct: number;
  picks_wrong: number;
  pick_pct: number | null;
  avg_margin_error: number | null;
  median_margin_error: number | null;
  within_3: number;
  within_3_pct: number | null;
  within_7: number;
  within_7_pct: number | null;
  within_10: number;
  within_10_pct: number | null;
  vegas_edge_plays: number;
  vegas_edge_wins: number;
  vegas_edge_losses: number;
  vegas_edge_pushes: number;
  vegas_edge_win_pct: number | null;
};

export type BacktestWeekSummary = BacktestSummaryStats & {
  season: number;
  week: number | string;
};

export async function fetchBacktestSeason(requestedSeason?: number) {
  const allGames = await fetchAllBacktestGames();

  const seasons = [...new Set(
    allGames
      .map(row => Number(row.season))
      .filter(Number.isFinite)
  )].sort((a, b) => b - a);
  const season = requestedSeason && seasons.includes(requestedSeason)
    ? requestedSeason
    : seasons[0] ?? null;

  const games = season
    ? allGames.filter(row => Number(row.season) === season)
    : [];
  const weeklyRows = buildWeeklyBacktestSummary(games, season);
  const seasonTotal = { season: season ?? 0, week: `${season ?? ''} TOTAL`, ...summarizeBacktestGames(games) };

  return {
    seasons,
    season,
    games,
    weeklyRows,
    seasonTotal,
    overall: summarizeBacktestGames(allGames)
  };
}

export async function fetchBacktestResultsSeason(requestedSeason?: number) {
  const data = await fetchBacktestSeason(requestedSeason);
  return {
    seasons: data.seasons,
    season: data.season,
    games: data.games
      .slice()
      .sort((a, b) => Number(a.week) - Number(b.week) || String(a.away_team).localeCompare(String(b.away_team)))
  };
}

async function fetchAllBacktestGames() {
  const supabase = getPublicSupabase();
  const pageSize = 1000;
  const rows: Record<string, unknown>[] = [];

  for (let from = 0; ; from += pageSize) {
    const to = from + pageSize - 1;
    const { data, error } = await supabase
      .from('backtest_games')
      .select('*')
      .order('season', { ascending: false })
      .order('week', { ascending: true })
      .range(from, to);

    if (error) throw new Error(error.message);
    const page = data ?? [];
    rows.push(...page);

    if (page.length < pageSize) break;
  }

  return rows;
}

export function buildWeeklyBacktestSummary(rows: Record<string, unknown>[], season: number | null): BacktestWeekSummary[] {
  const weeks = [...new Set(rows.map(row => Number(row.week)).filter(Number.isFinite))]
    .sort((a, b) => a - b);

  return weeks.map(week => ({
    season: season ?? 0,
    week,
    ...summarizeBacktestGames(rows.filter(row => Number(row.week) === week))
  }));
}

export function summarizeBacktestGames(rows: Record<string, unknown>[]): BacktestSummaryStats {
  const games = rows.length;
  const picksCorrect = rows.filter(row => isWin(row.pick_result)).length;
  const picksWrong = rows.filter(row => isLoss(row.pick_result)).length;
  const pickDenominator = picksCorrect + picksWrong;
  const errors = rows
    .map(row => Number(row.margin_error))
    .filter(Number.isFinite);
  const vegasWins = rows.filter(row => isWin(row.model_vegas_result)).length;
  const vegasLosses = rows.filter(row => isLoss(row.model_vegas_result)).length;
  const vegasPushes = rows.filter(row => String(row.model_vegas_result ?? '').toUpperCase() === 'PUSH').length;
  const vegasPlays = vegasWins + vegasLosses + vegasPushes;
  const within3 = errors.filter(value => value <= 3).length;
  const within7 = errors.filter(value => value <= 7).length;
  const within10 = errors.filter(value => value <= 10).length;

  return {
    games,
    picks_correct: picksCorrect,
    picks_wrong: picksWrong,
    pick_pct: pickDenominator ? round2((picksCorrect / pickDenominator) * 100) : null,
    avg_margin_error: average(errors),
    median_margin_error: median(errors),
    within_3: within3,
    within_3_pct: games ? round2((within3 / games) * 100) : null,
    within_7: within7,
    within_7_pct: games ? round2((within7 / games) * 100) : null,
    within_10: within10,
    within_10_pct: games ? round2((within10 / games) * 100) : null,
    vegas_edge_plays: vegasPlays,
    vegas_edge_wins: vegasWins,
    vegas_edge_losses: vegasLosses,
    vegas_edge_pushes: vegasPushes,
    vegas_edge_win_pct: vegasPlays ? round2((vegasWins / vegasPlays) * 100) : null
  };
}

export async function fetchRatingsSeason(requestedSeason?: number) {
  const supabase = getPublicSupabase();
  const seasonResult = await supabase
    .from('ratings')
    .select('season')
    .order('season', { ascending: false })
    .limit(1000);

  if (seasonResult.error) throw new Error(seasonResult.error.message);

  const seasons = [...new Set(
    (seasonResult.data ?? [])
      .map(row => Number(row.season))
      .filter(Number.isFinite)
  )].sort((a, b) => b - a);
  const season = requestedSeason && seasons.includes(requestedSeason)
    ? requestedSeason
    : seasons[0];

  if (!season) return { seasons, season: null, rows: [] };

  const [ratingsResult, teamsResult] = await Promise.all([
    supabase
      .from('ratings')
      .select('*')
      .eq('season', season)
      .order('composite', { ascending: false })
      .limit(1000),
    shouldFilterToFbs(season)
      ? supabase.from('teams').select('school').limit(500)
      : Promise.resolve({ data: null, error: null })
  ]);

  if (ratingsResult.error) throw new Error(ratingsResult.error.message);
  if (teamsResult.error) throw new Error(teamsResult.error.message);

  const rows = ratingsResult.data ?? [];
  const fbsTeams = new Set((teamsResult.data ?? []).map(row => String(row.school)));
  const filteredRows = fbsTeams.size
    ? rows.filter(row => fbsTeams.has(String(row.team)))
    : rows;

  return { seasons, season, rows: filteredRows };
}

export async function fetchRatingTeam(requestedSeason: number | undefined, teamName: string) {
  const { seasons, season, rows } = await fetchRatingsSeason(requestedSeason);
  const decodedTeam = decodeURIComponent(teamName);
  const index = rows.findIndex(row => String(row.team) === decodedTeam);
  const roster = season
    ? await fetchRosterForTeam(season, decodedTeam)
    : [];

  return {
    seasons,
    season,
    rank: index >= 0 ? index + 1 : null,
    row: index >= 0 ? rows[index] : null,
    roster
  };
}

export async function fetchRosterForTeam(season: number, team: string) {
  const supabase = getPublicSupabase();
  const { data, error } = await supabase
    .from('roster_players')
    .select('player_name,position,rating,class_year,source')
    .eq('season', season)
    .eq('team', team)
    .order('rating', { ascending: false, nullsFirst: false })
    .limit(300);

  if (error) throw new Error(error.message);
  return data ?? [];
}

function shouldFilterToFbs(season: number) {
  return season >= 2022 && season <= 2025;
}

function isWin(value: unknown) {
  return ['WIN', 'CORRECT', 'W'].includes(String(value ?? '').toUpperCase());
}

function isLoss(value: unknown) {
  return ['LOSS', 'WRONG', 'INCORRECT', 'L'].includes(String(value ?? '').toUpperCase());
}

function average(values: number[]) {
  if (!values.length) return null;
  return round2(values.reduce((sum, value) => sum + value, 0) / values.length);
}

function median(values: number[]) {
  if (!values.length) return null;
  const sorted = values.slice().sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  const value = sorted.length % 2
    ? sorted[middle]
    : (sorted[middle - 1] + sorted[middle]) / 2;
  return round2(value);
}

function round2(value: number) {
  return Math.round(value * 100) / 100;
}

export async function fetchFormulaData() {
  const supabase = getPublicSupabase();
  const [activeConfig, recentConfigs, optimizer] = await Promise.all([
    supabase
      .from('model_configs')
      .select('*')
      .eq('is_active', true)
      .order('updated_at', { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase
      .from('model_configs')
      .select('*')
      .order('updated_at', { ascending: false })
      .limit(25),
    supabase
      .from('weight_optimizer')
      .select('*')
      .order('rank', { ascending: true })
      .limit(5)
  ]);

  for (const result of [activeConfig, recentConfigs, optimizer]) {
    if (result.error) throw new Error(result.error.message);
  }

  return {
    activeConfig: activeConfig.data,
    recentConfigs: recentConfigs.data ?? [],
    optimizer: optimizer.data ?? []
  };
}
