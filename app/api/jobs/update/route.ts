import { NextRequest, NextResponse } from 'next/server';
import { runModelUpdate } from '@/lib/jobs/run-update';

export async function POST(request: NextRequest) {
  const secret = request.headers.get('authorization')?.replace(/^Bearer\s+/i, '');
  if (!process.env.CRON_SECRET || secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
  }

  const body = await request.json().catch(() => ({}));
  const season = Number(body.season ?? new Date().getFullYear());
  const includeBacktest = Boolean(body.includeBacktest);

  const result = await runModelUpdate({ season, includeBacktest });
  return NextResponse.json({ ok: true, result });
}

export async function GET(request: NextRequest) {
  const secret = request.headers.get('authorization')?.replace(/^Bearer\s+/i, '') ||
    request.nextUrl.searchParams.get('secret');
  if (!process.env.CRON_SECRET || secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
  }

  const season = Number(request.nextUrl.searchParams.get('season') ?? new Date().getFullYear());
  const result = await runModelUpdate({ season, includeBacktest: false });
  return NextResponse.json({ ok: true, result });
}
