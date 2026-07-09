'use client';

import { useRef, useState } from 'react';
import { createSupabaseBrowser } from '@/lib/supabase/client';
import type { Negocio } from '@/lib/types';

const SEED = ['T1 Tienda', 'T1 Envíos', 'T1 Pagos'];

export function NegociosView({ initial }: { initial: Negocio[] }) {
  const supabase = useRef(createSupabaseBrowser()).current;
  const [negocios, setNegocios] = useState<Negocio[]>(initial);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  function patchLocal(id: string, patch: Partial<Negocio>) {
    setNegocios((prev) => prev.map((n) => (n.id === id ? { ...n, ...patch } : n)));
  }

  async function save(id: string, patch: Partial<Negocio>) {
    setSavingId(id);
    await supabase.from('negocios').update(patch).eq('id', id);
    setSavingId(null);
  }

  async function addNegocio(nombre = 'Nuevo negocio') {
    const uid = (await supabase.auth.getUser()).data.user?.id;
    if (!uid) return;
    const { data } = await supabase
      .from('negocios')
      .insert({ user_id: uid, nombre, orden: negocios.length })
      .select()
      .single();
    if (data) setNegocios((prev) => [...prev, data as Negocio]);
    return data as Negocio | undefined;
  }

  async function seed() {
    setBusy(true);
    const uid = (await supabase.auth.getUser()).data.user?.id;
    if (uid) {
      const { data } = await supabase
        .from('negocios')
        .insert(SEED.map((nombre, i) => ({ user_id: uid, nombre, orden: i })))
        .select();
      if (data) setNegocios(data as Negocio[]);
    }
    setBusy(false);
  }

  async function remove(id: string) {
    if (!confirm('¿Eliminar este negocio?')) return;
    setNegocios((prev) => prev.filter((n) => n.id !== id));
    await supabase.from('negocios').delete().eq('id', id);
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-slate-400">
        Contexto y objetivo anual de cada unidad de T1. La IA lo usa en tu <b>Daily</b> y tu <b>coach de alineación</b>. Se guarda solo.
      </p>

      {negocios.length === 0 && (
        <div className="card p-6 text-center">
          <div className="text-3xl">🏢</div>
          <p className="mt-2 text-sm text-slate-400">Empieza con los negocios de T1.</p>
          <button onClick={seed} disabled={busy} className="btn-primary mt-4 w-full">
            {busy ? 'Creando…' : 'Crear T1 Tienda, T1 Envíos y T1 Pagos'}
          </button>
        </div>
      )}

      <div className="space-y-3">
        {negocios.map((n) => (
          <div key={n.id} className="card space-y-2 p-4">
            <div className="flex items-center gap-2">
              <span className="text-lg">🏢</span>
              <input
                value={n.nombre}
                onChange={(e) => patchLocal(n.id, { nombre: e.target.value })}
                onBlur={(e) => save(n.id, { nombre: e.target.value })}
                className="min-w-0 flex-1 rounded-lg bg-ink-900 px-3 py-2 text-sm font-semibold outline-none ring-1 ring-ink-700 focus:ring-brand"
              />
              <button onClick={() => remove(n.id)} className="text-slate-600 active:text-urgent" aria-label="Eliminar">
                ✕
              </button>
            </div>

            <div>
              <label className="text-[10px] uppercase tracking-wide text-slate-500">🎯 Objetivo del año</label>
              <textarea
                value={n.objetivo_anual ?? ''}
                onChange={(e) => patchLocal(n.id, { objetivo_anual: e.target.value })}
                onBlur={(e) => save(n.id, { objetivo_anual: e.target.value })}
                rows={2}
                placeholder="¿Qué se quiere lograr este año en este negocio?"
                className="mt-1 w-full rounded-lg bg-ink-900 px-3 py-2 text-sm outline-none ring-1 ring-ink-700 focus:ring-brand"
              />
            </div>

            <div>
              <label className="text-[10px] uppercase tracking-wide text-slate-500">Contexto</label>
              <textarea
                value={n.contexto ?? ''}
                onChange={(e) => patchLocal(n.id, { contexto: e.target.value })}
                onBlur={(e) => save(n.id, { contexto: e.target.value })}
                rows={4}
                placeholder="Situación, métricas clave, retos, quién lo lidera, dependencias…"
                className="mt-1 w-full rounded-lg bg-ink-900 px-3 py-2 text-sm outline-none ring-1 ring-ink-700 focus:ring-brand"
              />
            </div>

            {savingId === n.id && <p className="text-[10px] text-slate-600">Guardando…</p>}
          </div>
        ))}
      </div>

      {negocios.length > 0 && (
        <button onClick={() => addNegocio()} className="btn-ghost w-full">
          + Añadir negocio
        </button>
      )}
    </div>
  );
}
