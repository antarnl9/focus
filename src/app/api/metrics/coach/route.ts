import { NextResponse } from 'next/server';
import { requireUser } from '@/lib/auth';
import { hasAnthropic } from '@/lib/env';
import { computeMetrics } from '@/lib/metrics';
import { alignmentCoach } from '@/lib/anthropic';
import { getCooProfile, cooContextString } from '@/lib/coo';
import { localDateStr, addDaysStr } from '@/lib/time';

// Coach de alineación con IA: ¿voy alineado a mis prioridades y objetivo?
export async function POST(request: Request) {
  const auth = await requireUser();
  if (!auth.ok) return auth.response;
  if (!hasAnthropic()) return NextResponse.json({ error: 'ANTHROPIC_API_KEY no configurada' }, { status: 400 });
  const { supabase, user } = auth;

  const body = (await request.json().catch(() => ({}))) as { desde?: string; hasta?: string };
  const hasta = body.hasta || localDateStr();
  const desde = body.desde || addDaysStr(hasta, -6);

  try {
    const [metrics, priosR, bitR, grabsR, profile] = await Promise.all([
      computeMetrics(supabase, user.id, desde, hasta),
      supabase.from('prioridades').select('tier, texto, done').eq('user_id', user.id).order('tier'),
      supabase
        .from('bitacora')
        .select('tipo, texto')
        .eq('user_id', user.id)
        .gte('fecha', desde)
        .lte('fecha', hasta)
        .order('created_at', { ascending: false }),
      supabase.from('grabaciones').select('label').eq('user_id', user.id).gte('fecha', desde).lte('fecha', hasta),
      getCooProfile(supabase, user.id),
    ]);

    const juntaMap = new Map<string, number>();
    for (const g of grabsR.data ?? []) juntaMap.set(g.label, (juntaMap.get(g.label) ?? 0) + 1);

    const result = await alignmentCoach({
      contexto: cooContextString(profile),
      rango: `${desde} a ${hasta}`,
      metricas: {
        dudasCreadas: metrics.dudasCreadas,
        dudasResueltas: metrics.dudasResueltas,
        tiempoPromedioMin: metrics.tiempoPromedioMin,
        pctEnVentana: metrics.pctEnVentana,
        cumplimientoProtegido: metrics.cumplimientoProtegido,
      },
      prioridades: (priosR.data ?? []).map((p) => ({ tier: p.tier, texto: p.texto, done: !!p.done })),
      bitacora: (bitR.data ?? []).map((b) => ({ tipo: b.tipo, texto: b.texto })),
      juntas: [...juntaMap.entries()].map(([label, veces]) => ({ label, veces })),
    });

    return NextResponse.json({ coach: result });
  } catch (e) {
    console.error('[coach]', e);
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
