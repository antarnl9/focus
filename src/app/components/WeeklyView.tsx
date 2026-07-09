'use client';

import { useMemo, useState } from 'react';
import type { WeeklyMetrics } from '@/lib/metrics';
import type { DayBlock, Grabacion, Prioridad } from '@/lib/types';
import { prettyTime } from '@/lib/time';

export function WeeklyView({
  metrics,
  blocks,
  grabaciones,
  prioridades,
}: {
  metrics: WeeklyMetrics;
  blocks: DayBlock[];
  grabaciones: Grabacion[];
  prioridades: Prioridad[];
}) {
  const [review, setReview] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showPlantilla, setShowPlantilla] = useState(false);

  const juntas = useMemo(() => {
    const map = new Map<string, number>();
    for (const g of grabaciones) map.set(g.label, (map.get(g.label) ?? 0) + 1);
    return [...map.entries()].map(([label, veces]) => ({ label, veces })).sort((a, b) => b.veces - a.veces);
  }, [grabaciones]);

  const hechas = prioridades.filter((p) => p.done);
  const pendientes = prioridades.filter((p) => !p.done);

  async function generar() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/semana/review', { method: 'POST' });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Error');
      setReview(json.review);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-6">
      {/* Métricas (spec §9 Fase 4, punto 12) */}
      <section>
        <h2 className="mb-2 text-sm font-bold uppercase tracking-wide text-slate-400">Métricas de la semana</h2>
        <div className="grid grid-cols-2 gap-2">
          <Metric label="Dudas creadas" value={String(metrics.dudasCreadas)} sub={`${metrics.dudasPendientes} pendientes`} />
          <Metric label="Dudas resueltas" value={String(metrics.dudasResueltas)} sub={`${metrics.dudasRedirigidas} redirigidas`} tone="ok" />
          <Metric
            label="Tiempo a resolución"
            value={metrics.tiempoPromedioMin !== null ? fmtDur(metrics.tiempoPromedioMin) : '—'}
            sub="promedio"
          />
          <Metric
            label="% en ventana"
            value={metrics.pctEnVentana !== null ? `${metrics.pctEnVentana}%` : '—'}
            sub={`${metrics.resueltasEnVentana} vs ${metrics.resueltasInterrupcion} interrup.`}
            tone={metrics.pctEnVentana !== null && metrics.pctEnVentana >= 60 ? 'ok' : 'warn'}
          />
        </div>

        {/* Cumplimiento de bloques protegidos */}
        <div className="card mt-2 p-3">
          <div className="flex items-center justify-between">
            <p className="text-sm font-semibold">Bloques protegidos respetados</p>
            <span
              className={`chip ${
                metrics.cumplimientoProtegido === null
                  ? 'bg-ink-700 text-slate-400'
                  : metrics.cumplimientoProtegido >= 80
                  ? 'bg-ok/20 text-ok'
                  : 'bg-warn/20 text-warn'
              }`}
            >
              {metrics.cumplimientoProtegido !== null ? `${metrics.cumplimientoProtegido}%` : 'Conecta Calendar'}
            </span>
          </div>
          {metrics.cumplimientoProtegido !== null && (
            <>
              <div className="mt-2 h-2 overflow-hidden rounded-full bg-ink-700">
                <div
                  className={`h-full ${metrics.cumplimientoProtegido >= 80 ? 'bg-ok' : 'bg-warn'}`}
                  style={{ width: `${metrics.cumplimientoProtegido}%` }}
                />
              </div>
              <p className="mt-1 text-xs text-slate-500">
                {metrics.bloquesInvadidos} de {metrics.bloquesProtegidos} bloques con evento externo encima.
              </p>
            </>
          )}
        </div>

        {/* Redirigidas por owner */}
        {metrics.porOwner.length > 0 && (
          <div className="card mt-2 p-3">
            <p className="mb-2 text-sm font-semibold">Redirigidas por owner</p>
            <div className="space-y-1.5">
              {metrics.porOwner.map((o) => (
                <div key={o.owner} className="flex items-center gap-2">
                  <span className="w-20 shrink-0 truncate text-xs text-slate-400">{o.owner}</span>
                  <div className="h-2 flex-1 overflow-hidden rounded-full bg-ink-700">
                    <div className="h-full bg-brand" style={{ width: `${barWidth(o.count, metrics.porOwner)}%` }} />
                  </div>
                  <span className="w-6 text-right text-xs text-slate-300">{o.count}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </section>

      {/* Juntas de la semana (candidatas a matar) */}
      <section>
        <h2 className="mb-2 text-sm font-bold uppercase tracking-wide text-slate-400">Juntas de la semana</h2>
        <div className="space-y-1.5">
          {juntas.map((j) => (
            <div key={j.label} className="card flex items-center gap-3 px-3 py-2.5">
              <span className="text-lg">🎙️</span>
              <span className="min-w-0 flex-1 truncate text-sm">{j.label}</span>
              <span className={`chip ${j.veces >= 3 ? 'bg-warn/20 text-warn' : 'bg-ink-700 text-slate-400'}`}>{j.veces}x</span>
            </div>
          ))}
          {juntas.length === 0 && <p className="card p-4 text-center text-sm text-slate-500">Sin juntas grabadas esta semana.</p>}
        </div>
      </section>

      {/* Prioridades */}
      <section>
        <h2 className="mb-2 text-sm font-bold uppercase tracking-wide text-slate-400">Prioridades</h2>
        <div className="grid grid-cols-2 gap-2">
          <Metric label="Completadas" value={String(hechas.length)} tone="ok" />
          <Metric label="Pendientes" value={String(pendientes.length)} tone={pendientes.length ? 'warn' : 'ok'} />
        </div>
      </section>

      {/* Revisión de viernes con IA (spec §9 Fase 4, punto 13) */}
      <section>
        <h2 className="mb-2 text-sm font-bold uppercase tracking-wide text-slate-400">Revisión de viernes</h2>
        <button onClick={generar} disabled={loading} className="btn-primary w-full">
          {loading ? 'Analizando la semana…' : review ? '↻ Regenerar revisión' : '🧠 Generar revisión de viernes'}
        </button>
        {error && <p className="mt-2 text-sm text-urgent">{error}</p>}
        {review && (
          <div className="card mt-3 whitespace-pre-wrap p-4 text-sm leading-relaxed text-slate-200">{review}</div>
        )}
      </section>

      {/* Plantilla activa (colapsable) */}
      <section>
        <button
          onClick={() => setShowPlantilla((v) => !v)}
          className="flex w-full items-center justify-between text-sm font-bold uppercase tracking-wide text-slate-400"
        >
          <span>Plantilla del día (L–V)</span>
          <span>{showPlantilla ? '▲' : '▼'}</span>
        </button>
        {showPlantilla && (
          <div className="mt-2 space-y-1">
            {blocks.map((b) => (
              <div key={b.id} className="flex items-center gap-2 rounded-lg border border-ink-700 bg-ink-800/50 px-3 py-2 text-xs">
                <span className="w-24 shrink-0 text-slate-400">
                  {prettyTime(b.hora_ini)}–{prettyTime(b.hora_fin)}
                </span>
                <span className="truncate text-slate-200">{b.label}</span>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

function Metric({ label, value, sub, tone }: { label: string; value: string; sub?: string; tone?: 'ok' | 'warn' }) {
  const color = tone === 'ok' ? 'text-ok' : tone === 'warn' ? 'text-warn' : 'text-slate-100';
  return (
    <div className="card p-3">
      <p className="text-[10px] uppercase tracking-wide text-slate-500">{label}</p>
      <p className={`mt-1 text-2xl font-bold ${color}`}>{value}</p>
      {sub && <p className="text-xs text-slate-500">{sub}</p>}
    </div>
  );
}

function fmtDur(min: number): string {
  if (min < 60) return `${min}m`;
  const h = Math.floor(min / 60);
  const m = min % 60;
  return m ? `${h}h ${m}m` : `${h}h`;
}

function barWidth(count: number, all: { count: number }[]): number {
  const max = Math.max(...all.map((a) => a.count), 1);
  return Math.round((count / max) * 100);
}
