'use client';

import { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createSupabaseBrowser } from '@/lib/supabase/client';
import type { CooProfile } from '@/lib/types';

export function PerfilCoo({ initial }: { initial: CooProfile }) {
  const supabase = useRef(createSupabaseBrowser()).current;
  const router = useRouter();
  const [form, setForm] = useState({
    nombre: initial.nombre ?? '',
    titulo: initial.titulo ?? '',
    objetivo: initial.objetivo ?? '',
    bio: initial.bio ?? '',
  });
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);

  function set(k: keyof typeof form, v: string) {
    setForm((f) => ({ ...f, [k]: v }));
    setSaved(false);
  }

  async function save() {
    setBusy(true);
    const uid = (await supabase.auth.getUser()).data.user?.id;
    await supabase
      .from('users')
      .update({
        nombre: form.nombre.trim() || null,
        titulo: form.titulo.trim() || null,
        objetivo: form.objetivo.trim() || null,
        bio: form.bio.trim() || null,
      })
      .eq('id', uid);
    setBusy(false);
    setSaved(true);
    router.refresh();
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-slate-400">
        Esto define quién eres y tu objetivo. La IA lo usa para aterrizar tu <b>Daily</b> y el <b>coach de alineación</b> a ti.
      </p>

      <div className="card space-y-3 p-4">
        <Field label="Nombre" value={form.nombre} onChange={(v) => set('nombre', v)} />
        <Field label="Título / rol" value={form.titulo} onChange={(v) => set('titulo', v)} placeholder="COO de T1" />
        <div>
          <label className="text-[10px] uppercase tracking-wide text-slate-500">Tu objetivo en la empresa</label>
          <textarea
            value={form.objetivo}
            onChange={(e) => set('objetivo', e.target.value)}
            rows={3}
            placeholder="Ej. Escalar T1 Envíos, dejar los productos core en autopiloto, ganarle a Tiendanube en México…"
            className="mt-1 w-full rounded-lg bg-ink-900 px-3 py-2 text-sm outline-none ring-1 ring-ink-700 focus:ring-brand"
          />
        </div>
        <div>
          <label className="text-[10px] uppercase tracking-wide text-slate-500">Quién eres / contexto</label>
          <textarea
            value={form.bio}
            onChange={(e) => set('bio', e.target.value)}
            rows={3}
            placeholder="Cómo trabajas, qué te importa, cómo tomas decisiones…"
            className="mt-1 w-full rounded-lg bg-ink-900 px-3 py-2 text-sm outline-none ring-1 ring-ink-700 focus:ring-brand"
          />
        </div>
        <button onClick={save} disabled={busy} className="btn-primary w-full">
          {busy ? 'Guardando…' : saved ? 'Guardado ✓' : 'Guardar perfil'}
        </button>
      </div>
    </div>
  );
}

function Field({ label, value, onChange, placeholder }: { label: string; value: string; onChange: (v: string) => void; placeholder?: string }) {
  return (
    <div>
      <label className="text-[10px] uppercase tracking-wide text-slate-500">{label}</label>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="mt-1 w-full rounded-lg bg-ink-900 px-3 py-2 text-sm outline-none ring-1 ring-ink-700 focus:ring-brand"
      />
    </div>
  );
}
