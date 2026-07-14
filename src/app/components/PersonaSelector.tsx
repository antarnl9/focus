'use client';

import { useMemo, useState } from 'react';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Persona } from '@/lib/types';

// Autocomplete de personas (multi-selección) + alta rápida. Muestra solo los
// seleccionados como chips; el resto se busca (no amontona a las 49).
export function PersonaSelector({
  personas,
  selectedIds,
  onChange,
  onPersonasChange,
  supabase,
  disabled,
}: {
  personas: Persona[];
  selectedIds: string[];
  onChange: (ids: string[]) => void;
  onPersonasChange: (personas: Persona[]) => void;
  supabase: SupabaseClient;
  disabled?: boolean;
}) {
  const [query, setQuery] = useState('');
  const [busy, setBusy] = useState(false);

  const selected = useMemo(() => personas.filter((p) => selectedIds.includes(p.id)), [personas, selectedIds]);

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    return personas
      .filter((p) => !selectedIds.includes(p.id))
      .filter((p) => p.nombre.toLowerCase().includes(q) || (p.puesto ?? '').toLowerCase().includes(q))
      .slice(0, 20);
  }, [personas, selectedIds, query]);

  const exactExists = useMemo(
    () => personas.some((p) => p.nombre.trim().toLowerCase() === query.trim().toLowerCase()),
    [personas, query]
  );

  function toggle(id: string) {
    if (disabled) return;
    onChange(selectedIds.includes(id) ? selectedIds.filter((x) => x !== id) : [...selectedIds, id]);
  }

  async function quickAdd(nombre: string) {
    const n = nombre.trim();
    if (!n) return;
    setBusy(true);
    const uid = (await supabase.auth.getUser()).data.user?.id;
    const { data } = await supabase.from('personas').insert({ user_id: uid, nombre: n }).select().single();
    setBusy(false);
    if (data) {
      const p = data as Persona;
      onPersonasChange([...personas, p]);
      onChange([...selectedIds, p.id]);
    }
    setQuery('');
  }

  return (
    <div>
      {/* Seleccionados */}
      {selected.length > 0 && (
        <div className="mb-2 flex flex-wrap gap-1.5">
          {selected.map((p) => (
            <button
              key={p.id}
              type="button"
              onClick={() => toggle(p.id)}
              disabled={disabled}
              className="chip bg-brand text-white disabled:opacity-60"
            >
              {p.nombre.split(' ')[0]} ✕
            </button>
          ))}
        </div>
      )}

      {!disabled && (
        <>
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={`Buscar entre ${personas.length} personas…`}
            className="w-full rounded-lg bg-ink-900 px-3 py-2 text-sm outline-none ring-1 ring-ink-700 focus:ring-brand"
          />

          {query.trim() && (
            <div className="mt-1 max-h-52 space-y-1 overflow-y-auto">
              {results.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => {
                    toggle(p.id);
                    setQuery('');
                  }}
                  className="flex w-full items-center gap-2.5 rounded-lg border border-ink-700 bg-ink-800/40 px-3 py-2 text-left active:scale-[0.99]"
                >
                  <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-brand-deep/30 text-[10px] font-bold text-brand-soft">
                    {p.nombre.slice(0, 2).toUpperCase()}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm text-slate-100">{p.nombre}</p>
                    {p.puesto && <p className="truncate text-[11px] text-slate-500">{p.puesto}</p>}
                  </div>
                  <span className="text-brand-soft">+</span>
                </button>
              ))}

              {!exactExists && (
                <button
                  type="button"
                  onClick={() => quickAdd(query)}
                  disabled={busy}
                  className="w-full rounded-lg border border-dashed border-ink-600 px-3 py-2 text-left text-sm text-slate-300 active:scale-[0.99]"
                >
                  {busy ? 'Agregando…' : `+ Agregar “${query.trim()}” como persona nueva`}
                </button>
              )}

              {results.length === 0 && exactExists && (
                <p className="px-1 py-2 text-xs text-slate-500">Ya está en la lista o seleccionada.</p>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}
