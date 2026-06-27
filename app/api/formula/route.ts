import { NextRequest, NextResponse } from 'next/server';
import { getServiceSupabase } from '@/lib/db/client';
import { DEFAULT_CALIBRATION, DEFAULT_WEIGHTS, normalizeWeights } from '@/lib/model/predict';
import type { ModelCalibration, ModelWeights } from '@/lib/model/types';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => ({}));
  const weights = normalizeWeights({
    pass: numberOrDefault(body.passWeight, DEFAULT_WEIGHTS.pass),
    rush: numberOrDefault(body.rushWeight, DEFAULT_WEIGHTS.rush),
    overall: numberOrDefault(body.overallWeight, DEFAULT_WEIGHTS.overall),
    composite: numberOrDefault(body.compositeWeight, DEFAULT_WEIGHTS.composite)
  });
  const calibration: ModelCalibration = {
    pointsPerRating: numberOrDefault(body.pointsPerRating, DEFAULT_CALIBRATION.pointsPerRating),
    homeField: numberOrDefault(body.homeField, DEFAULT_CALIBRATION.homeField),
    marginShrink: numberOrDefault(body.marginShrink, DEFAULT_CALIBRATION.marginShrink),
    maxMargin: numberOrDefault(body.maxMargin, DEFAULT_CALIBRATION.maxMargin)
  };
  const coachOffenseBoost = numberOrDefault(body.coachOffenseBoost, 0.6);
  const coachDefenseBoost = numberOrDefault(body.coachDefenseBoost, 0.6);
  const coachDevelopmentBoost = numberOrDefault(body.coachDevelopmentBoost, 1.0);
  const ratingRecencyWeight = numberOrDefault(body.ratingRecencyWeight, 2.5);
  const ratingTalentWeight = numberOrDefault(body.ratingTalentWeight, 0.4);
  const ratingHistoricalPositionWeight = numberOrDefault(body.ratingHistoricalPositionWeight, 0.3);
  const ratingPreseasonPositionWeight = numberOrDefault(body.ratingPreseasonPositionWeight, 0.7);
  const name = cleanName(body.name) || `manual-${new Date().toISOString().slice(0, 19)}`;

  try {
    const supabase = getServiceSupabase();
    const now = new Date().toISOString();
    const inactive = await supabase
      .from('model_configs')
      .update({ is_active: false, updated_at: now })
      .eq('is_active', true);
    if (inactive.error) throw inactive.error;

    const saved = await supabase
      .from('model_configs')
      .upsert({
        name,
        pass_weight: weights.pass,
        rush_weight: weights.rush,
        overall_weight: weights.overall,
        composite_weight: weights.composite,
        points_per_rating: calibration.pointsPerRating,
        home_field: calibration.homeField,
        margin_shrink: calibration.marginShrink,
        max_margin: calibration.maxMargin,
        coach_offense_boost: coachOffenseBoost,
        coach_defense_boost: coachDefenseBoost,
        coach_development_boost: coachDevelopmentBoost,
        rating_recency_weight: ratingRecencyWeight,
        rating_talent_weight: ratingTalentWeight,
        rating_historical_position_weight: ratingHistoricalPositionWeight,
        rating_preseason_position_weight: ratingPreseasonPositionWeight,
        is_active: true,
        updated_at: now
      }, { onConflict: 'name' })
      .select('*')
      .single();
    if (saved.error) throw saved.error;

    return NextResponse.json({ ok: true, config: saved.data });
  } catch (error) {
    return NextResponse.json({ ok: false, error: errorMessage(error) }, { status: 500 });
  }
}

function numberOrDefault(value: unknown, fallback: number) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function cleanName(value: unknown) {
  return String(value ?? '')
    .trim()
    .replace(/[^\w .:-]/g, '')
    .slice(0, 80);
}

function errorMessage(error: unknown) {
  if (error instanceof Error) return error.message;
  if (error && typeof error === 'object' && 'message' in error) {
    return String((error as { message?: unknown }).message);
  }
  return String(error);
}
