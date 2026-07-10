'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import type { DayBlock } from '@/lib/types';
import { ThemeToggle } from './ThemeToggle';
import { minutesOfDay, hmToMinutes, prettyDate, prettyTime } from '@/lib/time';
import { BLOCK_META } from '@/lib/defaults';

export function HeaderNow({
  nombre,
  blocks,
  now,
  pendientes,
  urgentes,
}: {
  nombre: string;
  blocks: DayBlock[];
  now: Date;
  pendientes: number;
  urgentes: number;
}) {
  const router = useRouter();
  const [refreshing, setRefreshing] = useState(false);
  const mins = minutesOfDay(now);
  const active = blocks.find((b) => mins >= hmToMinutes(b.hora_ini) && mins < hmToMinutes(b.hora_fin));

  function refrescar() {
    setRefreshing(true);
    router.refresh(); // revalida los datos del server sin recargar la app
    setTimeout(() => setRefreshing(false), 800);
  }

  // Próxima ventana de dudas (spec §3.1: contador visible).
  const nextWindow = blocks
    .filter((b) => b.tipo === 'dudas' && hmToMinutes(b.hora_ini) > mins)
    .sort((a, b) => hmToMinutes(a.hora_ini) - hmToMinutes(b.hora_ini))[0];
  const minsToWindow = nextWindow ? hmToMinutes(nextWindow.hora_ini) - mins : null;

  const saludo = mins < 12 * 60 ? 'Buenos días' : mins < 19 * 60 ? 'Buenas tardes' : 'Buenas noches';

  return (
    <header className="sticky top-0 z-20 border-b border-ink-800 bg-ink-950/90 px-4 pb-3 pt-3 backdrop-blur safe-top">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-xs uppercase tracking-wide text-slate-500">{prettyDate(now)}</p>
          <h1 className="text-lg font-bold">
            {saludo}, {nombre}
          </h1>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={refrescar}
            className={`grid h-9 w-9 place-items-center rounded-full border border-ink-700 text-base text-slate-300 active:scale-90 ${refreshing ? 'animate-spin' : ''}`}
            aria-label="Actualizar"
            title="Actualizar"
          >
            ↻
          </button>
          <ThemeToggle />
          <Link
            href="/metricas"
            aria-label="Métricas y coach"
            title="Métricas"
            className="grid h-9 w-9 place-items-center rounded-full border border-ink-700 text-base text-slate-300 active:scale-90"
          >
            📊
          </Link>
          <Link
            href="/ajustes"
            aria-label="Perfil y ajustes"
            className="ml-0.5 grid h-11 w-11 place-items-center rounded-full bg-gradient-to-br from-brand to-brand-deep text-sm font-bold text-white shadow-pop ring-2 ring-brand/30 active:scale-90"
          >
            {nombre.slice(0, 2).toUpperCase()}
          </Link>
        </div>
      </div>

      <div className="mt-3 grid grid-cols-2 gap-2">
        {/* Bloque activo ("ahora") */}
        <div className="card flex items-center gap-2 px-3 py-2">
          <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${active ? BLOCK_META[active.tipo].dot : 'bg-ink-600'} animate-pulse`} />
          <div className="min-w-0">
            <p className="text-[10px] uppercase tracking-wide text-slate-500">Ahora</p>
            <p className="truncate text-sm font-semibold">{active ? active.label : 'Fuera de agenda'}</p>
          </div>
        </div>

        {/* Contador a próxima ventana de dudas */}
        <div className={`card flex items-center gap-2 px-3 py-2 ${urgentes > 0 ? 'border-urgent/50' : ''}`}>
          <span className="text-lg">{urgentes > 0 ? '🚨' : '⏳'}</span>
          <div className="min-w-0">
            <p className="text-[10px] uppercase tracking-wide text-slate-500">
              {pendientes > 0 ? `${pendientes} duda${pendientes > 1 ? 's' : ''}` : 'Dudas'}
            </p>
            <p className="truncate text-sm font-semibold">
              {minsToWindow !== null
                ? `Ventana en ${fmtMins(minsToWindow)}`
                : nextWindow === undefined && blocks.some((b) => b.tipo === 'dudas')
                ? `Ventana ${prettyTime(nextDudasTomorrowNote())}`
                : 'Sin ventana hoy'}
            </p>
          </div>
        </div>
      </div>
    </header>
  );
}

function fmtMins(m: number): string {
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60);
  const mm = m % 60;
  return mm ? `${h} h ${mm} min` : `${h} h`;
}

function nextDudasTomorrowNote(): string {
  return '15:15';
}
