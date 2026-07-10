import { NextResponse } from 'next/server';
import { requireUser } from '@/lib/auth';
import { hasAnthropic } from '@/lib/env';
import { runAssistant, type ChatTurn } from '@/lib/assistant';

// POST { history: ChatTurn[] } → { reply, pendingActions }
export async function POST(request: Request) {
  const auth = await requireUser();
  if (!auth.ok) return auth.response;
  if (!hasAnthropic()) return NextResponse.json({ error: 'IA no configurada' }, { status: 400 });

  const { history } = (await request.json()) as { history: ChatTurn[] };
  const nombre = ((auth.user.user_metadata?.full_name as string) || auth.user.email || 'COO').split(' ')[0];

  try {
    const res = await runAssistant(auth.supabase, auth.user.id, history ?? [], nombre);
    return NextResponse.json(res);
  } catch (e) {
    console.error('[assistant]', e);
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
