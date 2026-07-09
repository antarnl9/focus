import { NextResponse } from 'next/server';
import { requireUser } from '@/lib/auth';
import { hasSlack } from '@/lib/env';
import { postDaily } from '@/lib/slack';
import { localDateStr } from '@/lib/time';

// Envía el Daily a #daily-coo con un clic (spec §3.6) y lo marca en bitácora.
export async function POST(request: Request) {
  const auth = await requireUser();
  if (!auth.ok) return auth.response;
  const { supabase, user } = auth;

  const { contenido } = (await request.json()) as { contenido: string };
  if (!contenido?.trim()) return NextResponse.json({ error: 'vacío' }, { status: 400 });
  if (!hasSlack()) return NextResponse.json({ error: 'Slack no configurado' }, { status: 400 });

  const fecha = localDateStr();
  let slackTs: string | null = null;
  try {
    const res = await postDaily(contenido);
    slackTs = (res.ts as string) ?? null;
  } catch (e) {
    console.error('[daily] send', e);
    return NextResponse.json({ error: 'No se pudo enviar a Slack' }, { status: 500 });
  }

  await supabase.from('dailies').upsert(
    { user_id: user.id, fecha, contenido, enviado_slack: true, slack_ts: slackTs },
    { onConflict: 'user_id,fecha' }
  );
  await supabase.from('bitacora').insert({ user_id: user.id, tipo: 'daily', texto: 'Daily enviado a #daily-coo.' });

  return NextResponse.json({ ok: true });
}
