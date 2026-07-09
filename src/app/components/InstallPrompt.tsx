'use client';

import { useEffect, useState } from 'react';

// Sugerencia de instalación de la PWA + activación de notificaciones push.
export function InstallPrompt() {
  const [deferred, setDeferred] = useState<any>(null);
  const [show, setShow] = useState(false);

  useEffect(() => {
    const onPrompt = (e: Event) => {
      e.preventDefault();
      setDeferred(e);
      // No molestar si ya está instalada.
      if (!window.matchMedia('(display-mode: standalone)').matches) setShow(true);
    };
    window.addEventListener('beforeinstallprompt', onPrompt);
    return () => window.removeEventListener('beforeinstallprompt', onPrompt);
  }, []);

  async function install() {
    if (!deferred) return;
    deferred.prompt();
    await deferred.userChoice;
    setShow(false);
    setDeferred(null);
  }

  if (!show) return null;

  return (
    <div className="fixed inset-x-3 bottom-20 z-40 animate-slideUp">
      <div className="card mx-auto flex max-w-lg items-center gap-3 p-3">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/icons/icon.svg" alt="" className="h-9 w-9" />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold">Instala Focus</p>
          <p className="text-xs text-slate-400">Ábrelo como app desde tu pantalla de inicio.</p>
        </div>
        <button onClick={() => setShow(false)} className="chip bg-ink-700 text-slate-400">
          Ahora no
        </button>
        <button onClick={install} className="btn-primary px-3 py-2 text-sm">
          Instalar
        </button>
      </div>
    </div>
  );
}
