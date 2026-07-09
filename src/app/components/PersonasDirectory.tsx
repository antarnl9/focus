'use client';

import { useRef, useState } from 'react';
import Link from 'next/link';
import { createSupabaseBrowser } from '@/lib/supabase/client';
import type { Persona, PersonaTipo } from '@/lib/types';
import { TIPO_META, DOMAIN, normalizeCorreo } from './persona-util';

export function PersonasDirectory({ initial }: { initial: Persona[] }) {
  const supabase = useRef(createSupabaseBrowser()).current;
  const [personas, setPersonas] = useState<Persona[]>(initial);
  const [adding, setAdding] = useState(false);
  const [nombre, setNombre] = useState('');
  const [puesto, setPuesto] = useState('');
  const [correo, setCorreo] = useState('');
  const [tipo, setTipo] = useState<PersonaTipo>('interno');
  const [busy, setBusy] = useState(false);

  async function add() {
    const n = nombre.trim();
    if (!n) return;
    setBusy(true);
    const uid = (await supabase.auth.getUser()).data.user?.id;
    const { data } = await supabase
      .from('personas')
      .insert({ user_id: uid, nombre: n, puesto: puesto.trim() || null, correo: normalizeCorreo(correo, tipo), tipo })
      .select()
      .single();
    setBusy(false);
    if (data) setPersonas((prev) => [...prev, data as Persona].sort((a, b) => a.nombre.localeCompare(b.nombre)));
    setNombre('');
    setPuesto('');
    setCorreo('');
    setTipo('interno');
    setAdding(false);
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2">
        <p className="min-w-0 flex-1 text-sm text-slate-400">Tu directorio: liga juntas y dudas a cada persona.</p>
        <Link href="/personas/import" className="chip bg-ink-700 text-slate-300 active:scale-95">
          ⤵️ Importar
        </Link>
        <button onClick={() => setAdding((v) => !v)} className="chip bg-brand text-white">
          {adding ? 'Cancelar' : '+ Nueva'}
        </button>
      </div>

      {adding && (
        <div className="card space-y-2 p-3">
          <div className="flex flex-wrap gap-1.5">
            {(Object.keys(TIPO_META) as PersonaTipo[]).map((t) => (
              <button key={t} onClick={() => setTipo(t)} className={`chip ${tipo === t ? TIPO_META[t].tone : 'bg-ink-800 text-slate-500'}`}>
                {TIPO_META[t].icon} {TIPO_META[t].label}
              </button>
            ))}
          </div>
          <input value={nombre} onChange={(e) => setNombre(e.target.value)} placeholder="Nombre *" className="w-full rounded-lg bg-ink-900 px-3 py-2 text-sm outline-none ring-1 ring-ink-700 focus:ring-brand" />
          <input value={puesto} onChange={(e) => setPuesto(e.target.value)} placeholder="Puesto" className="w-full rounded-lg bg-ink-900 px-3 py-2 text-sm outline-none ring-1 ring-ink-700 focus:ring-brand" />
          <div className="flex items-center rounded-lg bg-ink-900 ring-1 ring-ink-700 focus-within:ring-brand">
            <input
              value={correo}
              onChange={(e) => setCorreo(e.target.value)}
              placeholder={tipo === 'interno' ? 'usuario' : 'correo@dominio.com'}
              className="min-w-0 flex-1 bg-transparent px-3 py-2 text-sm outline-none"
            />
            {tipo === 'interno' && !correo.includes('@') && <span className="pr-3 text-sm text-slate-500">@{DOMAIN}</span>}
          </div>
          <button onClick={add} disabled={busy || !nombre.trim()} className="btn-primary w-full text-sm">
            Guardar
          </button>
          <p className="text-[11px] text-slate-600">
            {tipo === 'interno' ? `Si es de T1, solo escribe el usuario; se completa @${DOMAIN}.` : 'Después agregas Slack y descripción en su perfil.'}
          </p>
        </div>
      )}

      <div className="space-y-2">
        {personas.map((p) => (
          <Link key={p.id} href={`/personas/${p.id}`} className="card flex items-center gap-3 p-3 active:scale-[0.99]">
            <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-brand-deep/30 text-sm font-bold text-brand-soft">
              {p.nombre.slice(0, 2).toUpperCase()}
            </span>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <p className="truncate text-sm font-semibold">{p.nombre}</p>
                <span className={`chip ${TIPO_META[p.tipo]?.tone ?? 'bg-ink-700 text-slate-400'}`}>{TIPO_META[p.tipo]?.label ?? p.tipo}</span>
              </div>
              <p className="truncate text-xs text-slate-500">{[p.puesto, p.correo].filter(Boolean).join(' · ') || 'Sin datos'}</p>
            </div>
            <span className="text-slate-600">›</span>
          </Link>
        ))}
        {personas.length === 0 && !adding && (
          <p className="card p-6 text-center text-sm text-slate-500">Aún no hay personas. Agrega la primera con “+ Nueva”.</p>
        )}
      </div>
    </div>
  );
}
