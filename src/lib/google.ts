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

// ¿El evento lo creó Focus? (por etiqueta nueva o por el prefijo viejo [Focus]).
export function isFocusEvent(e: { summary?: string | null; extendedProperties?: { private?: Record<string, string> | null } | null }): boolean {
  return e.extendedProperties?.private?.focus === '1' || (e.summary ?? '').startsWith('[Focus]');
}

// Regla de recurrencia semanal según los días del bloque (0=dom..6=sáb).
// Vacío/nulo = lun-vie (default de trabajo).
const BYDAY = ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA'];
function rruleFor(dias?: number[] | null): string {
  const src = dias && dias.length ? dias : [1, 2, 3, 4, 5];
  const days = src.map((d) => BYDAY[d]).filter(Boolean);
  return `RRULE:FREQ=WEEKLY;BYDAY=${days.join(',')}`;
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
      .filter((e) => (e.start?.dateTime || e.start?.date) && !isFocusEvent(e))
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
      .filter((e) => e.start?.dateTime && !isFocusEvent(e))
      .map((e) => ({
        id: e.id ?? '',
        summary: e.summary ?? '(sin título)',
        start: e.start?.dateTime ?? '',
        end: e.end?.dateTime ?? '',
        htmlLink: e.htmlLink ?? undefined,
        status: e.status ?? undefined,
      }));
  } catch (err) {
    console.error('[google] listEventsBetween', err);
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

// Crea un evento nuevo en Calendar (hoy) con invitados y les manda el invite.
export async function createEvent(
  userId: string,
  p: { summary: string; fecha: string; horaIni: string; horaFin: string; emails: string[]; description?: string }
): Promise<{ ok: boolean; error?: string }> {
  const cal = await getCalendarClient(userId);
  if (!cal) return { ok: false, error: 'Calendar no conectado' };
  try {
    await cal.events.insert({
      calendarId: env.googleCalendarId,
      sendUpdates: 'all',
      requestBody: {
        summary: p.summary,
        description: p.description || undefined,
        start: { dateTime: `${p.fecha}T${p.horaIni}:00`, timeZone: TZ },
        end: { dateTime: `${p.fecha}T${p.horaFin}:00`, timeZone: TZ },
        attendees: p.emails.map((e) => ({ email: e })),
      },
    });
    return { ok: true };
  } catch (err) {
    console.error('[google] createEvent', err);
    return { ok: false, error: (err as Error).message };
  }
}

// --- Operaciones sobre un evento (para editar desde la app) ---

// Agrega invitados a un evento y les manda el invite por correo.
// Si el evento es una ocurrencia de una serie recurrente, invita a TODA la
// serie (todos sus días), no solo a ese día.
export async function inviteToEvent(userId: string, eventId: string, emails: string[]): Promise<{ ok: boolean; error?: string }> {
  const cal = await getCalendarClient(userId);
  if (!cal) return { ok: false, error: 'Calendar no conectado' };
  try {
    const inst = await cal.events.get({ calendarId: env.googleCalendarId, eventId });
    // recurringEventId apunta al evento maestro de la serie; si existe, invita ahí.
    const targetId = inst.data.recurringEventId || eventId;
    const target =
      targetId === eventId ? inst : await cal.events.get({ calendarId: env.googleCalendarId, eventId: targetId });

    const existing = target.data.attendees ?? [];
    const set = new Map<string, { email: string }>();
    for (const a of existing) if (a.email) set.set(a.email.toLowerCase(), { email: a.email });
    for (const e of emails) if (e) set.set(e.toLowerCase(), { email: e });

    await cal.events.patch({
      calendarId: env.googleCalendarId,
      eventId: targetId,
      sendUpdates: 'all', // manda el invite
      requestBody: { attendees: [...set.values()] },
    });
    return { ok: true };
  } catch (err) {
    console.error('[google] inviteToEvent', err);
    return { ok: false, error: (err as Error).message };
  }
}

// Mueve un evento (nuevo horario, mismo día del evento).
export async function rescheduleEvent(userId: string, eventId: string, horaIni: string, horaFin: string): Promise<{ ok: boolean; error?: string }> {
  const cal = await getCalendarClient(userId);
  if (!cal) return { ok: false, error: 'Calendar no conectado' };
  try {
    const ev = await cal.events.get({ calendarId: env.googleCalendarId, eventId });
    const fecha = (ev.data.start?.dateTime ?? '').slice(0, 10) || localDateStr();
    await cal.events.patch({
      calendarId: env.googleCalendarId,
      eventId,
      sendUpdates: 'all',
      requestBody: {
        start: { dateTime: `${fecha}T${horaIni}:00`, timeZone: TZ },
        end: { dateTime: `${fecha}T${horaFin}:00`, timeZone: TZ },
      },
    });
    return { ok: true };
  } catch (err) {
    console.error('[google] rescheduleEvent', err);
    return { ok: false, error: (err as Error).message };
  }
}

// Actualiza el evento recurrente de un bloque de la plantilla: horario, nombre
// y días de recurrencia (para que Google respete los días específicos).
export async function updateBlockEvent(
  userId: string,
  eventId: string,
  p: { summary: string; horaIni: string; horaFin: string; dias?: number[] | null }
): Promise<{ ok: boolean; error?: string }> {
  const cal = await getCalendarClient(userId);
  if (!cal) return { ok: false, error: 'Calendar no conectado' };
  try {
    const ev = await cal.events.get({ calendarId: env.googleCalendarId, eventId });
    const fecha = (ev.data.start?.dateTime ?? '').slice(0, 10) || localDateStr();
    await cal.events.patch({
      calendarId: env.googleCalendarId,
      eventId,
      requestBody: {
        summary: p.summary,
        start: { dateTime: `${fecha}T${p.horaIni}:00`, timeZone: TZ },
        end: { dateTime: `${fecha}T${p.horaFin}:00`, timeZone: TZ },
        recurrence: [rruleFor(p.dias)],
      },
    });
    return { ok: true };
  } catch (err) {
    console.error('[google] updateBlockEvent', err);
    return { ok: false, error: (err as Error).message };
  }
}

// Cancela (elimina) un evento y avisa a los invitados.
// scope 'this' = solo esa ocurrencia; 'series' = toda la serie recurrente.
export async function cancelEvent(
  userId: string,
  eventId: string,
  scope: 'this' | 'series' = 'this'
): Promise<{ ok: boolean; error?: string }> {
  const cal = await getCalendarClient(userId);
  if (!cal) return { ok: false, error: 'Calendar no conectado' };
  try {
    let targetId = eventId;
    if (scope === 'series') {
      const inst = await cal.events.get({ calendarId: env.googleCalendarId, eventId });
      targetId = inst.data.recurringEventId || eventId; // maestro de la serie
    }
    await cal.events.delete({ calendarId: env.googleCalendarId, eventId: targetId, sendUpdates: 'all' });
    return { ok: true };
  } catch (err) {
    console.error('[google] cancelEvent', err);
    return { ok: false, error: (err as Error).message };
  }
}

// Borra los eventos viejos con prefijo [Focus] (o etiqueta focus) del calendario.
export async function cleanupFocusEvents(userId: string): Promise<{ ok: boolean; deleted: number; error?: string }> {
  const cal = await getCalendarClient(userId);
  if (!cal) return { ok: false, deleted: 0, error: 'Calendar no conectado' };
  try {
    const res = await cal.events.list({
      calendarId: env.googleCalendarId,
      timeMin: new Date(Date.now() - 60 * 86400000).toISOString(),
      timeMax: new Date(Date.now() + 200 * 86400000).toISOString(),
      singleEvents: false, // trae las series recurrentes (masters)
      maxResults: 2500,
    });
    const ids = new Set<string>();
    for (const e of res.data.items ?? []) {
      if (isFocusEvent(e)) ids.add(e.id ?? '');
    }
    let deleted = 0;
    for (const id of ids) {
      if (!id) continue;
      try {
        await cal.events.delete({ calendarId: env.googleCalendarId, eventId: id, sendUpdates: 'none' });
        deleted++;
      } catch {
        /* ya no existe o sin permiso */
      }
    }
    // Limpia referencias en day_blocks.
    await createSupabaseAdmin().from('day_blocks').update({ gcal_event_id: null }).eq('user_id', userId);
    return { ok: true, deleted };
  } catch (err) {
    console.error('[google] cleanupFocusEvents', err);
    return { ok: false, deleted: 0, error: (err as Error).message };
  }
}

// Escritura: crea la plantilla como eventos recurrentes (spec §3.1 / §5.2).
// Bloques 'protegido' y 'comida' como ocupado (opaque); 'dudas' con descripción.
export async function writeTemplateToCalendar(
  userId: string,
  blocks: { id: string; hora_ini: string; hora_fin: string; label: string; tipo: string; dias?: number[] | null }[]
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
          summary: b.label, // sin prefijo [Focus]
          description: desc || undefined,
          start: { dateTime: `${today}T${b.hora_ini}:00`, timeZone: TZ },
          end: { dateTime: `${today}T${b.hora_fin}:00`, timeZone: TZ },
          recurrence: [rruleFor(b.dias)],
          transparency: busy ? 'opaque' : 'transparent',
          visibility: b.tipo === 'dudas' ? 'public' : 'default',
          extendedProperties: { private: { focus: '1' } }, // etiqueta interna
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
