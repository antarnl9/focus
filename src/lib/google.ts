import { google, calendar_v3 } from 'googleapis';
import { env } from './env';
import { encrypt, decrypt } from './crypto';
import { createSupabaseAdmin } from './supabase/admin';
import { TZ, localDateStr } from './time';
import type { CalendarEvent } from './types';

// Construye un cliente OAuth2 autorizado para el usuario a partir de los tokens
// guardados (cifrados) en la tabla integraciones. Refresca y persiste si expira.
export async function getCalendarClient(userId: string): Promise<calendar_v3.Calendar | null> {
  const admin = createSupabaseAdmin();
  const { data } = await admin
    .from('integraciones')
    .select('access_token, refresh_token, expira')
    .eq('user_id', userId)
    .eq('proveedor', 'google')
    .maybeSingle();

  if (!data?.refresh_token && !data?.access_token) return null;

  const oauth2 = new google.auth.OAuth2(env.googleClientId, env.googleClientSecret);
  oauth2.setCredentials({
    access_token: data.access_token ? safeDecrypt(data.access_token) : undefined,
    refresh_token: data.refresh_token ? safeDecrypt(data.refresh_token) : undefined,
    expiry_date: data.expira ? new Date(data.expira).getTime() : undefined,
  });

  // Persiste el token refrescado.
  oauth2.on('tokens', async (tokens) => {
    const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (tokens.access_token) patch.access_token = encrypt(tokens.access_token);
    if (tokens.refresh_token) patch.refresh_token = encrypt(tokens.refresh_token);
    if (tokens.expiry_date) patch.expira = new Date(tokens.expiry_date).toISOString();
    await admin.from('integraciones').update(patch).eq('user_id', userId).eq('proveedor', 'google');
  });

  return google.calendar({ version: 'v3', auth: oauth2 });
}

function safeDecrypt(v: string): string {
  try {
    return decrypt(v);
  } catch {
    return v; // por si se guardó en claro durante pruebas
  }
}

// Guarda los tokens del provider Google (del login OAuth) cifrados.
export async function saveGoogleTokens(userId: string, accessToken?: string | null, refreshToken?: string | null, expiresIn?: number) {
  const admin = createSupabaseAdmin();
  const patch: Record<string, unknown> = { user_id: userId, proveedor: 'google', updated_at: new Date().toISOString() };
  if (accessToken) patch.access_token = encrypt(accessToken);
  if (refreshToken) patch.refresh_token = encrypt(refreshToken);
  patch.scopes = 'calendar.events calendar.readonly';
  if (expiresIn) patch.expira = new Date(Date.now() + expiresIn * 1000).toISOString();
  await admin.from('integraciones').upsert(patch, { onConflict: 'user_id,proveedor' });
}

// Lectura: eventos del día (spec §3.1 / §5.2).
export async function listTodayEvents(userId: string): Promise<CalendarEvent[]> {
  const cal = await getCalendarClient(userId);
  if (!cal) return [];
  const today = localDateStr();
  const timeMin = new Date(`${today}T00:00:00`);
  const timeMax = new Date(`${today}T23:59:59`);
  try {
    const res = await cal.events.list({
      calendarId: env.googleCalendarId,
      timeMin: timeMin.toISOString(),
      timeMax: timeMax.toISOString(),
      singleEvents: true,
      orderBy: 'startTime',
      timeZone: TZ,
      maxResults: 50,
    });
    return (res.data.items ?? [])
      .filter((e) => e.start?.dateTime || e.start?.date)
      .map((e) => ({
        id: e.id ?? '',
        summary: e.summary ?? '(sin título)',
        start: e.start?.dateTime ?? `${e.start?.date}T00:00:00`,
        end: e.end?.dateTime ?? `${e.end?.date}T23:59:59`,
        htmlLink: e.htmlLink ?? undefined,
        status: e.status ?? undefined,
      }));
  } catch (err) {
    console.error('[google] listTodayEvents', err);
    return [];
  }
}

// Lectura de eventos EXTERNOS (no creados por Focus) en un rango de fechas.
// Se usa para medir el cumplimiento de bloques protegidos (spec §9 Fase 4).
export async function listEventsBetween(userId: string, desde: string, hasta: string): Promise<CalendarEvent[]> {
  const cal = await getCalendarClient(userId);
  if (!cal) return [];
  const timeMin = new Date(`${desde}T00:00:00`);
  const timeMax = new Date(`${hasta}T23:59:59`);
  try {
    const res = await cal.events.list({
      calendarId: env.googleCalendarId,
      timeMin: timeMin.toISOString(),
      timeMax: timeMax.toISOString(),
      singleEvents: true,
      orderBy: 'startTime',
      timeZone: TZ,
      maxResults: 250,
    });
    return (res.data.items ?? [])
      .filter((e) => e.start?.dateTime && !(e.summary ?? '').startsWith('[Focus]'))
      .map((e) => ({
        id: e.id ?? '',
        summary: e.summary ?? '(sin título)',
        start: e.start?.dateTime ?? '',
        end: e.end?.dateTime ?? '',
        htmlLink: e.htmlLink ?? undefined,
        status: e.status ?? undefined,
      }));
  } catch (err) {
    console.error('[google] listWeekEvents', err);
    return [];
  }
}

// Invitados de eventos en un rango (para importar personas). Excluye al COO.
export async function listAttendees(userId: string, desde: string, hasta: string): Promise<{ email: string; nombre: string }[]> {
  const cal = await getCalendarClient(userId);
  if (!cal) return [];
  try {
    const res = await cal.events.list({
      calendarId: env.googleCalendarId,
      timeMin: new Date(`${desde}T00:00:00`).toISOString(),
      timeMax: new Date(`${hasta}T23:59:59`).toISOString(),
      singleEvents: true,
      orderBy: 'startTime',
      timeZone: TZ,
      maxResults: 250,
    });
    const map = new Map<string, { email: string; nombre: string }>();
    for (const e of res.data.items ?? []) {
      for (const a of e.attendees ?? []) {
        if (a.self || a.resource) continue;
        const email = (a.email ?? '').toLowerCase();
        if (!email || map.has(email)) continue;
        map.set(email, { email, nombre: a.displayName || email.split('@')[0] });
      }
    }
    return [...map.values()];
  } catch (err) {
    console.error('[google] listAttendees', err);
    return [];
  }
}

// Escritura: crea la plantilla como eventos recurrentes (spec §3.1 / §5.2).
// Bloques 'protegido' y 'comida' como ocupado (opaque); 'dudas' con descripción.
export async function writeTemplateToCalendar(
  userId: string,
  blocks: { id: string; hora_ini: string; hora_fin: string; label: string; tipo: string }[]
): Promise<{ ok: boolean; created: number; error?: string }> {
  const cal = await getCalendarClient(userId);
  if (!cal) return { ok: false, created: 0, error: 'Calendar no conectado' };

  const today = localDateStr();
  const admin = createSupabaseAdmin();
  let created = 0;

  for (const b of blocks) {
    // Recurrencia entre semana (lun-vie).
    const busy = b.tipo === 'protegido' || b.tipo === 'comida';
    const desc =
      b.tipo === 'dudas'
        ? 'Ventana de dudas del COO. Envía tu duda con /duda en Slack (#dudas-coo) con contexto, decisión, opciones, recomendación e impacto.'
        : b.tipo === 'protegido'
        ? 'Bloque protegido de definición estratégica. No agendar encima.'
        : '';
    try {
      const res = await cal.events.insert({
        calendarId: env.googleCalendarId,
        requestBody: {
          summary: `[Focus] ${b.label}`,
          description: desc || undefined,
          start: { dateTime: `${today}T${b.hora_ini}:00`, timeZone: TZ },
          end: { dateTime: `${today}T${b.hora_fin}:00`, timeZone: TZ },
          recurrence: ['RRULE:FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR'],
          transparency: busy ? 'opaque' : 'transparent',
          visibility: b.tipo === 'dudas' ? 'public' : 'default',
        },
      });
      if (res.data.id) {
        await admin.from('day_blocks').update({ gcal_event_id: res.data.id }).eq('id', b.id);
        created++;
      }
    } catch (err) {
      console.error('[google] insert', b.label, err);
    }
  }
  return { ok: true, created };
}
