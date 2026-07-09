'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { createSupabaseBrowser } from '@/lib/supabase/client';

interface P {
  id: string;
  nombre: string;
  puesto: string | null;
  correo: string;
}

// Selector de personas con buscador + correo directo. Devuelve los correos.
export function PeoplePicker({ onChange }: { onChange: (emails: string[]) => void }) {
  const supabase = useRef(createSupabaseBrowser()).current;
  const [personas, setPersonas] = useState<P[]>([]);
  const [sel, setSel] = useState<Map<string, P>>(new Map());
  const [query, setQuery] = useState('');
  const [emailInput, setEmailInput] = useState('');

  useEffect(() => {
    supabase
      .from('personas')
      .select('id, nombre, puesto, correo')
      .not('correo', 'is', null)
      .order('rango')
      .order('nombre')
      .then(({ data }) => data && setPersonas(data as P[]));
  }, [supabase]);

  useEffect(() => {
    onChange([...sel.keys()]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sel]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = q ? personas.filter((p) => p.nombre.toLowerCase().includes(q) || (p.puesto ?? '').toLowerCase().includes(q)) : personas;
    return list.slice(0, 30);
  }, [personas, query]);

  function toggle(p: P) {
    setSel((prev) => {
      const n = new Map(prev);
      if (n.has(p.correo)) n.delete(p.correo);
      else n.set(p.correo, p);
      return n;
    });
  }

  function addEmail() {
    const e = emailInput.trim().toLowerCase();
    if (!e.includes('@') || !e.includes('.')) return;
    setSel((prev) => new Map(prev).set(e, { id: e, nombre: e, puesto: null, correo: e }));
    setEmailInput('');
  }

  const selArr = [...sel.values()];

  return (
    <div className="space-y-2">
      {selArr.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {selArr.map((p) => (
            <button key={p.correo} onClick={() => toggle(p)} className="chip bg-brand text-white">
              {p.nombre.split(' ')[0]} ✕
            </button>
          ))}
        </div>
      )}

      <input
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder={`Buscar entre ${personas.length}…`}
        className="w-full rounded-lg bg-ink-900 px-3 py-2 text-sm outline-none ring-1 ring-ink-700 focus:ring-brand"
      />
      <div className="flex items-center gap-2">
        <input
          value={emailInput}
          onChange={(e) => setEmailInput(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && addEmail()}
          placeholder="…o escribe un correo"
          className="min-w-0 flex-1 rounded-lg bg-ink-900 px-3 py-2 text-sm outline-none ring-1 ring-ink-700 focus:ring-brand"
        />
        <button onClick={addEmail} className="btn-ghost px-3 py-2 text-sm">
          +
        </button>
      </div>

      <div className="max-h-44 space-y-1 overflow-y-auto">
        {filtered.map((p) => {
          const on = sel.has(p.correo);
          return (
            <button
              key={p.id}
              onClick={() => toggle(p)}
              className={`flex w-full items-center gap-2 rounded-lg border px-2 py-1.5 text-left ${on ? 'border-brand bg-brand-deep/20' : 'border-ink-700 bg-ink-800/40'}`}
            >
              <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-brand-deep/30 text-[10px] font-bold text-brand-soft">
                {p.nombre.slice(0, 2).toUpperCase()}
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm">{p.nombre}</p>
                {p.puesto && <p className="truncate text-[11px] text-slate-500">{p.puesto}</p>}
              </div>
              <span className={`grid h-5 w-5 shrink-0 place-items-center rounded-full text-xs ${on ? 'bg-brand text-white' : 'bg-ink-700 text-slate-500'}`}>
                {on ? '✓' : '+'}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
