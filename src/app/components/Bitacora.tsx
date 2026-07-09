'use client';

import { useState } from 'react';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { BitacoraEntry } from '@/lib/types';

const TIPO_META: Record<BitacoraEntry['tipo'], { icon: string; label: string }> = {
  nota: { icon: '📝', label: 'Nota' },
  duda_resuelta: { icon: '✅', label: 'Duda resuelta' },
  prioridad: { icon: '🎯', label: 'Prioridad' },
  grabacion: { icon: '🎙️', label: 'Grabación' },
  acuerdo: { icon: '🤝', label: 'Acuerdo' },
  daily: { icon: '📊', label: 'Daily' },
};

export function Bitacora({
  supabase,
  today,
  entries,
  onChanged,
}: {
  supabase: SupabaseClient;
  today: string;
  entries: BitacoraEntry[];
  onChanged: () => void;
}) {
  const [texto, setTexto] = useState('');
  const [saving, setSaving] = useState(false);

  async function add() {
    const t = texto.trim();
    if (!t) return;
    setSaving(true);
    const uid = (await supabase.auth.getUser()).data.user?.id;
    await supabase.from('bitacora').insert({ user_id: uid, tipo: 'nota', texto: t });
    setTexto('');
    setSaving(false);
    onChanged();
  }

  return (
    <section>
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-sm font-bold uppercase tracking-wide text-slate-400">Bitácora de hoy</h2>
        <span className="chip bg-ink-700 text-slate-400">{entries.length}</span>
      </div>

      {/* Entrada rápida de una línea (spec §3.5). */}
      <div className="card mb-4 flex items-center gap-2 p-2">
        <input
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && add()}
          placeholder="Anota algo del día…"
          className="min-w-0 flex-1 bg-transparent px-2 py-2 text-sm outline-none"
        />
        <button onClick={add} disabled={saving || !texto.trim()} className="btn-primary px-4 py-2 text-sm">
          Añadir
        </button>
      </div>

      <ol className="relative space-y-3 border-l border-ink-700 pl-4">
        {entries.map((e) => {
          const meta = TIPO_META[e.tipo];
          return (
            <li key={e.id} className="relative">
              <span className="absolute -left-[22px] top-1 grid h-4 w-4 place-items-center rounded-full bg-ink-800 text-[9px]">
                {meta.icon}
              </span>
              <div className="rounded-xl border border-ink-700 bg-ink-800/50 px-3 py-2">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-mono text-slate-500">{e.hora}</span>
                  <span className="chip bg-ink-700 text-[10px] text-slate-400">{meta.label}</span>
                </div>
                <p className="mt-1 text-sm text-slate-200">{e.texto}</p>
              </div>
            </li>
          );
        })}
        {entries.length === 0 && (
          <li className="text-sm text-slate-500">Aún no hay entradas. Se llena sola al resolver dudas y completar prioridades.</li>
        )}
      </ol>

      <p className="mt-4 text-center text-xs text-slate-600">
        Historial de {today}. La bitácora se archiva por fecha.
      </p>
    </section>
  );
}
