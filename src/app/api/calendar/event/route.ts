import { NextResponse } from 'next/server';
import { requireUser } from '@/lib/auth';
import { inviteToEvent, rescheduleEvent, cancelEvent, setEventRecurrence } from '@/lib/google';
import { syncCalendar } from '@/lib/calendar';

// Editar un evento de Calendar desde la app: invitar, mover o cancelar.
export async function POST(request: Request) {
  const auth = await requireUser();
  if (!auth.ok) return auth.response;
  const { user } = auth;

  const body = (await request.json()) as {
    action: 'invite' | 'reschedule' | 'cancel' | 'recurrence';
    eventId: string;
    emails?: string[];
    hora_ini?: string;
    hora_fin?: string;
    scope?: 'this' | 'series';
    dias?: number[];
  };

  if (!body.eventId) return NextResponse.json({ error: 'missing_event' }, { status: 400 });

  let res: { ok: boolean; error?: string };
  switch (body.action) {
    case 'invite':
      res = await inviteToEvent(user.id, body.eventId, body.emails ?? []);
      break;
    case 'reschedule':
      if (!body.hora_ini || !body.hora_fin) return NextResponse.json({ error: 'missing_time' }, { status: 400 });
      res = await rescheduleEvent(user.id, body.eventId, body.hora_ini, body.hora_fin);
      break;
    case 'cancel':
      res = await cancelEvent(user.id, body.eventId, body.scope === 'series' ? 'series' : 'this');
      break;
    case 'recurrence':
      res = await setEventRecurrence(user.id, body.eventId, body.dias ?? []);
      break;
    default:
      return NextResponse.json({ error: 'bad_action' }, { status: 400 });
  }

  if (!res.ok) return NextResponse.json({ error: res.error || 'Error' }, { status: 400 });
  // Refresca el espejo para que el home muestre el cambio de inmediato.
  await syncCalendar(user.id).catch(() => {});
  return NextResponse.json({ ok: true });
}
