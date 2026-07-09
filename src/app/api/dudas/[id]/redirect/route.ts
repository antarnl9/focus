import { NextResponse } from 'next/server';
import { requireUser, userNombre } from '@/lib/auth';
import { hasSlack } from '@/lib/env';
import { postInThread } from '@/lib/slack';

// Redirigir una duda a un owner (spec §3.2). Notifica en el hilo y la saca de la cola.
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireUser();
  if (!auth.ok) return auth.response;
  const { supabase, user } = auth;
  const { id } = await params;

  const { owner } = (await request.json()) as { owner: string };
  if (!owner) return NextResponse.json({ error: 'missing_owner' }, { status: 400 });

  const { data: duda } = await supabase.from('dudas').select('*').eq('id', id).maybeSingle();
  if (!duda) return NextResponse.json({ error: 'not_found' }, { status: 404 });

  const nombre = await userNombre(supabase, user.id);

  if (hasSlack() && duda.slack_channel && duda.slack_ts) {
    try {
      await postInThread(duda.slack_channel, duda.slack_ts, `↪️ *${nombre} indica:* esto lo resuelve *${owner}*.`);
    } catch (e) {
      console.error('[redirect] slack', e);
    }
  }

  await supabase.from('dudas').update({ estado: 'redirigida', redirigida_a: owner, resolved_at: new Date().toISOString() }).eq('id', id);

  await supabase.from('bitacora').insert({
    user_id: user.id,
    tipo: 'nota',
    texto: `Duda de ${duda.autor_nombre || 'equipo'} redirigida a ${owner}: ${duda.decision || ''}`,
    ref_duda_id: id,
  });

  return NextResponse.json({ ok: true });
}
