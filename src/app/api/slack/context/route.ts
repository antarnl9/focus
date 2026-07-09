import { NextResponse } from 'next/server';
import { requireUser } from '@/lib/auth';

// Estado + contexto guardado de Slack (para la vista).
export async function GET() {
  const auth = await requireUser();
  if (!auth.ok) return auth.response;
  const { supabase, user } = auth;

  const [{ data: integ }, { data: ctx }] = await Promise.all([
    supabase.from('integraciones').select('proveedor').eq('user_id', user.id).eq('proveedor', 'slack').maybeSingle(),
    supabase.from('slack_context').select('resumen, recomendaciones, actualizado, mensajes').eq('user_id', user.id).maybeSingle(),
  ]);

  return NextResponse.json({
    connected: !!integ,
    resumen: ctx?.resumen ?? null,
    recomendaciones: ctx?.recomendaciones ?? null,
    actualizado: ctx?.actualizado ?? null,
    mensajes: ctx?.mensajes ?? 0,
  });
}
