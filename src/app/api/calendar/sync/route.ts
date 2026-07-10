import { NextResponse } from 'next/server';
import { requireUser } from '@/lib/auth';
import { syncCalendar } from '@/lib/calendar';

// Lo dispara el home al abrir, al volver a la app y cada ~60s.
export async function POST() {
  const auth = await requireUser();
  if (!auth.ok) return auth.response;
  const res = await syncCalendar(auth.user.id);
  if (!res.ok) return NextResponse.json({ error: res.error }, { status: 400 });
  return NextResponse.json({ ok: true, cambios: res.cambios });
}
