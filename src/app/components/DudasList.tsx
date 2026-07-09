'use client';

import { useState } from 'react';
import type { Duda } from '@/lib/types';
import { OWNERS } from '@/lib/defaults';
import { VoiceButton } from './VoiceButton';

export function DudasList({
  dudas,
  onChanged,
  onLog,
}: {
  dudas: Duda[];
  onChanged: () => void;
  onLog: () => void;
}) {
  const urgentes = dudas.filter((d) => d.urgente);
  const ventana = dudas.filter((d) => !d.urgente);

  return (
    <section className="space-y-5">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-bold uppercase tracking-wide text-slate-400">Dudas pendientes</h2>
        <span className="chip bg-ink-700 text-slate-400">{dudas.length}</span>
      </div>

      {urgentes.length > 0 && (
        <div>
          <p className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-urgent">
            🚨 Urgentes ({urgentes.length})
          </p>
          <div className="space-y-2">
            {urgentes.map((d) => (
              <DudaCard key={d.id} duda={d} onChanged={onChanged} onLog={onLog} />
            ))}
          </div>
        </div>
      )}

      <div>
        {ventana.length > 0 && (
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
            Para la ventana ({ventana.length})
          </p>
        )}
        <div className="space-y-2">
          {ventana.map((d) => (
            <DudaCard key={d.id} duda={d} onChanged={onChanged} onLog={onLog} />
          ))}
        </div>
      </div>

      {dudas.length === 0 && (
        <div className="card p-8 text-center">
          <div className="text-3xl">🎉</div>
          <p className="mt-2 text-sm text-slate-400">Cola limpia. Sin dudas pendientes.</p>
        </div>
      )}
    </section>
  );
}

function DudaCard({ duda, onChanged, onLog }: { duda: Duda; onChanged: () => void; onLog: () => void }) {
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<null | 'hilo' | 'persona' | 'redirigir'>(null);
  const [texto, setTexto] = useState('');
  const [busy, setBusy] = useState(false);

  async function resolver(enPersona: boolean) {
    if (!enPersona && !texto.trim()) return;
    setBusy(true);
    const res = await fetch(`/api/dudas/${duda.id}/resolve`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ resolucion: texto.trim() || 'Resuelto en persona', enPersona }),
    });
    setBusy(false);
    if (res.ok) {
      onChanged();
      onLog();
    } else {
      alert('No se pudo resolver. Revisa la conexión con Slack.');
    }
  }

  async function redirigir(owner: string) {
    setBusy(true);
    const res = await fetch(`/api/dudas/${duda.id}/redirect`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ owner }),
    });
    setBusy(false);
    if (res.ok) {
      onChanged();
      onLog();
    } else {
      alert('No se pudo redirigir.');
    }
  }

  const incompleta = duda.estado === 'incompleta';

  return (
    <div
      className={`card overflow-hidden ${duda.urgente ? 'border-urgent/50' : ''} ${
        duda.urgente && !open ? 'animate-pulseRing' : ''
      }`}
    >
      <button onClick={() => setOpen((v) => !v)} className="flex w-full items-start gap-3 p-3 text-left">
        <span className="mt-0.5 text-lg">{duda.urgente ? '🚨' : '❓'}</span>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <p className="truncate text-sm font-semibold text-slate-100">{duda.autor_nombre || 'Equipo'}</p>
            {incompleta && <span className="chip bg-warn/20 text-warn">incompleta</span>}
          </div>
          <p className="mt-0.5 line-clamp-2 text-sm text-slate-300">{duda.decision || '(sin decisión)'}</p>
        </div>
        <span className="text-slate-600">{open ? '▲' : '▼'}</span>
      </button>

      {open && (
        <div className="border-t border-ink-700 px-3 pb-3 pt-2 text-sm">
          <Field label="Contexto" value={duda.contexto} />
          <Field label="Opciones" value={duda.opciones} />
          <Field label="Recomendación del owner" value={duda.recomendacion} highlight />
          <Field label="Impacto si no se decide hoy" value={duda.impacto} />

          {/* Acciones */}
          <div className="mt-3 grid grid-cols-3 gap-2">
            <ActionBtn active={mode === 'hilo'} onClick={() => setMode('hilo')}>
              💬 Hilo
            </ActionBtn>
            <ActionBtn active={mode === 'persona'} onClick={() => setMode('persona')}>
              🤝 En persona
            </ActionBtn>
            <ActionBtn active={mode === 'redirigir'} onClick={() => setMode('redirigir')}>
              ↪️ Redirigir
            </ActionBtn>
          </div>

          {(mode === 'hilo' || mode === 'persona') && (
            <div className="mt-3">
              <div className="relative">
                <textarea
                  value={texto}
                  onChange={(e) => setTexto(e.target.value)}
                  rows={3}
                  placeholder={mode === 'hilo' ? 'Escribe (o dicta) la decisión…' : 'Nota de lo resuelto en persona…'}
                  className="w-full rounded-lg bg-ink-900 px-3 py-2 pr-11 text-sm outline-none ring-1 ring-ink-700 focus:ring-brand"
                />
                <div className="absolute right-2 top-2">
                  <VoiceButton onText={(t) => setTexto((prev) => (prev ? prev + ' ' : '') + t)} />
                </div>
              </div>
              <button
                onClick={() => resolver(mode === 'persona')}
                disabled={busy || (mode === 'hilo' && !texto.trim())}
                className="btn-primary mt-2 w-full text-sm"
              >
                {busy ? 'Guardando…' : mode === 'hilo' ? 'Publicar en hilo y resolver' : 'Marcar resuelta'}
              </button>
            </div>
          )}

          {mode === 'redirigir' && (
            <div className="mt-3">
              <p className="mb-2 text-xs text-slate-500">¿Quién lo resuelve?</p>
              <div className="flex flex-wrap gap-2">
                {OWNERS.map((o) => (
                  <button
                    key={o}
                    disabled={busy}
                    onClick={() => redirigir(o)}
                    className="chip bg-ink-700 px-3 py-2 text-slate-200 active:scale-95"
                  >
                    {o}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function Field({ label, value, highlight }: { label: string; value: string | null; highlight?: boolean }) {
  if (!value) return null;
  return (
    <div className="mt-2">
      <p className="text-[10px] uppercase tracking-wide text-slate-500">{label}</p>
      <p className={`mt-0.5 text-sm ${highlight ? 'text-brand-soft' : 'text-slate-300'}`}>{value}</p>
    </div>
  );
}

function ActionBtn({ children, active, onClick }: { children: React.ReactNode; active: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={`rounded-lg border px-2 py-2 text-xs font-medium transition active:scale-95 ${
        active ? 'border-brand bg-brand-deep/30 text-white' : 'border-ink-700 bg-ink-800 text-slate-300'
      }`}
    >
      {children}
    </button>
  );
}
