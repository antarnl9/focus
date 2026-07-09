'use client';

import { useState } from 'react';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { DayBlock, BlockTipo } from '@/lib/types';
import { WEEKDAYS } from '@/lib/defaults';
import { BLOCK_META } from '@/lib/defaults';

const TIPOS: BlockTipo[] = ['fija', 'protegido', 'dudas', 'flex', 'comida', 'neutral'];

export function BlockSheet({
  block,
  supabase,
  onSaved,
  onDeleted,
  onClose,
}: {
  block: DayBlock;
  supabase: SupabaseClient;
  onSaved: (b: DayBlock) => void;
  onDeleted: (id: string) => void;
  onClose: () => void;
}) {
  const [label, setLabel] = useState(block.label);
  const [horaIni, setHoraIni] = useState(block.hora_ini);
  const [horaFin, setHoraFin] = useState(block.hora_fin);
  const [tipo, setTipo] = useState<BlockTipo>(block.tipo);
  const [dias, setDias] = useState<number[]>(block.dias ?? []);
  const [busy, setBusy] = useState(false);

  function toggleDia(v: number) {
    setDias((prev) => (prev.includes(v) ? prev.filter((x) => x !== v) : [...prev, v]));
  }

  async function save() {
    setBusy(true);
    const patch = { label: label.trim(), hora_ini: horaIni, hora_fin: horaFin, tipo, dias: dias.length ? dias : null };
    await supabase.from('day_blocks').update(patch).eq('id', block.id);
    setBusy(false);
    onSaved({ ...block, ...patch, dias: dias.length ? dias : null });
    onClose();
  }

  async function remove() {
    if (!confirm('¿Eliminar este bloque?')) return;
    setBusy(true);
    await supabase.from('day_blocks').delete().eq('id', block.id);
    setBusy(false);
    onDeleted(block.id);
    onClose();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50" onClick={onClose}>
      <div className="card w-full max-w-lg animate-slideUp rounded-b-none p-4 pb-8 safe-bottom" onClick={(e) => e.stopPropagation()}>
        <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-ink-600" />
        <p className="mb-3 text-base font-bold">Editar bloque</p>

        <input
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          placeholder="Nombre del bloque"
          className="w-full rounded-lg bg-ink-900 px-3 py-2 text-sm font-semibold outline-none ring-1 ring-ink-700 focus:ring-brand"
        />

        <div className="mt-2 flex items-center gap-2">
          <input type="time" value={horaIni} onChange={(e) => setHoraIni(e.target.value)} className="flex-1 rounded-lg bg-ink-900 px-2 py-2 text-sm outline-none ring-1 ring-ink-700 focus:ring-brand" />
          <span className="text-slate-500">–</span>
          <input type="time" value={horaFin} onChange={(e) => setHoraFin(e.target.value)} className="flex-1 rounded-lg bg-ink-900 px-2 py-2 text-sm outline-none ring-1 ring-ink-700 focus:ring-brand" />
        </div>

        <p className="mt-3 text-[10px] uppercase tracking-wide text-slate-500">Tipo</p>
        <div className="mt-1 flex flex-wrap gap-1.5">
          {TIPOS.map((t) => (
            <button key={t} onClick={() => setTipo(t)} className={`chip ${tipo === t ? 'bg-brand text-white' : 'bg-ink-800 text-slate-500'}`}>
              {BLOCK_META[t].label}
            </button>
          ))}
        </div>

        <p className="mt-3 text-[10px] uppercase tracking-wide text-slate-500">Días de la semana</p>
        <p className="text-[11px] text-slate-600">Vacío = todos los días. Marca días para fijarlo solo en esos.</p>
        <div className="mt-1 flex gap-1.5">
          {WEEKDAYS.map((d) => (
            <button
              key={d.v}
              onClick={() => toggleDia(d.v)}
              className={`grid h-9 w-9 place-items-center rounded-full text-sm font-semibold ${
                dias.includes(d.v) ? 'bg-brand text-white' : 'bg-ink-800 text-slate-500'
              }`}
            >
              {d.label}
            </button>
          ))}
        </div>

        <div className="mt-4 flex gap-2">
          <button onClick={save} disabled={busy || !label.trim()} className="btn-primary flex-1">
            Guardar
          </button>
          <button onClick={remove} disabled={busy} className="rounded-xl border border-urgent/40 bg-urgent/10 px-4 text-sm font-medium text-urgent active:scale-95">
            🗑️
          </button>
        </div>
        <button onClick={onClose} className="mt-3 w-full text-center text-xs text-slate-500">
          Cerrar
        </button>
      </div>
    </div>
  );
}
