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

  const ratingsResult = await supabase
    .from('ratings')
    .select('*')
    .eq('season', season)
    .order('composite', { ascending: false })
    .limit(250);

  if (ratingsResult.error) throw new Error(ratingsResult.error.message);
  return { seasons, season, rows: ratingsResult.data ?? [] };
}
