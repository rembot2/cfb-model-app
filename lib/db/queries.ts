import { getPublicSupabase } from './client';

export async function fetchDashboardData() {
  const supabase = getPublicSupabase();

  const [
    ratings,
    summary,
    optimizer,
    buckets,
    predictions
  ] = await Promise.all([
    supabase.from('ratings').select('*').order('season', { ascending: false }).order('composite', { ascending: false }).limit(300),
    supabase.from('backtest_summary').select('*').order('season', { ascending: false }).limit(200),
    supabase.from('weight_optimizer').select('*').order('rank', { ascending: true }).limit(25),
    supabase.from('model_buckets').select('*').order('bucket_type').order('id'),
    supabase.from('predictions').select('*').order('season', { ascending: false }).order('week', { ascending: true }).limit(100)
  ]);

  for (const result of [ratings, summary, optimizer, buckets, predictions]) {
    if (result.error) throw new Error(result.error.message);
  }

  return {
    ratings: ratings.data ?? [],
    summary: summary.data ?? [],
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
