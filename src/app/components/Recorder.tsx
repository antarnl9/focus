'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import type { SupabaseClient } from '@supabase/supabase-js';
import { createSupabaseBrowser } from '@/lib/supabase/client';
import type { DayBlock, Grabacion, Persona, CalendarEvent, EventAttendee } from '@/lib/types';
import { minutesOfDay, hmToMinutes, prettyTime } from '@/lib/time';
import { PersonaSelector } from './PersonaSelector';
import { useRecording } from './RecordingProvider';
import { ensurePersonasFromAttendees } from './persona-util';

type Row = Grabacion & { personasIds: string[]; personasNombres: string[] };

const CUSTOM = '__custom__';

function mapRows(data: unknown[]): Row[] {
  return (data ?? []).map((g) => {
    const row = g as Grabacion & { grabacion_personas?: { persona_id: string; personas?: { nombre: string } }[] };
    const links = row.grabacion_personas ?? [];
    return {
      ...row,
      personasIds: links.map((x) => x.persona_id),
      personasNombres: links.map((x) => x.personas?.nombre).filter(Boolean) as string[],
    };
  });
}

interface JuntaOpt {
  key: string;
  label: string;
  time: string;
  attendees: EventAttendee[];
  blockRef: string | null;
  isNow: boolean;
  start: number;
  isEvent: boolean;
}

export function Recorder({
  initial,
  blocks,
  now,
  events,
}: {
  initial: Grabacion[];
  blocks: DayBlock[];
  now: Date;
  events: CalendarEvent[];
}) {
  const supabase = useRef(createSupabaseBrowser()).current;
  const rec = useRecording();
  const [items, setItems] = useState<Row[]>(initial.map((g) => ({ ...g, personasIds: [], personasNombres: [] })));
  const [personas, setPersonas] = useState<Persona[]>([]);
  const [selKey, setSelKey] = useState<string>('');
  const [customLabel, setCustomLabel] = useState('');
  const [selPersonas, setSelPersonas] = useState<string[]>([]);
  const [switching, setSwitching] = useState(false);
  const [uploading, setUploading] = useState(false);
  const userSetRef = useRef(false);
  const wasRecording = useRef(false);

  const mins = minutesOfDay(now);

  // Juntas de hoy: eventos reales de Google (con invitados) + bloques de la plantilla.
  const options = useMemo<JuntaOpt[]>(() => {
    const evs: JuntaOpt[] = events.map((e) => {
      const s = minutesOfDay(new Date(e.start));
      const en = minutesOfDay(new Date(e.end));
      return {
        key: `ev:${e.id}`,
        label: e.summary,
        time: `${fmtMin(s)}–${fmtMin(en)}`,
        attendees: e.attendees ?? [],
        blockRef: null,
        isNow: mins >= s && mins < en,
        start: s,
        isEvent: true,
      };
    });
    const bls: JuntaOpt[] = blocks.map((b) => {
      const s = hmToMinutes(b.hora_ini);
      const en = hmToMinutes(b.hora_fin);
      return {
        key: `bl:${b.id}`,
        label: b.label,
        time: `${prettyTime(b.hora_ini)}–${prettyTime(b.hora_fin)}`,
        attendees: [],
        blockRef: b.id,
        isNow: mins >= s && mins < en,
        start: s,
        isEvent: false,
      };
    });
    return [...evs, ...bls].sort((a, b) => a.start - b.start);
  }, [events, blocks, mins]);

  const selected = options.find((o) => o.key === selKey) ?? null;
  const isCustom = selKey === CUSTOM;
  const nowCount = options.filter((o) => o.isNow).length;

  useEffect(() => {
    fetchPersonas();
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Default: la junta que está pasando AHORA (evento primero), con sus invitados.
  useEffect(() => {
    if (rec.recording || userSetRef.current || !options.length) return;
    const pick =
      options.find((o) => o.isNow && o.isEvent) ??
      options.find((o) => o.isNow) ??
      options.find((o) => o.isEvent) ??
      options[0];
    if (pick && pick.key !== selKey) applySelect(pick.key);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [options, rec.recording]);

  // Refresca la lista cuando termina una grabación (o hay algo en proceso).
  useEffect(() => {
    const was = wasRecording.current;
    wasRecording.current = rec.recording;
    if (was && !rec.recording) {
      const t = setTimeout(refresh, 1500);
      return () => clearTimeout(t);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rec.recording]);

  useEffect(() => {
    const anyProcessing = items.some((g) => ['subida', 'transcribiendo', 'procesando'].includes(g.estado));
    if (!anyProcessing) return;
    const t = setInterval(refresh, 12_000);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items]);

  async function fetchPersonas() {
    const { data } = await supabase.from('personas').select('*').order('rango').order('nombre');
    if (data) setPersonas(data as Persona[]);
  }

  async function refresh() {
    const { data } = await supabase
      .from('grabaciones')
      .select('*, grabacion_personas(persona_id, personas(nombre))')
      .order('created_at', { ascending: false })
      .limit(30);
    if (data) setItems(mapRows(data));
  }

  // Selecciona una junta y, si es un evento con invitados, los deja listos como personas.
  async function applySelect(key: string) {
    setSelKey(key);
    setSwitching(false);
    const opt = options.find((o) => o.key === key);
    if (opt && opt.attendees.length) {
      const uid = (await supabase.auth.getUser()).data.user?.id;
      if (uid) {
        const ids = await ensurePersonasFromAttendees(supabase, uid, opt.attendees);
        setSelPersonas(ids);
        fetchPersonas();
      }
    } else {
      setSelPersonas([]);
    }
  }

  function chooseJunta(key: string) {
    userSetRef.current = true;
    if (key === CUSTOM) {
      setSelKey(CUSTOM);
      setSwitching(false);
      setSelPersonas([]);
    } else {
      applySelect(key);
    }
  }

  function currentSel(): { label: string; blockRef: string | null; attendees: EventAttendee[] } {
    if (isCustom) return { label: customLabel.trim() || 'Junta sin nombre', blockRef: null, attendees: [] };
    if (selected) return { label: selected.label, blockRef: selected.blockRef, attendees: selected.attendees };
    return { label: 'Junta', blockRef: null, attendees: [] };
  }

  function grabar() {
    const { label, blockRef, attendees } = currentSel();
    rec.start({ label, blockRef, attendees, personaIds: selPersonas });
  }

  async function uploadFile(file: File) {
    setUploading(true);
    try {
      const uid = (await supabase.auth.getUser()).data.user?.id;
      if (!uid) return;
      const { label, blockRef, attendees } = currentSel();
      const { data } = await supabase
        .from('grabaciones')
        .insert({
          user_id: uid,
          label: label !== 'Junta sin nombre' ? label : file.name.replace(/\.[^.]+$/, ''),
          block_ref: blockRef,
          estado: 'grabando',
        })
        .select()
        .single();
      const id = (data as Grabacion)?.id;
      if (!id) return;
      const attIds = await ensurePersonasFromAttendees(supabase, uid, attendees);
      const ids = [...new Set([...selPersonas, ...attIds])];
      if (ids.length) await supabase.from('grabacion_personas').insert(ids.map((pid) => ({ grabacion_id: id, persona_id: pid, user_id: uid })));
      const ext = file.name.split('.').pop() || 'm4a';
      const path = `${uid}/${id}.${ext}`;
      const { error } = await supabase.storage.from('grabaciones').upload(path, file, { contentType: file.type, upsert: true });
      if (error) {
        alert('Falló la subida.');
        return;
      }
      await fetch('/api/recordings/finalize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, audio_path: path, duracion_seg: 0, mimetype: file.type }),
      });
      setCustomLabel('');
      refresh();
    } finally {
      setUploading(false);
    }
  }

  const invitadosNombres = personas.filter((p) => selPersonas.includes(p.id)).map((p) => p.nombre);

  return (
    <section className="space-y-5">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-bold uppercase tracking-wide text-slate-400">Grabación de juntas</h2>
        <Link href="/personas" className="chip bg-ink-700 text-slate-300 active:scale-95">
          👤 Personas
        </Link>
      </div>

      <div className="card space-y-3 p-4">
        {/* ¿Qué grabas? */}
        <div>
          <label className="mb-1 block text-[10px] uppercase tracking-wide text-slate-500">¿Qué estás grabando?</label>
          {!switching ? (
            <button
              onClick={() => setSwitching(true)}
              disabled={rec.recording}
              className="flex w-full items-center gap-2 rounded-lg bg-ink-900 px-3 py-2.5 text-left ring-1 ring-ink-700 active:scale-[0.99] disabled:opacity-60"
            >
              <span className="text-lg">{isCustom || !selected?.isEvent ? '🗓️' : '📅'}</span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold text-slate-100">
                  {isCustom ? customLabel.trim() || 'Otra junta…' : selected?.label ?? 'Elige una junta'}
                </p>
                {selected && <p className="text-[11px] text-slate-500">{selected.time}</p>}
              </div>
              {selected?.isNow && <span className="chip bg-brand text-white">ahora</span>}
              <span className="text-xs text-slate-500">Cambiar ›</span>
            </button>
          ) : (
            <div className="space-y-1 rounded-lg bg-ink-900 p-1 ring-1 ring-ink-700">
              {options.length === 0 && <p className="p-3 text-center text-xs text-slate-500">Sin juntas hoy. Usa “Otra junta…”.</p>}
              {options.map((o) => (
                <button
                  key={o.key}
                  onClick={() => chooseJunta(o.key)}
                  className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left active:bg-ink-800"
                >
                  <span>{o.isEvent ? '📅' : '🗓️'}</span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm text-slate-100">{o.label}</p>
                    <p className="text-[11px] text-slate-500">
                      {o.time}
                      {o.attendees.length ? ` · ${o.attendees.length} invitado${o.attendees.length > 1 ? 's' : ''}` : ''}
                    </p>
                  </div>
                  {o.isNow && <span className="chip bg-brand text-white">ahora</span>}
                </button>
              ))}
              <button onClick={() => chooseJunta(CUSTOM)} className="w-full rounded-lg px-3 py-2 text-left text-sm text-slate-300 active:bg-ink-800">
                ✏️ Otra junta…
              </button>
            </div>
          )}
          {!switching && nowCount > 1 && (
            <p className="mt-1.5 text-[11px] text-warn">
              ⚠️ Tienes {nowCount} juntas empalmadas ahora. Toca arriba para elegir en cuál estás.
            </p>
          )}
        </div>

        {isCustom && (
          <input
            value={customLabel}
            onChange={(e) => setCustomLabel(e.target.value)}
            disabled={rec.recording}
            placeholder="Nombre de la junta"
            className="w-full rounded-lg bg-ink-900 px-3 py-2 text-sm outline-none ring-1 ring-ink-700 focus:ring-brand disabled:opacity-60"
          />
        )}

        {/* Personas */}
        <div>
          <label className="mb-1 block text-[10px] uppercase tracking-wide text-slate-500">¿Con quién?</label>
          {selected?.isEvent && selected.attendees.length > 0 && (
            <p className="mb-1 text-[11px] text-slate-500">
              Invitados del evento, ya seleccionados{invitadosNombres.length ? `: ${invitadosNombres.join(', ')}` : ''}. Ajusta si quieres.
            </p>
          )}
          <PersonaSelector
            personas={personas}
            selectedIds={selPersonas}
            onChange={setSelPersonas}
            onPersonasChange={setPersonas}
            supabase={supabase}
            disabled={rec.recording}
          />
        </div>

        {/* Grabar / detener */}
        <div className="flex items-center gap-3">
          {!rec.recording ? (
            <button onClick={grabar} disabled={rec.busy || uploading || !rec.canRecord} className="btn-primary flex-1">
              ⏺ Grabar
            </button>
          ) : (
            <button onClick={rec.stop} className="btn flex-1 animate-pulseRing bg-urgent text-white">
              ⏹ Detener · {fmtDur(rec.elapsed)}
            </button>
          )}
          <label className="btn-ghost cursor-pointer" title="Subir audio del teléfono">
            {uploading ? '⏳' : '📁'}
            <input
              type="file"
              accept="audio/*"
              className="hidden"
              disabled={rec.recording || uploading}
              onChange={(e) => e.target.files?.[0] && uploadFile(e.target.files[0])}
            />
          </label>
        </div>

        {!rec.canRecord && (
          <p className="text-xs text-warn">Tu navegador no permite grabar aquí. Usa 📁 para subir un audio del teléfono.</p>
        )}
        <p className="text-center text-[11px] text-slate-600">Al iniciar, avisa que la junta se graba. La pantalla se mantiene encendida.</p>
      </div>

      <div className="space-y-2">
        {items.map((g) => (
          <GrabacionCard key={g.id} g={g} supabase={supabase} blocks={blocks} personas={personas} onPersonasChange={setPersonas} onChanged={refresh} />
        ))}
        {items.length === 0 && <p className="card p-4 text-center text-sm text-slate-500">Sin grabaciones aún.</p>}
      </div>
    </section>
  );
}

function GrabacionCard({
  g,
  supabase,
  blocks,
  personas,
  onPersonasChange,
  onChanged,
}: {
  g: Row;
  supabase: SupabaseClient;
  blocks: DayBlock[];
  personas: Persona[];
  onPersonasChange: (p: Persona[]) => void;
  onChanged: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [label, setLabel] = useState(g.label);
  const [blockRef, setBlockRef] = useState<string>(g.block_ref ?? CUSTOM);
  const [sel, setSel] = useState<string[]>(g.personasIds);
  const [busy, setBusy] = useState(false);
  const [transcribing, setTranscribing] = useState(false);

  async function transcribir() {
    setTranscribing(true);
    const res = await fetch('/api/recordings/transcribe', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: g.id }),
    });
    if (!res.ok) {
      const j = await res.json().catch(() => ({}));
      alert(j.error || 'No se pudo transcribir.');
      setTranscribing(false);
      return;
    }
    setTimeout(() => {
      setTranscribing(false);
      onChanged();
    }, 2500);
  }

  const estadoMeta: Record<Grabacion['estado'], { label: string; tone: string }> = {
    grabando: { label: 'Grabando…', tone: 'bg-urgent/20 text-urgent' },
    subida: { label: 'En cola', tone: 'bg-ink-700 text-slate-400' },
    transcribiendo: { label: 'Transcribiendo…', tone: 'bg-accent/20 text-accent' },
    procesando: { label: 'Resumiendo…', tone: 'bg-brand/20 text-brand-soft' },
    lista: { label: 'Guardada', tone: 'bg-ok/20 text-ok' },
    error: { label: 'Error', tone: 'bg-urgent/20 text-urgent' },
  };
  const m = estadoMeta[g.estado];
  const conQuien = g.personasNombres.length ? `con ${g.personasNombres.join(', ')}` : g.persona ? `con ${g.persona}` : '';

  async function loadAudio() {
    if (audioUrl || !g.audio_path) return;
    const { data } = await supabase.storage.from('grabaciones').createSignedUrl(g.audio_path, 3600);
    if (data?.signedUrl) setAudioUrl(data.signedUrl);
  }

  function toggle() {
    const next = !open;
    setOpen(next);
    if (next) loadAudio();
  }

  async function saveEdit() {
    setBusy(true);
    const isCustom = blockRef === CUSTOM;
    const b = blocks.find((x) => x.id === blockRef);
    const newLabel = isCustom ? label.trim() || 'Junta sin nombre' : b?.label ?? label;
    await supabase.from('grabaciones').update({ label: newLabel, block_ref: isCustom ? null : blockRef }).eq('id', g.id);
    // Reemplaza las personas ligadas.
    const uid = (await supabase.auth.getUser()).data.user?.id;
    await supabase.from('grabacion_personas').delete().eq('grabacion_id', g.id);
    if (sel.length) await supabase.from('grabacion_personas').insert(sel.map((pid) => ({ grabacion_id: g.id, persona_id: pid, user_id: uid })));
    setBusy(false);
    setEditing(false);
    onChanged();
  }

  async function remove() {
    if (!confirm('¿Eliminar esta grabación y su audio?')) return;
    setBusy(true);
    if (g.audio_path) await supabase.storage.from('grabaciones').remove([g.audio_path]);
    await supabase.from('grabaciones').delete().eq('id', g.id);
    setBusy(false);
    onChanged();
  }

  return (
    <div className="card overflow-hidden">
      <button onClick={toggle} className="flex w-full items-center gap-3 p-3 text-left">
        <span className="text-lg">🎙️</span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold">{g.label}</p>
          <p className="truncate text-xs text-slate-500">
            {conQuien ? conQuien + ' · ' : ''}
            {g.duracion_seg ? fmtDur(g.duracion_seg) : ''}
          </p>
        </div>
        <span className={`chip ${m.tone}`}>{m.label}</span>
      </button>

      {open && (
        <div className="border-t border-ink-700 px-3 pb-3 pt-2">
          {audioUrl ? (
            // eslint-disable-next-line jsx-a11y/media-has-caption
            <audio controls src={audioUrl} className="w-full" />
          ) : g.audio_path ? (
            <p className="text-xs text-slate-500">Cargando audio…</p>
          ) : null}

          {!editing ? (
            <div className="mt-2 flex items-center gap-2">
              <button onClick={() => setEditing(true)} className="chip bg-ink-700 text-slate-300">
                ✏️ Reasignar junta/personas
              </button>
              <button onClick={remove} disabled={busy} className="chip bg-urgent/20 text-urgent">
                🗑️ Eliminar
              </button>
            </div>
          ) : (
            <div className="mt-2 space-y-2">
              <select
                value={blockRef}
                onChange={(e) => setBlockRef(e.target.value)}
                className="w-full rounded-lg bg-ink-900 px-3 py-2 text-sm outline-none ring-1 ring-ink-700 focus:ring-brand"
              >
                {blocks.map((b) => (
                  <option key={b.id} value={b.id}>
                    {prettyTime(b.hora_ini)} · {b.label}
                  </option>
                ))}
                <option value={CUSTOM}>✏️ Otra junta…</option>
              </select>
              {blockRef === CUSTOM && (
                <input
                  value={label}
                  onChange={(e) => setLabel(e.target.value)}
                  placeholder="Nombre de la junta"
                  className="w-full rounded-lg bg-ink-900 px-3 py-2 text-sm outline-none ring-1 ring-ink-700 focus:ring-brand"
                />
              )}
              <PersonaSelector
                personas={personas}
                selectedIds={sel}
                onChange={setSel}
                onPersonasChange={onPersonasChange}
                supabase={supabase}
              />
              <div className="flex gap-2">
                <button onClick={saveEdit} disabled={busy} className="btn-primary flex-1 py-2 text-sm">
                  Guardar
                </button>
                <button onClick={() => setEditing(false)} className="btn-ghost py-2 text-sm">
                  Cancelar
                </button>
              </div>
            </div>
          )}

          {g.resumen && (
            <div className="mt-3">
              <p className="text-[10px] uppercase tracking-wide text-slate-500">Resumen</p>
              <p className="mt-1 whitespace-pre-wrap text-sm text-slate-200">{g.resumen}</p>
            </div>
          )}
          {g.acuerdos?.length > 0 && (
            <div className="mt-3">
              <p className="text-[10px] uppercase tracking-wide text-slate-500">Acuerdos</p>
              <ul className="mt-1 space-y-1">
                {g.acuerdos.map((a, i) => (
                  <li key={i} className="text-sm text-slate-300">
                    🤝 {a.acuerdo}
                    {a.responsable ? ` — ${a.responsable}` : ''}
                    {a.fecha ? ` (${a.fecha})` : ''}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {(g.estado === 'lista' || g.estado === 'error') && !g.resumen && g.audio_path && (
            <button
              onClick={transcribir}
              disabled={transcribing}
              className="mt-3 w-full rounded-xl border border-ink-700 bg-ink-800/60 py-2 text-sm font-medium text-slate-200 active:scale-[0.98] disabled:opacity-60"
            >
              {transcribing ? 'Transcribiendo…' : '🎙️ Transcribir y resumir'}
            </button>
          )}
        </div>
      )}
    </div>
  );
}

function fmtMin(min: number): string {
  const h = Math.floor(min / 60);
  const m = min % 60;
  return prettyTime(`${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`);
}

function fmtDur(s: number): string {
  const m = Math.floor(s / 60);
  const ss = s % 60;
  return `${m}:${String(ss).padStart(2, '0')}`;
}
