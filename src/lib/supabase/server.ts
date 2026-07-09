import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { env } from '../env';

type CookieToSet = { name: string; value: string; options: CookieOptions };

// Cliente Supabase para Server Components y Route Handlers (usa la sesión del usuario).
export async function createSupabaseServer() {
  const cookieStore = await cookies();
  return createServerClient(env.supabaseUrl(), env.supabaseAnonKey(), {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet: CookieToSet[]) {
        try {
          cookiesToSet.forEach(({ name, value, options }) =>
            cookieStore.set(name, value, options)
          );
        } catch {
          // Llamado desde un Server Component sin permiso de escritura; el middleware
          // refresca la sesión, así que se puede ignorar.
        }
      },
    },
  });
}
