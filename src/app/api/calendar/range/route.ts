import { NextResponse } from 'next/server';
import { requireUser } from '@/lib/auth';
import { listEventsBetween } from '@/lib/google';

// Eventos (reales, no los de Focus) en un rango, para la vista de calendario.
export async function GET(request: Request) {
  const auth = await requireUser();
  if (!auth.ok) return auth.response;
  const url = new URL(request.url);
  const desde = url.searchParams.get('desde');
  const hasta = url.searchParams.get('hasta');
  if (!desde || !hasta) return NextResponse.json({ error: 'missing_range' }, { status: 400 });
  const events = await listEventsBetween(auth.user.id, desde, hasta);
  return NextResponse.json({ events });
}
