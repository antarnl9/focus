'use client';

import { useState } from 'react';
import type { Daily } from '@/lib/types';

export function DailyPanel({ today, initial }: { today: string; initial: Daily | null }) {
  const [contenido, setContenido] = useState(initial?.contenido ?? '');
  const [enviado, setEnviado] = useState(initial?.enviado_slack ?? false);
  const [generating, setGenerating] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function generar() {
    setGenerating(true);
    setError(null);
    try {
      const res = await fetch('/api/daily/generate', { method: 'POST' });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Error al generar');
      setContenido(json.contenido);
      setEnviado(false);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setGenerating(false);
    }
  }

  async function enviar() {
    if (!contenido.trim()) return;
    setSending(true);
    setError(null);
    try {
      const res = await fetch('/api/daily/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contenido }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Error al enviar');
      setEnviado(true);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSending(false);
    }
  }

  return (
    <section className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-bold uppercase tracking-wide text-slate-400">Daily de cierre</h2>
        {enviado && <span className="chip bg-ok/20 text-ok">Enviado ✓</span>}
      </div>

      <p className="text-sm text-slate-400">
        A partir de tu bitácora, dudas, prioridades y acuerdos del día. Editable antes de enviar a{' '}
        <span className="font-mono text-slate-300">#daily-coo</span>.
      </p>

      <button onClick={generar} disabled={generating} className="btn-primary w-full">
        {generating ? 'Generando…' : contenido ? '↻ Regenerar Daily' : '✨ Generar Daily'}
      </button>

      {contenido && (
        <>
          <textarea
            value={contenido}
            onChange={(e) => {
              setContenido(e.target.value);
              setEnviado(false);
            }}
            rows={16}
            className="w-full rounded-xl bg-ink-900 px-3 py-3 font-mono text-[13px] leading-relaxed outline-none ring-1 ring-ink-700 focus:ring-brand"
          />
          <button onClick={enviar} disabled={sending || enviado} className="btn-primary w-full">
            {sending ? 'Enviando…' : enviado ? 'Enviado a #daily-coo' : '📤 Enviar a #daily-coo'}
          </button>
        </>
      )}

      {error && <p className="text-sm text-urgent">{error}</p>}

      <p className="text-center text-xs text-slate-600">Daily de {today}</p>
    </section>
  );
}
