'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { DayBlock, CalendarEvent } from '@/lib/types';
import { minutesOfDay, hmToMinutes, prettyTime } from '@/lib/time';
import { BLOCK_META } from '@/lib/defaults';
import { EventSheet } from './EventSheet';
import { BlockSheet } from './BlockSheet';

interface Item {
  key: string;
  startMin: number;
  endMin: number;
  label: string;
  kind: 'block' | 'event';
  tipo?: DayBlock['tipo'];
  timeLabel: string;
  link?: string;
  event?: CalendarEvent;
  block?: DayBlock;
}

export function DayTimeline({
  blocks,
  events,
  now,
  supabase,
  onBlockSaved,
  onBlockDeleted,
}: {
  blocks: DayBlock[];
  events: CalendarEvent[];
  now: Date;
  supabase: SupabaseClient;
  onBlockSaved: (b: DayBlock) => void;
  onBlockDeleted: (id: string) => void;
}) {
  const mins = minutesOfDay(now);
  const [selEvent, setSelEvent] = useState<CalendarEvent | null>(null);
  const [selBlock, setSelBlock] = useState<DayBlock | null>(null);

  const items = useMemo<Item[]>(() => {
    const b: Item[] = blocks.map((bl) => ({
      key: `b-${bl.id}`,
      startMin: hmToMinutes(bl.hora_ini),
      endMin: hmToMinutes(bl.hora_fin),
      label: bl.label,
      kind: 'block',
      tipo: bl.tipo,
      timeLabel: `${prettyTime(bl.hora_ini)} – ${prettyTime(bl.hora_fin)}`,
      block: bl,
    }));
    const e: Item[] = events.map((ev) => {
      const start = minutesOfDay(new Date(ev.start));
      const end = minutesOfDay(new Date(ev.end));
      return {
        key: `e-${ev.id}`,
        startMin: start,
        endMin: end,
        label: ev.summary,
        kind: 'event',
        timeLabel: `${fmt(start)} – ${fmt(end)}`,
        link: ev.htmlLink,
        event: ev,
      };
    });
    return [...b, ...e].sort((x, y) => x.startMin - y.startMin || x.endMin - y.endMin);
  }, [blocks, events]);

  return (
    <section>
      <div className="mb-2 flex items-center justify-between">
        <h2 className="text-sm font-bold uppercase tracking-wide text-slate-400">Agenda de hoy</h2>
        <div className="flex items-center gap-2">
          <Link href="/calendario" className="chip bg-ink-700 text-slate-300 active:scale-95">
            📅 Mes
          </Link>
          <Link href="/agenda" className="chip bg-ink-700 text-slate-300 active:scale-95">
            ✏️ Editar
          </Link>
        </div>
      </div>

      <ol className="space-y-1.5">
        {items.map((it) => {
          const isActive = mins >= it.startMin && mins < it.endMin;
          const isPast = it.endMin <= mins;
          const meta = it.tipo ? BLOCK_META[it.tipo] : null;

          return (
            <li key={it.key}>
              <div
                onClick={
                  it.kind === 'event' && it.event
                    ? () => setSelEvent(it.event!)
                    : it.kind === 'block' && it.block
                    ? () => setSelBlock(it.block!)
                    : undefined
                }
                role="button"
                className={[
                  'flex items-stretch gap-3 rounded-xl border px-3 py-2.5 transition cursor-pointer active:scale-[0.99]',
                  isActive
                    ? 'border-brand bg-brand-deep/20 shadow-pop'
                    : it.kind === 'event'
                    ? 'border-ink-700 bg-ink-800/40'
                    : meta?.color ?? 'border-ink-700 bg-ink-800/60',
                  isPast && !isActive ? 'opacity-45' : '',
                ].join(' ')}
              >
                <div className="flex w-16 shrink-0 flex-col justify-center">
                  <span className="text-[11px] font-medium leading-tight text-slate-300">
                    {fmtStart(it.timeLabel)}
                  </span>
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    {it.kind === 'event' && <span className="text-xs">📅</span>}
                    <p className="truncate text-sm font-semibold text-slate-100">{it.label}</p>
                    {isActive && (
                      <span className="chip animate-pulse bg-brand text-white">ahora</span>
                    )}
                  </div>
                  <div className="mt-0.5 flex items-center gap-2">
                    <span className="text-[11px] text-slate-500">{it.timeLabel}</span>
                    {meta && it.tipo !== 'flex' && it.tipo !== 'neutral' && (
                      <span className={`chip ${chipTone(it.tipo!)}`}>{meta.label}</span>
                    )}
                  </div>
                </div>
                <span className="self-center text-slate-500">›</span>
              </div>
            </li>
          );
        })}
        {items.length === 0 && (
          <li className="card p-4 text-center text-sm text-slate-500">Sin bloques configurados.</li>
        )}
      </ol>

      {selEvent && <EventSheet event={selEvent} onClose={() => setSelEvent(null)} />}
      {selBlock && (
        <BlockSheet
          block={selBlock}
          supabase={supabase}
          onSaved={onBlockSaved}
          onDeleted={onBlockDeleted}
          onClose={() => setSelBlock(null)}
        />
      )}
    </section>
  );
}

function fmt(min: number): string {
  const h = Math.floor(min / 60);
  const m = min % 60;
  return prettyTime(`${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`);
}
function fmtStart(range: string): string {
  return range.split(' – ')[0] ?? range;
}
function chipTone(tipo: DayBlock['tipo']): string {
  switch (tipo) {
    case 'dudas':
      return 'bg-accent/20 text-accent';
    case 'protegido':
      return 'bg-brand/20 text-brand-soft';
    case 'comida':
      return 'bg-warn/20 text-warn';
    default:
      return 'bg-ink-700 text-slate-400';
  }
}
