'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(base64);
  const arr = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) arr[i] = raw.charCodeAt(i);
  return arr;
}

export function QuickActions() {
  const [pushState, setPushState] = useState<'idle' | 'on' | 'unavailable'>('idle');
  const [calState, setCalState] = useState<'idle' | 'busy' | 'done' | 'error'>('idle');
  const [calMsg, setCalMsg] = useState('');
  const vapid = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;

  useEffect(() => {
    if (!('serviceWorker' in navigator) || !('PushManager' in window) || !vapid) {
      setPushState('unavailable');
      return;
    }
    navigator.serviceWorker.ready
      .then((reg) => reg.pushManager.getSubscription())
      .then((sub) => sub && setPushState('on'))
      .catch(() => {});
  }, [vapid]);

  async function enablePush() {
    try {
      const perm = await Notification.requestPermission();
      if (perm !== 'granted') return;
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(vapid!) as unknown as BufferSource,
      });
      await fetch('/api/push/subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(sub),
      });
      setPushState('on');
    } catch {
      /* noop */
    }
  }

  async function syncCalendar() {
    setCalState('busy');
    setCalMsg('');
    try {
      const res = await fetch('/api/calendar/template', { method: 'POST' });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Error');
      setCalState('done');
      setCalMsg(json.message || `${json.created} bloques creados en Calendar.`);
    } catch (e) {
      setCalState('error');
      setCalMsg((e as Error).message);
    }
  }

  return (
    <section>
      <h2 className="mb-2 text-sm font-bold uppercase tracking-wide text-slate-400">Ajustes rápidos</h2>
      <div className="space-y-2">
        <Link href="/personas" className="card flex items-center gap-3 p-3 active:scale-[0.99]">
          <span className="text-xl">👤</span>
          <div className="flex-1">
            <p className="text-sm font-semibold">Personas</p>
            <p className="text-xs text-slate-500">Directorio: liga juntas y dudas a cada persona.</p>
          </div>
          <span className="text-slate-600">›</span>
        </Link>

        {pushState !== 'on' && pushState !== 'unavailable' && (
          <button onClick={enablePush} className="card flex w-full items-center gap-3 p-3 text-left active:scale-[0.99]">
            <span className="text-xl">🔔</span>
            <div className="flex-1">
              <p className="text-sm font-semibold">Activar notificaciones</p>
              <p className="text-xs text-slate-500">Dudas urgentes y recordatorios de ventana/Daily.</p>
            </div>
            <span className="chip bg-brand text-white">Activar</span>
          </button>
        )}
        {pushState === 'on' && (
          <div className="card flex items-center gap-3 p-3">
            <span className="text-xl">🔔</span>
            <p className="flex-1 text-sm text-slate-300">Notificaciones activas</p>
            <span className="chip bg-ok/20 text-ok">✓</span>
          </div>
        )}

        <button onClick={syncCalendar} disabled={calState === 'busy'} className="card flex w-full items-center gap-3 p-3 text-left active:scale-[0.99]">
          <span className="text-xl">📅</span>
          <div className="flex-1">
            <p className="text-sm font-semibold">Sincronizar plantilla a Calendar</p>
            <p className="text-xs text-slate-500">
              {calState === 'done' || calState === 'error' ? calMsg : 'Crea los bloques como eventos "ocupado" recurrentes.'}
            </p>
          </div>
          <span className={`chip ${calState === 'done' ? 'bg-ok/20 text-ok' : 'bg-ink-700 text-slate-300'}`}>
            {calState === 'busy' ? '…' : calState === 'done' ? '✓' : 'Sincronizar'}
          </span>
        </button>
      </div>
    </section>
  );
}
