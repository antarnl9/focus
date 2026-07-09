import { NextResponse } from 'next/server';
import { requireUser, userNombre } from '@/lib/auth';
import { hasSlack } from '@/lib/env';
import { postInThread, reactInThread } from '@/lib/slack';

// Resolver una duda: publica la decisión en el hilo de Slack (spec §3.2) y
// la registra en la bitácora con timestamp (spec §10). <5 s.
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireUser();
  if (!auth.ok) return auth.response;
  const { supabase, user } = auth;
  const { id } = await params;

  const { resolucion, enPersona } = (await request.json()) as { resolucion: string; enPersona?: boolean };

  const { data: duda } = await supabase.from('dudas').select('*').eq('id', id).maybeSingle();
  if (!duda) return NextResponse.json({ error: 'not_found' }, { status: 404 });

  const nombre = await userNombre(supabase, user.id);

  // Publica en el hilo de Slack (si vino de Slack y no fue resuelta en persona).
  if (!enPersona && hasSlack() && duda.slack_channel && duda.slack_ts) {
    try {
      await postInThread(duda.slack_channel, duda.slack_ts, `✅ *Resuelto por ${nombre}:*\n${resolucion}`);
      await reactInThread(duda.slack_channel, duda.slack_ts, 'white_check_mark');
    } catch (e) {
      console.error('[resolve] slack', e);
    }
  }

  // Marca resuelta.
  await supabase
    .from('dudas')
    .update({
      estado: 'resuelta',
      resolucion,
      resuelto_por: nombre,
      resolved_at: new Date().toISOString(),
    })
    .eq('id', id);

  // Bitácora automática (spec §3.5 / §10).
  await supabase.from('bitacora').insert({
    user_id: user.id,
    tipo: 'duda_resuelta',
    texto: `Duda de ${duda.autor_nombre || 'equipo'}: ${duda.decision || ''} → ${resolucion}${
      enPersona ? ' (resuelta en persona)' : ''
    }`,
    ref_duda_id: id,
  });

  return NextResponse.json({ ok: true });
}
