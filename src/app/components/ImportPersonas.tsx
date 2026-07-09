'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { Candidato } from '@/app/api/personas/import/route';
import { TIPO_META } from './persona-util';

export function ImportPersonas() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [candidatos, setCandidatos] = useState<Candidato[]>([]);
  const [sel, setSel] = useState<Set<number>>(new Set());
  const [importing, setImporting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch('/api/personas/import');
        const json = await res.json();
        if (!res.ok) throw new Error(json.error || 'Error');
        setCandidatos(json.candidatos as Candidato[]);
        setSel(new Set((json.candidatos as Candidato[]).map((_, i) => i))); // todos por defecto
      } catch (e) {
        setError((e as Error).message);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  function toggle(i: number) {
    setSel((prev) => {
      const n = new Set(prev);
      if (n.has(i)) n.delete(i);
      else n.add(i);
      return n;
    });
  }

  async function importar() {
    setImporting(true);
    setError(null);
    try {
      const personas = candidatos.filter((_, i) => sel.has(i));
      const res = await fetch('/api/personas/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ personas }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Error');
      router.push('/personas');
      router.refresh();
    } catch (e) {
      setError((e as Error).message);
      setImporting(false);
    }
  }

  if (loading) return <p className="card p-6 text-center text-sm text-slate-500">Buscando en Calendar y Slack…</p>;

  if (error) return <p className="card p-4 text-center text-sm text-urgent">{error}</p>;

  if (candidatos.length === 0)
    return (
      <div className="card p-6 text-center">
        <div className="text-3xl">✅</div>
        <p className="mt-2 text-sm text-slate-400">
          No hay personas nuevas por importar. Ya están todas, o no hay invitados en Calendar / autores de dudas en Slack.
        </p>
      </div>
    );

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-slate-400">Encontré {candidatos.length} posibles personas.</p>
        <button
          onClick={() => setSel(sel.size === candidatos.length ? new Set() : new Set(candidatos.map((_, i) => i)))}
          className="chip bg-ink-700 text-slate-300"
        >
          {sel.size === candidatos.length ? 'Ninguna' : 'Todas'}
        </button>
      </div>

      <div className="space-y-2">
        {candidatos.map((c, i) => (
          <button key={i} onClick={() => toggle(i)} className="card flex w-full items-center gap-3 p-3 text-left active:scale-[0.99]">
            <span
              className={`grid h-6 w-6 shrink-0 place-items-center rounded-md border ${
                sel.has(i) ? 'border-brand bg-brand text-white' : 'border-ink-600'
              }`}
            >
              {sel.has(i) ? '✓' : ''}
            </span>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <p className="truncate text-sm font-semibold">{c.nombre}</p>
                <span className={`chip ${TIPO_META[c.tipo]?.tone}`}>{TIPO_META[c.tipo]?.label}</span>
              </div>
              <p className="truncate text-xs text-slate-500">
                {c.fuente === 'calendar' ? '📅 ' : '💬 '}
                {c.correo || c.slack_user_id}
              </p>
            </div>
          </button>
        ))}
      </div>

      <button onClick={importar} disabled={importing || sel.size === 0} className="btn-primary w-full">
        {importing ? 'Importando…' : `Importar ${sel.size} persona${sel.size === 1 ? '' : 's'}`}
      </button>
      <p className="text-center text-[11px] text-slate-600">
        Después puedes completar puesto, Slack y descripción en cada perfil.
      </p>
    </div>
  );
}
