import { NextRequest, NextResponse } from 'next/server';
import { runModelUpdate, type UpdateStep } from '@/lib/jobs/run-update';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  const secret = request.headers.get('authorization')?.replace(/^Bearer\s+/i, '');
  if (!process.env.CRON_SECRET || secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
  }

  const body = await request.json().catch(() => ({}));
  const season = Number(body.season ?? new Date().getFullYear());
  const includeBacktest = Boolean(body.includeBacktest);
  const steps = parseSteps(body.step ?? body.steps);

  try {
    const result = await runModelUpdate({
      season,
      includeBacktest,
      steps,
      rosterLimit: numberOrNull(body.limit),
      rosterOffset: numberOrNull(body.offset) ?? 0
    });
    return NextResponse.json({ ok: true, result });
  } catch (error) {
    return NextResponse.json(formatError(error), { status: 500 });
  }
}

export async function GET(request: NextRequest) {
  const secret = request.headers.get('authorization')?.replace(/^Bearer\s+/i, '') ||
    request.nextUrl.searchParams.get('secret');
  if (!process.env.CRON_SECRET || secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
  }

  const season = Number(request.nextUrl.searchParams.get('season') ?? new Date().getFullYear());
  const steps = parseSteps(request.nextUrl.searchParams.get('step'));

  try {
    const result = await runModelUpdate({
      season,
      includeBacktest: request.nextUrl.searchParams.get('includeBacktest') === 'true',
      steps,
      rosterLimit: numberOrNull(request.nextUrl.searchParams.get('limit')),
      rosterOffset: numberOrNull(request.nextUrl.searchParams.get('offset')) ?? 0
    });
    return NextResponse.json({ ok: true, result });
  } catch (error) {
    return NextResponse.json(formatError(error), { status: 500 });
  }
}

function parseSteps(value: unknown): UpdateStep[] | undefined {
  if (!value) return undefined;
  const allowed = new Set<UpdateStep>(['teams', 'games', 'stats', 'rosters', 'ratings', 'predictions', 'backtest']);
  const raw = Array.isArray(value) ? value.join(',') : String(value);
  const steps = raw
    .split(',')
    .map(step => step.trim().toLowerCase())
    .filter((step): step is UpdateStep => allowed.has(step as UpdateStep));
  return steps.length ? steps : undefined;
}

function numberOrNull(value: unknown) {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function formatError(error: unknown) {
  return {
    ok: false,
    error: error instanceof Error ? error.message : String(error),
    stack: process.env.NODE_ENV === 'development' && error instanceof Error ? error.stack : undefined
  };
}
