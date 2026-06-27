import { NextRequest, NextResponse } from 'next/server';
import { getServiceSupabase } from '@/lib/db/client';

export const dynamic = 'force-dynamic';

const developmentOptions = new Set(['Elite', 'Good', 'Average', 'Poor', 'Terrible']);

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => ({}));
  const secret = request.headers.get('authorization')?.replace(/^Bearer\s+/i, '') || body.secret;
  if (!process.env.CRON_SECRET || secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
  }

  const team = String(body.team || '').trim();
  if (!team) {
    return NextResponse.json({ ok: false, error: 'Team is required' }, { status: 400 });
  }

  const offenseRating = ratingValue(body.offenseRating);
  const defenseRating = ratingValue(body.defenseRating);
  const developmentRating = developmentOptions.has(String(body.developmentRating))
    ? String(body.developmentRating)
    : 'Average';
  const hireYear = yearValue(body.hireYear);

  try {
    const supabase = getServiceSupabase();
    const { data, error } = await supabase
      .from('coach_configs')
      .update({
        hire_year: hireYear,
        offense_rating: offenseRating,
        defense_rating: defenseRating,
        development_rating: developmentRating,
        source: 'manual',
        updated_at: new Date().toISOString()
      })
      .eq('team', team)
      .select('*')
      .single();

    if (error) throw error;
    return NextResponse.json({ ok: true, coach: data });
  } catch (error) {
    return NextResponse.json({ ok: false, error: errorMessage(error) }, { status: 500 });
  }
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
