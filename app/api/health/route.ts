import { NextResponse } from 'next/server';
import { getPublicSupabase } from '@/lib/db/client';

export async function GET() {
  const supabase = getPublicSupabase();
  const { error } = await supabase.from('ratings').select('id', { count: 'exact', head: true });
  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
