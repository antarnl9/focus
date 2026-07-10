import Anthropic from '@anthropic-ai/sdk';
import type { SupabaseClient } from '@supabase/supabase-js';
import { env } from './env';
import { localDateStr, localParts } from './time';
import { getTodayEventsFromDb, syncCalendar } from './calendar';
import { listEventsBetween, rescheduleEvent, createEvent, inviteToEvent, cancelEvent } from './google';

// Copiloto: le hablas/escribes y ejecuta acciones reales (tool use).
// Las acciones que mandan correo quedan como PROPUESTA y el usuario confirma.

export interface ChatTurn {
  role: 'user' | 'assistant';
  content: string;
}
export interface PendingAction {
  tool: string;
  input: Record<string, unknown>;
  titulo: string; // "Mover junta"
  detalle: string; // "“Reportes T1” → 17:00–17:30"
}

// Acciones que salen hacia afuera (mandan correo) → requieren confirmación.
const CONFIRM_TOOLS = new Set(['mover_junta', 'crear_junta', 'invitar_a_junta', 'cancelar_junta']);

const DIAS = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];

const TOOLS: Anthropic.Tool[] = [
  {
    name: 'agenda_hoy',
    description: 'Consulta las juntas (eventos de Google Calendar) y bloques de HOY. Úsalo para saber qué hay hoy y para obtener el id real de una junta antes de moverla, invitar o cancelar.',
    input_schema: { type: 'object', properties: {} },
  },
  {
    name: 'agenda_rango',
    description: 'Consulta juntas entre dos fechas (YYYY-MM-DD). Úsalo para días distintos a hoy.',
    input_schema: {
      type: 'object',
      properties: { desde: { type: 'string', description: 'YYYY-MM-DD' }, hasta: { type: 'string', description: 'YYYY-MM-DD' } },
      required: ['desde', 'hasta'],
    },
  },
  {
    name: 'buscar_persona',
    description: 'Busca personas del directorio por nombre o correo. Úsalo para obtener el correo de alguien antes de invitarlo.',
    input_schema: { type: 'object', properties: { query: { type: 'string' } }, required: ['query'] },
  },
  {
    name: 'listar_dudas',
    description: 'Lista las dudas pendientes del equipo.',
    input_schema: { type: 'object', properties: {} },
  },
  {
    name: 'tomar_nota',
    description: 'Guarda una nota rápida en la bitácora del COO (no manda correo).',
    input_schema: { type: 'object', properties: { texto: { type: 'string' } }, required: ['texto'] },
  },
  {
    name: 'crear_persona',
    description: 'Guarda a alguien en el directorio de personas (no manda correo).',
    input_schema: {
      type: 'object',
      properties: {
        nombre: { type: 'string' },
        correo: { type: 'string' },
        tipo: { type: 'string', enum: ['interno', 'cliente', 'proveedor', 'otro'] },
      },
      required: ['nombre'],
    },
  },
  {
    name: 'mover_junta',
    description: 'Mueve una junta a otro horario el mismo día (manda correo a los invitados). Requiere el event_id real (obténlo de la agenda).',
    input_schema: {
      type: 'object',
      properties: {
        event_id: { type: 'string' },
        titulo: { type: 'string', description: 'nombre de la junta, para mostrarlo' },
        hora_ini: { type: 'string', description: 'HH:MM 24h' },
        hora_fin: { type: 'string', description: 'HH:MM 24h' },
      },
      required: ['event_id', 'hora_ini', 'hora_fin'],
    },
  },
  {
    name: 'crear_junta',
    description: 'Crea una junta nueva y manda invitación a los correos indicados.',
    input_schema: {
      type: 'object',
      properties: {
        titulo: { type: 'string' },
        fecha: { type: 'string', description: 'YYYY-MM-DD' },
        hora_ini: { type: 'string', description: 'HH:MM 24h' },
        hora_fin: { type: 'string', description: 'HH:MM 24h' },
        invitados: { type: 'array', items: { type: 'string' }, description: 'correos' },
      },
      required: ['titulo', 'fecha', 'hora_ini', 'hora_fin'],
    },
  },
  {
    name: 'invitar_a_junta',
    description: 'Agrega invitados a una junta existente y les manda el invite. Requiere event_id real.',
    input_schema: {
      type: 'object',
      properties: {
        event_id: { type: 'string' },
        titulo: { type: 'string' },
        emails: { type: 'array', items: { type: 'string' } },
      },
      required: ['event_id', 'emails'],
    },
  },
  {
    name: 'cancelar_junta',
    description: 'Cancela (elimina) una junta y avisa a los invitados. Requiere event_id real.',
    input_schema: {
      type: 'object',
      properties: { event_id: { type: 'string' }, titulo: { type: 'string' } },
      required: ['event_id'],
    },
  },
];

function accionInfo(name: string, i: Record<string, unknown>): { titulo: string; detalle: string } {
  const inv = (i.invitados as string[]) ?? [];
  const emails = (i.emails as string[]) ?? [];
  switch (name) {
    case 'mover_junta':
      return { titulo: 'Mover junta', detalle: `“${i.titulo || 'la junta'}” → ${i.hora_ini}–${i.hora_fin}` };
    case 'crear_junta':
      return { titulo: 'Crear junta', detalle: `“${i.titulo}” · ${i.fecha} ${i.hora_ini}–${i.hora_fin}${inv.length ? ` · ${inv.join(', ')}` : ''}` };
    case 'invitar_a_junta':
      return { titulo: 'Invitar', detalle: `${emails.join(', ')} → “${i.titulo || 'la junta'}”` };
    case 'cancelar_junta':
      return { titulo: 'Cancelar junta', detalle: `“${i.titulo || 'la junta'}”` };
    default:
      return { titulo: name, detalle: '' };
  }
}

// Ejecuta las tools de solo-lectura y las internas (nota/persona) dentro del loop.
async function execTool(
  client: SupabaseClient,
  userId: string,
  name: string,
  input: Record<string, unknown>
): Promise<unknown> {
  switch (name) {
    case 'agenda_hoy': {
      const eventos = await getTodayEventsFromDb(client, userId);
      const { data: bloques } = await client
        .from('day_blocks')
        .select('label, hora_ini, hora_fin')
        .eq('user_id', userId)
        .order('orden');
      return {
        fecha: localDateStr(),
        eventos: eventos.map((e) => ({ id: e.id, titulo: e.summary, inicio: e.start, fin: e.end, invitados: (e.attendees ?? []).map((a) => a.email) })),
        bloques: bloques ?? [],
      };
    }
    case 'agenda_rango': {
      const evs = await listEventsBetween(userId, String(input.desde), String(input.hasta));
      return { eventos: evs.map((e) => ({ id: e.id, titulo: e.summary, inicio: e.start, fin: e.end })) };
    }
    case 'buscar_persona': {
      const q = String(input.query || '').replace(/[%,]/g, ' ');
      const { data } = await client
        .from('personas')
        .select('nombre, correo, puesto, tipo')
        .or(`nombre.ilike.%${q}%,correo.ilike.%${q}%`)
        .limit(8);
      return { personas: data ?? [] };
    }
    case 'listar_dudas': {
      const { data } = await client
        .from('dudas')
        .select('autor_nombre, decision, urgente')
        .eq('user_id', userId)
        .eq('estado', 'pendiente')
        .order('urgente', { ascending: false })
        .limit(15);
      return { dudas: data ?? [] };
    }
    case 'tomar_nota': {
      await client.from('bitacora').insert({ user_id: userId, tipo: 'nota', texto: String(input.texto || '') });
      return { ok: true };
    }
    case 'crear_persona': {
      await client.from('personas').insert({
        user_id: userId,
        nombre: String(input.nombre || ''),
        correo: input.correo ? String(input.correo) : null,
        tipo: (input.tipo as string) || 'otro',
      });
      return { ok: true };
    }
    default:
      return { error: 'tool desconocida' };
  }
}

// Corre el loop de tool-use y devuelve la respuesta + acciones por confirmar.
export async function runAssistant(
  client: SupabaseClient,
  userId: string,
  history: ChatTurn[],
  nombre: string
): Promise<{ reply: string; pendingActions: PendingAction[] }> {
  const anthropic = new Anthropic({ apiKey: env.anthropicKey() });
  const p = localParts(new Date());
  const system = `Eres el copiloto personal de ${nombre}, COO de T1. Ayudas por chat (voz o texto), en español, directo y breve.
Hoy es ${localDateStr()} (${DIAS[p.weekday] ?? ''}). Zona horaria America/Mexico_City, horas en formato 24h.
Tienes herramientas para consultar y actuar sobre el calendario, dudas y personas.
Reglas:
- Para mover, invitar o cancelar una junta necesitas su id real: primero consulta la agenda (agenda_hoy o agenda_rango). NUNCA inventes ids.
- Para invitar a alguien por su nombre, primero busca su correo con buscar_persona.
- Las acciones que mandan correo (mover_junta, crear_junta, invitar_a_junta, cancelar_junta) NO se ejecutan solas: quedan como propuesta y el usuario confirma con un botón. Cuando llames una, dile en una frase qué vas a hacer y pídele confirmar.
- tomar_nota y crear_persona sí se hacen directo.
- Una acción a la vez. Si falta un dato (hora, fecha, quién), pregúntalo en vez de adivinar.
- Sé breve, cálido y natural. No inventes datos que no obtuviste de las herramientas.`;

  const messages: Anthropic.MessageParam[] = history
    .filter((t) => t.content?.trim())
    .map((t) => ({ role: t.role, content: t.content }));

  const pendingActions: PendingAction[] = [];
  let reply = '';

  for (let step = 0; step < 6; step++) {
    const res = await anthropic.messages.create({ model: env.anthropicModel, max_tokens: 1500, system, tools: TOOLS, messages });
    reply = res.content
      .filter((b): b is Anthropic.TextBlock => b.type === 'text')
      .map((b) => b.text)
      .join('')
      .trim();

    if (res.stop_reason !== 'tool_use') break;

    messages.push({ role: 'assistant', content: res.content });
    const results: Anthropic.ToolResultBlockParam[] = [];
    for (const block of res.content) {
      if (block.type !== 'tool_use') continue;
      const input = (block.input ?? {}) as Record<string, unknown>;
      if (CONFIRM_TOOLS.has(block.name)) {
        pendingActions.push({ tool: block.name, input, ...accionInfo(block.name, input) });
        results.push({ type: 'tool_result', tool_use_id: block.id, content: 'Propuesta registrada. El usuario la confirmará con un botón; todavía NO se ha hecho.' });
      } else {
        const out = await execTool(client, userId, block.name, input);
        results.push({ type: 'tool_result', tool_use_id: block.id, content: JSON.stringify(out) });
      }
    }
    messages.push({ role: 'user', content: results });
  }

  return { reply, pendingActions };
}

// Ejecuta de verdad una acción confirmada por el usuario.
export async function executeAction(userId: string, action: PendingAction): Promise<{ ok: boolean; message: string }> {
  const i = action.input;
  try {
    let r: { ok: boolean; error?: string };
    switch (action.tool) {
      case 'mover_junta':
        r = await rescheduleEvent(userId, String(i.event_id), String(i.hora_ini), String(i.hora_fin));
        break;
      case 'crear_junta':
        r = await createEvent(userId, {
          summary: String(i.titulo),
          fecha: String(i.fecha),
          horaIni: String(i.hora_ini),
          horaFin: String(i.hora_fin),
          emails: (i.invitados as string[]) ?? [],
        });
        break;
      case 'invitar_a_junta':
        r = await inviteToEvent(userId, String(i.event_id), (i.emails as string[]) ?? []);
        break;
      case 'cancelar_junta':
        r = await cancelEvent(userId, String(i.event_id));
        break;
      default:
        return { ok: false, message: 'Acción no reconocida' };
    }
    if (!r.ok) return { ok: false, message: r.error || 'No se pudo completar' };
    await syncCalendar(userId).catch(() => {});
    return { ok: true, message: `✅ ${action.titulo}: ${action.detalle}` };
  } catch (e) {
    return { ok: false, message: (e as Error).message };
  }
}
