'use client';

import { createBrowserClient } from '@supabase/ssr';

// Cliente Supabase para el navegador (sesión del usuario, realtime).
export function createSupabaseBrowser() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
}
