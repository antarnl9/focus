import { redirect } from 'next/navigation';
import Link from 'next/link';
import { createSupabaseServer } from '@/lib/supabase/server';
import { MetricsView } from '@/app/components/MetricsView';

export const dynamic = 'force-dynamic';

export default async function MetricasPage() {
  const supabase = await createSupabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  return (
    <div className="flex min-h-dvh flex-col bg-ink-950">
      <header className="sticky top-0 z-20 flex items-center gap-3 border-b border-ink-800 bg-ink-950/90 px-4 pb-3 pt-3 backdrop-blur safe-top">
        <Link href="/" className="rounded-full border border-ink-700 px-3 py-1.5 text-sm text-slate-300 active:scale-95">
          ← Hoy
        </Link>
        <h1 className="text-lg font-bold">Métricas y coach</h1>
      </header>

      <main className="flex-1 overflow-y-auto px-4 pb-16 pt-4">
        <MetricsView />
      </main>
    </div>
  );
}
