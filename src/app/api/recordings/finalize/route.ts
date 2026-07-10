import { NextResponse, after } from 'next/server';
import { requireUser } from '@/lib/auth';
import { hasDeepgram } from '@/lib/env';
import { processTranscription } from '@/lib/transcription';

// Marca la grabación como subida y transcribe. La transcripción corre en el
// mismo servicio web con after() (no requiere un worker aparte).
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

  const willTranscribe = hasDeepgram();
  const estado = willTranscribe ? 'subida' : 'lista';
  await supabase
    .from('grabaciones')
    .update({ audio_path, duracion_seg: duracion_seg || 0, estado })
    .eq('id', id);

  if (willTranscribe) {
    after(() => processTranscription({ grabacionId: id, userId: user.id, audioPath: audio_path, mimetype }));
  }

  return NextResponse.json({ ok: true, transcribiendo: willTranscribe });
}
