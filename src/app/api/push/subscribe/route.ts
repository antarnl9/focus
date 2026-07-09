import { NextResponse } from 'next/server';
import { requireUser } from '@/lib/auth';

// Guarda la suscripción Web Push del dispositivo (spec §5.5).
export async function POST(request: Request) {
  const auth = await requireUser();
  if (!auth.ok) return auth.response;
  const { supabase, user } = auth;

  const sub = (await request.json()) as { endpoint: string; keys: { p256dh: string; auth: string } };
  if (!sub?.endpoint || !sub?.keys) return NextResponse.json({ error: 'bad_subscription' }, { status: 400 });

  await supabase.from('push_subscriptions').upsert(
    { user_id: user.id, endpoint: sub.endpoint, keys: sub.keys },
    { onConflict: 'endpoint' }
  );
  return NextResponse.json({ ok: true });
}
