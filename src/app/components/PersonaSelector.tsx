'use client';

import { useState } from 'react';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Persona } from '@/lib/types';

// Chips de personas (multi-selección) + alta rápida. Reutilizable en grabar y reasignar.
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
  const [adding, setAdding] = useState(false);
  const [nombre, setNombre] = useState('');
  const [puesto, setPuesto] = useState('');
  const [busy, setBusy] = useState(false);

  function toggle(id: string) {
    if (disabled) return;
    onChange(selectedIds.includes(id) ? selectedIds.filter((x) => x !== id) : [...selectedIds, id]);
  }

  async function add() {
    const n = nombre.trim();
    if (!n) return;
    setBusy(true);
    const uid = (await supabase.auth.getUser()).data.user?.id;
    const { data } = await supabase
      .from('personas')
      .insert({ user_id: uid, nombre: n, puesto: puesto.trim() || null })
      .select()
      .single();
    setBusy(false);
    if (data) {
      const p = data as Persona;
      onPersonasChange([...personas, p]);
      onChange([...selectedIds, p.id]);
    }
    setNombre('');
    setPuesto('');
    setAdding(false);
  }

  return (
    <div>
      <div className="flex flex-wrap gap-1.5">
        {personas.map((p) => {
          const sel = selectedIds.includes(p.id);
          return (
            <button
              key={p.id}
              type="button"
              onClick={() => toggle(p.id)}
              disabled={disabled}
              className={`chip ${sel ? 'bg-brand text-white' : 'bg-ink-800 text-slate-400'} disabled:opacity-60`}
            >
              {sel ? '✓ ' : ''}
              {p.nombre}
            </button>
          );
        })}
        {!disabled && (
          <button type="button" onClick={() => setAdding((v) => !v)} className="chip bg-ink-700 text-slate-300">
            + Nueva
          </button>
        )}
      </div>

      {adding && (
        <div className="mt-2 space-y-2 rounded-lg border border-ink-700 bg-ink-900/60 p-2">
          <input
            autoFocus
            value={nombre}
            onChange={(e) => setNombre(e.target.value)}
            placeholder="Nombre"
            className="w-full rounded-lg bg-ink-900 px-3 py-2 text-sm outline-none ring-1 ring-ink-700 focus:ring-brand"
          />
          <input
            value={puesto}
            onChange={(e) => setPuesto(e.target.value)}
            placeholder="Puesto (opcional)"
            className="w-full rounded-lg bg-ink-900 px-3 py-2 text-sm outline-none ring-1 ring-ink-700 focus:ring-brand"
          />
          <div className="flex gap-2">
            <button onClick={add} disabled={busy || !nombre.trim()} className="btn-primary flex-1 py-1.5 text-sm">
              Agregar
            </button>
            <button onClick={() => setAdding(false)} className="btn-ghost py-1.5 text-sm">
              Cancelar
            </button>
          </div>
          <p className="text-[10px] text-slate-600">Completa su perfil (correo, Slack, descripción) luego en Personas.</p>
        </div>
      )}
    </div>
  );
}
