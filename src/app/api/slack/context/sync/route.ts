import { NextResponse } from 'next/server';
import { requireUser } from '@/lib/auth';
import { syncSlackContext } from '@/lib/slackcontext';

// Jala DMs+canales del COO, los resume con IA y guarda el contexto.
export async function POST() {
  const auth = await requireUser();
  if (!auth.ok) return auth.response;
  const res = await syncSlackContext(auth.user.id);
  if (!res.ok) return NextResponse.json({ error: res.error }, { status: 400 });
  return NextResponse.json({ mensajes: res.mensajes, resumen: res.resumen });
}
