import Anthropic from '@anthropic-ai/sdk';
import { env } from './env';
import type { Acuerdo } from './types';

let _client: Anthropic | null = null;
function client(): Anthropic {
  if (!_client) _client = new Anthropic({ apiKey: env.anthropicKey() });
  return _client;
}

// Extrae el primer bloque de texto y parsea JSON de forma robusta.
function parseJSON<T>(text: string): T {
  const trimmed = text.trim();
  try {
    return JSON.parse(trimmed) as T;
  } catch {
    const match = trimmed.match(/\{[\s\S]*\}/);
    if (match) return JSON.parse(match[0]) as T;
    throw new Error('La IA no devolvió JSON válido: ' + trimmed.slice(0, 200));
  }
}

async function completeText(system: string, user: string, maxTokens = 2000): Promise<string> {
  const res = await client().messages.create({
    model: env.anthropicModel,
    max_tokens: maxTokens,
    system,
    messages: [{ role: 'user', content: user }],
  });
  return res.content
    .filter((b): b is Anthropic.TextBlock => b.type === 'text')
    .map((b) => b.text)
    .join('');
}

async function completeJSON<T>(system: string, user: string, maxTokens = 2000): Promise<T> {
  const text = await completeText(
    system + '\n\nResponde ÚNICAMENTE con JSON válido, sin explicaciones ni markdown.',
    user,
    maxTokens
  );
  return parseJSON<T>(text);
}

// ---------------------------------------------------------------------------
//  (a) + (b) Triage de duda: clasifica urgencia y valida formato.
// ---------------------------------------------------------------------------
export interface TriageInput {
  contexto?: string | null;
  decision?: string | null;
  opciones?: string | null;
  recomendacion?: string | null;
  impacto?: string | null;
  urgente_marcado?: boolean;
}

export interface TriageResult {
  completa: boolean;
  faltantes: string[];
  urgente: boolean;
  motivo: string;
  mensaje_para_completar: string;
}

export async function triageDuda(input: TriageInput): Promise<TriageResult> {
  const system = `Eres el asistente de triage del COO de T1. Evalúas dudas que el equipo envía por Slack.
Tu trabajo tiene dos partes:
1. VALIDAR FORMATO: la duda debe tener los 5 campos completos y sustanciales: contexto, decisión pedida, opciones, recomendación del owner, impacto si no se decide hoy. Un campo vacío, con "n/a", o de una sola palabra sin sentido cuenta como faltante.
2. CLASIFICAR URGENCIA: es "urgente" SOLO si es una urgencia real: cliente grande en riesgo, producción caída, dinero o reputación en juego, o bloqueo de un lanzamiento P0. Si no, es de "ventana" (puede esperar a la próxima ventana de dudas).

Devuelve JSON con:
- "completa": boolean (true si los 5 campos son sustanciales)
- "faltantes": string[] (nombres de los campos que faltan o son insuficientes; [] si está completa)
- "urgente": boolean
- "motivo": string (1 frase explicando la clasificación de urgencia)
- "mensaje_para_completar": string (si falta info, un mensaje breve y amable en español para pedir al autor que complete los campos faltantes; "" si está completa)`;

  const user = `DUDA:
Contexto: ${input.contexto || '(vacío)'}
Decisión que necesitan: ${input.decision || '(vacío)'}
Opciones que ven: ${input.opciones || '(vacío)'}
Recomendación del owner: ${input.recomendacion || '(vacío)'}
Impacto si no se decide hoy: ${input.impacto || '(vacío)'}
Marcó "urgencia real": ${input.urgente_marcado ? 'sí' : 'no'}`;

  return completeJSON<TriageResult>(system, user, 800);
}

// ---------------------------------------------------------------------------
//  (c) Resumen + acuerdos por transcripción de junta.
// ---------------------------------------------------------------------------
export interface MeetingSummary {
  resumen: string;
  acuerdos: Acuerdo[];
  pendientes: Acuerdo[];
}

export async function summarizeMeeting(label: string, transcript: string): Promise<MeetingSummary> {
  const system = `Eres el asistente del COO de T1. Recibes la transcripción (es-MX) de una junta y produces un resumen ejecutivo.
Devuelve JSON con:
- "resumen": string (3-6 líneas, lo esencial de la junta)
- "acuerdos": array de { "acuerdo": string, "responsable": string, "fecha": string } (decisiones tomadas; responsable y fecha "" si no se dijeron)
- "pendientes": array de { "acuerdo": string, "responsable": string, "fecha": string } (tareas o pendientes con fecha si aplica)
Sé conciso y concreto. No inventes responsables ni fechas.`;

  const user = `Junta: ${label}\n\nTranscripción:\n${transcript.slice(0, 100000)}`;
  return completeJSON<MeetingSummary>(system, user, 2500);
}

// ---------------------------------------------------------------------------
//  (d) Composición del Daily.
// ---------------------------------------------------------------------------
export interface DailyInput {
  fecha: string;
  bitacora: { hora: string; tipo: string; texto: string }[];
  dudasResueltas: { autor: string; decision: string; resolucion: string }[];
  dudasPendientes: { autor: string; decision: string; urgente: boolean }[];
  prioridades: { tier: number; texto: string; done: boolean }[];
  acuerdos: { junta: string; acuerdo: string; responsable?: string; fecha?: string }[];
  juntas: { label: string; resumen: string }[]; // resumen (o transcript) de lo grabado hoy
}

export async function composeDaily(input: DailyInput, contexto = ''): Promise<string> {
  const system = `${contexto ? contexto + '\n\n' : ''}Eres el asistente del COO de T1. Redactas el "Daily" de cierre que se envía al CEO por Slack.
Usa EXACTAMENTE este formato (markdown de Slack, con emojis):

✅ *Resuelto hoy*
- ...

🔄 *En curso*
- ...

🎯 *Mañana (top 3)*
- ...

⚠️ *Riesgos / bloqueos*
- ...

Reglas:
- Sé conciso, orientado a resultados. Bullets cortos.
- "Resuelto hoy" sale de la bitácora, dudas resueltas, prioridades completadas y lo tratado en las juntas grabadas.
- "En curso" de prioridades no terminadas y dudas pendientes.
- "Mañana (top 3)": exactamente 3 bullets con lo más importante para el día siguiente (basado en P0/P1 y pendientes).
- "Riesgos / bloqueos": dudas urgentes sin resolver, acuerdos con fecha próxima, o bloqueos evidentes. Si no hay, escribe "- Sin bloqueos identificados".
- Responde SOLO con el texto del Daily, sin encabezados extra ni comentarios.`;

  const user = `Fecha: ${input.fecha}

BITÁCORA DEL DÍA:
${input.bitacora.map((b) => `- [${b.hora}] (${b.tipo}) ${b.texto}`).join('\n') || '(sin entradas)'}

DUDAS RESUELTAS HOY:
${input.dudasResueltas.map((d) => `- ${d.autor}: ${d.decision} → ${d.resolucion}`).join('\n') || '(ninguna)'}

DUDAS PENDIENTES:
${input.dudasPendientes.map((d) => `- ${d.urgente ? '[URGENTE] ' : ''}${d.autor}: ${d.decision}`).join('\n') || '(ninguna)'}

PRIORIDADES:
${input.prioridades.map((p) => `- P${p.tier} ${p.done ? '[hecho]' : '[pendiente]'} ${p.texto}`).join('\n') || '(ninguna)'}

JUNTAS GRABADAS (resumen de lo discutido):
${input.juntas.map((j) => `- ${j.label}: ${j.resumen}`).join('\n') || '(ninguna)'}

ACUERDOS DE JUNTAS:
${input.acuerdos.map((a) => `- (${a.junta}) ${a.acuerdo}${a.responsable ? ` — ${a.responsable}` : ''}${a.fecha ? ` (${a.fecha})` : ''}`).join('\n') || '(ninguno)'}`;

  return (await completeText(system, user, 1800)).trim();
}

// ---------------------------------------------------------------------------
//  (g) Coach de alineación: ¿voy alineado a mis prioridades y objetivo?
// ---------------------------------------------------------------------------
export interface CoachInput {
  contexto: string; // perfil/objetivo del COO
  rango: string;
  metricas: {
    dudasCreadas: number;
    dudasResueltas: number;
    tiempoPromedioMin: number | null;
    pctEnVentana: number | null;
    cumplimientoProtegido: number | null;
  };
  prioridades: { tier: number; texto: string; done: boolean }[];
  bitacora: { tipo: string; texto: string }[];
  juntas: { label: string; veces: number }[];
}

export interface CoachResult {
  veredicto: 'alineado' | 'parcial' | 'desviado';
  resumen: string;
  bien: string[];
  ajusta: string[];
  siguiente_paso: string;
}

export async function alignmentCoach(input: CoachInput): Promise<CoachResult> {
  const system = `${input.contexto ? input.contexto + '\n\n' : ''}Eres el chief of staff del COO de T1. Evalúas qué tan alineado está su tiempo real con sus prioridades (P0/P1/P2) y su objetivo en la empresa.
Analiza la actividad del periodo (dudas, prioridades, bitácora, juntas) y responde con honestidad y foco.

Devuelve JSON:
- "veredicto": "alineado" | "parcial" | "desviado"
- "resumen": string (1-2 frases: qué tan alineado está y por qué)
- "bien": string[] (2-3 cosas que sí empujan sus P0/objetivo)
- "ajusta": string[] (2-3 cosas concretas a cambiar: tiempo mal invertido, P0 sin avanzar, juntas de bajo valor)
- "siguiente_paso": string (la acción #1 para volver/seguir alineado)
Sé específico y accionable. No inventes datos.`;

  const user = `PERIODO: ${input.rango}

MÉTRICAS:
- Dudas creadas: ${input.metricas.dudasCreadas}, resueltas: ${input.metricas.dudasResueltas}
- Tiempo promedio a resolución: ${input.metricas.tiempoPromedioMin ?? 'n/d'} min
- % resueltas en ventana: ${input.metricas.pctEnVentana ?? 'n/d'}%
- Cumplimiento de bloques protegidos: ${input.metricas.cumplimientoProtegido ?? 'n/d'}%

PRIORIDADES:
${input.prioridades.map((p) => `- P${p.tier} ${p.done ? '[hecho]' : '[pendiente]'} ${p.texto}`).join('\n') || '(ninguna)'}

BITÁCORA DEL PERIODO:
${input.bitacora.slice(0, 60).map((b) => `- (${b.tipo}) ${b.texto}`).join('\n') || '(sin entradas)'}

JUNTAS GRABADAS:
${input.juntas.map((j) => `- ${j.label} (${j.veces}x)`).join('\n') || '(ninguna)'}`;

  return completeJSON<CoachResult>(system, user, 1500);
}

// ---------------------------------------------------------------------------
//  (f) Revisión de viernes (spec §9 Fase 4, punto 13).
// ---------------------------------------------------------------------------
export interface FridayReviewInput {
  metricas: {
    dudasCreadas: number;
    dudasResueltas: number;
    tiempoPromedioMin: number | null;
    pctEnVentana: number | null;
    cumplimientoProtegido: number | null;
  };
  juntas: { label: string; veces: number }[];
  prioridadesPendientes: { tier: number; texto: string }[];
  prioridadesHechas: { tier: number; texto: string }[];
}

export async function fridayReview(input: FridayReviewInput): Promise<string> {
  const system = `Eres el chief of staff del COO de T1. Es viernes: haz la revisión semanal.
Con base en las métricas, juntas y prioridades de la semana, escribe una revisión honesta y accionable en markdown de Slack con EXACTAMENTE estas secciones:

🔪 *Juntas a considerar matar o comprimir*
- (juntas recurrentes de bajo valor; si todas aportan, dilo)

🟡 *Al 90% — cerrar la próxima semana*
- (prioridades casi listas o pendientes clave)

✅ *Wins de la semana*
- (logros según prioridades hechas y dudas resueltas)

🎯 *Foco de la próxima semana (top 3)*
- (3 apuestas concretas)

📉 *Señales*
- (1-3 observaciones de las métricas: tiempo a resolución, % en ventana, cumplimiento de bloques protegidos)

Sé directo y breve. Responde solo con el texto.`;

  const user = `MÉTRICAS DE LA SEMANA:
- Dudas creadas: ${input.metricas.dudasCreadas}
- Dudas resueltas: ${input.metricas.dudasResueltas}
- Tiempo promedio a resolución: ${input.metricas.tiempoPromedioMin ?? 'n/d'} min
- % resueltas en ventana: ${input.metricas.pctEnVentana ?? 'n/d'}%
- Cumplimiento de bloques protegidos: ${input.metricas.cumplimientoProtegido ?? 'n/d'}%

JUNTAS GRABADAS ESTA SEMANA:
${input.juntas.map((j) => `- ${j.label} (${j.veces}x)`).join('\n') || '(ninguna)'}

PRIORIDADES HECHAS:
${input.prioridadesHechas.map((p) => `- P${p.tier} ${p.texto}`).join('\n') || '(ninguna)'}

PRIORIDADES PENDIENTES:
${input.prioridadesPendientes.map((p) => `- P${p.tier} ${p.texto}`).join('\n') || '(ninguna)'}`;

  return (await completeText(system, user, 1500)).trim();
}

// ---------------------------------------------------------------------------
//  (h) Resumen de conversaciones de Slack (contexto).
// ---------------------------------------------------------------------------
export interface SlackSummary {
  resumen: string;
  recomendaciones: string;
}

export async function summarizeSlack(digest: string): Promise<SlackSummary> {
  const system = `Eres el chief of staff del COO de T1. Recibes un volcado de sus conversaciones recientes de Slack (DMs y canales).
Devuelve JSON con dos campos en markdown:
- "resumen": viñetas por tema/persona de lo que se está hablando (decisiones pendientes, qué esperan de él, riesgos). Conciso, sintetizado, no copies literal. ~10 viñetas.
- "recomendaciones": viñetas de LO MÁS IMPORTANTE A ATACAR por el COO, priorizado (lo que debe decidir/responder/desbloquear hoy, con la persona o tema). 3-6 viñetas, muy accionable.`;
  return completeJSON<SlackSummary>(
    system + '\n\nResponde SOLO JSON válido.',
    digest.slice(0, 120000),
    2200
  );
}

// ---------------------------------------------------------------------------
//  (i) CEO Brief — formato estricto para #daily-ceo-brief.
// ---------------------------------------------------------------------------
export async function composeCeoDaily(input: DailyInput, contexto = ''): Promise<string> {
  const system = `${contexto ? contexto + '\n\n' : ''}Eres el chief of staff del COO de T1. Redactas su update diario para el CEO (Arturo) en el canal #daily-ceo-brief, en formato OBLIGATORIO y ejecutivo.

Usa EXACTAMENTE esta estructura (respeta títulos y numeración):

HOY (1–3 outcomes):
1) …
2) …
3) …
MAÑANA (1–3 prioridades):
1) …
2) …
3) …
AYUDA (0–2 asks sí/no o A/B):
- … (o N/A)
KILL (0–1):
- … (o N/A)
MÉTRICA/SEÑAL (1):
- …

REGLAS (críticas):
- Máximo 12–14 líneas reales (sin contar títulos).
- HOY = outcomes/entregables cerrados, NO actividades. Prohibido "llamada con…", "revisé…", "avancé…".
- MAÑANA = prioridades con entregable concreto.
- AYUDA = decisión clara sí/no o A vs B (máx 2). Si no hay ask real: N/A.
- KILL = algo que se pausó/pospuso para mantener foco, o N/A.
- MÉTRICA/SEÑAL = SIEMPRE debe existir: un número o señal corta y específica (no "todo bien", no "avanzando").
- No inventes datos: usa la bitácora, dudas, prioridades, resúmenes de juntas, acuerdos y el contexto de Slack. Si algo no aplica, N/A.
- Solo 1–3 por sección (no siempre 3).
Responde SOLO con el texto del brief, sin encabezados extra.`;

  const user = `Fecha: ${input.fecha}

BITÁCORA DEL DÍA:
${input.bitacora.map((b) => `- [${b.hora}] (${b.tipo}) ${b.texto}`).join('\n') || '(sin entradas)'}

DUDAS RESUELTAS HOY:
${input.dudasResueltas.map((d) => `- ${d.autor}: ${d.decision} → ${d.resolucion}`).join('\n') || '(ninguna)'}

DUDAS PENDIENTES:
${input.dudasPendientes.map((d) => `- ${d.urgente ? '[URGENTE] ' : ''}${d.autor}: ${d.decision}`).join('\n') || '(ninguna)'}

PRIORIDADES:
${input.prioridades.map((p) => `- P${p.tier} ${p.done ? '[hecho]' : '[pendiente]'} ${p.texto}`).join('\n') || '(ninguna)'}

JUNTAS GRABADAS (resumen de lo discutido):
${input.juntas.map((j) => `- ${j.label}: ${j.resumen}`).join('\n') || '(ninguna)'}

ACUERDOS DE JUNTAS:
${input.acuerdos.map((a) => `- (${a.junta}) ${a.acuerdo}${a.responsable ? ` — ${a.responsable}` : ''}${a.fecha ? ` (${a.fecha})` : ''}`).join('\n') || '(ninguno)'}`;

  return (await completeText(system, user, 1200)).trim();
}

// ---------------------------------------------------------------------------
//  (e) Resumen pre-ventana (DM 15 min antes).
// ---------------------------------------------------------------------------
export async function preWindowSummary(
  ventanaLabel: string,
  dudas: { autor: string; decision: string; urgente: boolean }[]
): Promise<string> {
  if (dudas.length === 0) {
    return `⏰ ${ventanaLabel} en 15 min. No tienes dudas acumuladas. 🎉`;
  }
  const system = `Eres el asistente del COO de T1. En 15 minutos empieza una ventana de dudas.
Redacta un DM MUY breve (2-4 líneas) que resuma las dudas acumuladas: cuántas hay, cuáles son urgentes y de quién, y el tema. Empieza con "⏰ ${ventanaLabel} en 15 min." Responde solo con el texto del mensaje.`;
  const user = `DUDAS ACUMULADAS (${dudas.length}):
${dudas.map((d) => `- ${d.urgente ? '[URGENTE] ' : ''}${d.autor}: ${d.decision}`).join('\n')}`;
  return (await completeText(system, user, 500)).trim();
}
