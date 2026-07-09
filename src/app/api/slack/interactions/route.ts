import { NextResponse, after } from 'next/server';
import { verifySlackSignature, extractDudaValues } from '@/lib/slack';
import { handleDudaTriage } from '@/lib/dudas';

// Interacciones de Slack: submit del modal /duda.
// Responde <3 s y procesa el triage en segundo plano (spec §6 nota webhooks).
export async function POST(request: Request) {
  const raw = await request.text();
  const ts = request.headers.get('x-slack-request-timestamp');
  const sig = request.headers.get('x-slack-signature');
  if (!verifySlackSignature(raw, ts, sig)) {
    return new NextResponse('firma inválida', { status: 401 });
  }

  const params = new URLSearchParams(raw);
  const payloadRaw = params.get('payload');
  if (!payloadRaw) return new NextResponse('', { status: 200 });

  const payload = JSON.parse(payloadRaw);

  if (payload.type === 'view_submission' && payload.view?.callback_id === 'duda_submit') {
    const vals = extractDudaValues(payload.view.state.values);
    const autorId: string = payload.user?.id;
    const autorNombre: string | undefined = payload.user?.username || payload.user?.name;

    // Procesa el triage tras responder (Next 15 `after`), sin bloquear el modal.
    after(async () => {
      try {
        await handleDudaTriage({ autorId, autorNombre, ...vals });
      } catch (e) {
        console.error('[slack] handleDudaTriage', e);
      }
    });

    // 200 vacío cierra el modal. El bot confirmará por el canal/hilo.
    return new NextResponse('', { status: 200 });
  }

  return new NextResponse('', { status: 200 });
}
