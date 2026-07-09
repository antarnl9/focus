import { NextResponse } from 'next/server';
import type { User } from '@supabase/supabase-js';
import { createSupabaseServer } from './supabase/server';
import { env } from './env';

// Devuelve el usuario autenticado y permitido, o una respuesta 401/403.
export async function requireUser(): Promise<
  | { ok: true; user: User; supabase: Awaited<ReturnType<typeof createSupabaseServer>> }
  | { ok: false; response: NextResponse }
> {
  const supabase = await createSupabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { ok: false, response: NextResponse.json({ error: 'no_session' }, { status: 401 }) };
  }
  const email = (user.email ?? '').toLowerCase();
  if (!env.allowedEmails().includes(email)) {
    return { ok: false, response: NextResponse.json({ error: 'forbidden' }, { status: 403 }) };
  }
  return { ok: true, user, supabase };
}

export async function userNombre(supabase: Awaited<ReturnType<typeof createSupabaseServer>>, userId: string): Promise<string> {
  const { data } = await supabase.from('users').select('nombre').eq('id', userId).maybeSingle();
  return data?.nombre || 'COO';
}
