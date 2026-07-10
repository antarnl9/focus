import { NextResponse, after } from 'next/server';
import { syncCalendar, userIdForChannel, calWebhookToken } from '@/lib/calendar';

// Webhook de Google Calendar (push). Google solo avisa "algo cambió"; nosotros
// corremos el sync (incremental). Responde 200 rápido y sincroniza después.
export async function POST(request: Request) {
  const channelId = request.headers.get('x-goog-channel-id');
  const token = request.headers.get('x-goog-channel-token');
  const state = request.headers.get('x-goog-resource-state'); // 'sync' | 'exists'

  // Valida que venga de nuestro canal.
  if (!channelId || token !== calWebhookToken()) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  // 'sync' es el handshake inicial: no hay cambios que jalar.
  if (state === 'sync') return NextResponse.json({ ok: true });

  after(async () => {
    try {
      const userId = await userIdForChannel(channelId);
      if (userId) await syncCalendar(userId);
    } catch (e) {
      console.error('[calendar] notification', e);
    }
  });

  return NextResponse.json({ ok: true });
}
