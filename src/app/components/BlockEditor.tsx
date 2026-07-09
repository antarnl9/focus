'use client';

import { useMemo, useRef, useState } from 'react';
import { createSupabaseBrowser } from '@/lib/supabase/client';
import type { BlockTipo, DayBlock } from '@/lib/types';
import { hmToMinutes } from '@/lib/time';
import { BLOCK_META } from '@/lib/defaults';

const TIPOS: BlockTipo[] = ['fija', 'protegido', 'dudas', 'flex', 'comida', 'neutral'];

export function BlockEditor({ initial }: { initial: DayBlock[] }) {
  const supabase = useRef(createSupabaseBrowser()).current;
  const [blocks, setBlocks] = useState<DayBlock[]>(initial);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [calMsg, setCalMsg] = useState('');
  const [calBusy, setCalBusy] = useState(false);

  const sorted = useMemo(
    () => [...blocks].sort((a, b) => hmToMinutes(a.hora_ini) - hmToMinutes(b.hora_ini)),
    [blocks]
  );

  function patchLocal(id: string, patch: Partial<DayBlock>) {
    setBlocks((prev) => prev.map((b) => (b.id === id ? { ...b, ...patch } : b)));
  }

  async function save(id: string, patch: Partial<DayBlock>) {
    setSavingId(id);
    await supabase.from('day_blocks').update(patch).eq('id', id);
    setSavingId(null);
  }

  async function addBlock() {
    const uid = (await supabase.auth.getUser()).data.user?.id;
    if (!uid) return;
    const { data } = await supabase
      .from('day_blocks')
      .insert({ user_id: uid, hora_ini: '12:00', hora_fin: '12:30', label: 'Nuevo bloque', tipo: 'flex', orden: blocks.length })
      .select()
      .single();
    if (data) setBlocks((prev) => [...prev, data as DayBlock]);
  }

  async function remove(id: string) {
    if (!confirm('¿Eliminar este bloque?')) return;
    setBlocks((prev) => prev.filter((b) => b.id !== id));
    await supabase.from('day_blocks').delete().eq('id', id);
  }

  async function syncCalendar() {
    setCalBusy(true);
    setCalMsg('');
    try {
      const res = await fetch('/api/calendar/template', { method: 'POST' });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Error');
      setCalMsg(json.message || `${json.created} bloques creados en Calendar.`);
    } catch (e) {
      setCalMsg((e as Error).message);
    } finally {
      setCalBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-slate-400">
        Edita tus bloques/juntas del día: hora, nombre y tipo. Los cambios se guardan solos.
      </p>

      <div className="space-y-2">
        {sorted.map((b) => (
          <div key={b.id} className="card p-3">
            <div className="flex items-center gap-2">
              <input
                type="time"
                value={b.hora_ini}
                onChange={(e) => patchLocal(b.id, { hora_ini: e.target.value })}
                onBlur={(e) => save(b.id, { hora_ini: e.target.value })}
                className="rounded-lg bg-ink-900 px-2 py-2 text-sm outline-none ring-1 ring-ink-700 focus:ring-brand"
              />
              <span className="text-slate-500">–</span>
              <input
                type="time"
                value={b.hora_fin}
                onChange={(e) => patchLocal(b.id, { hora_fin: e.target.value })}
                onBlur={(e) => save(b.id, { hora_fin: e.target.value })}
                className="rounded-lg bg-ink-900 px-2 py-2 text-sm outline-none ring-1 ring-ink-700 focus:ring-brand"
              />
              <button
                onClick={() => remove(b.id)}
                className="ml-auto text-slate-600 active:text-urgent"
                aria-label="Eliminar bloque"
              >
                ✕
              </button>
            </div>

            <input
              value={b.label}
              onChange={(e) => patchLocal(b.id, { label: e.target.value })}
              onBlur={(e) => save(b.id, { label: e.target.value })}
              placeholder="Nombre del bloque / junta"
              className="mt-2 w-full rounded-lg bg-ink-900 px-3 py-2 text-sm outline-none ring-1 ring-ink-700 focus:ring-brand"
            />

            <div className="mt-2 flex flex-wrap gap-1.5">
              {TIPOS.map((t) => (
                <button
                  key={t}
                  onClick={() => {
                    patchLocal(b.id, { tipo: t });
                    save(b.id, { tipo: t });
                  }}
                  className={`chip ${b.tipo === t ? tone(t) : 'bg-ink-800 text-slate-500'}`}
                >
                  {BLOCK_META[t].label}
                </button>
              ))}
            </div>

            {savingId === b.id && <p className="mt-1 text-[10px] text-slate-600">Guardando…</p>}
          </div>
        ))}
      </div>

      <button onClick={addBlock} className="btn-ghost w-full">
        + Añadir bloque
      </button>

      <div className="card p-3">
        <button onClick={syncCalendar} disabled={calBusy} className="btn-primary w-full">
          {calBusy ? 'Sincronizando…' : '📅 Sincronizar plantilla a Google Calendar'}
        </button>
        {calMsg && <p className="mt-2 text-center text-xs text-slate-400">{calMsg}</p>}
        <p className="mt-2 text-center text-[11px] text-slate-600">
          Crea los bloques como eventos recurrentes; los protegidos y comida quedan como “ocupado”.
        </p>
      </div>
    </div>
  );
}

function tone(t: BlockTipo): string {
  switch (t) {
    case 'dudas':
      return 'bg-accent/20 text-accent';
    case 'protegido':
      return 'bg-brand/20 text-brand-soft';
    case 'comida':
      return 'bg-warn/20 text-warn';
    case 'fija':
      return 'bg-slate-500/20 text-slate-300';
    default:
      return 'bg-ink-700 text-slate-300';
  }
}
