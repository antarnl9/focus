import webpush from 'web-push';
import { env, hasPush } from './env';
import { createSupabaseAdmin } from './supabase/admin';

let configured = false;
function configure() {
  if (configured || !hasPush()) return;
  webpush.setVapidDetails(env.vapidSubject, env.vapidPublic, env.vapidPrivate);
  configured = true;
}

export interface PushPayload {
  title: string;
  body: string;
  url?: string;
  tag?: string;
  urgent?: boolean;
}

// Envía una notificación push a todos los dispositivos del usuario.
// El DM de Slack sirve de respaldo (spec §5.5), así que esto es best-effort.
export async function sendPush(userId: string, payload: PushPayload): Promise<void> {
  if (!hasPush()) return;
  configure();
  const admin = createSupabaseAdmin();
  const { data: subs } = await admin
    .from('push_subscriptions')
    .select('id, endpoint, keys')
    .eq('user_id', userId);

  await Promise.all(
    (subs ?? []).map(async (s) => {
      try {
        await webpush.sendNotification(
          { endpoint: s.endpoint, keys: s.keys as { p256dh: string; auth: string } },
          JSON.stringify(payload)
        );
      } catch (err: unknown) {
        const status = (err as { statusCode?: number }).statusCode;
        if (status === 410 || status === 404) {
          await admin.from('push_subscriptions').delete().eq('id', s.id);
        }
      }
    })
  );
}
