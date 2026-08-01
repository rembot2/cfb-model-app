import { NextRequest, NextResponse } from 'next/server';
import { getPublicSupabase } from '@/lib/db/client';
import { DEFAULT_CALIBRATION, DEFAULT_WEIGHTS, predictGame } from '@/lib/model/predict';
import { projectMatchupScore, type TeamSeasonScoring } from '@/lib/model/score-projection';
import {
  calibrateWinProbability,
  type CoachDevelopmentInput
} from '@/lib/model/win-probability';
import type { ModelCalibration, ModelWeights, Rating } from '@/lib/model/types';

export const dynamic = 'force-dynamic';

type Site = 'teamA' | 'teamB' | 'neutral';

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => ({}));
  const season = Number(body.season);
  const teamA = String(body.teamA || '').trim();
  const teamB = String(body.teamB || '').trim();
  const site = normalizeSite(body.site);

  if (!Number.isFinite(season) || !teamA || !teamB) {
    return NextResponse.json({ ok: false, error: 'Season and both teams are required.' }, { status: 400 });
  }
  if (teamA === teamB) {
    return NextResponse.json({ ok: false, error: 'Choose two different teams.' }, { status: 400 });
  }

  try {
    const supabase = getPublicSupabase();
    const [ratingsResult, configResult, coachesResult, historyResult, mlResult] = await Promise.all([
      supabase
        .from('ratings')
        .select('*')
        .eq('season', season)
        .in('team', [teamA, teamB]),
      supabase
        .from('model_configs')
        .select('*')
        .eq('is_active', true)
        .order('updated_at', { ascending: false })
        .limit(1)
        .maybeSingle(),
      supabase
        .from('coach_configs')
        .select('team,hire_year,development_rating')
        .in('team', [teamA, teamB]),
      supabase
        .from('backtest_games')
        .select('model_home_margin,home_margin')
        .gte('season', 2022)
        .lte('season', 2025)
        .limit(1000),
      supabase
        .from('predictions')
        .select('ml_home_margin,ml_win_prob_home')
        .eq('season', season)
        .eq('home_team', site === 'teamB' ? teamB : teamA)
        .eq('away_team', site === 'teamB' ? teamA : teamB)
        .maybeSingle()
    ]);
    ]);

    if (ratingsResult.error) throw ratingsResult.error;
    if (configResult.error) throw configResult.error;
    if (coachesResult.error) throw coachesResult.error;
    if (mlResult.error) throw mlResult.error;
    const mlHomeMargin = mlResult.data?.ml_home_margin ?? null;
    const mlWinProbHome = mlResult.data?.ml_win_prob_home ?? null;
    const mlTeamAMargin = mlHomeMargin !== null
      ? (site === 'teamB' ? -Number(mlHomeMargin) : Number(mlHomeMargin))
      : null;

    const ratings = new Map((ratingsResult.data ?? []).map(row => [String(row.team), mapRating(row)]));
    const ratingA = ratings.get(teamA);
    const ratingB = ratings.get(teamB);
    if (!ratingA || !ratingB) {
      return NextResponse.json({ ok: false, error: 'One or both teams do not have ratings for this season.' }, { status: 404 });
    }

    const config = mapConfig(configResult.data);
    const homeRating = site === 'teamB' ? ratingB : ratingA;
    const awayRating = site === 'teamB' ? ratingA : ratingB;
    const calibration = site === 'neutral'
      ? { ...config.calibration, homeField: 0 }
      : config.calibration;
    const prediction = predictGame(homeRating, awayRating, config.weights, calibration);
    const teamAMargin = site === 'teamB'
      ? -prediction.modelHomeMargin
      : prediction.modelHomeMargin;
    const coaches = new Map(
      (coachesResult.data ?? []).map(row => [
        String(row.team),
        mapCoachDevelopment(row)
      ])
    );
    const winCalibration = calibrateWinProbability(
      teamAMargin,
      (historyResult.data ?? []).map(row => ({
        modelHomeMargin: numberOrDefault(row.model_home_margin, Number.NaN),
        actualHomeMargin: numberOrDefault(row.home_margin, Number.NaN)
      })),
      coaches.get(teamA) ?? null,
      coaches.get(teamB) ?? null,
      season
    );
    const teamAWinProbability = winCalibration.finalProbability;
    const seasonScoring = season < 2026
      ? await loadSeasonScoring(supabase, season, teamA, teamB)
      : null;
    const score = projectMatchupScore(ratingA, ratingB, {
      season,
      teamAMargin,
      teamAStats: seasonScoring?.teams.get(teamA),
      teamBStats: seasonScoring?.teams.get(teamB),
      leaguePointsPerTeam: seasonScoring?.leaguePointsPerTeam
    });

    return NextResponse.json({
      ok: true,
      season,
      site,
      teamA,
      teamB,
      homeTeam: homeRating.team,
      awayTeam: awayRating.team,
      prediction: {
        ...prediction,
        teamAMargin,
        teamBMargin: -teamAMargin,
        teamAWinProbability,
        teamBWinProbability: 1 - teamAWinProbability,
        winCalibration,
        teamAScore: score.teamA,
        teamBScore: score.teamB,
        scoreProjection: score,
        spread: prediction.modelSpread,
        mlHomeMargin: mlHomeMargin,
        mlTeamAMargin: mlTeamAMargin,
        mlWinProbHome: mlWinProbHome,
        mlSpread: mlTeamAMargin !== null
          ? mlTeamAMargin === 0
            ? "Pick'em"
            : `${mlTeamAMargin > 0 ? teamA : teamB} -${Math.abs(mlTeamAMargin).toFixed(1)}`
          : null
      },
      ratings: {
        [teamA]: ratingA,
        [teamB]: ratingB
      },
      formula: config
    });
  } catch (error) {
    return NextResponse.json({ ok: false, error: errorMessage(error) }, { status: 500 });
  }
}

function mapRating(row: Record<string, unknown>): Rating {
  return {
    team: String(row.team),
    composite: numberOrDefault(row.composite, 75),
    offRating: numberOrDefault(row.off_rating, 75),
    defRating: numberOrDefault(row.def_rating, 75),
    rushOff: numberOrDefault(row.rush_off_rating, numberOrDefault(row.off_rating, 75)),
    passOff: numberOrDefault(row.pass_off_rating, numberOrDefault(row.off_rating, 75)),
    rushDef: numberOrDefault(row.rush_def_rating, numberOrDefault(row.def_rating, 75)),
    passDef: numberOrDefault(row.pass_def_rating, numberOrDefault(row.def_rating, 75)),
    passRate: numberOrDefault(row.pass_rate, numberOrDefault(row.passRate, 0.5)),
    games: numberOrDefault(row.games, 0)
  };
}

function mapConfig(row: Record<string, unknown> | null) {
  const weights: ModelWeights = {
    pass: numberOrDefault(row?.pass_weight, DEFAULT_WEIGHTS.pass),
    rush: numberOrDefault(row?.rush_weight, DEFAULT_WEIGHTS.rush),
    overall: numberOrDefault(row?.overall_weight, DEFAULT_WEIGHTS.overall),
    composite: numberOrDefault(row?.composite_weight, DEFAULT_WEIGHTS.composite)
  };
  const calibration: ModelCalibration = {
    pointsPerRating: numberOrDefault(row?.points_per_rating, DEFAULT_CALIBRATION.pointsPerRating),
    homeField: numberOrDefault(row?.home_field, DEFAULT_CALIBRATION.homeField),
    marginShrink: numberOrDefault(row?.margin_shrink, DEFAULT_CALIBRATION.marginShrink),
    maxMargin: numberOrDefault(row?.max_margin, DEFAULT_CALIBRATION.maxMargin)
  };
  return {
    name: row?.name ? String(row.name) : 'default',
    weights,
    calibration
  };
}

function normalizeSite(value: unknown): Site {
  return value === 'teamB' || value === 'neutral' ? value : 'teamA';
}

async function loadSeasonScoring(
  supabase: ReturnType<typeof getPublicSupabase>,
  season: number,
  teamA: string,
  teamB: string
) {
  const [gamesResult, statsResult] = await Promise.all([
    supabase
      .from('games')
      .select('home_team,away_team,home_points,away_points')
      .eq('season', season)
      .not('home_points', 'is', null)
      .not('away_points', 'is', null)
      .limit(1000),
    supabase
      .from('team_game_stats')
      .select('team,pts_per_drive_off,pts_per_drive_def,pass_rate_off,raw')
      .eq('season', season)
      .in('team', [teamA, teamB])
      .limit(1000)
  ]);

  if (gamesResult.error) throw gamesResult.error;
  if (statsResult.error) throw statsResult.error;

  const games = gamesResult.data ?? [];
  const totalPoints = games.reduce(
    (sum, game) => sum + Number(game.home_points) + Number(game.away_points),
    0
  );
  const leaguePointsPerTeam = games.length
    ? totalPoints / (games.length * 2)
    : null;
  const teams = new Map<string, TeamSeasonScoring>();

  for (const team of [teamA, teamB]) {
    let pointsFor = 0;
    let pointsAllowed = 0;
    let gamesPlayed = 0;

    for (const game of games) {
      if (game.home_team === team) {
        pointsFor += Number(game.home_points);
        pointsAllowed += Number(game.away_points);
        gamesPlayed += 1;
      } else if (game.away_team === team) {
        pointsFor += Number(game.away_points);
        pointsAllowed += Number(game.home_points);
        gamesPlayed += 1;
      }
    }

    const teamStats = (statsResult.data ?? []).filter(row => row.team === team);
    teams.set(team, {
      games: gamesPlayed,
      pointsFor: gamesPlayed ? pointsFor / gamesPlayed : null,
      pointsAllowed: gamesPlayed ? pointsAllowed / gamesPlayed : null,
      offensivePpd: average(teamStats.map(row => row.pts_per_drive_off)),
      defensivePpd: average(teamStats.map(row => row.pts_per_drive_def)),
      playsPerGame: average(teamStats.map(row => rawNumber(row.raw, 'offense', 'plays'))),
      drivesPerGame: average(teamStats.map(row => rawNumber(row.raw, 'offense', 'drives'))),
      passRate: average(teamStats.map(row => row.pass_rate_off))
    });
  }

  return { leaguePointsPerTeam, teams };
}

function rawNumber(
  raw: unknown,
  section: string,
  field: string
) {
  if (!raw || typeof raw !== 'object') return null;
  const nested = (raw as Record<string, unknown>)[section];
  if (!nested || typeof nested !== 'object') return null;
  return numberOrNull((nested as Record<string, unknown>)[field]);
}

function average(values: unknown[]) {
  const numbers = values
    .map(numberOrNull)
    .filter((value): value is number => value !== null);
  if (!numbers.length) return null;
  return numbers.reduce((sum, value) => sum + value, 0) / numbers.length;
}

function numberOrNull(value: unknown) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function mapCoachDevelopment(
  row: Record<string, unknown>
): CoachDevelopmentInput {
  const hireYear = Number(row.hire_year);
  return {
    developmentRating: String(row.development_rating || 'Average'),
    hireYear: Number.isFinite(hireYear) ? hireYear : null
  };
}

function numberOrDefault(value: unknown, fallback: number) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function errorMessage(error: unknown) {
  if (error instanceof Error) return error.message;
  if (error && typeof error === 'object' && 'message' in error) {
    return String((error as { message?: unknown }).message);
  }
  return String(error);
}
