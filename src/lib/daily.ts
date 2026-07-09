import type { SupabaseClient } from '@supabase/supabase-js';
import { composeDaily, type DailyInput } from './anthropic';
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
    client.from('grabaciones').select('label, acuerdos').eq('user_id', userId).eq('fecha', fecha),
  ]);

  const acuerdos: DailyInput['acuerdos'] = [];
  for (const g of grabs.data ?? []) {
    for (const a of ((g.acuerdos as { acuerdo: string; responsable?: string; fecha?: string }[]) ?? [])) {
      acuerdos.push({ junta: g.label, acuerdo: a.acuerdo, responsable: a.responsable, fecha: a.fecha });
    }
  }

  return {
    fecha,
    bitacora: (bit.data ?? []).map((b) => ({ hora: b.hora, tipo: b.tipo, texto: b.texto })),
    dudasResueltas: (dudasRes.data ?? []).map((d) => ({ autor: d.autor_nombre || 'equipo', decision: d.decision || '', resolucion: d.resolucion || '' })),
    dudasPendientes: (dudasPend.data ?? []).map((d) => ({ autor: d.autor_nombre || 'equipo', decision: d.decision || '', urgente: !!d.urgente })),
    prioridades: (prios.data ?? []).map((p) => ({ tier: p.tier, texto: p.texto, done: !!p.done })),
    acuerdos,
  };
}

// Compone el Daily con IA y lo guarda (upsert) en la tabla dailies.
export async function generateAndSaveDaily(client: SupabaseClient, userId: string, fecha: string): Promise<string> {
  const input = await gatherDailyData(client, userId, fecha);
  const contexto = await fullCooContext(client, userId);
  const contenido = await composeDaily(input, contexto);
  await client.from('dailies').upsert(
    { user_id: userId, fecha, contenido, enviado_slack: false },
    { onConflict: 'user_id,fecha' }
  );
  return contenido;
}
