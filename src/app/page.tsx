import { redirect } from 'next/navigation';
import { createSupabaseServer } from '@/lib/supabase/server';
import { ensureUserBootstrap } from '@/lib/bootstrap';
import { listTodayEvents } from '@/lib/google';
import { localDateStr } from '@/lib/time';
import { Dashboard } from '@/app/components/Dashboard';
import type { DayBlock, Duda, Prioridad, BitacoraEntry, Grabacion, Daily, CalendarEvent } from '@/lib/types';

export const dynamic = 'force-dynamic';

export default async function Home() {
  const supabase = await createSupabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect('/login');

  // Asegura datos base (idempotente).
  await ensureUserBootstrap(supabase, user).catch(() => {});

  const today = localDateStr();

  const [blocksR, dudasR, priosR, bitR, grabR, dailyR, calEvents] = await Promise.all([
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
    supabase.from('grabaciones').select('*').eq('user_id', user.id).order('created_at', { ascending: false }).limit(20),
    supabase.from('dailies').select('*').eq('user_id', user.id).eq('fecha', today).maybeSingle(),
    listTodayEvents(user.id).catch(() => [] as CalendarEvent[]),
  ]);

  const nombre = (user.user_metadata?.full_name as string) || user.email || 'COO';

  return (
    <Dashboard
      nombre={nombre.split(' ')[0]}
      today={today}
      initialBlocks={(blocksR.data ?? []) as DayBlock[]}
      initialDudas={(dudasR.data ?? []) as Duda[]}
      initialPrioridades={(priosR.data ?? []) as Prioridad[]}
      initialBitacora={(bitR.data ?? []) as BitacoraEntry[]}
      initialGrabaciones={(grabR.data ?? []) as Grabacion[]}
      initialDaily={(dailyR.data ?? null) as Daily | null}
      calendarEvents={calEvents as CalendarEvent[]}
    />
  );
}
