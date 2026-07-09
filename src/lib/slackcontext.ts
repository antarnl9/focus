import { WebClient } from '@slack/web-api';
import type { SupabaseClient } from '@supabase/supabase-js';
import { getSlackUserToken } from './slack';
import { summarizeSlack } from './anthropic';
import { hasAnthropic } from './env';
import { createSupabaseAdmin } from './supabase/admin';

const MAX_CONVERSATIONS = 15;
const MSGS_PER_CONV = 25;
const SINCE_HOURS = 48;

// Construye un volcado de texto de DMs + canales recientes del COO.
async function buildDigest(userToken: string): Promise<{ text: string; mensajes: number }> {
  const web = new WebClient(userToken);
  const oldest = String(Math.floor(Date.now() / 1000) - SINCE_HOURS * 3600);
  const nameCache = new Map<string, string>();

  async function userName(id?: string): Promise<string> {
    if (!id) return 'alguien';
    if (nameCache.has(id)) return nameCache.get(id)!;
    try {
      const info = await web.users.info({ user: id });
      const n = info.user?.profile?.real_name || info.user?.real_name || info.user?.name || id;
      nameCache.set(id, n);
      return n;
    } catch {
      return id;
    }
  }

  let convs: { id: string; label: string }[] = [];
  try {
    const res = await web.conversations.list({
      types: 'public_channel,private_channel,im,mpim',
      exclude_archived: true,
      limit: 200,
    });
    for (const c of res.channels ?? []) {
      const isChannel = c.is_channel || c.is_group;
      if (isChannel && !c.is_member) continue;
      let label = c.name ? `#${c.name}` : '';
      if (c.is_im && c.user) label = `DM con ${await userName(c.user)}`;
      else if (c.is_mpim) label = c.name || 'grupo';
      convs.push({ id: c.id!, label: label || c.id! });
    }
  } catch (e) {
    console.error('[slackcontext] conversations.list', e);
  }

  // Prioriza DMs y limita cantidad.
  convs = convs.slice(0, MAX_CONVERSATIONS);

  const parts: string[] = [];
  let mensajes = 0;
  for (const conv of convs) {
    try {
      const h = await web.conversations.history({ channel: conv.id, oldest, limit: MSGS_PER_CONV });
      const msgs = (h.messages ?? []).filter((m) => m.text && !m.subtype).reverse();
      if (!msgs.length) continue;
      const lines: string[] = [];
      for (const m of msgs) {
        const who = await userName(m.user);
        lines.push(`${who}: ${(m.text ?? '').replace(/\s+/g, ' ').slice(0, 400)}`);
        mensajes++;
      }
      parts.push(`### ${conv.label}\n${lines.join('\n')}`);
    } catch {
      /* canal sin permiso o error puntual */
    }
  }

  return { text: parts.join('\n\n'), mensajes };
}

// Sincroniza el contexto de Slack: jala → resume → guarda.
export async function syncSlackContext(userId: string): Promise<{ ok: boolean; mensajes: number; resumen: string; error?: string }> {
  const token = await getSlackUserToken(userId);
  if (!token) return { ok: false, mensajes: 0, resumen: '', error: 'Slack no conectado' };

  const { text, mensajes } = await buildDigest(token);
  let resumen = '';
  if (mensajes === 0) {
    resumen = 'Sin conversaciones recientes en las últimas 48 h.';
  } else if (hasAnthropic()) {
    try {
      resumen = await summarizeSlack(text);
    } catch (e) {
      console.error('[slackcontext] summarize', e);
      resumen = 'No se pudo resumir (IA).';
    }
  } else {
    resumen = `${mensajes} mensajes recientes (configura Anthropic para el resumen).`;
  }

  const admin = createSupabaseAdmin();
  await admin.from('slack_context').upsert(
    { user_id: userId, resumen, mensajes, actualizado: new Date().toISOString() },
    { onConflict: 'user_id' }
  );
  return { ok: true, mensajes, resumen };
}

// Resumen guardado (para alimentar la IA del Daily / coach).
export async function getSlackContextSummary(client: SupabaseClient, userId: string): Promise<string> {
  const { data } = await client.from('slack_context').select('resumen').eq('user_id', userId).maybeSingle();
  return data?.resumen ? `Contexto reciente de Slack del COO:\n${data.resumen}` : '';
}
