'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createSupabaseBrowser } from '@/lib/supabase/client';
import type { CalendarEvent } from '@/lib/types';
import { localTimeStr } from '@/lib/time';

interface P {
  id: string;
  nombre: string;
  correo: string;
}

export function EventSheet({ event, onClose }: { event: CalendarEvent; onClose: () => void }) {
  const supabase = useRef(createSupabaseBrowser()).current;
  const router = useRouter();
  const [personas, setPersonas] = useState<P[]>([]);
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [horaIni, setHoraIni] = useState(localTimeStr(new Date(event.start)));
  const [horaFin, setHoraFin] = useState(localTimeStr(new Date(event.end)));
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => {
    supabase
      .from('personas')
      .select('id, nombre, correo')
      .not('correo', 'is', null)
      .order('rango')
      .order('nombre')
      .then(({ data }) => data && setPersonas(data as P[]));
  }, [supabase]);

  function toggle(correo: string) {
    setSel((prev) => {
      const n = new Set(prev);
      if (n.has(correo)) n.delete(correo);
      else n.add(correo);
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
      setTimeout(onClose, 700);
    } else {
      const j = await res.json().catch(() => ({}));
      setMsg('Error: ' + (j.error || 'no se pudo. ¿Eres el organizador del evento?'));
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50" onClick={onClose}>
      <div
        className="card w-full max-w-lg animate-slideUp rounded-b-none p-4 pb-8 safe-bottom"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-ink-600" />
        <div className="flex items-start gap-2">
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

        {/* Invitar personas */}
        <div className="mt-4">
          <p className="mb-1 text-[10px] uppercase tracking-wide text-slate-500">Agregar personas y enviar invitación</p>
          <div className="flex max-h-32 flex-wrap gap-1.5 overflow-y-auto">
            {personas.map((p) => (
              <button
                key={p.id}
                onClick={() => toggle(p.correo)}
                className={`chip ${sel.has(p.correo) ? 'bg-brand text-white' : 'bg-ink-800 text-slate-400'}`}
              >
                {sel.has(p.correo) ? '✓ ' : ''}
                {p.nombre.split(' ')[0]}
              </button>
            ))}
            {personas.length === 0 && <span className="text-xs text-slate-500">Sin personas con correo. Agrégalas en Personas.</span>}
          </div>
          <button
            onClick={() => call({ action: 'invite', emails: [...sel] }, '✅ Invitaciones enviadas')}
            disabled={busy || sel.size === 0}
            className="btn-primary mt-2 w-full text-sm"
          >
            📨 Invitar {sel.size > 0 ? `(${sel.size})` : ''}
          </button>
        </div>

        {/* Mover horario */}
        <div className="mt-4">
          <p className="mb-1 text-[10px] uppercase tracking-wide text-slate-500">Mover horario</p>
          <div className="flex items-center gap-2">
            <input type="time" value={horaIni} onChange={(e) => setHoraIni(e.target.value)} className="flex-1 rounded-lg bg-ink-900 px-2 py-2 text-sm outline-none ring-1 ring-ink-700 focus:ring-brand" />
            <span className="text-slate-500">–</span>
            <input type="time" value={horaFin} onChange={(e) => setHoraFin(e.target.value)} className="flex-1 rounded-lg bg-ink-900 px-2 py-2 text-sm outline-none ring-1 ring-ink-700 focus:ring-brand" />
            <button
              onClick={() => call({ action: 'reschedule', hora_ini: horaIni, hora_fin: horaFin }, '✅ Movido')}
              disabled={busy}
              className="btn-ghost px-3 py-2 text-sm"
            >
              Mover
            </button>
          </div>
        </div>

        {/* Cancelar */}
        <button
          onClick={() => {
            if (confirm('¿Cancelar este evento? Se avisará a los invitados.')) call({ action: 'cancel' }, '✅ Cancelado');
          }}
          disabled={busy}
          className="mt-4 w-full rounded-xl border border-urgent/40 bg-urgent/10 py-2.5 text-sm font-medium text-urgent active:scale-[0.98]"
        >
          🗑️ Cancelar evento
        </button>

        {msg && <p className="mt-2 text-center text-sm text-slate-300">{msg}</p>}
        <button onClick={onClose} className="mt-3 w-full text-center text-xs text-slate-500">
          Cerrar
        </button>
      </div>
    </div>
  );
}
