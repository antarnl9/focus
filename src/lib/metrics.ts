import type { SupabaseClient } from '@supabase/supabase-js';
import { weekStartStr, weekdaysStr, localMidnightISO, hmToMinutes, minutesOfDay } from './time';
import { listWeekEvents } from './google';

export interface WeeklyMetrics {
  weekStart: string;
  dudasCreadas: number;
  dudasResueltas: number;
  dudasRedirigidas: number;
  dudasPendientes: number;
  tiempoPromedioMin: number | null; // minutos promedio a resolución
  pctEnVentana: number | null; // % resueltas dentro de una ventana de dudas
  resueltasEnVentana: number;
  resueltasInterrupcion: number;
  porOwner: { owner: string; count: number }[];
  cumplimientoProtegido: number | null; // % de bloques protegidos sin evento externo encima
  bloquesProtegidos: number;
  bloquesInvadidos: number;
}

// Métricas de la semana (spec §9 Fase 4, punto 12).
export async function computeWeeklyMetrics(client: SupabaseClient, userId: string): Promise<WeeklyMetrics> {
  const weekStart = weekStartStr();
  const since = localMidnightISO(weekStart);

  const [blocksR, creadasR, resueltasR, redirigidasR, pendientesR] = await Promise.all([
    client.from('day_blocks').select('hora_ini, hora_fin, tipo').eq('user_id', userId),
    client.from('dudas').select('id', { count: 'exact', head: true }).eq('user_id', userId).gte('created_at', since),
    client
      .from('dudas')
      .select('created_at, resolved_at')
      .eq('user_id', userId)
      .eq('estado', 'resuelta')
      .gte('resolved_at', since),
    client.from('dudas').select('redirigida_a').eq('user_id', userId).eq('estado', 'redirigida').gte('resolved_at', since),
    client.from('dudas').select('id', { count: 'exact', head: true }).eq('user_id', userId).eq('estado', 'pendiente'),
  ]);

  const blocks = blocksR.data ?? [];
  const dudasWindows = blocks
    .filter((b) => b.tipo === 'dudas')
    .map((b) => ({ ini: hmToMinutes(b.hora_ini), fin: hmToMinutes(b.hora_fin) }));

  // Tiempo a resolución + en-ventana vs interrupción.
  const resueltas = resueltasR.data ?? [];
  let sumaMin = 0;
  let enVentana = 0;
  for (const d of resueltas) {
    if (d.resolved_at && d.created_at) {
      sumaMin += (new Date(d.resolved_at).getTime() - new Date(d.created_at).getTime()) / 60000;
      const mins = minutesOfDay(new Date(d.resolved_at));
      if (dudasWindows.some((w) => mins >= w.ini && mins < w.fin)) enVentana++;
    }
  }
  const tiempoPromedioMin = resueltas.length ? Math.round(sumaMin / resueltas.length) : null;
  const pctEnVentana = resueltas.length ? Math.round((enVentana / resueltas.length) * 100) : null;

  // Redirigidas por owner.
  const ownerMap = new Map<string, number>();
  for (const r of redirigidasR.data ?? []) {
    const o = r.redirigida_a || 'Sin asignar';
    ownerMap.set(o, (ownerMap.get(o) ?? 0) + 1);
  }
  const porOwner = [...ownerMap.entries()].map(([owner, count]) => ({ owner, count })).sort((a, b) => b.count - a.count);

  // Cumplimiento de bloques protegidos: sin evento de Calendar encima.
  let cumplimientoProtegido: number | null = null;
  let bloquesProtegidos = 0;
  let bloquesInvadidos = 0;
  const protegidos = blocks.filter((b) => b.tipo === 'protegido' || b.tipo === 'comida');
  if (protegidos.length) {
    try {
      const events = await listWeekEvents(userId); // eventos que no son de Focus
      const dias = weekdaysStr();
      for (const dia of dias) {
        for (const b of protegidos) {
          bloquesProtegidos++;
          const bIni = hmToMinutes(b.hora_ini);
          const bFin = hmToMinutes(b.hora_fin);
          const invadido = events.some((ev) => {
            const evDay = ev.start.slice(0, 10);
            if (evDay !== dia) return false;
            const s = minutesOfDay(new Date(ev.start));
            const e = minutesOfDay(new Date(ev.end));
            return s < bFin && e > bIni; // solapamiento
          });
          if (invadido) bloquesInvadidos++;
        }
      }
      cumplimientoProtegido =
        bloquesProtegidos > 0 ? Math.round(((bloquesProtegidos - bloquesInvadidos) / bloquesProtegidos) * 100) : null;
    } catch {
      cumplimientoProtegido = null;
    }
  }

  return {
    weekStart,
    dudasCreadas: creadasR.count ?? 0,
    dudasResueltas: resueltas.length,
    dudasRedirigidas: (redirigidasR.data ?? []).length,
    dudasPendientes: pendientesR.count ?? 0,
    tiempoPromedioMin,
    pctEnVentana,
    resueltasEnVentana: enVentana,
    resueltasInterrupcion: resueltas.length - enVentana,
    porOwner,
    cumplimientoProtegido,
    bloquesProtegidos,
    bloquesInvadidos,
  };
}
