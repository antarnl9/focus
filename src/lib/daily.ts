import type { SupabaseClient } from '@supabase/supabase-js';
import { composeDaily, composeCeoDaily, type DailyInput } from './anthropic';
import { fullCooContext } from './coo';

// Reúne los insumos del Daily desde la BD (spec §3.6). Funciona con el cliente
// del usuario (RLS) o con el admin (cron/worker) — solo hay que filtrar por user_id.
export async function gatherDailyData(client: SupabaseClient, userId: string, fecha: string): Promise<DailyInput> {
  const [bit, dudasRes, dudasPend, prios, grabs] = await Promise.all([
    client.from('bitacora').select('hora, tipo, texto').eq('user_id', userId).eq('fecha', fecha).order('created_at'),
    client
      .from('dudas')
      .select('autor_nombre, decision, resolucion')
      .eq('user_id', userId)
      .eq('estado', 'resuelta')
      .gte('resolved_at', `${fecha}T00:00:00`),
    client.from('dudas').select('autor_nombre, decision, urgente').eq('user_id', userId).in('estado', ['pendiente', 'incompleta']),
    client.from('prioridades').select('tier, texto, done').eq('user_id', userId).order('tier'),
    client.from('grabaciones').select('label, resumen, transcript, acuerdos').eq('user_id', userId).eq('fecha', fecha),
  ]);

  const acuerdos: DailyInput['acuerdos'] = [];
  const juntas: DailyInput['juntas'] = [];
  for (const g of grabs.data ?? []) {
    for (const a of ((g.acuerdos as { acuerdo: string; responsable?: string; fecha?: string }[]) ?? [])) {
      acuerdos.push({ junta: g.label, acuerdo: a.acuerdo, responsable: a.responsable, fecha: a.fecha });
    }
    // Prefiere el resumen IA; si no hay, usa un extracto del transcript.
    const resumen = (g.resumen as string) || '';
    const transcript = (g.transcript as string) || '';
    const texto = resumen || (transcript ? transcript.slice(0, 1500) : '');
    if (texto) juntas.push({ label: g.label as string, resumen: texto });
  }

  return {
    fecha,
    bitacora: (bit.data ?? []).map((b) => ({ hora: b.hora, tipo: b.tipo, texto: b.texto })),
    dudasResueltas: (dudasRes.data ?? []).map((d) => ({ autor: d.autor_nombre || 'equipo', decision: d.decision || '', resolucion: d.resolucion || '' })),
    dudasPendientes: (dudasPend.data ?? []).map((d) => ({ autor: d.autor_nombre || 'equipo', decision: d.decision || '', urgente: !!d.urgente })),
    prioridades: (prios.data ?? []).map((p) => ({ tier: p.tier, texto: p.texto, done: !!p.done })),
    acuerdos,
    juntas,
  };
}

// Compone AMBOS dailies (CEO Brief + personal) y los guarda.
export async function generateAndSaveDailies(
  client: SupabaseClient,
  userId: string,
  fecha: string
): Promise<{ ceo: string; personal: string }> {
  const input = await gatherDailyData(client, userId, fecha);
  const contexto = await fullCooContext(client, userId);
  const [ceo, personal] = await Promise.all([composeCeoDaily(input, contexto), composeDaily(input, contexto)]);
  await client.from('dailies').upsert(
    [
      { user_id: userId, fecha, tipo: 'ceo', contenido: ceo, enviado_slack: false },
      { user_id: userId, fecha, tipo: 'personal', contenido: personal, enviado_slack: false },
    ],
    { onConflict: 'user_id,fecha,tipo' }
  );
  return { ceo, personal };
}
