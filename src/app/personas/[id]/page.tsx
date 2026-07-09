import { redirect } from 'next/navigation';
import Link from 'next/link';
import { createSupabaseServer } from '@/lib/supabase/server';
import { PersonaProfile } from '@/app/components/PersonaProfile';
import type { Persona, Grabacion, Duda } from '@/lib/types';

export const dynamic = 'force-dynamic';

export default async function PersonaPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createSupabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: persona } = await supabase.from('personas').select('*').eq('id', id).maybeSingle();
  if (!persona) redirect('/personas');

  // Juntas grabadas con esta persona.
  const { data: links } = await supabase
    .from('grabacion_personas')
    .select('grabaciones(*)')
    .eq('persona_id', id);
  const grabaciones: Grabacion[] = (links ?? []).flatMap((l) => {
    const g = (l as unknown as { grabaciones: Grabacion | Grabacion[] }).grabaciones;
    return Array.isArray(g) ? g : g ? [g] : [];
  });

  // Dudas que ha mandado (cruce por Slack o por nombre).
  const ors: string[] = [];
  if (persona.slack_user_id) ors.push(`autor_id.eq.${persona.slack_user_id}`);
  ors.push(`autor_nombre.eq.${persona.nombre}`);
  const { data: dudas } = await supabase
    .from('dudas')
    .select('*')
    .eq('user_id', user.id)
    .or(ors.join(','))
    .order('created_at', { ascending: false })
    .limit(30);

  return (
    <div className="flex min-h-dvh flex-col bg-ink-950">
      <header className="sticky top-0 z-20 flex items-center gap-3 border-b border-ink-800 bg-ink-950/90 px-4 pb-3 pt-3 backdrop-blur safe-top">
        <Link href="/personas" className="rounded-full border border-ink-700 px-3 py-1.5 text-sm text-slate-300 active:scale-95">
          ← Personas
        </Link>
        <h1 className="truncate text-lg font-bold">{persona.nombre}</h1>
      </header>

      <main className="flex-1 overflow-y-auto px-4 pb-16 pt-4">
        <PersonaProfile
          persona={persona as Persona}
          grabaciones={grabaciones as Grabacion[]}
          dudas={(dudas ?? []) as Duda[]}
        />
      </main>
    </div>
  );
}
