'use client';

import { useEffect, useRef, useState } from 'react';
import { VoiceButton } from './VoiceButton';

interface PendingAction {
  tool: string;
  input: Record<string, unknown>;
  resumen: string;
}
interface Msg {
  role: 'user' | 'assistant';
  content: string;
}

const SUGERENCIAS = [
  '¿Qué tengo hoy?',
  'Mueve mi próxima junta 30 min',
  '¿Qué dudas tengo pendientes?',
  'Invita a Steb a la junta de reportes',
];

export function AssistantFab() {
  const [open, setOpen] = useState(false);
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [pending, setPending] = useState<PendingAction[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [working, setWorking] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [msgs, pending, loading]);

  async function send(text: string) {
    const t = text.trim();
    if (!t || loading) return;
    const next = [...msgs, { role: 'user' as const, content: t }];
    setMsgs(next);
    setInput('');
    setPending([]);
    setLoading(true);
    try {
      const res = await fetch('/api/assistant', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ history: next }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Error');
      setMsgs((m) => [...m, { role: 'assistant', content: json.reply || '(sin respuesta)' }]);
      setPending((json.pendingActions as PendingAction[]) ?? []);
    } catch (e) {
      setMsgs((m) => [...m, { role: 'assistant', content: '⚠️ ' + (e as Error).message }]);
    } finally {
      setLoading(false);
    }
  }

  async function confirmar(action: PendingAction) {
    setWorking(true);
    setPending((p) => p.filter((a) => a !== action));
    try {
      const res = await fetch('/api/assistant/execute', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action }),
      });
      const json = await res.json();
      setMsgs((m) => [...m, { role: 'assistant', content: json.message || (json.ok ? '✅ Hecho' : '⚠️ No se pudo') }]);
    } catch (e) {
      setMsgs((m) => [...m, { role: 'assistant', content: '⚠️ ' + (e as Error).message }]);
    } finally {
      setWorking(false);
    }
  }

  function cancelar(action: PendingAction) {
    setPending((p) => p.filter((a) => a !== action));
    setMsgs((m) => [...m, { role: 'assistant', content: 'Ok, no lo hago.' }]);
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        aria-label="Copiloto"
        className="fixed bottom-24 right-4 z-40 grid h-14 w-14 place-items-center rounded-full bg-gradient-to-br from-brand to-brand-deep text-2xl text-white shadow-pop ring-2 ring-brand/30 active:scale-90 safe-bottom"
      >
        ✨
      </button>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-ink-950">
      <header className="flex items-center gap-3 border-b border-ink-800 px-4 pb-3 pt-3 safe-top">
        <span className="grid h-9 w-9 place-items-center rounded-full bg-gradient-to-br from-brand to-brand-deep text-lg text-white">✨</span>
        <div className="flex-1">
          <h2 className="text-base font-bold">Copiloto</h2>
          <p className="text-[11px] text-slate-500">Pídele mover juntas, invitar, consultar…</p>
        </div>
        <button onClick={() => setOpen(false)} aria-label="Cerrar" className="grid h-9 w-9 place-items-center rounded-full border border-ink-700 text-slate-300 active:scale-90">
          ✕
        </button>
      </header>

      <div ref={scrollRef} className="flex-1 space-y-3 overflow-y-auto px-4 py-4">
        {msgs.length === 0 && (
          <div className="space-y-2">
            <p className="text-sm text-slate-400">Dime qué necesitas. Por ejemplo:</p>
            {SUGERENCIAS.map((s) => (
              <button key={s} onClick={() => send(s)} className="block w-full rounded-xl border border-ink-700 bg-ink-900 px-3 py-2.5 text-left text-sm text-slate-200 active:scale-[0.99]">
                {s}
              </button>
            ))}
          </div>
        )}

        {msgs.map((m, i) => (
          <div key={i} className={m.role === 'user' ? 'flex justify-end' : 'flex justify-start'}>
            <div
              className={`max-w-[85%] whitespace-pre-wrap rounded-2xl px-3.5 py-2.5 text-sm ${
                m.role === 'user' ? 'bg-brand-deep/40 text-slate-100' : 'bg-ink-800 text-slate-200'
              }`}
            >
              {m.content}
            </div>
          </div>
        ))}

        {loading && <div className="flex justify-start"><div className="rounded-2xl bg-ink-800 px-3.5 py-2.5 text-sm text-slate-500">Pensando…</div></div>}

        {pending.map((a, i) => (
          <div key={i} className="rounded-2xl border border-brand/40 bg-ink-900 p-3">
            <p className="text-[10px] uppercase tracking-wide text-slate-500">Confirmar acción</p>
            <p className="mt-0.5 text-sm font-medium text-slate-100">{a.resumen}</p>
            <p className="mt-0.5 text-[11px] text-slate-500">Manda correo a los invitados.</p>
            <div className="mt-2 flex gap-2">
              <button onClick={() => confirmar(a)} disabled={working} className="btn-primary flex-1 py-2 text-sm">
                {working ? 'Haciendo…' : 'Confirmar'}
              </button>
              <button onClick={() => cancelar(a)} className="btn-ghost py-2 text-sm">
                Cancelar
              </button>
            </div>
          </div>
        ))}
      </div>

      <div className="border-t border-ink-800 px-3 py-2.5 safe-bottom">
        <div className="flex items-center gap-2">
          <VoiceButton onText={(t) => send(t)} />
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && send(input)}
            placeholder="Escribe o dicta…"
            className="min-w-0 flex-1 rounded-full bg-ink-900 px-4 py-2.5 text-sm outline-none ring-1 ring-ink-700 focus:ring-brand"
          />
          <button
            onClick={() => send(input)}
            disabled={loading || !input.trim()}
            aria-label="Enviar"
            className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-brand text-lg text-white active:scale-90 disabled:opacity-40"
          >
            ➤
          </button>
        </div>
      </div>
    </div>
  );
}
