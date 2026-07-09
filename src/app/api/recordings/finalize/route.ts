import { NextResponse } from 'next/server';
import { requireUser } from '@/lib/auth';
import { hasDeepgram } from '@/lib/env';
import { enqueue, QUEUES } from '@/lib/queue';

// Marca la grabación como subida y encola la transcripción (worker, spec §3.4/§5.4).
export async function POST(request: Request) {
  const auth = await requireUser();
  if (!auth.ok) return auth.response;
  const { supabase, user } = auth;

  const { id, audio_path, duracion_seg, mimetype } = (await request.json()) as {
    id: string;
    audio_path: string;
    duracion_seg: number;
    mimetype?: string;
  };

  // Si hay Deepgram, queda "subida" (en cola para el worker); si no, "lista"
  // (audio guardado y reproducible, sin transcripción automática).
  const estado = hasDeepgram() ? 'subida' : 'lista';
  await supabase
    .from('grabaciones')
    .update({ audio_path, duracion_seg: duracion_seg || 0, estado })
    .eq('id', id);

  if (hasDeepgram()) {
    await enqueue(QUEUES.transcribe, { grabacionId: id, userId: user.id, audioPath: audio_path, mimetype });
  }

  return NextResponse.json({ ok: true, queued: hasDeepgram() });
}
