import { redirect } from 'next/navigation';
import Link from 'next/link';
import { createSupabaseServer } from '@/lib/supabase/server';
import { getCooProfile } from '@/lib/coo';
import { AjustesActions } from '@/app/components/AjustesActions';

export const dynamic = 'force-dynamic';

const LINKS = [
  { href: '/perfil', icon: '🧭', label: 'Mi perfil y objetivo', desc: 'Quién eres y tu objetivo; alimenta la IA.' },
  { href: '/negocios', icon: '🏢', label: 'Negocios T1', desc: 'Contexto y objetivo anual por unidad.' },
  { href: '/personas', icon: '👤', label: 'Personas', desc: 'Directorio del equipo, clientes y proveedores.' },
  { href: '/contexto', icon: '💬', label: 'Contexto de Slack', desc: 'Conecta y resume tus conversaciones.' },
];

export default async function AjustesPage() {
  const supabase = await createSupabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const profile = await getCooProfile(supabase, user.id);
  const nombre = profile.nombre || user.email || 'Usuario';
  const initials = nombre.slice(0, 2).toUpperCase();

  return (
    <div className="flex min-h-dvh flex-col bg-ink-950">
      <header className="sticky top-0 z-20 flex items-center gap-3 border-b border-ink-800 bg-ink-950/90 px-4 pb-3 pt-3 backdrop-blur safe-top">
        <Link href="/" className="rounded-full border border-ink-700 px-3 py-1.5 text-sm text-slate-300 active:scale-95">
          ← Hoy
        </Link>
        <h1 className="text-lg font-bold">Ajustes</h1>
      </header>

      <main className="flex-1 overflow-y-auto px-4 pb-16 pt-4">
        {/* Ficha */}
        <div className="card mb-6 flex items-center gap-3 p-4">
          <span className="grid h-12 w-12 shrink-0 place-items-center rounded-full bg-brand-deep/30 text-lg font-bold text-brand-soft">
            {initials}
          </span>
          <div className="min-w-0 flex-1">
            <p className="truncate text-base font-bold">{nombre}</p>
            <p className="truncate text-xs text-slate-500">{profile.titulo || user.email}</p>
          </div>
        </div>

        {/* Módulos */}
        <h2 className="mb-2 text-sm font-bold uppercase tracking-wide text-slate-400">Configuración</h2>
        <div className="mb-6 space-y-2">
          {LINKS.map((l) => (
            <Link key={l.href} href={l.href} className="card flex items-center gap-3 p-3 active:scale-[0.99]">
              <span className="text-xl">{l.icon}</span>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold">{l.label}</p>
                <p className="truncate text-xs text-slate-500">{l.desc}</p>
              </div>
              <span className="text-slate-600">›</span>
            </Link>
          ))}
        </div>

        {/* Preferencias */}
        <h2 className="mb-2 text-sm font-bold uppercase tracking-wide text-slate-400">Preferencias</h2>
        <AjustesActions />

        {/* Sesión */}
        <form action="/auth/signout" method="post" className="mt-8">
          <button type="submit" className="w-full rounded-xl border border-ink-700 py-3 text-sm text-slate-400 active:scale-[0.99]">
            Cerrar sesión
          </button>
        </form>
      </main>
    </div>
  );
}
