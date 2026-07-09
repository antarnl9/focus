import { NextResponse } from 'next/server';
import { requireUser } from '@/lib/auth';
import { computeMetrics } from '@/lib/metrics';
import { localDateStr, addDaysStr } from '@/lib/time';

// Métricas por rango de fecha (spec §9 Fase 4). GET /api/metrics?desde=&hasta=
export async function GET(request: Request) {
  const auth = await requireUser();
  if (!auth.ok) return auth.response;
  const { supabase, user } = auth;

  const url = new URL(request.url);
  const hasta = url.searchParams.get('hasta') || localDateStr();
  const desde = url.searchParams.get('desde') || addDaysStr(hasta, -6);

  try {
    const metrics = await computeMetrics(supabase, user.id, desde, hasta);
    return NextResponse.json(metrics);
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
