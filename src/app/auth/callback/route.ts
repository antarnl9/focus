import { NextResponse } from 'next/server';
import { createSupabaseServer } from '@/lib/supabase/server';
import { ensureUserBootstrap } from '@/lib/bootstrap';
import { saveGoogleTokens } from '@/lib/google';
import { env } from '@/lib/env';

// Callback OAuth de Supabase (PKCE). Intercambia el code por sesión,
// valida la allowlist, guarda los tokens de Google y siembra los datos.
export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get('code');
  const origin = env.appUrl || url.origin;

  if (!code) {
    return NextResponse.redirect(`${origin}/login?error=missing_code`);
  }

  const supabase = await createSupabaseServer();
  const { data, error } = await supabase.auth.exchangeCodeForSession(code);

  if (error || !data.user) {
    return NextResponse.redirect(`${origin}/login?error=exchange`);
  }

  const email = (data.user.email ?? '').toLowerCase();
  if (!env.allowedEmails().includes(email)) {
    await supabase.auth.signOut();
    return NextResponse.redirect(`${origin}/acceso-restringido`);
  }

  // Siembra usuario + plantilla + prioridades la primera vez.
  try {
    await ensureUserBootstrap(supabase, data.user);
  } catch (e) {
    console.error('[auth] bootstrap', e);
  }

  // Guarda los tokens de Google (Calendar) cifrados, si vinieron en el consent.
  try {
    const session = data.session;
    if (session?.provider_token || session?.provider_refresh_token) {
      await saveGoogleTokens(
        data.user.id,
        session.provider_token ?? null,
        session.provider_refresh_token ?? null,
        3600
      );
    }
  } catch (e) {
    console.error('[auth] saveGoogleTokens', e);
  }

  return NextResponse.redirect(`${origin}/`);
}
