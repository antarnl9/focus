'use client';

import { useEffect, useState } from 'react';

// Tu daily personal (formato ✅/🔄/🎯/⚠️), en Métricas. Se genera junto con el CEO Brief.
export function DailyPersonal() {
  const [contenido, setContenido] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [gen, setGen] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch('/api/daily?tipo=personal')
      .then((r) => r.json())
      .then((j) => setContenido(j.contenido ?? null))
      .finally(() => setLoading(false));
  }, []);

  async function generar() {
    setGen(true);
    setError(null);
    try {
      const r = await fetch('/api/daily/generate', { method: 'POST' });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || 'Error');
      setContenido(j.personal);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setGen(false);
    }
  }

  return (
    <section>
      <h2 className="mb-2 text-sm font-bold uppercase tracking-wide text-slate-400">Tu daily personal</h2>
      <p className="mb-2 text-sm text-slate-400">Tu cierre del día (resuelto, en curso, mañana, riesgos). Solo para ti.</p>
      <button onClick={generar} disabled={gen} className="btn-primary w-full">
        {gen ? 'Generando…' : contenido ? '↻ Actualizar' : '✨ Generar mi daily'}
      </button>
      {error && <p className="mt-2 text-sm text-urgent">{error}</p>}
      {loading ? (
        <p className="mt-3 text-center text-sm text-slate-500">Cargando…</p>
      ) : contenido ? (
        <div className="card mt-3 whitespace-pre-wrap p-4 text-sm leading-relaxed text-slate-200">{contenido}</div>
      ) : (
        <p className="mt-3 text-center text-xs text-slate-600">Aún no generas tu daily de hoy.</p>
      )}
    </section>
  );
}
