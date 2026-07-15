'use client';

import { createContext, useContext, useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { createSupabaseBrowser } from '@/lib/supabase/client';
import type { Grabacion, EventAttendee } from '@/lib/types';
import { ensurePersonasFromAttendees } from './persona-util';

interface StartArgs {
  label: string;
  blockRef?: string | null;
  personaIds?: string[];
  attendees?: EventAttendee[]; // invitados del evento; se crean/casan como personas
  fecha?: string; // día de la junta (YYYY-MM-DD); default hoy
}

interface RecordingCtx {
  recording: boolean;
  elapsed: number;
  label: string | null;
  busy: boolean;
  canRecord: boolean;
  start: (a: StartArgs) => Promise<void>;
  stop: () => void;
}

const Ctx = createContext<RecordingCtx | null>(null);

export function useRecording(): RecordingCtx {
  const c = useContext(Ctx);
  if (!c) throw new Error('useRecording fuera de RecordingProvider');
  return c;
}

function pickMime(): string {
  const cands = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/aac'];
  for (const c of cands) {
    if (typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported(c)) return c;
  }
  return '';
}

// Mantiene la pantalla encendida mientras grabas (Wake Lock).
type WakeSentinel = { release: () => Promise<void> } | null;

export function RecordingProvider({ children }: { children: ReactNode }) {
  const supabase = useRef(createSupabaseBrowser()).current;
  const [recording, setRecording] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [label, setLabel] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [canRecord, setCanRecord] = useState(true);
  // Audio que NO se pudo subir: se guarda para reintentar/descargar (no perderlo).
  const [failed, setFailed] = useState<{ blob: Blob; filename: string; id: string; path: string; dur: number } | null>(null);

  const mediaRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const startRef = useRef<number>(0);
  const rowIdRef = useRef<string | null>(null);
  const mimeRef = useRef<string>('');
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const wakeRef = useRef<WakeSentinel>(null);

  useEffect(() => {
    setCanRecord(typeof MediaRecorder !== 'undefined' && !!navigator.mediaDevices);
  }, []);

  const acquireWake = useCallback(async () => {
    try {
      const wl = (navigator as unknown as { wakeLock?: { request: (t: string) => Promise<WakeSentinel> } }).wakeLock;
      if (wl) wakeRef.current = await wl.request('screen');
    } catch {
      /* no soportado / sin permiso */
    }
  }, []);

  const releaseWake = useCallback(async () => {
    try {
      await wakeRef.current?.release();
    } catch {
      /* ya liberado */
    }
    wakeRef.current = null;
  }, []);

  // Al ocultar la app: fuerza a volcar el último trozo de audio (por si el
  // sistema la congela). Al volver: re-adquiere el Wake Lock.
  useEffect(() => {
    const onVis = () => {
      if (!recording) return;
      if (document.visibilityState === 'hidden') {
        try {
          mediaRef.current?.requestData();
        } catch {
          /* recorder ya inactivo */
        }
      } else if (!wakeRef.current) {
        acquireWake();
      }
    };
    document.addEventListener('visibilitychange', onVis);
    return () => document.removeEventListener('visibilitychange', onVis);
  }, [recording, acquireWake]);

  async function resolvePersonaIds(uid: string, personaIds: string[], attendees: EventAttendee[]): Promise<string[]> {
    const fromAttendees = await ensurePersonasFromAttendees(supabase, uid, attendees);
    return [...new Set([...personaIds, ...fromAttendees])];
  }

  const start = useCallback(
    async ({ label: lbl, blockRef = null, personaIds = [], attendees = [], fecha }: StartArgs) => {
      if (recording || busy) return;
      setBusy(true);
      try {
        const uid = (await supabase.auth.getUser()).data.user?.id;
        if (!uid) throw new Error('no auth');
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        const mime = pickMime();
        mimeRef.current = mime;
        // Bitrate bajo (voz): archivos ~4× más chicos → subidas más confiables.
        const opts: MediaRecorderOptions = { audioBitsPerSecond: 48000 };
        if (mime) opts.mimeType = mime;
        const mr = new MediaRecorder(stream, opts);
        chunksRef.current = [];
        mr.ondataavailable = (e) => e.data.size && chunksRef.current.push(e.data);
        mr.onstop = () => finalize(uid);

        const { data } = await supabase
          .from('grabaciones')
          .insert({ user_id: uid, label: lbl, block_ref: blockRef, estado: 'grabando', ...(fecha ? { fecha } : {}) })
          .select()
          .single();
        const id = (data as Grabacion)?.id ?? null;
        rowIdRef.current = id;

        const ids = await resolvePersonaIds(uid, personaIds, attendees);
        if (id && ids.length) {
          await supabase.from('grabacion_personas').insert(ids.map((pid) => ({ grabacion_id: id, persona_id: pid, user_id: uid })));
        }

        mediaRef.current = mr;
        startRef.current = Date.now();
        mr.start(15000); // emite el audio en trozos de 15s: si se interrumpe, no se pierde todo
        await acquireWake();
        setRecording(true);
        setLabel(lbl);
        setElapsed(0);
        timerRef.current = setInterval(() => setElapsed(Math.floor((Date.now() - startRef.current) / 1000)), 1000);
      } catch {
        alert('No se pudo acceder al micrófono. Otorga permiso desde el navegador.');
      } finally {
        setBusy(false);
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [recording, busy, supabase, acquireWake]
  );

  const stop = useCallback(() => {
    if (!recording) return;
    mediaRef.current?.stop();
    mediaRef.current?.stream.getTracks().forEach((t) => t.stop());
    if (timerRef.current) clearInterval(timerRef.current);
    releaseWake();
    setRecording(false);
    setLabel(null);
  }, [recording, releaseWake]);

  async function finalize(uid: string) {
    const id = rowIdRef.current;
    if (!id) return;
    const mime = mimeRef.current;
    const blob = new Blob(chunksRef.current, { type: mime || 'audio/webm' });
    const dur = Math.floor((Date.now() - startRef.current) / 1000);
    const ext = mime.includes('mp4') || mime.includes('aac') ? 'm4a' : 'webm';
    const path = `${uid}/${id}.${ext}`;
    setBusy(true);

    // Sube con reintentos (las redes móviles fallan en subidas grandes).
    let uploaded = false;
    for (let attempt = 0; attempt < 3 && !uploaded; attempt++) {
      const { error } = await supabase.storage.from('grabaciones').upload(path, blob, { contentType: blob.type, upsert: true });
      if (!error) uploaded = true;
      else if (attempt < 2) await new Promise((r) => setTimeout(r, 1500 * (attempt + 1)));
    }

    if (uploaded) {
      await fetch('/api/recordings/finalize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, audio_path: path, duracion_seg: dur, mimetype: blob.type }),
      }).catch(() => {});
      setFailed(null);
    } else {
      // No se pudo subir: marca "error" (para no dejarla en "Grabando…") y
      // conserva el audio para reintentar o descargar (no se pierde).
      await supabase.from('grabaciones').update({ estado: 'error' }).eq('id', id);
      setFailed({ blob, filename: `junta-${id}.${ext}`, id, path, dur });
    }
    setBusy(false);
  }

  async function retryFailed() {
    if (!failed) return;
    setBusy(true);
    const { error } = await supabase.storage.from('grabaciones').upload(failed.path, failed.blob, { contentType: failed.blob.type, upsert: true });
    if (!error) {
      await fetch('/api/recordings/finalize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: failed.id, audio_path: failed.path, duracion_seg: failed.dur, mimetype: failed.blob.type }),
      }).catch(() => {});
      setFailed(null);
    } else {
      alert('Sigue sin subir (revisa tu conexión). Descarga el audio para no perderlo.');
    }
    setBusy(false);
  }

  return (
    <Ctx.Provider value={{ recording, elapsed, label, busy, canRecord, start, stop }}>
      {children}
      {recording && <RecordingBar label={label} elapsed={elapsed} busy={busy} onStop={stop} />}
      {failed && !recording && (
        <FailedBar busy={busy} onRetry={retryFailed} onDownload={() => saveBlob(failed.blob, failed.filename)} onDismiss={() => setFailed(null)} />
      )}
    </Ctx.Provider>
  );
}

// Guarda el blob en el teléfono: share sheet (iOS/Archivos) o descarga directa.
async function saveBlob(blob: Blob, filename: string) {
  const file = new File([blob], filename, { type: blob.type || 'audio/webm' });
  try {
    const nav = navigator as Navigator & {
      canShare?: (d: { files: File[] }) => boolean;
      share?: (d: { files: File[]; title?: string }) => Promise<void>;
    };
    if (nav.share && nav.canShare && nav.canShare({ files: [file] })) {
      await nav.share({ files: [file], title: filename });
      return;
    }
  } catch {
    /* cae al fallback */
  }
  try {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 15000);
  } catch {
    /* noop */
  }
}

function FailedBar({ busy, onRetry, onDownload, onDismiss }: { busy: boolean; onRetry: () => void; onDownload: () => void; onDismiss: () => void }) {
  return (
    <div className="fixed inset-x-0 bottom-16 z-50 px-3 safe-bottom">
      <div className="mx-auto max-w-lg rounded-xl border border-urgent/50 bg-ink-900/95 p-3 shadow-pop backdrop-blur">
        <p className="text-sm font-semibold text-urgent">⚠️ El audio no se subió</p>
        <p className="mt-0.5 text-[11px] text-slate-400">No lo pierdas: reintenta la subida o descárgalo a tu teléfono (luego súbelo con 📁 en Juntas).</p>
        <div className="mt-2 flex gap-2">
          <button onClick={onRetry} disabled={busy} className="btn-primary flex-1 py-2 text-sm">
            {busy ? 'Subiendo…' : '↻ Reintentar'}
          </button>
          <button onClick={onDownload} className="rounded-xl border border-ink-700 bg-ink-800/60 px-4 py-2 text-sm font-medium text-slate-200 active:scale-95">
            ⬇︎ Descargar
          </button>
          <button onClick={onDismiss} aria-label="Descartar" className="rounded-xl border border-ink-700 px-3 py-2 text-sm text-slate-500 active:scale-95">
            ✕
          </button>
        </div>
      </div>
    </div>
  );
}

function RecordingBar({ label, elapsed, busy, onStop }: { label: string | null; elapsed: number; busy: boolean; onStop: () => void }) {
  return (
    <div className="fixed inset-x-0 bottom-16 z-50 px-3 safe-bottom">
      <div className="mx-auto flex max-w-lg items-center gap-3 rounded-xl border border-urgent/40 bg-ink-900/95 px-4 py-2.5 shadow-pop backdrop-blur">
        <span className="h-2.5 w-2.5 shrink-0 animate-pulse rounded-full bg-urgent" />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold text-slate-100">● Grabando · {label ?? 'Junta'}</p>
          <p className="text-[11px] tabular-nums text-slate-400">{fmtDur(elapsed)} · pantalla encendida</p>
        </div>
        <button onClick={onStop} disabled={busy} className="btn bg-urgent px-4 text-white active:scale-95">
          {busy ? 'Subiendo…' : '⏹ Detener'}
        </button>
      </div>
    </div>
  );
}

function fmtDur(s: number): string {
  const m = Math.floor(s / 60);
  const sec = s % 60;
  return `${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
}
