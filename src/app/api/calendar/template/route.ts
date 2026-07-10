import { NextResponse } from 'next/server';
import { requireUser } from '@/lib/auth';
import { writeTemplateToCalendar } from '@/lib/google';

// Escribe la plantilla del día como eventos recurrentes "ocupado" en Calendar
// para que nadie agende sobre bloques protegidos (spec §3.1 / §5.2 / §10).
export async function POST() {
  const auth = await requireUser();
  if (!auth.ok) return auth.response;
  const { supabase, user } = auth;

  const { data: blocks } = await supabase
    .from('day_blocks')
    .select('id, hora_ini, hora_fin, label, tipo, dias, gcal_event_id')
    .eq('user_id', user.id)
    .order('orden');

  // Solo crea los que aún no tienen evento (evita duplicados).
  const pendientes = (blocks ?? []).filter((b) => !b.gcal_event_id);
  if (pendientes.length === 0) {
    return NextResponse.json({ ok: true, created: 0, message: 'La plantilla ya está en Calendar.' });
  }

  const result = await writeTemplateToCalendar(user.id, pendientes);
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 400 });

  await supabase.from('bitacora').insert({
    user_id: user.id,
    tipo: 'nota',
    texto: `Plantilla sincronizada a Google Calendar (${result.created} bloques).`,
  });

  return NextResponse.json({ ok: true, created: result.created });
}
