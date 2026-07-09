import { createClient } from '@deepgram/sdk';
import { env, hasDeepgram } from './env';

// Transcripción de audio es-MX con diarización (spec §5.4, Fase 3).
export async function transcribeBuffer(buffer: Buffer, mimetype = 'audio/webm'): Promise<string> {
  if (!hasDeepgram()) throw new Error('DEEPGRAM_API_KEY no configurada');
  const dg = createClient(env.deepgramKey);
  const { result, error } = await dg.listen.prerecorded.transcribeFile(buffer, {
    model: 'nova-2',
    language: 'es',
    smart_format: true,
    diarize: true,
    punctuate: true,
    utterances: true,
    mimetype,
  } as never);
  if (error) throw new Error('Deepgram: ' + (error as Error).message);

  // Prefiere el formato con etiquetas de hablante si existe.
  const paragraphs = result?.results?.channels?.[0]?.alternatives?.[0]?.paragraphs?.transcript;
  const plain = result?.results?.channels?.[0]?.alternatives?.[0]?.transcript;
  return (paragraphs || plain || '').trim();
}
