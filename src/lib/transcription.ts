import { createSupabaseAdmin } from './supabase/admin';
import { transcribeBuffer } from './deepgram';
import { summarizeMeeting } from './anthropic';
import { hasAnthropic } from './env';

// Pipeline de junta: audio (storage) → transcripción → resumen + acuerdos IA
// → bitácora (spec §3.4 / §5.4). Se ejecuta en el worker.
export async function processTranscription(params: {
  grabacionId: string;
  userId: string;
  audioPath: string;
  mimetype?: string;
}): Promise<void> {
  const admin = createSupabaseAdmin();
  const { grabacionId, userId, audioPath, mimetype } = params;

  const { data: grab } = await admin.from('grabaciones').select('label').eq('id', grabacionId).maybeSingle();
  const label = grab?.label || 'Junta';

  try {
    await admin.from('grabaciones').update({ estado: 'transcribiendo' }).eq('id', grabacionId);

    // Descarga el audio del bucket privado.
    const { data: blob, error } = await admin.storage.from('grabaciones').download(audioPath);
    if (error || !blob) throw new Error('No se pudo descargar el audio: ' + (error?.message || ''));
    const buffer = Buffer.from(await blob.arrayBuffer());

    // Transcripción (Deepgram es-MX).
    const transcript = await transcribeBuffer(buffer, mimetype || 'audio/webm');
    await admin.from('grabaciones').update({ transcript, estado: 'procesando' }).eq('id', grabacionId);

    // Resumen + acuerdos con IA.
    if (hasAnthropic() && transcript) {
      const summary = await summarizeMeeting(label, transcript);
      await admin
        .from('grabaciones')
        .update({ resumen: summary.resumen, acuerdos: summary.acuerdos, estado: 'lista' })
        .eq('id', grabacionId);

      // Bitácora automática: grabación + acuerdos (spec §3.5).
      await admin.from('bitacora').insert({
        user_id: userId,
        tipo: 'grabacion',
        texto: `Junta grabada: ${label}. ${summary.resumen}`,
        ref_grabacion_id: grabacionId,
      });
      for (const a of summary.acuerdos ?? []) {
        await admin.from('bitacora').insert({
          user_id: userId,
          tipo: 'acuerdo',
          texto: `${a.acuerdo}${a.responsable ? ` — ${a.responsable}` : ''}${a.fecha ? ` (${a.fecha})` : ''}`,
          ref_grabacion_id: grabacionId,
        });
      }
    } else {
      await admin.from('grabaciones').update({ estado: 'lista' }).eq('id', grabacionId);
    }
  } catch (e) {
    console.error('[transcription]', grabacionId, e);
    await admin.from('grabaciones').update({ estado: 'error' }).eq('id', grabacionId);
  }
}
