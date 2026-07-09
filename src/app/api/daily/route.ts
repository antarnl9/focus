import { NextResponse } from 'next/server';
import { requireUser } from '@/lib/auth';
import { localDateStr } from '@/lib/time';

// GET /api/daily?tipo=personal|ceo&fecha=YYYY-MM-DD  → daily guardado.
// GET /api/daily?history=1&tipo=ceo                  → historial (últimos 30).
export async function GET(request: Request) {
  const auth = await requireUser();
  if (!auth.ok) return auth.response;
  const { supabase, user } = auth;

  const url = new URL(request.url);
  const tipo = url.searchParams.get('tipo') || 'ceo';
  const history = url.searchParams.get('history');

  if (history) {
    const { data } = await supabase
      .from('dailies')
      .select('fecha, contenido, enviado_slack, tipo')
      .eq('user_id', user.id)
      .eq('tipo', tipo)
      .order('fecha', { ascending: false })
      .limit(30);
    return NextResponse.json({ dailies: data ?? [] });
  }

  const fecha = url.searchParams.get('fecha') || localDateStr();
  const { data } = await supabase
    .from('dailies')
    .select('contenido, enviado_slack')
    .eq('user_id', user.id)
    .eq('fecha', fecha)
    .eq('tipo', tipo)
    .maybeSingle();
  return NextResponse.json({ contenido: data?.contenido ?? null, enviado: data?.enviado_slack ?? false });
}
