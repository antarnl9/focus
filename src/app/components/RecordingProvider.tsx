'use client';

import { createContext, useContext, useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { createSupabaseBrowser } from '@/lib/supabase/client';
import type { Grabacion } from '@/lib/types';

interface StartArgs {
  label: string;
  blockRef?: string | null;
  personaIds?: string[];
  attendeeEmails?: string[]; // se casan con personas por correo
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

  // Re-adquiere el Wake Lock al volver a la app (se libera al ocultar).
  useEffect(() => {
    const onVis = () => {
      if (recording && document.visibilityState === 'visible' && !wakeRef.current) acquireWake();
    };
    document.addEventListener('visibilitychange', onVis);
    return () => document.removeEventListener('visibilitychange', onVis);
  }, [recording, acquireWake]);

  async function resolvePersonaIds(personaIds: string[], attendeeEmails: string[]): Promise<string[]> {
    const set = new Set(personaIds);
    const emails = attendeeEmails.map((e) => e.toLowerCase()).filter(Boolean);
    if (emails.length) {
      const { data } = await supabase.from('personas').select('id, correo').in('correo', emails);
      for (const p of (data ?? []) as { id: string; correo: string | null }[]) set.add(p.id);
    }
    return [...set];
  }

  const start = useCallback(
    async ({ label: lbl, blockRef = null, personaIds = [], attendeeEmails = [] }: StartArgs) => {
      if (recording || busy) return;
      setBusy(true);
      try {
        const uid = (await supabase.auth.getUser()).data.user?.id;
        if (!uid) throw new Error('no auth');
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        const mime = pickMime();
        mimeRef.current = mime;
        const mr = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
        chunksRef.current = [];
        mr.ondataavailable = (e) => e.data.size && chunksRef.current.push(e.data);
        mr.onstop = () => finalize(uid);

        const { data } = await supabase
          .from('grabaciones')
          .insert({ user_id: uid, label: lbl, block_ref: blockRef, estado: 'grabando' })
          .select()
          .single();
        const id = (data as Grabacion)?.id ?? null;
        rowIdRef.current = id;

        const ids = await resolvePersonaIds(personaIds, attendeeEmails);
        if (id && ids.length) {
          await supabase.from('grabacion_personas').insert(ids.map((pid) => ({ grabacion_id: id, persona_id: pid, user_id: uid })));
        }

        mediaRef.current = mr;
        startRef.current = Date.now();
        mr.start();
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
    const { error } = await supabase.storage.from('grabaciones').upload(path, blob, { contentType: blob.type, upsert: true });
    if (!error) {
      await fetch('/api/recordings/finalize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, audio_path: path, duracion_seg: dur, mimetype: blob.type }),
      }).catch(() => {});
    } else {
      alert('Falló la subida del audio.');
    }
    setBusy(false);
  }

  return (
    <Ctx.Provider value={{ recording, elapsed, label, busy, canRecord, start, stop }}>
      {children}
      {recording && <RecordingBar label={label} elapsed={elapsed} busy={busy} onStop={stop} />}
    </Ctx.Provider>
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
