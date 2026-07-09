'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import type { CalendarEvent } from '@/lib/types';
import { localDateStr } from '@/lib/time';
import { EventSheet } from './EventSheet';

const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
const DOW = ['L', 'M', 'M', 'J', 'V', 'S', 'D'];

function pad(n: number) {
  return String(n).padStart(2, '0');
}

// Rejilla de 42 días (6 semanas) empezando en lunes.
function buildGrid(y: number, m: number): { dateStr: string; day: number; inMonth: boolean }[] {
  const first = new Date(Date.UTC(y, m, 1, 12));
  const dow = first.getUTCDay(); // 0=dom
  const offset = (dow + 6) % 7; // lunes = 0
  const start = new Date(first);
  start.setUTCDate(start.getUTCDate() - offset);
  const out = [];
  for (let i = 0; i < 42; i++) {
    const d = new Date(start);
    d.setUTCDate(d.getUTCDate() + i);
    out.push({
      dateStr: `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`,
      day: d.getUTCDate(),
      inMonth: d.getUTCMonth() === m,
    });
  }
  return out;
}

export function CalendarView() {
  const today = localDateStr();
  const [ty, tm] = [Number(today.slice(0, 4)), Number(today.slice(5, 7)) - 1];
  const [y, setY] = useState(ty);
  const [m, setM] = useState(tm);
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [selDate, setSelDate] = useState(today);
  const [selEvent, setSelEvent] = useState<CalendarEvent | null>(null);

  const grid = useMemo(() => buildGrid(y, m), [y, m]);

  const fetchEvents = useCallback(async () => {
    setLoading(true);
    const g = buildGrid(y, m);
    const res = await fetch(`/api/calendar/range?desde=${g[0].dateStr}&hasta=${g[41].dateStr}`);
    const json = await res.json();
    setEvents(res.ok ? (json.events as CalendarEvent[]) : []);
    setLoading(false);
  }, [y, m]);

  useEffect(() => {
    fetchEvents();
  }, [fetchEvents]);

  const byDay = useMemo(() => {
    const map = new Map<string, CalendarEvent[]>();
    for (const e of events) {
      const d = e.start.slice(0, 10);
      if (!map.has(d)) map.set(d, []);
      map.get(d)!.push(e);
    }
    return map;
  }, [events]);

  function move(delta: number) {
    let nm = m + delta;
    let ny = y;
    if (nm < 0) {
      nm = 11;
      ny--;
    } else if (nm > 11) {
      nm = 0;
      ny++;
    }
    setM(nm);
    setY(ny);
  }

  function goHoy() {
    setY(ty);
    setM(tm);
    setSelDate(today);
  }

  const selEvents = byDay.get(selDate) ?? [];

  return (
    <div className="space-y-4">
      {/* Navegación */}
      <div className="flex items-center justify-between">
        <button onClick={() => move(-1)} className="rounded-full border border-ink-700 px-3 py-1.5 text-sm active:scale-95">
          ‹
        </button>
        <p className="text-sm font-bold capitalize">
          {MESES[m]} {y}
        </p>
        <button onClick={() => move(1)} className="rounded-full border border-ink-700 px-3 py-1.5 text-sm active:scale-95">
          ›
        </button>
      </div>
      <div className="flex justify-center">
        <button onClick={goHoy} className="chip bg-ink-700 text-slate-300">
          Hoy
        </button>
      </div>

      {/* Rejilla */}
      <div>
        <div className="mb-1 grid grid-cols-7 text-center text-[10px] font-semibold uppercase text-slate-500">
          {DOW.map((d, i) => (
            <span key={i}>{d}</span>
          ))}
        </div>
        <div className="grid grid-cols-7 gap-1">
          {grid.map((cell) => {
            const evs = byDay.get(cell.dateStr) ?? [];
            const isToday = cell.dateStr === today;
            const isSel = cell.dateStr === selDate;
            return (
              <button
                key={cell.dateStr}
                onClick={() => setSelDate(cell.dateStr)}
                className={[
                  'flex aspect-square flex-col items-center justify-start rounded-lg border p-1 text-xs transition',
                  isSel ? 'border-brand bg-brand-deep/20' : 'border-ink-700 bg-ink-800/40',
                  !cell.inMonth ? 'opacity-40' : '',
                ].join(' ')}
              >
                <span className={`text-[11px] ${isToday ? 'grid h-5 w-5 place-items-center rounded-full bg-brand font-bold text-white' : 'text-slate-300'}`}>
                  {cell.day}
                </span>
                <div className="mt-0.5 flex flex-wrap justify-center gap-0.5">
                  {evs.slice(0, 3).map((_, i) => (
                    <span key={i} className="h-1 w-1 rounded-full bg-accent" />
                  ))}
                  {evs.length > 3 && <span className="text-[8px] text-slate-500">+{evs.length - 3}</span>}
                </div>
              </button>
            );
          })}
        </div>
        {loading && <p className="mt-2 text-center text-xs text-slate-500">Cargando…</p>}
      </div>

      {/* Eventos del día seleccionado */}
      <div>
        <p className="mb-2 text-sm font-bold text-slate-300">
          {new Date(selDate + 'T12:00:00').toLocaleDateString('es-MX', { weekday: 'long', day: 'numeric', month: 'long' })}
        </p>
        <div className="space-y-2">
          {selEvents.map((e) => (
            <button
              key={e.id}
              onClick={() => setSelEvent(e)}
              className="card flex w-full items-center gap-3 p-3 text-left active:scale-[0.99]"
            >
              <span className="text-base">📅</span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold">{e.summary}</p>
                <p className="text-xs text-slate-500">
                  {new Date(e.start).toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' })} –{' '}
                  {new Date(e.end).toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' })}
                </p>
              </div>
              <span className="text-slate-600">›</span>
            </button>
          ))}
          {selEvents.length === 0 && <p className="card p-4 text-center text-sm text-slate-500">Sin eventos este día.</p>}
        </div>
      </div>

      {selEvent && (
        <EventSheet
          event={selEvent}
          onClose={() => {
            setSelEvent(null);
            fetchEvents();
          }}
        />
      )}
    </div>
  );
}
