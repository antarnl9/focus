'use client';

import { useState } from 'react';

export function SlackContextView({
  connected,
  resumen,
  actualizado,
  mensajes,
}: {
  connected: boolean;
  resumen: string | null;
  actualizado: string | null;
  mensajes: number;
}) {
  const [res, setRes] = useState(resumen);
  const [act, setAct] = useState(actualizado);
  const [msgs, setMsgs] = useState(mensajes);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function sync() {
    setBusy(true);
    setError(null);
    try {
      const r = await fetch('/api/slack/context/sync', { method: 'POST' });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || 'Error');
      setRes(j.resumen);
      setMsgs(j.mensajes);
      setAct(new Date().toISOString());
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  if (!connected) {
    return (
      <div className="space-y-4">
        <p className="text-sm text-slate-400">
          Conecta tu Slack para que Focus lea tus DMs y canales, los resuma y use ese contexto en tu <b>Daily</b> y tu <b>coach</b>.
          <br />
          <span className="text-slate-500">Focus guarda solo el resumen, no los mensajes.</span>
        </p>
        <a href="/api/slack/oauth/start" className="btn-primary block w-full text-center">
          🔗 Conectar mi Slack
        </a>
        <p className="text-center text-[11px] text-slate-600">Requiere la Slack app configurada con OAuth de usuario.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <span className="chip bg-ok/20 text-ok">Slack conectado ✓</span>
        {act && <span className="text-xs text-slate-500">Actualizado {new Date(act).toLocaleString('es-MX')}</span>}
      </div>

      <button onClick={sync} disabled={busy} className="btn-primary w-full">
        {busy ? 'Jalando y resumiendo…' : '↻ Sincronizar contexto ahora'}
      </button>
      {error && <p className="text-sm text-urgent">{error}</p>}

      {res ? (
        <div className="card p-4">
          <p className="mb-2 text-[10px] uppercase tracking-wide text-slate-500">Resumen ({msgs} mensajes)</p>
          <div className="whitespace-pre-wrap text-sm leading-relaxed text-slate-200">{res}</div>
        </div>
      ) : (
        <p className="card p-4 text-center text-sm text-slate-500">Aún no sincronizas. Dale al botón de arriba.</p>
      )}
    </div>
  );
}
