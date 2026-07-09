'use client';

import { useState } from 'react';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Prioridad } from '@/lib/types';

const TIER_LABEL = ['P0', 'P1', 'P2'] as const;
const TIER_TONE = ['bg-urgent/20 text-urgent', 'bg-warn/20 text-warn', 'bg-ink-700 text-slate-400'];

export function Prioridades({
  supabase,
  initial,
  onLog,
}: {
  supabase: SupabaseClient;
  initial: Prioridad[];
  onLog: () => void;
}) {
  const [items, setItems] = useState<Prioridad[]>(initial);
  const [adding, setAdding] = useState(false);
  const [texto, setTexto] = useState('');
  const [tier, setTier] = useState<0 | 1 | 2>(0);

  async function toggle(p: Prioridad) {
    const done = !p.done;
    setItems((prev) => prev.map((x) => (x.id === p.id ? { ...x, done, done_at: done ? new Date().toISOString() : null } : x)));
    await supabase.from('prioridades').update({ done, done_at: done ? new Date().toISOString() : null }).eq('id', p.id);
    // Al completar: registra en bitácora (spec §3.3).
    if (done) {
      await supabase.from('bitacora').insert({ user_id: p.user_id, tipo: 'prioridad', texto: `Prioridad completada: ${p.texto}` });
      onLog();
    }
  }

  async function add() {
    const t = texto.trim();
    if (!t) return;
    const { data } = await supabase
      .from('prioridades')
      .insert({ tier, texto: t, orden: items.length, user_id: (await supabase.auth.getUser()).data.user?.id })
      .select()
      .single();
    if (data) setItems((prev) => [...prev, data as Prioridad]);
    setTexto('');
    setAdding(false);
  }

  async function remove(p: Prioridad) {
    setItems((prev) => prev.filter((x) => x.id !== p.id));
    await supabase.from('prioridades').delete().eq('id', p.id);
  }

  return (
    <section>
      <div className="mb-2 flex items-center justify-between">
        <h2 className="text-sm font-bold uppercase tracking-wide text-slate-400">Prioridades</h2>
        <button onClick={() => setAdding((v) => !v)} className="chip bg-ink-700 text-slate-300 active:scale-95">
          {adding ? 'Cancelar' : '+ Añadir'}
        </button>
      </div>

      {adding && (
        <div className="card mb-2 space-y-2 p-3">
          <input
            autoFocus
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && add()}
            placeholder="Nueva prioridad…"
            className="w-full rounded-lg bg-ink-900 px-3 py-2 text-sm outline-none ring-1 ring-ink-700 focus:ring-brand"
          />
          <div className="flex items-center gap-2">
            {TIER_LABEL.map((l, i) => (
              <button
                key={l}
                onClick={() => setTier(i as 0 | 1 | 2)}
                className={`chip ${tier === i ? TIER_TONE[i] : 'bg-ink-800 text-slate-500'}`}
              >
                {l}
              </button>
            ))}
            <button onClick={add} className="btn-primary ml-auto px-4 py-1.5 text-sm">
              Guardar
            </button>
          </div>
        </div>
      )}

      <div className="space-y-1.5">
        {[0, 1, 2].map((t) =>
          items.filter((p) => p.tier === t).length ? (
            <div key={t}>
              {items
                .filter((p) => p.tier === t)
                .map((p) => (
                  <div key={p.id} className="group flex items-center gap-3 rounded-xl border border-ink-700 bg-ink-800/60 px-3 py-2.5">
                    <button
                      onClick={() => toggle(p)}
                      className={`grid h-6 w-6 shrink-0 place-items-center rounded-md border ${
                        p.done ? 'border-ok bg-ok/20 text-ok' : 'border-ink-600'
                      }`}
                      aria-label="Completar"
                    >
                      {p.done ? '✓' : ''}
                    </button>
                    <span className={`chip ${TIER_TONE[t]}`}>{TIER_LABEL[t]}</span>
                    <span className={`min-w-0 flex-1 truncate text-sm ${p.done ? 'text-slate-500 line-through' : 'text-slate-100'}`}>
                      {p.texto}
                    </span>
                    <button
                      onClick={() => remove(p)}
                      className="text-slate-600 opacity-0 transition group-hover:opacity-100 active:opacity-100"
                      aria-label="Eliminar"
                    >
                      ✕
                    </button>
                  </div>
                ))}
            </div>
          ) : null
        )}
        {items.length === 0 && <p className="card p-4 text-center text-sm text-slate-500">Sin prioridades.</p>}
      </div>
    </section>
  );
}
