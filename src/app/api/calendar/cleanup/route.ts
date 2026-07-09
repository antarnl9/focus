import { NextResponse } from 'next/server';
import { requireUser } from '@/lib/auth';
import { cleanupFocusEvents } from '@/lib/google';

// Borra los eventos viejos con prefijo [Focus] del calendario.
export async function POST() {
  const auth = await requireUser();
  if (!auth.ok) return auth.response;
  const res = await cleanupFocusEvents(auth.user.id);
  if (!res.ok) return NextResponse.json({ error: res.error || 'Error' }, { status: 400 });
  return NextResponse.json({ ok: true, deleted: res.deleted });
}
