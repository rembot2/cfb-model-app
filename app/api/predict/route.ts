import { NextRequest, NextResponse } from 'next/server';
import { getPublicSupabase } from '@/lib/db/client';
import { DEFAULT_CALIBRATION, DEFAULT_WEIGHTS, predictGame } from '@/lib/model/predict';
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
    const [ratingsResult, configResult] = await Promise.all([
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
        .maybeSingle()
    ]);

    if (ratingsResult.error) throw ratingsResult.error;
    if (configResult.error) throw configResult.error;

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
    const teamAWinProbability = winProbability(teamAMargin);
    const score = projectedScore(teamAMargin);

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
        teamAScore: score.teamA,
        teamBScore: score.teamB,
        spread: prediction.modelSpread
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

function projectedScore(teamAMargin: number) {
  const total = 52;
  const teamA = Math.max(0, Math.round(total / 2 + teamAMargin / 2));
  return {
    teamA,
    teamB: Math.max(0, total - teamA)
  };
}

function winProbability(margin: number) {
  return 1 / (1 + Math.exp(-margin / 7));
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
