'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createSupabaseBrowser } from '@/lib/supabase/client';
import type { CalendarEvent, PersonaTipo } from '@/lib/types';
import { localTimeStr } from '@/lib/time';

interface P {
  id: string;
  nombre: string;
  puesto: string | null;
  correo: string;
  rango: number;
  tipo: PersonaTipo;
}

export function EventSheet({ event, onClose }: { event: CalendarEvent; onClose: () => void }) {
  const supabase = useRef(createSupabaseBrowser()).current;
  const router = useRouter();
  const [personas, setPersonas] = useState<P[]>([]);
  const [sel, setSel] = useState<Map<string, P>>(new Map()); // correo -> persona
  const [query, setQuery] = useState('');
  const [horaIni, setHoraIni] = useState(localTimeStr(new Date(event.start)));
  const [horaFin, setHoraFin] = useState(localTimeStr(new Date(event.end)));
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [showMas, setShowMas] = useState(false);

  useEffect(() => {
    supabase
      .from('personas')
      .select('id, nombre, puesto, correo, rango, tipo')
      .not('correo', 'is', null)
      .order('rango')
      .order('nombre')
      .then(({ data }) => data && setPersonas(data as P[]));
  }, [supabase]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = q
      ? personas.filter((p) => p.nombre.toLowerCase().includes(q) || (p.puesto ?? '').toLowerCase().includes(q))
      : personas;
    return list.slice(0, 40);
  }, [personas, query]);

  function toggle(p: P) {
    setSel((prev) => {
      const n = new Map(prev);
      if (n.has(p.correo)) n.delete(p.correo);
      else n.set(p.correo, p);
      return n;
    });
  }

  async function call(body: object, okMsg: string) {
    setBusy(true);
    setMsg(null);
    const res = await fetch('/api/calendar/event', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ eventId: event.id, ...body }),
    });
    setBusy(false);
    if (res.ok) {
      setMsg(okMsg);
      router.refresh();
      setTimeout(onClose, 800);
    } else {
      const j = await res.json().catch(() => ({}));
      setMsg('Error: ' + (j.error || 'no se pudo. ¿Eres el organizador del evento?'));
    }
  }

  const selArr = [...sel.values()];

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50" onClick={onClose}>
      <div
        className="card flex max-h-[88dvh] w-full max-w-lg animate-slideUp flex-col rounded-b-none p-4 pb-6 safe-bottom"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mx-auto mb-3 h-1 w-10 shrink-0 rounded-full bg-ink-600" />

        {/* Header */}
        <div className="flex shrink-0 items-start gap-2">
          <span className="text-lg">📅</span>
          <div className="min-w-0 flex-1">
            <p className="truncate text-base font-bold">{event.summary}</p>
            <p className="text-xs text-slate-500">
              {localTimeStr(new Date(event.start))} – {localTimeStr(new Date(event.end))}
            </p>
          </div>
          {event.htmlLink && (
            <a href={event.htmlLink} target="_blank" rel="noreferrer" className="chip bg-ink-700 text-slate-300">
              Abrir
            </a>
          )}
        </div>

        {/* Seleccionados */}
        {selArr.length > 0 && (
          <div className="mt-3 flex shrink-0 flex-wrap gap-1.5">
            {selArr.map((p) => (
              <button key={p.correo} onClick={() => toggle(p)} className="chip bg-brand text-white">
                {p.nombre.split(' ')[0]} ✕
              </button>
            ))}
          </div>
        )}

        {/* Buscador */}
        <div className="mt-3 shrink-0">
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={`Buscar entre ${personas.length} personas…`}
            className="w-full rounded-xl bg-ink-900 px-3 py-2.5 text-sm outline-none ring-1 ring-ink-700 focus:ring-brand"
          />
        </div>

        {/* Lista (scroll) */}
        <div className="mt-2 min-h-0 flex-1 space-y-1 overflow-y-auto">
          {filtered.map((p) => {
            const on = sel.has(p.correo);
            return (
              <button
                key={p.id}
                onClick={() => toggle(p)}
                className={`flex w-full items-center gap-3 rounded-xl border px-3 py-2 text-left transition ${
                  on ? 'border-brand bg-brand-deep/20' : 'border-ink-700 bg-ink-800/40'
                }`}
              >
                <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-brand-deep/30 text-xs font-bold text-brand-soft">
                  {p.nombre.slice(0, 2).toUpperCase()}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{p.nombre}</p>
                  {p.puesto && <p className="truncate text-xs text-slate-500">{p.puesto}</p>}
                </div>
                <span className={`grid h-6 w-6 shrink-0 place-items-center rounded-full ${on ? 'bg-brand text-white' : 'bg-ink-700 text-slate-500'}`}>
                  {on ? '✓' : '+'}
                </span>
              </button>
            );
          })}
          {filtered.length === 0 && <p className="py-6 text-center text-sm text-slate-500">Sin resultados.</p>}
        </div>

        {/* Acción invitar */}
        <div className="mt-3 shrink-0 space-y-2">
          <button
            onClick={() => call({ action: 'invite', emails: selArr.map((p) => p.correo) }, '✅ Invitaciones enviadas')}
            disabled={busy || selArr.length === 0}
            className="btn-primary w-full"
          >
            📨 Invitar {selArr.length > 0 ? `a ${selArr.length}` : ''}
          </button>

          {/* Más opciones: mover / cancelar */}
          <button onClick={() => setShowMas((v) => !v)} className="w-full text-center text-xs text-slate-500">
            {showMas ? 'Ocultar' : 'Más opciones (mover / cancelar)'}
          </button>

          {showMas && (
            <div className="space-y-2 rounded-xl border border-ink-700 bg-ink-900/50 p-3">
              <p className="text-[10px] uppercase tracking-wide text-slate-500">Mover horario</p>
              <div className="flex items-center gap-2">
                <input type="time" value={horaIni} onChange={(e) => setHoraIni(e.target.value)} className="flex-1 rounded-lg bg-ink-900 px-2 py-2 text-sm outline-none ring-1 ring-ink-700 focus:ring-brand" />
                <span className="text-slate-500">–</span>
                <input type="time" value={horaFin} onChange={(e) => setHoraFin(e.target.value)} className="flex-1 rounded-lg bg-ink-900 px-2 py-2 text-sm outline-none ring-1 ring-ink-700 focus:ring-brand" />
                <button onClick={() => call({ action: 'reschedule', hora_ini: horaIni, hora_fin: horaFin }, '✅ Movido')} disabled={busy} className="btn-ghost px-3 py-2 text-sm">
                  Mover
                </button>
              </div>
              <button
                onClick={() => {
                  if (confirm('¿Cancelar este evento? Se avisará a los invitados.')) call({ action: 'cancel' }, '✅ Cancelado');
                }}
                disabled={busy}
                className="w-full rounded-xl border border-urgent/40 bg-urgent/10 py-2 text-sm font-medium text-urgent active:scale-[0.98]"
              >
                🗑️ Cancelar evento
              </button>
            </div>
          )}

          {msg && <p className="text-center text-sm text-slate-300">{msg}</p>}
        </div>
      </div>
    </div>
  );
}
