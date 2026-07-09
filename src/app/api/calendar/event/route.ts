import { NextResponse } from 'next/server';
import { requireUser } from '@/lib/auth';
import { inviteToEvent, rescheduleEvent, cancelEvent } from '@/lib/google';

// Editar un evento de Calendar desde la app: invitar, mover o cancelar.
export async function POST(request: Request) {
  const auth = await requireUser();
  if (!auth.ok) return auth.response;
  const { user } = auth;

  const body = (await request.json()) as {
    action: 'invite' | 'reschedule' | 'cancel';
    eventId: string;
    emails?: string[];
    hora_ini?: string;
    hora_fin?: string;
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
      res = await cancelEvent(user.id, body.eventId);
      break;
    default:
      return NextResponse.json({ error: 'bad_action' }, { status: 400 });
  }

  if (!res.ok) return NextResponse.json({ error: res.error || 'Error' }, { status: 400 });
  return NextResponse.json({ ok: true });
}
