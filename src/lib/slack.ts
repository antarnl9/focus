import crypto from 'node:crypto';
import { WebClient } from '@slack/web-api';
import { env } from './env';
import { encrypt, decrypt } from './crypto';
import { createSupabaseAdmin } from './supabase/admin';

let _web: WebClient | null = null;
export function slack(): WebClient {
  if (!_web) _web = new WebClient(env.slackBotToken());
  return _web;
}

// --- Token de USUARIO (xoxp) para leer DMs/canales del COO (contexto). ---
export async function saveSlackUserToken(userId: string, token: string) {
  const admin = createSupabaseAdmin();
  await admin.from('integraciones').upsert(
    { user_id: userId, proveedor: 'slack', access_token: encrypt(token), scopes: 'user:history', updated_at: new Date().toISOString() },
    { onConflict: 'user_id,proveedor' }
  );
}

export async function getSlackUserToken(userId: string): Promise<string | null> {
  const admin = createSupabaseAdmin();
  const { data } = await admin
    .from('integraciones')
    .select('access_token')
    .eq('user_id', userId)
    .eq('proveedor', 'slack')
    .maybeSingle();
  if (!data?.access_token) return null;
  try {
    return decrypt(data.access_token);
  } catch {
    return data.access_token;
  }
}

// --- Verificación de firma (spec §8): X-Slack-Signature en todos los webhooks. ---
export function verifySlackSignature(rawBody: string, timestamp: string | null, signature: string | null): boolean {
  if (!timestamp || !signature) return false;
  // Rechaza requests con más de 5 minutos (anti-replay).
  const now = Math.floor(Date.now() / 1000);
  if (Math.abs(now - Number(timestamp)) > 60 * 5) return false;

  const base = `v0:${timestamp}:${rawBody}`;
  const hmac = crypto.createHmac('sha256', env.slackSigningSecret());
  hmac.update(base);
  const expected = `v0=${hmac.digest('hex')}`;
  try {
    return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(signature));
  } catch {
    return false;
  }
}

// --- Modal /duda con formato obligatorio (spec §3.2) ---
export function dudaModalView(triggerChannel?: string) {
  return {
    type: 'modal' as const,
    callback_id: 'duda_submit',
    private_metadata: triggerChannel || '',
    title: { type: 'plain_text' as const, text: 'Nueva duda' },
    submit: { type: 'plain_text' as const, text: 'Enviar' },
    close: { type: 'plain_text' as const, text: 'Cancelar' },
    blocks: [
      {
        type: 'context',
        elements: [{ type: 'mrkdwn', text: 'El contexto viaja por escrito antes que la persona. Completa los 5 campos.' }],
      },
      inputBlock('contexto', 'Contexto', 'Situación / antecedentes', true),
      inputBlock('decision', '¿Qué decisión necesitas?', 'Sé específico', true),
      inputBlock('opciones', 'Opciones que ves', 'A) ... B) ...', true),
      inputBlock('recomendacion', 'Tu recomendación (owner)', '¿Qué recomiendas y por qué?', true),
      inputBlock('impacto', 'Impacto si no se decide hoy', '¿Qué pasa si esperamos?', true),
      {
        type: 'input',
        block_id: 'urgente',
        optional: true,
        label: { type: 'plain_text', text: '¿Es urgencia real?' },
        element: {
          type: 'checkboxes',
          action_id: 'urgente_check',
          options: [
            {
              text: { type: 'mrkdwn', text: 'Cliente grande en riesgo / producción caída / dinero o reputación / bloqueo de lanzamiento P0' },
              value: 'urgente',
            },
          ],
        },
      },
    ],
  };
}

function inputBlock(id: string, label: string, placeholder: string, multiline: boolean) {
  return {
    type: 'input' as const,
    block_id: id,
    label: { type: 'plain_text' as const, text: label },
    element: {
      type: 'plain_text_input' as const,
      action_id: `${id}_val`,
      multiline,
      placeholder: { type: 'plain_text' as const, text: placeholder },
    },
  };
}

// Extrae los valores del submit del modal.
export function extractDudaValues(values: Record<string, Record<string, { value?: string; selected_options?: unknown[] }>>) {
  const get = (block: string, action: string) => values?.[block]?.[action]?.value?.trim() || '';
  const urgente = (values?.urgente?.urgente_check?.selected_options?.length ?? 0) > 0;
  return {
    contexto: get('contexto', 'contexto_val'),
    decision: get('decision', 'decision_val'),
    opciones: get('opciones', 'opciones_val'),
    recomendacion: get('recomendacion', 'recomendacion_val'),
    impacto: get('impacto', 'impacto_val'),
    urgente_marcado: urgente,
  };
}

// --- Block Kit para publicar una duda en #dudas-coo ---
export function dudaMessageBlocks(d: {
  autor: string;
  contexto: string;
  decision: string;
  opciones: string;
  recomendacion: string;
  impacto: string;
  urgente: boolean;
}) {
  return [
    {
      type: 'header',
      text: { type: 'plain_text', text: `${d.urgente ? '🚨 URGENTE — ' : '❓ '}Duda de ${d.autor}` },
    },
    {
      type: 'section',
      fields: [
        { type: 'mrkdwn', text: `*Decisión pedida:*\n${d.decision}` },
        { type: 'mrkdwn', text: `*Impacto si espera:*\n${d.impacto}` },
      ],
    },
    { type: 'section', text: { type: 'mrkdwn', text: `*Contexto:* ${d.contexto}` } },
    { type: 'section', text: { type: 'mrkdwn', text: `*Opciones:* ${d.opciones}` } },
    { type: 'section', text: { type: 'mrkdwn', text: `*Recomendación de ${d.autor}:* ${d.recomendacion}` } },
    {
      type: 'context',
      elements: [{ type: 'mrkdwn', text: d.urgente ? '🔴 Marcada como urgencia real' : '🟡 Puede esperar a la ventana de dudas' }],
    },
  ];
}

// --- Helpers de envío ---
export async function postToDudasChannel(blocks: unknown[], text: string) {
  return slack().chat.postMessage({
    channel: env.slackDudasChannel,
    text,
    blocks: blocks as never,
  });
}

export async function postInThread(channel: string, threadTs: string, text: string) {
  return slack().chat.postMessage({ channel, thread_ts: threadTs, text });
}

export async function reactInThread(channel: string, ts: string, emoji: string) {
  try {
    await slack().reactions.add({ channel, timestamp: ts, name: emoji });
  } catch {
    /* ignora si ya existe */
  }
}

export async function dmUser(slackUserId: string, text: string) {
  const open = await slack().conversations.open({ users: slackUserId });
  const channel = open.channel?.id;
  if (!channel) return;
  await slack().chat.postMessage({ channel, text });
}

export async function postDaily(contenido: string) {
  return slack().chat.postMessage({
    channel: env.slackDailyChannel,
    text: '📊 Daily del COO',
    blocks: [
      { type: 'header', text: { type: 'plain_text', text: '📊 Daily del COO' } },
      { type: 'section', text: { type: 'mrkdwn', text: contenido } },
    ] as never,
  });
}

export async function userDisplayName(slackUserId: string): Promise<string> {
  try {
    const info = await slack().users.info({ user: slackUserId });
    return info.user?.profile?.real_name || info.user?.real_name || info.user?.name || slackUserId;
  } catch {
    return slackUserId;
  }
}
