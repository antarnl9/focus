'use client';

import { useState } from 'react';
import { createSupabaseBrowser } from '@/lib/supabase/client';

export default function LoginPage() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function signIn() {
    setLoading(true);
    setError(null);
    const supabase = createSupabaseBrowser();
    const hd = process.env.NEXT_PUBLIC_GOOGLE_HOSTED_DOMAIN || 't1.com';
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: `${window.location.origin}/auth/callback`,
        // Login + conexión de Calendar en un solo consent (spec §4).
        scopes:
          'https://www.googleapis.com/auth/calendar.events https://www.googleapis.com/auth/calendar.readonly',
        queryParams: {
          access_type: 'offline',
          prompt: 'consent',
          hd, // limita al dominio t1.com
        },
      },
    });
    if (error) {
      setError(error.message);
      setLoading(false);
    }
  }

  return (
    <main className="flex min-h-dvh flex-col items-center justify-center px-6 safe-top safe-bottom">
      <div className="card w-full max-w-sm p-8 text-center animate-slideUp">
        <div className="mx-auto mb-6 h-16 w-16">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/icons/icon.svg" alt="Focus" className="h-16 w-16" />
        </div>
        <h1 className="text-2xl font-bold tracking-tight">Focus</h1>
        <p className="mt-2 text-sm text-slate-400">Centro de comando del COO de T1</p>

        <button onClick={signIn} disabled={loading} className="btn-primary mt-8 w-full">
          {loading ? 'Conectando…' : 'Entrar con Google'}
        </button>

        {error && <p className="mt-4 text-sm text-urgent">{error}</p>}

        <p className="mt-6 text-xs text-slate-500">
          Acceso restringido. Solo cuentas autorizadas de t1.com.
        </p>
      </div>
    </main>
  );
}
