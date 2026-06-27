import { NextRequest, NextResponse } from 'next/server';
import { revalidatePath } from 'next/cache';
import { runModelUpdate, type UpdateStep } from '@/lib/jobs/run-update';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => ({}));
  const season = Number(body.season ?? 2026);
  const steps = parseSteps(body.steps ?? body.step) ?? ['ratings', 'predictions'];

  try {
    const result = await runModelUpdate({
      season,
      steps,
      optimizeBacktest: body.optimizeBacktest !== false
    });
    revalidateFormulaPaths(steps);
    return NextResponse.json({ ok: true, result });
  } catch (error) {
    return NextResponse.json({ ok: false, error: errorMessage(error) }, { status: 500 });
  }
}

function parseSteps(value: unknown): UpdateStep[] | undefined {
  if (!value) return undefined;
  const allowed = new Set<UpdateStep>(['teams', 'games', 'stats', 'rosters', 'coaches', 'ratings', 'predictions', 'backtest']);
  const raw = Array.isArray(value) ? value.join(',') : String(value);
  const steps = raw
    .split(',')
    .map(step => step.trim().toLowerCase())
    .filter((step): step is UpdateStep => allowed.has(step as UpdateStep));
  return steps.length ? steps : undefined;
}

function revalidateFormulaPaths(steps: UpdateStep[]) {
  revalidatePath('/');
  revalidatePath('/formula');
  if (steps.includes('ratings')) {
    revalidatePath('/ratings');
    revalidatePath('/ratings/[team]', 'page');
  }
  if (steps.includes('predictions') || steps.includes('games')) {
    revalidatePath('/games');
  }
  if (steps.includes('backtest')) {
    revalidatePath('/backtest');
    revalidatePath('/optimizer');
  }
}

function errorMessage(error: unknown) {
  if (error instanceof Error) return error.message;
  if (error && typeof error === 'object' && 'message' in error) {
    return String((error as { message?: unknown }).message);
  }
  return String(error);
}
