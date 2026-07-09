import { NextResponse } from 'next/server';
import { verifySlackSignature, slack, dudaModalView } from '@/lib/slack';

// Slash command /duda: abre el modal con el formato obligatorio (spec §5.1).
export async function POST(request: Request) {
  const raw = await request.text();
  const ts = request.headers.get('x-slack-request-timestamp');
  const sig = request.headers.get('x-slack-signature');
  if (!verifySlackSignature(raw, ts, sig)) {
    return new NextResponse('firma inválida', { status: 401 });
  }

  const params = new URLSearchParams(raw);
  const command = params.get('command');
  const triggerId = params.get('trigger_id');
  const channelId = params.get('channel_id') || undefined;

  if (command === '/duda' && triggerId) {
    try {
      await slack().views.open({ trigger_id: triggerId, view: dudaModalView(channelId) as never });
    } catch (e) {
      console.error('[slack] views.open', e);
      return NextResponse.json({
        response_type: 'ephemeral',
        text: 'No pude abrir el formulario. Intenta de nuevo.',
      });
    }
  }

  // Responder rápido y vacío para que Slack no muestre el texto del comando.
  return new NextResponse('', { status: 200 });
}
