import { redirect } from 'next/navigation';
import { createSupabaseServer } from '@/lib/supabase/server';
import { ensureUserBootstrap } from '@/lib/bootstrap';
import { getTodayEventsFromDb } from '@/lib/calendar';
import { localDateStr } from '@/lib/time';
import { Dashboard } from '@/app/components/Dashboard';
import type { DayBlock, Duda, Prioridad, BitacoraEntry, Daily, CalendarEvent } from '@/lib/types';

export const dynamic = 'force-dynamic';

export default async function Home() {
  const supabase = await createSupabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect('/login');

  // Asegura datos base (idempotente). En paralelo, no bloquea el primer render.
  const bootP = ensureUserBootstrap(supabase, user).catch(() => {});

  const today = localDateStr();

  const [blocksR, dudasR, priosR, bitR, dailyR, calEvents] = await Promise.all([
    supabase.from('day_blocks').select('*').eq('user_id', user.id).order('orden'),
    supabase
      .from('dudas')
      .select('*')
      .eq('user_id', user.id)
      .eq('estado', 'pendiente')
      .order('urgente', { ascending: false })
      .order('created_at', { ascending: true }),
    supabase.from('prioridades').select('*').eq('user_id', user.id).order('tier').order('orden'),
    supabase.from('bitacora').select('*').eq('user_id', user.id).eq('fecha', today).order('created_at'),
    supabase.from('dailies').select('*').eq('user_id', user.id).eq('fecha', today).eq('tipo', 'ceo').maybeSingle(),
    getTodayEventsFromDb(supabase, user.id, today).catch(() => [] as CalendarEvent[]),
  ]);
  await bootP;

  const nombre = (user.user_metadata?.full_name as string) || user.email || 'COO';

  // Las grabaciones las carga el tab Juntas al abrirse (no bloquean el home).
  return (
    <Dashboard
      nombre={nombre.split(' ')[0]}
      today={today}
      initialBlocks={(blocksR.data ?? []) as DayBlock[]}
      initialDudas={(dudasR.data ?? []) as Duda[]}
      initialPrioridades={(priosR.data ?? []) as Prioridad[]}
      initialBitacora={(bitR.data ?? []) as BitacoraEntry[]}
      initialGrabaciones={[]}
      initialDaily={(dailyR.data ?? null) as Daily | null}
      calendarEvents={calEvents as CalendarEvent[]}
    />
  );
}
