'use client';

import { useEffect, useRef, useState } from 'react';
import { createSupabaseBrowser } from '@/lib/supabase/client';
import type { DayBlock, Grabacion } from '@/lib/types';
import { minutesOfDay, hmToMinutes } from '@/lib/time';

function pickMime(): string {
  const cands = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/aac'];
  for (const c of cands) {
    if (typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported(c)) return c;
  }
  return '';
}

export function Recorder({ initial, blocks, now }: { initial: Grabacion[]; blocks: DayBlock[]; now: Date }) {
  const supabase = useRef(createSupabaseBrowser()).current;
  const [items, setItems] = useState<Grabacion[]>(initial);
  const [recording, setRecording] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [label, setLabel] = useState('');
  const [canRecord, setCanRecord] = useState(true);
  const [busy, setBusy] = useState(false);

  const mediaRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const startRef = useRef<number>(0);
  const rowIdRef = useRef<string | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Sugerir nombre desde el bloque activo (hereda el nombre de la junta, spec §3.4).
  useEffect(() => {
    if (!label && !recording) {
      const mins = minutesOfDay(now);
      const active = blocks.find((b) => mins >= hmToMinutes(b.hora_ini) && mins < hmToMinutes(b.hora_fin));
      if (active) setLabel(active.label);
    }
  }, [now, blocks, label, recording]);

  useEffect(() => {
    setCanRecord(typeof MediaRecorder !== 'undefined' && !!navigator.mediaDevices);
  }, []);

  // Poll de estado mientras haya grabaciones transcribiéndose.
  useEffect(() => {
    const anyProcessing = items.some((g) => ['subida', 'transcribiendo', 'procesando'].includes(g.estado));
    if (!anyProcessing) return;
    const t = setInterval(refresh, 12_000);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items]);

  async function refresh() {
    const { data } = await supabase.from('grabaciones').select('*').order('created_at', { ascending: false }).limit(20);
    if (data) setItems(data as Grabacion[]);
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

      // Crea la fila de grabación.
      const { data } = await supabase
        .from('grabaciones')
        .insert({ user_id: uid, label: label.trim() || 'Junta sin nombre', estado: 'grabando' })
        .select()
        .single();
      rowIdRef.current = (data as Grabacion)?.id ?? null;
      if (data) setItems((prev) => [data as Grabacion, ...prev]);

      mediaRef.current = mr;
      startRef.current = Date.now();
      mr.start();
      setRecording(true);
      setElapsed(0);
      timerRef.current = setInterval(() => setElapsed(Math.floor((Date.now() - startRef.current) / 1000)), 1000);
    } catch (err) {
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
    setLabel('');
    setBusy(false);
    refresh();
  }

  // Plan B: subir un audio grabado con el teléfono (spec §11 riesgo iOS).
  async function uploadFile(file: File) {
    setBusy(true);
    const uid = (await supabase.auth.getUser()).data.user?.id;
    if (!uid) return;
    const { data } = await supabase
      .from('grabaciones')
      .insert({ user_id: uid, label: label.trim() || file.name.replace(/\.[^.]+$/, ''), estado: 'grabando' })
      .select()
      .single();
    const id = (data as Grabacion)?.id;
    if (!id) return;
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
    setLabel('');
    setBusy(false);
    refresh();
  }

  return (
    <section className="space-y-5">
      <h2 className="text-sm font-bold uppercase tracking-wide text-slate-400">Grabación de juntas</h2>

      {/* Controlador de grabación */}
      <div className="card p-4">
        <input
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          disabled={recording}
          placeholder="Nombre de la junta"
          className="mb-3 w-full rounded-lg bg-ink-900 px-3 py-2 text-sm outline-none ring-1 ring-ink-700 focus:ring-brand disabled:opacity-60"
        />
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
          <label className="btn-ghost cursor-pointer">
            📁
            <input
              type="file"
              accept="audio/*"
              className="hidden"
              onChange={(e) => e.target.files?.[0] && uploadFile(e.target.files[0])}
            />
          </label>
        </div>
        {!canRecord && (
          <p className="mt-2 text-xs text-warn">
            Tu navegador no permite grabar aquí. Usa 📁 para subir un audio grabado con el teléfono.
          </p>
        )}
        <p className="mt-2 text-center text-[11px] text-slate-600">
          Aviso: al iniciar, informa a los participantes que la junta se graba.
        </p>
      </div>

      {/* Historial */}
      <div className="space-y-2">
        {items.map((g) => (
          <GrabacionCard key={g.id} g={g} />
        ))}
        {items.length === 0 && <p className="card p-4 text-center text-sm text-slate-500">Sin grabaciones aún.</p>}
      </div>
    </section>
  );
}

function GrabacionCard({ g }: { g: Grabacion }) {
  const [open, setOpen] = useState(false);
  const estadoMeta: Record<Grabacion['estado'], { label: string; tone: string }> = {
    grabando: { label: 'Grabando…', tone: 'bg-urgent/20 text-urgent' },
    subida: { label: 'En cola', tone: 'bg-ink-700 text-slate-400' },
    transcribiendo: { label: 'Transcribiendo…', tone: 'bg-accent/20 text-accent' },
    procesando: { label: 'Resumiendo…', tone: 'bg-brand/20 text-brand-soft' },
    lista: { label: 'Lista', tone: 'bg-ok/20 text-ok' },
    error: { label: 'Error', tone: 'bg-urgent/20 text-urgent' },
  };
  const m = estadoMeta[g.estado];

  return (
    <div className="card overflow-hidden">
      <button onClick={() => setOpen((v) => !v)} className="flex w-full items-center gap-3 p-3 text-left">
        <span className="text-lg">🎙️</span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold">{g.label}</p>
          <p className="text-xs text-slate-500">{g.duracion_seg ? fmtDur(g.duracion_seg) : ''}</p>
        </div>
        <span className={`chip ${m.tone}`}>{m.label}</span>
      </button>
      {open && g.estado === 'lista' && (
        <div className="border-t border-ink-700 px-3 pb-3 pt-2">
          {g.resumen && (
            <>
              <p className="text-[10px] uppercase tracking-wide text-slate-500">Resumen</p>
              <p className="mt-1 whitespace-pre-wrap text-sm text-slate-200">{g.resumen}</p>
            </>
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
