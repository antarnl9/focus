'use client';

import { useEffect, useState } from 'react';

// Interruptor de tema oscuro/claro. Persiste en localStorage.
export function ThemeToggle() {
  const [theme, setTheme] = useState<'dark' | 'light'>('dark');

  useEffect(() => {
    const t = (localStorage.getItem('focus-theme') as 'dark' | 'light') || 'dark';
    setTheme(t);
  }, []);

  function toggle() {
    const next = theme === 'dark' ? 'light' : 'dark';
    setTheme(next);
    document.documentElement.dataset.theme = next;
    try {
      localStorage.setItem('focus-theme', next);
    } catch {
      /* noop */
    }
  }

  return (
    <button
      onClick={toggle}
      className="rounded-full border border-ink-700 px-2.5 py-1.5 text-xs text-slate-300 active:scale-95"
      aria-label="Cambiar tema"
      title={theme === 'dark' ? 'Modo claro' : 'Modo oscuro'}
    >
      {theme === 'dark' ? '☀️' : '🌙'}
    </button>
  );
}
