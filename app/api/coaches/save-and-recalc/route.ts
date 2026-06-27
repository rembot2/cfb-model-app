import { NextRequest, NextResponse } from 'next/server';
import { revalidatePath } from 'next/cache';
import { getServiceSupabase } from '@/lib/db/client';
import { runModelUpdate } from '@/lib/jobs/run-update';

export const dynamic = 'force-dynamic';

const developmentOptions = new Set(['Elite', 'Good', 'Average', 'Poor', 'Terrible']);

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => ({}));
  const rawRows: Array<Record<string, unknown>> = Array.isArray(body.rows) ? body.rows : [];

  try {
    const supabase = getServiceSupabase();
    const rows = rawRows.map(normalizeCoachRow).filter((row): row is CoachUpdateRow => row !== null);

    if (rows.length) {
      const { error } = await supabase
        .from('coach_configs')
        .upsert(rows, { onConflict: 'team' });
      if (error) throw error;
    }

    const result = await runModelUpdate({
      season: 2026,
      steps: ['ratings', 'predictions'],
      optimizeBacktest: false
    });

    revalidatePath('/');
    revalidatePath('/coaches');
    revalidatePath('/ratings');
    revalidatePath('/ratings/[team]', 'page');
    revalidatePath('/games');

    const { data: freshRows, error: freshError } = await supabase
      .from('coach_configs')
      .select('team,coach_name,hire_year,offense_rating,defense_rating,development_rating,source')
      .order('team', { ascending: true });
    if (freshError) throw freshError;

    return NextResponse.json({ ok: true, saved: rows.length, result, coaches: freshRows ?? [] });
  } catch (error) {
    return NextResponse.json({ ok: false, error: errorMessage(error) }, { status: 500 });
  }
}

type CoachUpdateRow = {
  team: string;
  hire_year: number | null;
  offense_rating: number;
  defense_rating: number;
  development_rating: string;
  source: string;
  updated_at: string;
};

function normalizeCoachRow(row: Record<string, unknown>): CoachUpdateRow | null {
  const team = String(row.team || '').trim();
  if (!team) return null;
  const developmentRating = developmentOptions.has(String(row.developmentRating))
    ? String(row.developmentRating)
    : 'Average';

  return {
    team,
    hire_year: yearValue(row.hireYear),
    offense_rating: ratingValue(row.offenseRating),
    defense_rating: ratingValue(row.defenseRating),
    development_rating: developmentRating,
    source: 'manual',
    updated_at: new Date().toISOString()
  };
}

function ratingValue(value: unknown) {
  const n = Math.trunc(Number(value));
  return Number.isFinite(n) ? Math.max(1, Math.min(10, n)) : 5;
}

function yearValue(value: unknown) {
  const n = Math.trunc(Number(value));
  return Number.isFinite(n) && n > 1900 ? n : null;
}

function errorMessage(error: unknown) {
  if (error instanceof Error) return error.message;
  if (error && typeof error === 'object' && 'message' in error) {
    return String((error as { message?: unknown }).message);
  }
  return String(error);
}
