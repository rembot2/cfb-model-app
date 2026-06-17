import { getServiceSupabase } from '../db/client';

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
  // TODO: Replace with CFBD /teams and /teams/fbs ingestion.
  return { season, status: 'not_implemented' };
}

async function fetchGames(season: number) {
  // TODO: Replace with CFBD /games ingestion.
  return { season, status: 'not_implemented' };
}

async function fetchTeamGameStats(season: number) {
  // TODO: Replace with CFBD game/team stats ingestion.
  return { season, status: 'not_implemented' };
}

async function fetchRosters(season: number) {
  // TODO: Port On3 scraper into a backend job.
  return { season, status: 'not_implemented' };
}

async function calculateRatings(season: number) {
  // TODO: Port buildRollingRatings/calculateRatingsCore into TypeScript.
  return { season, status: 'not_implemented' };
}

async function generatePredictions(season: number) {
  // TODO: Use lib/model/predict.ts against ratings + schedule rows.
  return { season, status: 'not_implemented' };
}

async function runBacktest(season: number) {
  // TODO: Port runBacktest/evaluateWeightCombination into TypeScript.
  return { season, status: 'not_implemented' };
}
