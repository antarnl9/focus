import { NextResponse } from 'next/server';
import { requireUser } from '@/lib/auth';
import { executeAction, type PendingAction } from '@/lib/assistant';

// POST { action: PendingAction } → ejecuta de verdad la acción confirmada.
export async function POST(request: Request) {
  const auth = await requireUser();
  if (!auth.ok) return auth.response;

  const { action } = (await request.json()) as { action: PendingAction };
  if (!action?.tool) return NextResponse.json({ error: 'acción inválida' }, { status: 400 });

  const res = await executeAction(auth.user.id, action);
  return NextResponse.json(res, { status: res.ok ? 200 : 400 });
}
