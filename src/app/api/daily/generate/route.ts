import { NextResponse } from 'next/server';
import { requireUser } from '@/lib/auth';
import { hasAnthropic } from '@/lib/env';
import { generateAndSaveDailies } from '@/lib/daily';
import { localDateStr } from '@/lib/time';

// Genera AMBOS dailies (CEO Brief + personal) con IA. Objetivo <15 s.
export async function POST() {
  const auth = await requireUser();
  if (!auth.ok) return auth.response;
  if (!hasAnthropic()) return NextResponse.json({ error: 'ANTHROPIC_API_KEY no configurada' }, { status: 400 });

  const { supabase, user } = auth;
  const fecha = localDateStr();
  try {
    const { ceo, personal } = await generateAndSaveDailies(supabase, user.id, fecha);
    return NextResponse.json({ ceo, personal });
  } catch (e) {
    console.error('[daily] generate', e);
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
