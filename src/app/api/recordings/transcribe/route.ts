import { NextResponse, after } from 'next/server';
import { requireUser } from '@/lib/auth';
import { hasDeepgram } from '@/lib/env';
import { processTranscription } from '@/lib/transcription';

// Re-transcribe una grabación existente (para las que se guardaron sin transcript).
export async function POST(request: Request) {
  const auth = await requireUser();
  if (!auth.ok) return auth.response;
  const { supabase, user } = auth;

  if (!hasDeepgram()) return NextResponse.json({ error: 'Falta DEEPGRAM_API_KEY en el servidor.' }, { status: 400 });

  const { id } = (await request.json()) as { id: string };
  const { data: g } = await supabase.from('grabaciones').select('audio_path').eq('id', id).maybeSingle();
  if (!g?.audio_path) return NextResponse.json({ error: 'La grabación no tiene audio.' }, { status: 400 });

  await supabase.from('grabaciones').update({ estado: 'subida' }).eq('id', id);
  after(() => processTranscription({ grabacionId: id, userId: user.id, audioPath: g.audio_path as string }));

  return NextResponse.json({ ok: true });
}
