'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { createSupabaseBrowser } from '@/lib/supabase/client';
import { localParts } from '@/lib/time';
import { blockAppliesOn } from '@/lib/defaults';
import type { DayBlock, Duda, Prioridad, BitacoraEntry, Grabacion, Daily, CalendarEvent } from '@/lib/types';
import { HeaderNow } from './HeaderNow';
import { DayTimeline } from './DayTimeline';
import { DudasList } from './DudasList';
import { Prioridades } from './Prioridades';
import { Bitacora } from './Bitacora';
import { Recorder } from './Recorder';
import { DailyPanel } from './DailyPanel';
import { BottomNav, type Tab } from './BottomNav';
import { InstallPrompt } from './InstallPrompt';
import { QuickActions } from './QuickActions';

interface Props {
  nombre: string;
  today: string;
  initialBlocks: DayBlock[];
  initialDudas: Duda[];
  initialPrioridades: Prioridad[];
  initialBitacora: BitacoraEntry[];
  initialGrabaciones: Grabacion[];
  initialDaily: Daily | null;
  calendarEvents: CalendarEvent[];
}

export function Dashboard(props: Props) {
  const supabase = useMemo(() => createSupabaseBrowser(), []);
  const [tab, setTab] = useState<Tab>('hoy');
  const [now, setNow] = useState<Date>(() => new Date());

  const [dudas, setDudas] = useState<Duda[]>(props.initialDudas);
  const [bitacora, setBitacora] = useState<BitacoraEntry[]>(props.initialBitacora);
  const [blocks, setBlocks] = useState<DayBlock[]>(props.initialBlocks);

  // Bloques que aplican HOY (según su día de la semana).
  const weekday = localParts(now).weekday;
  const todayBlocks = useMemo(() => blocks.filter((b) => blockAppliesOn(b.dias, weekday)), [blocks, weekday]);

  const onBlockSaved = useCallback((b: DayBlock) => setBlocks((prev) => prev.map((x) => (x.id === b.id ? b : x))), []);
  const onBlockDeleted = useCallback((id: string) => setBlocks((prev) => prev.filter((x) => x.id !== id)), []);

  // Reloj: actualiza "ahora" y el contador cada 20 s.
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 20_000);
    return () => clearInterval(t);
  }, []);

  const refetchDudas = useCallback(async () => {
    const { data } = await supabase
      .from('dudas')
      .select('*')
      .eq('estado', 'pendiente')
      .order('urgente', { ascending: false })
      .order('created_at', { ascending: true });
    if (data) setDudas(data as Duda[]);
  }, [supabase]);

  const refetchBitacora = useCallback(async () => {
    const { data } = await supabase
      .from('bitacora')
      .select('*')
      .eq('fecha', props.today)
      .order('created_at');
    if (data) setBitacora(data as BitacoraEntry[]);
  }, [supabase, props.today]);

  // Realtime: nuevas dudas llegan sin refrescar (spec §6 Realtime).
  useEffect(() => {
    const channel = supabase
      .channel('dudas-live')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'dudas' }, () => {
        refetchDudas();
      })
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [supabase, refetchDudas]);

  const pendientes = dudas.length;
  const urgentes = dudas.filter((d) => d.urgente && d.estado === 'pendiente').length;

  return (
    <div className="flex min-h-dvh flex-col bg-ink-950">
      <HeaderNow nombre={props.nombre} blocks={todayBlocks} now={now} pendientes={pendientes} urgentes={urgentes} />

      <main className="flex-1 overflow-y-auto px-4 pb-28 pt-3">
        {tab === 'hoy' && (
          <div className="space-y-6">
            <DayTimeline
              blocks={todayBlocks}
              events={props.calendarEvents}
              now={now}
              supabase={supabase}
              onBlockSaved={onBlockSaved}
              onBlockDeleted={onBlockDeleted}
            />
            <Prioridades supabase={supabase} initial={props.initialPrioridades} onLog={refetchBitacora} />
            <QuickActions />
          </div>
        )}

        {tab === 'dudas' && <DudasList dudas={dudas} onChanged={refetchDudas} onLog={refetchBitacora} />}

        {tab === 'bitacora' && (
          <Bitacora supabase={supabase} today={props.today} entries={bitacora} onChanged={refetchBitacora} />
        )}

        {tab === 'juntas' && <Recorder initial={props.initialGrabaciones} blocks={todayBlocks} now={now} />}

        {tab === 'daily' && <DailyPanel today={props.today} initial={props.initialDaily} />}
      </main>

      <BottomNav tab={tab} setTab={setTab} pendientes={pendientes} urgentes={urgentes} />
      <InstallPrompt />
    </div>
  );
}
