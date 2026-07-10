import type { SupabaseClient } from '@supabase/supabase-js';
import type { calendar_v3 } from 'googleapis';
import { getCalendarClient, isFocusEvent } from './google';
import { createSupabaseAdmin } from './supabase/admin';
import { env } from './env';
import { TZ, localDateStr } from './time';
import type { CalendarEvent, EventAttendee } from './types';

// Ventana del espejo en la primera sincronización (luego el syncToken trae todo).
const PAST_DAYS = 7;
const FUTURE_DAYS = 60;

interface EventoRow {
  user_id: string;
  gcal_id: string;
  summary: string | null;
  inicio: string | null;
  fin: string | null;
  all_day: boolean;
  html_link: string | null;
  status: string | null;
  attendees: EventAttendee[];
  es_focus: boolean;
  actualizado: string;
}

function mapAttendees(atts?: calendar_v3.Schema$EventAttendee[] | null): EventAttendee[] {
  const out: EventAttendee[] = [];
  for (const a of atts ?? []) {
    if (a.self || a.resource || !a.email) continue;
    out.push({ email: a.email.toLowerCase(), nombre: a.displayName || a.email.split('@')[0], respuesta: a.responseStatus ?? undefined });
  }
  return out;
}

function toRow(userId: string, e: calendar_v3.Schema$Event): EventoRow {
  const allDay = !e.start?.dateTime && !!e.start?.date;
  const inicio = e.start?.dateTime ?? (e.start?.date ? new Date(`${e.start.date}T00:00:00`).toISOString() : null);
  const fin = e.end?.dateTime ?? (e.end?.date ? new Date(`${e.end.date}T00:00:00`).toISOString() : null);
  return {
    user_id: userId,
    gcal_id: e.id ?? '',
    summary: e.summary ?? '(sin título)',
    inicio,
    fin,
    all_day: allDay,
    html_link: e.htmlLink ?? null,
    status: e.status ?? null,
    attendees: mapAttendees(e.attendees),
    es_focus: isFocusEvent(e),
    actualizado: new Date().toISOString(),
  };
}

// Sincroniza Google → espejo local (incremental si hay syncToken; si no, ventana).
export async function syncCalendar(userId: string): Promise<{ ok: boolean; cambios: number; error?: string }> {
  const cal = await getCalendarClient(userId);
  if (!cal) return { ok: false, cambios: 0, error: 'Calendar no conectado' };
  const admin = createSupabaseAdmin();

  const { data: integ } = await admin
    .from('integraciones')
    .select('cal_sync_token')
    .eq('user_id', userId)
    .eq('proveedor', 'google')
    .maybeSingle();

  let syncToken: string | undefined = integ?.cal_sync_token ?? undefined;
  let cambios = 0;

  async function runList(useToken: boolean): Promise<string | undefined> {
    const upserts: EventoRow[] = [];
    const deletes: string[] = [];
    let pageToken: string | undefined;
    let nextSyncToken: string | undefined;

    for (;;) {
      const params: calendar_v3.Params$Resource$Events$List = {
        calendarId: env.googleCalendarId,
        singleEvents: true,
        showDeleted: true, // para reconciliar cancelaciones
        maxResults: 250,
        pageToken,
      };
      if (useToken && syncToken) {
        params.syncToken = syncToken;
      } else {
        params.timeMin = new Date(Date.now() - PAST_DAYS * 86400000).toISOString();
        params.timeMax = new Date(Date.now() + FUTURE_DAYS * 86400000).toISOString();
      }
      const res = await cal!.events.list(params);
      for (const e of res.data.items ?? []) {
        if (!e.id) continue;
        if (e.status === 'cancelled' || isFocusEvent(e)) deletes.push(e.id);
        else upserts.push(toRow(userId, e));
      }
      pageToken = res.data.nextPageToken ?? undefined;
      if (res.data.nextSyncToken) nextSyncToken = res.data.nextSyncToken;
      if (!pageToken) break;
    }

    if (upserts.length) {
      await admin.from('eventos').upsert(upserts, { onConflict: 'user_id,gcal_id' });
      cambios += upserts.length;
    }
    if (deletes.length) {
      await admin.from('eventos').delete().eq('user_id', userId).in('gcal_id', deletes);
      cambios += deletes.length;
    }
    return nextSyncToken;
  }

  try {
    let nextToken: string | undefined;
    try {
      nextToken = await runList(!!syncToken);
    } catch (err) {
      // 410 GONE = syncToken caducó → full sync desde cero.
      if ((err as { code?: number }).code === 410) {
        syncToken = undefined;
        await admin.from('eventos').delete().eq('user_id', userId); // limpia el espejo viejo
        nextToken = await runList(false);
      } else {
        throw err;
      }
    }
    if (nextToken) {
      await admin
        .from('integraciones')
        .update({ cal_sync_token: nextToken })
        .eq('user_id', userId)
        .eq('proveedor', 'google');
    }
    return { ok: true, cambios };
  } catch (err) {
    console.error('[calendar] syncCalendar', err);
    return { ok: false, cambios: 0, error: (err as Error).message };
  }
}

// Lee del espejo los eventos de HOY (rápido, sin llamar a Google). Excluye los
// que creó Focus (esos ya se ven como bloques) y los cancelados.
export async function getTodayEventsFromDb(client: SupabaseClient, userId: string, today = localDateStr()): Promise<CalendarEvent[]> {
  const start = new Date(`${today}T00:00:00`).toISOString();
  const end = new Date(`${today}T23:59:59`).toISOString();
  const { data } = await client
    .from('eventos')
    .select('gcal_id, summary, inicio, fin, all_day, html_link, status, attendees')
    .eq('user_id', userId)
    .eq('es_focus', false)
    .gte('inicio', start)
    .lte('inicio', end)
    .order('inicio');
  return (data ?? []).map((r) => ({
    id: r.gcal_id,
    summary: r.summary ?? '(sin título)',
    start: r.inicio ?? start,
    end: r.fin ?? r.inicio ?? end,
    htmlLink: r.html_link ?? undefined,
    status: r.status ?? undefined,
    allDay: r.all_day ?? false,
    attendees: (r.attendees as EventAttendee[]) ?? [],
  }));
}

// --- Push (watch) ---------------------------------------------------------

// Token para validar que las notificaciones vienen de nuestro canal.
export function calWebhookToken(): string {
  return env.cronSecret || 'focus-cal';
}

// Registra (o renueva) el canal push de Google que apunta a nuestro webhook.
// Requiere dominio verificado en Google Cloud (ver notas de despliegue).
export async function ensureCalendarWatch(userId: string): Promise<{ ok: boolean; error?: string }> {
  const cal = await getCalendarClient(userId);
  if (!cal) return { ok: false, error: 'Calendar no conectado' };
  const admin = createSupabaseAdmin();

  const { data: integ } = await admin
    .from('integraciones')
    .select('cal_channel_id, cal_resource_id, cal_channel_expira')
    .eq('user_id', userId)
    .eq('proveedor', 'google')
    .maybeSingle();

  // ¿Sigue vigente por más de 2 días? No renueves.
  if (integ?.cal_channel_id && integ?.cal_channel_expira) {
    const restante = new Date(integ.cal_channel_expira).getTime() - Date.now();
    if (restante > 2 * 86400000) return { ok: true };
  }

  // Cierra el canal viejo si existía.
  if (integ?.cal_channel_id && integ?.cal_resource_id) {
    try {
      await cal.channels.stop({ requestBody: { id: integ.cal_channel_id, resourceId: integ.cal_resource_id } });
    } catch {
      /* ya expiró */
    }
  }

  const channelId = `focus-${userId}-${Date.now()}`;
  try {
    const res = await cal.events.watch({
      calendarId: env.googleCalendarId,
      requestBody: {
        id: channelId,
        type: 'web_hook',
        address: `${env.appUrl}/api/calendar/notifications`,
        token: calWebhookToken(),
        params: { ttl: String(7 * 86400) }, // 7 días
      },
    });
    await admin
      .from('integraciones')
      .update({
        cal_channel_id: channelId,
        cal_resource_id: res.data.resourceId ?? null,
        cal_channel_expira: res.data.expiration ? new Date(Number(res.data.expiration)).toISOString() : null,
      })
      .eq('user_id', userId)
      .eq('proveedor', 'google');
    return { ok: true };
  } catch (err) {
    console.error('[calendar] ensureCalendarWatch', err);
    return { ok: false, error: (err as Error).message };
  }
}

// Encuentra al usuario dueño de un canal push (para el webhook).
export async function userIdForChannel(channelId: string): Promise<string | null> {
  const admin = createSupabaseAdmin();
  const { data } = await admin.from('integraciones').select('user_id').eq('cal_channel_id', channelId).maybeSingle();
  return data?.user_id ?? null;
}

export { TZ };
