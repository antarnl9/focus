import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';
import { env } from '../env';

type CookieToSet = { name: string; value: string; options: CookieOptions };

// Refresca la sesión de Supabase en cada request y aplica la allowlist estricta:
// solo los correos en ALLOWED_EMAILS pueden usar la app (spec §4).
export async function updateSession(request: NextRequest) {
  const path = request.nextUrl.pathname;
  const isPublic =
    path === '/login' ||
    path === '/acceso-restringido' ||
    path === '/offline' ||
    path.startsWith('/auth') ||
    path.startsWith('/api/slack') ||
    path.startsWith('/api/cron') ||
    path.startsWith('/icons') ||
    path === '/manifest.webmanifest' ||
    path === '/sw.js';

  // Webhooks y rutas públicas: no toques Supabase (protege el presupuesto <3 s de Slack).
  if (isPublic) return NextResponse.next({ request });

  let response = NextResponse.next({ request });

  const supabase = createServerClient(env.supabaseUrl(), env.supabaseAnonKey(), {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet: CookieToSet[]) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) =>
          response.cookies.set(name, value, options)
        );
      },
    },
  });

  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Sin sesión → login
  if (!user) {
    const url = request.nextUrl.clone();
    url.pathname = '/login';
    return NextResponse.redirect(url);
  }

  // Sesión existe pero el correo no está permitido → acceso restringido + cerrar sesión
  const email = (user.email ?? '').toLowerCase();
  if (!env.allowedEmails().includes(email)) {
    await supabase.auth.signOut();
    const url = request.nextUrl.clone();
    url.pathname = '/acceso-restringido';
    return NextResponse.redirect(url);
  }

  return response;
}
