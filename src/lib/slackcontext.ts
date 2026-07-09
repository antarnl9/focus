import { WebClient } from '@slack/web-api';
import type { SupabaseClient } from '@supabase/supabase-js';
import { getSlackUserToken } from './slack';
import { summarizeSlack } from './anthropic';
import { hasAnthropic } from './env';
import { createSupabaseAdmin } from './supabase/admin';

const MAX_CONVERSATIONS = 30;
const MSGS_PER_CONV = 25;
const SINCE_HOURS = 48;

// Construye un volcado de texto de DMs + canales recientes del COO.
async function buildDigest(userToken: string): Promise<{ text: string; mensajes: number; convs: number; note: string }> {
  const web = new WebClient(userToken);
  const oldest = String(Math.floor(Date.now() / 1000) - SINCE_HOURS * 3600);
  const nameCache = new Map<string, string>();
  let note = '';

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

  // Lista SOLO las conversaciones del usuario (DMs + canales donde está).
  const raw: { id: string; label: string; kind: number }[] = [];
  try {
    let cursor: string | undefined;
    for (let page = 0; page < 3; page++) {
      const res = await web.users.conversations({
        types: 'im,mpim,private_channel,public_channel',
        exclude_archived: true,
        limit: 200,
        cursor,
      });
      for (const c of res.channels ?? []) {
        let label = c.name ? `#${c.name}` : '';
        let kind = 2;
        if (c.is_im && c.user) {
          label = `DM con ${await userName(c.user)}`;
          kind = 0;
        } else if (c.is_mpim) {
          label = c.name || 'grupo';
          kind = 1;
        }
        raw.push({ id: c.id!, label: label || c.id!, kind });
      }
      cursor = res.response_metadata?.next_cursor;
      if (!cursor) break;
    }
  } catch (e) {
    note = 'No pude listar tus conversaciones (revisa permisos: im:read, channels:read, groups:read). ';
    console.error('[slackcontext] users.conversations', e);
  }

  // Prioriza DMs, luego grupos, luego canales.
  const convs = raw.sort((a, b) => a.kind - b.kind).slice(0, MAX_CONVERSATIONS);

  const parts: string[] = [];
  let mensajes = 0;
  let scopeError = false;
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
    } catch (err) {
      if ((err as { data?: { error?: string } }).data?.error === 'missing_scope') scopeError = true;
    }
  }
  if (scopeError && mensajes === 0) {
    note += 'Falta permiso de historial (im:history / channels:history / groups:history): reconecta Slack tras agregar los scopes. ';
  }

  return { text: parts.join('\n\n'), mensajes, convs: convs.length, note };
}

// Sincroniza el contexto de Slack: jala → resume → guarda.
export async function syncSlackContext(userId: string): Promise<{ ok: boolean; mensajes: number; resumen: string; error?: string }> {
  const token = await getSlackUserToken(userId);
  if (!token) return { ok: false, mensajes: 0, resumen: '', error: 'Slack no conectado' };

  const { text, mensajes, convs, note } = await buildDigest(token);
  let resumen = '';
  if (mensajes === 0) {
    resumen = note
      ? `No jalé mensajes. ${note}(Revisé ${convs} conversaciones.)`
      : `Sin mensajes en las últimas 48 h. Revisé ${convs} conversaciones.`;
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
