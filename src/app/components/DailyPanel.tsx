'use client';

import { useState } from 'react';
import type { Daily } from '@/lib/types';

interface HistItem {
  fecha: string;
  contenido: string;
  enviado_slack: boolean;
}

export function DailyPanel({ today, initial }: { today: string; initial: Daily | null }) {
  const [contenido, setContenido] = useState(initial?.contenido ?? '');
  const [enviado, setEnviado] = useState(initial?.enviado_slack ?? false);
  const [generating, setGenerating] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hist, setHist] = useState<HistItem[] | null>(null);

  async function generar() {
    setGenerating(true);
    setError(null);
    try {
      const res = await fetch('/api/daily/generate', { method: 'POST' });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Error al generar');
      setContenido(json.ceo);
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

  async function toggleHist() {
    if (hist) {
      setHist(null);
      return;
    }
    const res = await fetch('/api/daily?history=1&tipo=ceo');
    const json = await res.json();
    setHist((json.dailies as HistItem[]) ?? []);
  }

  return (
    <section className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-bold uppercase tracking-wide text-slate-400">CEO Brief</h2>
        {enviado && <span className="chip bg-ok/20 text-ok">Enviado ✓</span>}
      </div>

      <p className="text-sm text-slate-400">
        Formato del CEO: <b>HOY / MAÑANA / AYUDA / KILL / MÉTRICA</b>. Editable antes de enviar al canal del CEO.
      </p>

      <button onClick={generar} disabled={generating} className="btn-primary w-full">
        {generating ? 'Generando…' : contenido ? '↻ Regenerar' : '✨ Generar CEO Brief'}
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
            {sending ? 'Enviando…' : enviado ? 'Enviado ✓' : '📤 Enviar al canal del CEO'}
          </button>
        </>
      )}

      {error && <p className="text-sm text-urgent">{error}</p>}

      {/* Historial */}
      <button onClick={toggleHist} className="w-full text-center text-xs text-slate-500">
        {hist ? 'Ocultar historial' : '📚 Ver historial de briefs'}
      </button>
      {hist && (
        <div className="space-y-2">
          {hist.map((h) => (
            <details key={h.fecha} className="card p-3">
              <summary className="flex cursor-pointer items-center justify-between text-sm">
                <span className="font-medium">{h.fecha}</span>
                {h.enviado_slack && <span className="chip bg-ok/20 text-ok">enviado</span>}
              </summary>
              <pre className="mt-2 whitespace-pre-wrap font-mono text-[12px] text-slate-300">{h.contenido}</pre>
            </details>
          ))}
          {hist.length === 0 && <p className="text-center text-xs text-slate-500">Sin briefs guardados.</p>}
        </div>
      )}

      <p className="text-center text-xs text-slate-600">CEO Brief de {today} · se guarda automáticamente</p>
    </section>
  );
}
