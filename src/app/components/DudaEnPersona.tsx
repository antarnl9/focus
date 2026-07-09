'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Persona } from '@/lib/types';
import { VoiceButton } from './VoiceButton';

function pickMime(): string {
  const cands = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/aac'];
  for (const c of cands) if (typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported(c)) return c;
  return '';
}

// Captura de una duda/conversación EN PERSONA: elige quién, toma nota y (opcional) graba.
export function DudaEnPersona({ supabase, onSaved }: { supabase: SupabaseClient; onSaved: () => void }) {
  const [open, setOpen] = useState(false);
  const [personas, setPersonas] = useState<Persona[]>([]);
  const [persona, setPersona] = useState<Persona | null>(null);
  const [query, setQuery] = useState('');
  const [showList, setShowList] = useState(false);
  const [nota, setNota] = useState('');
  const [busy, setBusy] = useState(false);

  // Grabación
  const [recording, setRecording] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [grabId, setGrabId] = useState<string | null>(null);
  const grabIdRef = useRef<string | null>(null);
  const mediaRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const startRef = useRef(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (!open) return;
    supabase
      .from('personas')
      .select('*')
      .order('rango')
      .order('nombre')
      .then(({ data }) => data && setPersonas(data as Persona[]));
  }, [open, supabase]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = q ? personas.filter((p) => p.nombre.toLowerCase().includes(q) || (p.puesto ?? '').toLowerCase().includes(q)) : personas;
    return list.slice(0, 30);
  }, [personas, query]);

  async function startRec() {
    if (!persona) {
      alert('Primero elige la persona.');
      return;
    }
    try {
      const uid = (await supabase.auth.getUser()).data.user?.id;
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mime = pickMime();
      const mr = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
      chunksRef.current = [];
      mr.ondataavailable = (e) => e.data.size && chunksRef.current.push(e.data);
      mr.onstop = () => uploadRec(uid!, mime);
      const { data } = await supabase
        .from('grabaciones')
        .insert({ user_id: uid, label: `Duda — ${persona.nombre}`, estado: 'grabando' })
        .select()
        .single();
      const id = (data as { id: string })?.id;
      grabIdRef.current = id;
      setGrabId(id);
      if (id) await supabase.from('grabacion_personas').insert({ grabacion_id: id, persona_id: persona.id, user_id: uid });
      mediaRef.current = mr;
      startRef.current = Date.now();
      mr.start();
      setRecording(true);
      setElapsed(0);
      timerRef.current = setInterval(() => setElapsed(Math.floor((Date.now() - startRef.current) / 1000)), 1000);
    } catch {
      alert('No se pudo acceder al micrófono.');
    }
  }

  function stopRec() {
    mediaRef.current?.stop();
    mediaRef.current?.stream.getTracks().forEach((t) => t.stop());
    if (timerRef.current) clearInterval(timerRef.current);
    setRecording(false);
  }

  async function uploadRec(uid: string, mime: string) {
    const id = grabIdRef.current;
    if (!id) return;
    const blob = new Blob(chunksRef.current, { type: mime || 'audio/webm' });
    const dur = Math.floor((Date.now() - startRef.current) / 1000);
    const ext = mime.includes('mp4') || mime.includes('aac') ? 'm4a' : 'webm';
    const path = `${uid}/${id}.${ext}`;
    await supabase.storage.from('grabaciones').upload(path, blob, { contentType: blob.type, upsert: true });
    await fetch('/api/recordings/finalize', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, audio_path: path, duracion_seg: dur, mimetype: blob.type }),
    });
  }

  async function guardar() {
    if (!persona) {
      alert('Elige la persona.');
      return;
    }
    if (!nota.trim() && !grabId) {
      alert('Escribe una nota o graba la conversación.');
      return;
    }
    setBusy(true);
    const uid = (await supabase.auth.getUser()).data.user?.id;
    await supabase.from('dudas').insert({
      user_id: uid,
      autor_id: persona.slack_user_id,
      autor_nombre: persona.nombre,
      decision: nota.trim() || 'Conversación en persona',
      resolucion: nota.trim() || 'Atendida en persona',
      estado: 'resuelta',
      resuelto_por: 'COO',
      resolved_at: new Date().toISOString(),
    });
    await supabase.from('bitacora').insert({
      user_id: uid,
      tipo: 'duda_resuelta',
      texto: `Duda en persona de ${persona.nombre}${nota.trim() ? `: ${nota.trim()}` : ''}${grabId ? ' (grabada)' : ''}`,
    });
    setBusy(false);
    // Reset
    setPersona(null);
    setQuery('');
    setNota('');
    setGrabId(null);
    grabIdRef.current = null;
    setOpen(false);
    onSaved();
  }

  if (!open) {
    return (
      <button onClick={() => setOpen(true)} className="btn-primary w-full">
        ➕ Registrar duda en persona
      </button>
    );
  }

  return (
    <div className="card space-y-3 p-4">
      <div className="flex items-center justify-between">
        <p className="text-sm font-bold">Duda en persona</p>
        <button onClick={() => setOpen(false)} className="chip bg-ink-700 text-slate-400">
          Cancelar
        </button>
      </div>

      {/* Persona */}
      {persona ? (
        <div className="flex items-center gap-2 rounded-lg bg-ink-900 px-3 py-2">
          <span className="grid h-7 w-7 place-items-center rounded-full bg-brand-deep/30 text-xs font-bold text-brand-soft">
            {persona.nombre.slice(0, 2).toUpperCase()}
          </span>
          <span className="min-w-0 flex-1 truncate text-sm font-medium">{persona.nombre}</span>
          <button onClick={() => { setPersona(null); setShowList(true); }} className="chip bg-ink-700 text-slate-400">
            Cambiar
          </button>
        </div>
      ) : (
        <div>
          <input
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setShowList(true);
            }}
            onFocus={() => setShowList(true)}
            placeholder={`¿Quién? Buscar entre ${personas.length}…`}
            className="w-full rounded-lg bg-ink-900 px-3 py-2 text-sm outline-none ring-1 ring-ink-700 focus:ring-brand"
          />
          {showList && (
            <div className="mt-1 max-h-56 space-y-1 overflow-y-auto rounded-lg border border-ink-700 bg-ink-900/60 p-1">
              {filtered.map((p) => (
                <button
                  key={p.id}
                  onClick={() => {
                    setPersona(p);
                    setShowList(false);
                  }}
                  className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left active:bg-ink-800"
                >
                  <span className="grid h-7 w-7 place-items-center rounded-full bg-brand-deep/30 text-[10px] font-bold text-brand-soft">
                    {p.nombre.slice(0, 2).toUpperCase()}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm">{p.nombre}</p>
                    {p.puesto && <p className="truncate text-[11px] text-slate-500">{p.puesto}</p>}
                  </div>
                </button>
              ))}
              {filtered.length === 0 && <p className="p-2 text-center text-xs text-slate-500">Sin resultados.</p>}
            </div>
          )}
        </div>
      )}

      {/* Nota / decisión */}
      <div className="relative">
        <textarea
          value={nota}
          onChange={(e) => setNota(e.target.value)}
          rows={3}
          placeholder="Tema y decisión (escribe o dicta)…"
          className="w-full rounded-lg bg-ink-900 px-3 py-2 pr-11 text-sm outline-none ring-1 ring-ink-700 focus:ring-brand"
        />
        <div className="absolute right-2 top-2">
          <VoiceButton onText={(t) => setNota((prev) => (prev ? prev + ' ' : '') + t)} />
        </div>
      </div>

      {/* Grabar (opcional) */}
      <div className="flex items-center gap-2">
        {!recording ? (
          <button onClick={startRec} className="btn-ghost flex-1 text-sm">
            🎙️ Grabar conversación
          </button>
        ) : (
          <button onClick={stopRec} className="btn flex-1 animate-pulseRing bg-urgent text-sm text-white">
            ⏹ Detener · {Math.floor(elapsed / 60)}:{String(elapsed % 60).padStart(2, '0')}
          </button>
        )}
        {grabId && !recording && <span className="chip bg-ok/20 text-ok">🎙️ grabada</span>}
      </div>

      <button onClick={guardar} disabled={busy} className="btn-primary w-full">
        {busy ? 'Guardando…' : 'Guardar duda'}
      </button>
    </div>
  );
}
