import { NextResponse } from 'next/server';
import { requireUser } from '@/lib/auth';
import { createEvent } from '@/lib/google';
import { syncCalendar } from '@/lib/calendar';

// Crea un evento en Calendar (a partir de un bloque) e invita personas.
export async function POST(request: Request) {
  const auth = await requireUser();
  if (!auth.ok) return auth.response;

  const b = (await request.json()) as {
    summary: string;
    fecha: string;
    hora_ini: string;
    hora_fin: string;
    emails: string[];
  };
  if (!b.summary || !b.fecha || !b.hora_ini || !b.hora_fin) return NextResponse.json({ error: 'faltan datos' }, { status: 400 });

  const res = await createEvent(auth.user.id, {
    summary: b.summary,
    fecha: b.fecha,
    horaIni: b.hora_ini,
    horaFin: b.hora_fin,
    emails: b.emails ?? [],
  });
  if (!res.ok) return NextResponse.json({ error: res.error || 'Error' }, { status: 400 });
  await syncCalendar(auth.user.id).catch(() => {});
  return NextResponse.json({ ok: true });
}
