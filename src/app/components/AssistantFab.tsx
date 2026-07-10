'use client';

import { useEffect, useRef, useState } from 'react';

interface PendingAction {
  tool: string;
  input: Record<string, unknown>;
  titulo: string;
  detalle: string;
}
interface Msg {
  role: 'user' | 'assistant';
  content: string;
}

const ACTION_META: Record<string, { icon: string; badge: string; border: string; danger?: boolean }> = {
  mover_junta: { icon: '🕐', badge: 'bg-accent/20 text-accent', border: 'border-accent/40' },
  crear_junta: { icon: '➕', badge: 'bg-ok/20 text-ok', border: 'border-ok/40' },
  invitar_a_junta: { icon: '📨', badge: 'bg-brand/20 text-brand-soft', border: 'border-brand/40' },
  cancelar_junta: { icon: '🗑️', badge: 'bg-urgent/20 text-urgent', border: 'border-urgent/40', danger: true },
};

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
  const [listening, setListening] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const recRef = useRef<any>(null);
  const baseRef = useRef('');

  // Dictado: el texto (parcial + final) va cayendo al campo para revisar y enviar.
  function toggleMic() {
    if (listening) {
      recRef.current?.stop();
      return;
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SR) {
      alert('Tu navegador no permite dictado por voz aquí. Escribe tu mensaje.');
      return;
    }
    const rec = new SR();
    rec.lang = 'es-MX';
    rec.interimResults = true;
    rec.continuous = true;
    baseRef.current = input.trim();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    rec.onresult = (e: any) => {
      let interim = '';
      let finalTxt = '';
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const t = e.results[i][0].transcript;
        if (e.results[i].isFinal) finalTxt += t + ' ';
        else interim += t;
      }
      if (finalTxt) baseRef.current = (baseRef.current + ' ' + finalTxt).trim();
      setInput((baseRef.current + ' ' + interim).trim());
    };
    rec.onend = () => setListening(false);
    rec.onerror = () => setListening(false);
    recRef.current = rec;
    try {
      rec.start();
      setListening(true);
    } catch {
      setListening(false);
    }
  }

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [msgs, pending, loading]);

  async function send(text: string) {
    const t = text.trim();
    if (!t || loading) return;
    recRef.current?.stop();
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
        <button
          onClick={() => {
            recRef.current?.stop();
            setOpen(false);
          }}
          aria-label="Cerrar"
          className="grid h-9 w-9 place-items-center rounded-full border border-ink-700 text-slate-300 active:scale-90"
        >
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

        {pending.map((a, i) => {
          const meta = ACTION_META[a.tool] ?? { icon: '⚡', badge: 'bg-ink-700 text-slate-300', border: 'border-ink-700' };
          return (
            <div key={i} className={`rounded-2xl border ${meta.border} bg-ink-900 p-3.5 shadow-pop`}>
              <div className="flex items-start gap-2.5">
                <span className={`grid h-10 w-10 shrink-0 place-items-center rounded-2xl text-xl ${meta.badge}`}>{meta.icon}</span>
                <div className="min-w-0 flex-1">
                  <p className="text-[13px] font-bold text-slate-100">{a.titulo}</p>
                  <p className="text-sm text-slate-300">{a.detalle}</p>
                  <p className="mt-1 flex items-center gap-1 text-[11px] text-slate-500">✉️ Se avisa a los invitados por correo</p>
                </div>
              </div>
              <div className="mt-3 flex gap-2">
                <button
                  onClick={() => confirmar(a)}
                  disabled={working}
                  className={`flex-1 rounded-xl py-2.5 text-sm font-bold text-white active:scale-95 disabled:opacity-50 ${meta.danger ? 'bg-urgent' : 'bg-brand'}`}
                >
                  {working ? 'Haciendo…' : meta.danger ? 'Sí, cancelar' : 'Confirmar'}
                </button>
                <button onClick={() => cancelar(a)} className="rounded-xl border border-ink-700 px-4 py-2.5 text-sm font-medium text-slate-300 active:scale-95">
                  Ahora no
                </button>
              </div>
            </div>
          );
        })}
      </div>

      <div className="border-t border-ink-800 px-3 py-2.5 safe-bottom">
        {listening && (
          <p className="mb-1.5 flex items-center justify-center gap-1.5 text-[11px] font-medium text-urgent">
            <span className="h-2 w-2 animate-pulse rounded-full bg-urgent" /> Escuchando… habla y toca ⏹ para terminar
          </p>
        )}
        <div className="flex items-center gap-2">
          <button
            onClick={toggleMic}
            aria-label={listening ? 'Detener dictado' : 'Dictar'}
            className={`grid h-10 w-10 shrink-0 place-items-center rounded-full text-lg active:scale-90 ${
              listening ? 'animate-pulse bg-urgent text-white' : 'bg-ink-800 text-slate-300'
            }`}
          >
            {listening ? '⏹' : '🎤'}
          </button>
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && send(input)}
            placeholder={listening ? 'Escuchando…' : 'Escribe o toca 🎤'}
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
