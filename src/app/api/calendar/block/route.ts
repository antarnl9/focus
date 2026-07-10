import { NextResponse } from 'next/server';
import { requireUser } from '@/lib/auth';
import { updateBlockEvent } from '@/lib/google';

// Actualiza el evento recurrente de un bloque (horario, nombre, días) en Google.
export async function POST(request: Request) {
  const auth = await requireUser();
  if (!auth.ok) return auth.response;

  const { event_id, summary, hora_ini, hora_fin, dias } = (await request.json()) as {
    event_id: string;
    summary: string;
    hora_ini: string;
    hora_fin: string;
    dias?: number[] | null;
  };
  if (!event_id) return NextResponse.json({ error: 'sin event_id' }, { status: 400 });

  const res = await updateBlockEvent(auth.user.id, event_id, { summary, horaIni: hora_ini, horaFin: hora_fin, dias });
  return NextResponse.json(res, { status: res.ok ? 200 : 400 });
}
