'use client';

import { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createSupabaseBrowser } from '@/lib/supabase/client';
import type { Persona, PersonaTipo, Grabacion, Duda } from '@/lib/types';
import { TIPO_META, DOMAIN, normalizeCorreo } from './persona-util';

export function PersonaProfile({
  persona,
  grabaciones,
  dudas,
}: {
  persona: Persona;
  grabaciones: Grabacion[];
  dudas: Duda[];
}) {
  const supabase = useRef(createSupabaseBrowser()).current;
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState({
    nombre: persona.nombre,
    puesto: persona.puesto ?? '',
    correo: persona.correo ?? '',
    slack_user_id: persona.slack_user_id ?? '',
    descripcion: persona.descripcion ?? '',
    tipo: persona.tipo,
  });
  const [busy, setBusy] = useState(false);

  function set<K extends keyof typeof form>(k: K, v: (typeof form)[K]) {
    setForm((f) => ({ ...f, [k]: v }));
  }

  async function save() {
    setBusy(true);
    await supabase
      .from('personas')
      .update({
        nombre: form.nombre.trim(),
        puesto: form.puesto.trim() || null,
        correo: normalizeCorreo(form.correo, form.tipo),
        slack_user_id: form.slack_user_id.trim() || null,
        descripcion: form.descripcion.trim() || null,
        tipo: form.tipo,
      })
      .eq('id', persona.id);
    setBusy(false);
    setEditing(false);
    router.refresh();
  }

  async function remove() {
    if (!confirm('¿Eliminar esta persona? (sus grabaciones no se borran, solo se desvinculan)')) return;
    await supabase.from('personas').delete().eq('id', persona.id);
    router.push('/personas');
  }

  return (
    <div className="space-y-6">
      {/* Ficha */}
      <section className="card p-4">
        {!editing ? (
          <>
            <div className="flex items-start gap-3">
              <span className="grid h-12 w-12 shrink-0 place-items-center rounded-full bg-brand-deep/30 text-lg font-bold text-brand-soft">
                {persona.nombre.slice(0, 2).toUpperCase()}
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <p className="truncate text-lg font-bold">{persona.nombre}</p>
                  <span className={`chip ${TIPO_META[persona.tipo]?.tone ?? 'bg-ink-700 text-slate-400'}`}>
                    {TIPO_META[persona.tipo]?.icon} {TIPO_META[persona.tipo]?.label ?? persona.tipo}
                  </span>
                </div>
                {persona.puesto && <p className="text-sm text-slate-400">{persona.puesto}</p>}
              </div>
              <button onClick={() => setEditing(true)} className="chip bg-ink-700 text-slate-300">
                ✏️ Editar
              </button>
            </div>
            <div className="mt-3 space-y-1 text-sm">
              {persona.correo && <Info label="Correo" value={persona.correo} />}
              {persona.slack_user_id && <Info label="Slack" value={persona.slack_user_id} />}
              {persona.descripcion && (
                <div className="mt-2">
                  <p className="text-[10px] uppercase tracking-wide text-slate-500">Perfil</p>
                  <p className="mt-0.5 whitespace-pre-wrap text-slate-300">{persona.descripcion}</p>
                </div>
              )}
            </div>
          </>
        ) : (
          <div className="space-y-2">
            <div>
              <label className="text-[10px] uppercase tracking-wide text-slate-500">Tipo</label>
              <div className="mt-1 flex flex-wrap gap-1.5">
                {(Object.keys(TIPO_META) as PersonaTipo[]).map((t) => (
                  <button key={t} onClick={() => set('tipo', t)} className={`chip ${form.tipo === t ? TIPO_META[t].tone : 'bg-ink-800 text-slate-500'}`}>
                    {TIPO_META[t].icon} {TIPO_META[t].label}
                  </button>
                ))}
              </div>
            </div>
            <Field label="Nombre" value={form.nombre} onChange={(v) => set('nombre', v)} />
            <Field label="Puesto" value={form.puesto} onChange={(v) => set('puesto', v)} />
            <Field
              label="Correo"
              value={form.correo}
              onChange={(v) => set('correo', v)}
              placeholder={form.tipo === 'interno' ? `usuario (se completa @${DOMAIN})` : 'correo@dominio.com'}
            />
            <Field label="Slack user ID" value={form.slack_user_id} onChange={(v) => set('slack_user_id', v)} placeholder="U0XXXXXXX" />
            <div>
              <label className="text-[10px] uppercase tracking-wide text-slate-500">Descripción / perfil</label>
              <textarea
                value={form.descripcion}
                onChange={(e) => set('descripcion', e.target.value)}
                rows={4}
                placeholder="Rol, contexto, cómo trabaja, temas que maneja…"
                className="mt-1 w-full rounded-lg bg-ink-900 px-3 py-2 text-sm outline-none ring-1 ring-ink-700 focus:ring-brand"
              />
            </div>
            <div className="flex gap-2 pt-1">
              <button onClick={save} disabled={busy || !form.nombre.trim()} className="btn-primary flex-1 text-sm">
                Guardar
              </button>
              <button onClick={() => setEditing(false)} className="btn-ghost text-sm">
                Cancelar
              </button>
            </div>
            <button onClick={remove} className="w-full pt-2 text-center text-xs text-urgent">
              Eliminar persona
            </button>
          </div>
        )}
      </section>

      {/* Juntas con esta persona */}
      <section>
        <h2 className="mb-2 text-sm font-bold uppercase tracking-wide text-slate-400">Juntas ({grabaciones.length})</h2>
        <div className="space-y-2">
          {grabaciones.map((g) => (
            <div key={g.id} className="card flex items-center gap-3 p-3">
              <span className="text-lg">🎙️</span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold">{g.label}</p>
                <p className="text-xs text-slate-500">{g.fecha}</p>
              </div>
              {g.resumen && <span className="chip bg-ok/20 text-ok">resumen</span>}
            </div>
          ))}
          {grabaciones.length === 0 && <p className="card p-4 text-center text-sm text-slate-500">Sin juntas registradas con esta persona.</p>}
        </div>
      </section>

      {/* Dudas que ha mandado */}
      <section>
        <h2 className="mb-2 text-sm font-bold uppercase tracking-wide text-slate-400">Dudas enviadas ({dudas.length})</h2>
        <div className="space-y-2">
          {dudas.map((d) => (
            <div key={d.id} className="card p-3">
              <div className="flex items-center gap-2">
                <span className="text-sm">{d.urgente ? '🚨' : '❓'}</span>
                <p className="min-w-0 flex-1 truncate text-sm font-semibold">{d.decision || '(sin decisión)'}</p>
                <span className={`chip ${estadoTone(d.estado)}`}>{d.estado}</span>
              </div>
              {d.resolucion && <p className="mt-1 text-xs text-slate-400">→ {d.resolucion}</p>}
            </div>
          ))}
          {dudas.length === 0 && (
            <p className="card p-4 text-center text-sm text-slate-500">
              Sin dudas cruzadas. Tip: agrega su <b>Slack user ID</b> para ligar sus dudas automáticamente.
            </p>
          )}
        </div>
      </section>
    </div>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex gap-2">
      <span className="w-16 shrink-0 text-[10px] uppercase tracking-wide text-slate-500">{label}</span>
      <span className="min-w-0 flex-1 break-words text-slate-300">{value}</span>
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

function estadoTone(e: string): string {
  switch (e) {
    case 'resuelta':
      return 'bg-ok/20 text-ok';
    case 'redirigida':
      return 'bg-brand/20 text-brand-soft';
    case 'pendiente':
      return 'bg-warn/20 text-warn';
    default:
      return 'bg-ink-700 text-slate-400';
  }
}
