import { NextResponse } from 'next/server';
import { requireUser } from '@/lib/auth';
import { hasAnthropic } from '@/lib/env';
import { generateAndSaveDaily } from '@/lib/daily';
import { localDateStr } from '@/lib/time';

// Genera el Daily con IA (spec §3.6). Objetivo: <15 s.
export async function POST() {
  const auth = await requireUser();
  if (!auth.ok) return auth.response;
  if (!hasAnthropic()) return NextResponse.json({ error: 'ANTHROPIC_API_KEY no configurada' }, { status: 400 });

  const { supabase, user } = auth;
  const fecha = localDateStr();
  try {
    const contenido = await generateAndSaveDaily(supabase, user.id, fecha);
    return NextResponse.json({ contenido });
  } catch (e) {
    console.error('[daily] generate', e);
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
