import { NextResponse } from 'next/server';
import { requireUser } from '@/lib/auth';
import { createBlockEvent, inviteToEvent } from '@/lib/google';

// Invita gente a la junta recurrente de un BLOQUE (respeta sus días), sin
// duplicar: si el bloque ya tiene evento, agrega invitados a ese; si no, crea
// el evento recurrente (etiquetado focus, excluido del espejo) y lo liga.
export async function POST(request: Request) {
  const auth = await requireUser();
  if (!auth.ok) return auth.response;
  const { supabase, user } = auth;

  const { block_id, label, hora_ini, hora_fin, tipo, dias, emails } = (await request.json()) as {
    block_id: string;
    label: string;
    hora_ini: string;
    hora_fin: string;
    tipo: string;
    dias?: number[] | null;
    emails: string[];
  };
  if (!block_id || !emails?.length) return NextResponse.json({ error: 'faltan datos' }, { status: 400 });

  const { data: block } = await supabase.from('day_blocks').select('gcal_event_id').eq('id', block_id).maybeSingle();

  if (block?.gcal_event_id) {
    const res = await inviteToEvent(user.id, block.gcal_event_id, emails);
    if (!res.ok) return NextResponse.json({ error: res.error }, { status: 400 });
    return NextResponse.json({ ok: true });
  }

  const res = await createBlockEvent(user.id, { label, hora_ini, hora_fin, tipo, dias }, emails);
  if (!res.ok) return NextResponse.json({ error: res.error }, { status: 400 });
  if (res.eventId) await supabase.from('day_blocks').update({ gcal_event_id: res.eventId }).eq('id', block_id);
  return NextResponse.json({ ok: true });
}
