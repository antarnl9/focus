'use client';

import { useEffect, useState } from 'react';

interface Ctx {
  connected: boolean;
  resumen: string | null;
  recomendaciones: string | null;
  actualizado: string | null;
  mensajes: number;
}

export function SlackContextView() {
  const [ctx, setCtx] = useState<Ctx | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    const r = await fetch('/api/slack/context');
    if (r.ok) setCtx((await r.json()) as Ctx);
    else setCtx({ connected: false, resumen: null, recomendaciones: null, actualizado: null, mensajes: 0 });
  }

  useEffect(() => {
    load();
  }, []);

  async function sync() {
    setBusy(true);
    setError(null);
    try {
      const r = await fetch('/api/slack/context/sync', { method: 'POST' });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || 'Error');
      setCtx((prev) => ({
        connected: true,
        resumen: j.resumen,
        recomendaciones: j.recomendaciones ?? null,
        actualizado: new Date().toISOString(),
        mensajes: j.mensajes,
      }));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  if (!ctx) return <p className="card p-6 text-center text-sm text-slate-500">Cargando…</p>;

  if (!ctx.connected) {
    return (
      <div className="space-y-4">
        <p className="text-sm text-slate-400">
          Conecta tu Slack para que Focus lea tus DMs y canales, y te diga <b>qué es lo importante a atacar</b> y un resumen.
          <br />
          <span className="text-slate-500">Se guarda solo el resumen, no los mensajes.</span>
        </p>
        <a href="/api/slack/oauth/start" className="btn-primary block w-full text-center">
          🔗 Conectar mi Slack
        </a>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <span className="chip bg-ok/20 text-ok">Slack conectado ✓</span>
        {ctx.actualizado && <span className="text-xs text-slate-500">{new Date(ctx.actualizado).toLocaleString('es-MX')}</span>}
      </div>

      <button onClick={sync} disabled={busy} className="btn-primary w-full">
        {busy ? 'Jalando y analizando…' : '↻ Sincronizar ahora'}
      </button>
      {error && <p className="text-sm text-urgent">{error}</p>}

      {/* Lo importante a atacar (recomendación) — prominente */}
      {ctx.recomendaciones && (
        <div className="rounded-2xl border border-brand/40 bg-brand-deep/15 p-4">
          <p className="mb-2 flex items-center gap-1.5 text-sm font-bold text-brand-soft">🎯 Lo importante a atacar</p>
          <div className="whitespace-pre-wrap text-sm leading-relaxed text-slate-100">{ctx.recomendaciones}</div>
        </div>
      )}

      {/* Resumen */}
      {ctx.resumen && (
        <div className="card p-4">
          <p className="mb-2 text-[10px] uppercase tracking-wide text-slate-500">Resumen ({ctx.mensajes} mensajes)</p>
          <div className="whitespace-pre-wrap text-sm leading-relaxed text-slate-200">{ctx.resumen}</div>
        </div>
      )}

      {!ctx.resumen && <p className="card p-4 text-center text-sm text-slate-500">Aún no sincronizas. Dale al botón de arriba.</p>}
    </div>
  );
}
