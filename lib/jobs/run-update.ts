import { getServiceSupabase } from '../db/client';
import { CfbdClient, type CfbdGame, type CfbdTeamGameStat } from '../data/cfbd';

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
