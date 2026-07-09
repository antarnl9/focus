import { NextResponse } from 'next/server';
import { requireUser } from '@/lib/auth';
import { hasAnthropic } from '@/lib/env';
import { computeWeeklyMetrics } from '@/lib/metrics';
import { fridayReview } from '@/lib/anthropic';
import { weekStartStr } from '@/lib/time';

// Genera la revisión de viernes con IA (spec §9 Fase 4, punto 13).
export async function POST() {
  const auth = await requireUser();
  if (!auth.ok) return auth.response;
  if (!hasAnthropic()) return NextResponse.json({ error: 'ANTHROPIC_API_KEY no configurada' }, { status: 400 });

  const { supabase, user } = auth;
  const weekStart = weekStartStr();

  try {
    const [metrics, grabsR, priosR] = await Promise.all([
      computeWeeklyMetrics(supabase, user.id),
      supabase.from('grabaciones').select('label').eq('user_id', user.id).gte('fecha', weekStart),
      supabase.from('prioridades').select('tier, texto, done').eq('user_id', user.id),
    ]);

    const juntaMap = new Map<string, number>();
    for (const g of grabsR.data ?? []) juntaMap.set(g.label, (juntaMap.get(g.label) ?? 0) + 1);
    const juntas = [...juntaMap.entries()].map(([label, veces]) => ({ label, veces }));

    const prios = priosR.data ?? [];
    const review = await fridayReview({
      metricas: {
        dudasCreadas: metrics.dudasCreadas,
        dudasResueltas: metrics.dudasResueltas,
        tiempoPromedioMin: metrics.tiempoPromedioMin,
        pctEnVentana: metrics.pctEnVentana,
        cumplimientoProtegido: metrics.cumplimientoProtegido,
      },
      juntas,
      prioridadesPendientes: prios.filter((p) => !p.done).map((p) => ({ tier: p.tier, texto: p.texto })),
      prioridadesHechas: prios.filter((p) => p.done).map((p) => ({ tier: p.tier, texto: p.texto })),
    });

    return NextResponse.json({ review });
  } catch (e) {
    console.error('[semana] review', e);
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
