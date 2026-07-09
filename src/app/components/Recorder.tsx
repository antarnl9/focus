'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import type { SupabaseClient } from '@supabase/supabase-js';
import { createSupabaseBrowser } from '@/lib/supabase/client';
import type { DayBlock, Grabacion, Persona } from '@/lib/types';
import { minutesOfDay, hmToMinutes, prettyTime } from '@/lib/time';
import { PersonaSelector } from './PersonaSelector';

type Row = Grabacion & { personasIds: string[]; personasNombres: string[] };

function pickMime(): string {
  const cands = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/aac'];
  for (const c of cands) {
    if (typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported(c)) return c;
  }
  return '';
}

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

export function Recorder({ initial, blocks, now }: { initial: Grabacion[]; blocks: DayBlock[]; now: Date }) {
  const supabase = useRef(createSupabaseBrowser()).current;
  const [items, setItems] = useState<Row[]>(initial.map((g) => ({ ...g, personasIds: [], personasNombres: [] })));
  const [personas, setPersonas] = useState<Persona[]>([]);
  const [recording, setRecording] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [canRecord, setCanRecord] = useState(true);
  const [busy, setBusy] = useState(false);

  const [juntaSel, setJuntaSel] = useState<string>(CUSTOM);
  const [customLabel, setCustomLabel] = useState('');
  const [selPersonas, setSelPersonas] = useState<string[]>([]);

  const mediaRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const startRef = useRef<number>(0);
  const rowIdRef = useRef<string | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    setCanRecord(typeof MediaRecorder !== 'undefined' && !!navigator.mediaDevices);
    fetchPersonas();
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (recording || juntaSel !== CUSTOM || customLabel) return;
    const mins = minutesOfDay(now);
    const active = blocks.find((b) => mins >= hmToMinutes(b.hora_ini) && mins < hmToMinutes(b.hora_fin));
    if (active) setJuntaSel(active.id);
  }, [now, blocks, recording, juntaSel, customLabel]);

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

  function currentLabelAndRef(): { label: string; block_ref: string | null } {
    if (juntaSel === CUSTOM) return { label: customLabel.trim() || 'Junta sin nombre', block_ref: null };
    const b = blocks.find((x) => x.id === juntaSel);
    return { label: b?.label ?? 'Junta', block_ref: b?.id ?? null };
  }

  async function linkPersonas(grabacionId: string, uid: string, ids: string[]) {
    if (!ids.length) return;
    await supabase.from('grabacion_personas').insert(ids.map((pid) => ({ grabacion_id: grabacionId, persona_id: pid, user_id: uid })));
  }

  async function start() {
    if (recording) return;
    setBusy(true);
    try {
      const uid = (await supabase.auth.getUser()).data.user?.id;
      if (!uid) throw new Error('no auth');
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mime = pickMime();
      const mr = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
      chunksRef.current = [];
      mr.ondataavailable = (e) => e.data.size && chunksRef.current.push(e.data);
      mr.onstop = () => finalize(uid, mime);

      const { label, block_ref } = currentLabelAndRef();
      const { data } = await supabase
        .from('grabaciones')
        .insert({ user_id: uid, label, block_ref, estado: 'grabando' })
        .select()
        .single();
      const id = (data as Grabacion)?.id ?? null;
      rowIdRef.current = id;
      if (id) await linkPersonas(id, uid, selPersonas);

      mediaRef.current = mr;
      startRef.current = Date.now();
      mr.start();
      setRecording(true);
      setElapsed(0);
      timerRef.current = setInterval(() => setElapsed(Math.floor((Date.now() - startRef.current) / 1000)), 1000);
    } catch {
      alert('No se pudo acceder al micrófono. Otorga permiso o usa "Subir audio".');
    } finally {
      setBusy(false);
    }
  }

  function stop() {
    if (!recording) return;
    mediaRef.current?.stop();
    mediaRef.current?.stream.getTracks().forEach((t) => t.stop());
    if (timerRef.current) clearInterval(timerRef.current);
    setRecording(false);
  }

  async function finalize(uid: string, mime: string) {
    const id = rowIdRef.current;
    if (!id) return;
    const blob = new Blob(chunksRef.current, { type: mime || 'audio/webm' });
    const dur = Math.floor((Date.now() - startRef.current) / 1000);
    const ext = mime.includes('mp4') || mime.includes('aac') ? 'm4a' : 'webm';
    const path = `${uid}/${id}.${ext}`;
    setBusy(true);
    const { error } = await supabase.storage.from('grabaciones').upload(path, blob, { contentType: blob.type, upsert: true });
    if (error) {
      alert('Falló la subida del audio.');
      setBusy(false);
      return;
    }
    await fetch('/api/recordings/finalize', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, audio_path: path, duracion_seg: dur, mimetype: blob.type }),
    });
    setCustomLabel('');
    setSelPersonas([]);
    setBusy(false);
    refresh();
  }

  async function uploadFile(file: File) {
    setBusy(true);
    const uid = (await supabase.auth.getUser()).data.user?.id;
    if (!uid) return;
    const { label, block_ref } = currentLabelAndRef();
    const { data } = await supabase
      .from('grabaciones')
      .insert({
        user_id: uid,
        label: label !== 'Junta sin nombre' ? label : file.name.replace(/\.[^.]+$/, ''),
        block_ref,
        estado: 'grabando',
      })
      .select()
      .single();
    const id = (data as Grabacion)?.id;
    if (!id) return;
    await linkPersonas(id, uid, selPersonas);
    const ext = file.name.split('.').pop() || 'm4a';
    const path = `${uid}/${id}.${ext}`;
    const { error } = await supabase.storage.from('grabaciones').upload(path, file, { contentType: file.type, upsert: true });
    if (error) {
      alert('Falló la subida.');
      setBusy(false);
      return;
    }
    await fetch('/api/recordings/finalize', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, audio_path: path, duracion_seg: 0, mimetype: file.type }),
    });
    setCustomLabel('');
    setSelPersonas([]);
    setBusy(false);
    refresh();
  }

  return (
    <section className="space-y-5">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-bold uppercase tracking-wide text-slate-400">Grabación de juntas</h2>
        <Link href="/personas" className="chip bg-ink-700 text-slate-300 active:scale-95">
          👤 Personas
        </Link>
      </div>

      <div className="card space-y-3 p-4">
        <div>
          <label className="mb-1 block text-[10px] uppercase tracking-wide text-slate-500">Junta</label>
          <select
            value={juntaSel}
            onChange={(e) => setJuntaSel(e.target.value)}
            disabled={recording}
            className="w-full rounded-lg bg-ink-900 px-3 py-2 text-sm outline-none ring-1 ring-ink-700 focus:ring-brand disabled:opacity-60"
          >
            {blocks.map((b) => (
              <option key={b.id} value={b.id}>
                {prettyTime(b.hora_ini)} · {b.label}
              </option>
            ))}
            <option value={CUSTOM}>✏️ Otra junta…</option>
          </select>
        </div>

        {juntaSel === CUSTOM && (
          <input
            value={customLabel}
            onChange={(e) => setCustomLabel(e.target.value)}
            disabled={recording}
            placeholder="Nombre de la junta"
            className="w-full rounded-lg bg-ink-900 px-3 py-2 text-sm outline-none ring-1 ring-ink-700 focus:ring-brand disabled:opacity-60"
          />
        )}

        <div>
          <label className="mb-1 block text-[10px] uppercase tracking-wide text-slate-500">¿Con quién? (personas)</label>
          <PersonaSelector
            personas={personas}
            selectedIds={selPersonas}
            onChange={setSelPersonas}
            onPersonasChange={setPersonas}
            supabase={supabase}
            disabled={recording}
          />
        </div>

        <div className="flex items-center gap-3">
          {!recording ? (
            <button onClick={start} disabled={busy || !canRecord} className="btn-primary flex-1">
              ⏺ Grabar
            </button>
          ) : (
            <button onClick={stop} className="btn flex-1 animate-pulseRing bg-urgent text-white">
              ⏹ Detener · {fmtDur(elapsed)}
            </button>
          )}
          <label className="btn-ghost cursor-pointer" title="Subir audio del teléfono">
            📁
            <input type="file" accept="audio/*" className="hidden" onChange={(e) => e.target.files?.[0] && uploadFile(e.target.files[0])} />
          </label>
        </div>

        {!canRecord && (
          <p className="text-xs text-warn">Tu navegador no permite grabar aquí. Usa 📁 para subir un audio del teléfono.</p>
        )}
        <p className="text-center text-[11px] text-slate-600">Aviso: al iniciar, informa que la junta se graba.</p>
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

          {g.estado === 'lista' && !g.resumen && (
            <p className="mt-3 text-[11px] text-slate-600">
              Audio guardado. La transcripción y el resumen automáticos requieren Deepgram + el worker.
            </p>
          )}
        </div>
      )}
    </div>
  );
}

function fmtDur(s: number): string {
  const m = Math.floor(s / 60);
  const ss = s % 60;
  return `${m}:${String(ss).padStart(2, '0')}`;
}
