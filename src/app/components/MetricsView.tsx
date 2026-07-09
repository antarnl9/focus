'use client';

import { useCallback, useEffect, useState } from 'react';
import type { Metrics } from '@/lib/metrics';
import type { CoachResult } from '@/lib/anthropic';
import { localDateStr, addDaysStr } from '@/lib/time';

type Preset = '7' | '30' | 'mes' | 'custom';

export function MetricsView() {
  const today = localDateStr();
  const [preset, setPreset] = useState<Preset>('7');
  const [desde, setDesde] = useState(addDaysStr(today, -6));
  const [hasta, setHasta] = useState(today);
  const [metrics, setMetrics] = useState<Metrics | null>(null);
  const [loading, setLoading] = useState(true);

  const [coach, setCoach] = useState<CoachResult | null>(null);
  const [coachLoading, setCoachLoading] = useState(false);
  const [coachError, setCoachError] = useState<string | null>(null);

  function applyPreset(p: Preset) {
    setPreset(p);
    setCoach(null);
    if (p === '7') {
      setDesde(addDaysStr(today, -6));
      setHasta(today);
    } else if (p === '30') {
      setDesde(addDaysStr(today, -29));
      setHasta(today);
    } else if (p === 'mes') {
      setDesde(today.slice(0, 8) + '01');
      setHasta(today);
    }
  }

  const fetchMetrics = useCallback(async () => {
    setLoading(true);
    const res = await fetch(`/api/metrics?desde=${desde}&hasta=${hasta}`);
    const json = await res.json();
    if (res.ok) setMetrics(json as Metrics);
    setLoading(false);
  }, [desde, hasta]);

  useEffect(() => {
    fetchMetrics();
  }, [fetchMetrics]);

  async function runCoach() {
    setCoachLoading(true);
    setCoachError(null);
    try {
      const res = await fetch('/api/metrics/coach', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ desde, hasta }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Error');
      setCoach(json.coach as CoachResult);
    } catch (e) {
      setCoachError((e as Error).message);
    } finally {
      setCoachLoading(false);
    }
  }

  return (
    <div className="space-y-6">
      {/* Selector de rango */}
      <section>
        <div className="mb-2 flex flex-wrap gap-2">
          {([
            ['7', '7 días'],
            ['30', '30 días'],
            ['mes', 'Este mes'],
            ['custom', 'Personalizado'],
          ] as [Preset, string][]).map(([p, label]) => (
            <button
              key={p}
              onClick={() => applyPreset(p)}
              className={`chip ${preset === p ? 'bg-brand text-white' : 'bg-ink-800 text-slate-400'}`}
            >
              {label}
            </button>
          ))}
        </div>
        {preset === 'custom' && (
          <div className="flex items-center gap-2">
            <input type="date" value={desde} max={hasta} onChange={(e) => { setDesde(e.target.value); setCoach(null); }} className="flex-1 rounded-lg bg-ink-900 px-2 py-2 text-sm outline-none ring-1 ring-ink-700 focus:ring-brand" />
            <span className="text-slate-500">→</span>
            <input type="date" value={hasta} max={today} onChange={(e) => { setHasta(e.target.value); setCoach(null); }} className="flex-1 rounded-lg bg-ink-900 px-2 py-2 text-sm outline-none ring-1 ring-ink-700 focus:ring-brand" />
          </div>
        )}
        <p className="mt-1 text-xs text-slate-600">{desde} → {hasta}</p>
      </section>

      {/* Métricas */}
      {loading || !metrics ? (
        <p className="card p-6 text-center text-sm text-slate-500">Calculando…</p>
      ) : (
        <section>
          <div className="grid grid-cols-2 gap-2">
            <Metric label="Dudas creadas" value={String(metrics.dudasCreadas)} sub={`${metrics.dudasPendientes} pendientes ahora`} />
            <Metric label="Dudas resueltas" value={String(metrics.dudasResueltas)} sub={`${metrics.dudasRedirigidas} redirigidas`} tone="ok" />
            <Metric label="Tiempo a resolución" value={metrics.tiempoPromedioMin !== null ? fmtDur(metrics.tiempoPromedioMin) : '—'} sub="promedio" />
            <Metric label="% en ventana" value={metrics.pctEnVentana !== null ? `${metrics.pctEnVentana}%` : '—'} sub={`${metrics.resueltasEnVentana} vs ${metrics.resueltasInterrupcion} interrup.`} tone={metrics.pctEnVentana !== null && metrics.pctEnVentana >= 60 ? 'ok' : 'warn'} />
          </div>

          <div className="card mt-2 p-3">
            <div className="flex items-center justify-between">
              <p className="text-sm font-semibold">Bloques protegidos respetados</p>
              <span className={`chip ${metrics.cumplimientoProtegido === null ? 'bg-ink-700 text-slate-400' : metrics.cumplimientoProtegido >= 80 ? 'bg-ok/20 text-ok' : 'bg-warn/20 text-warn'}`}>
                {metrics.cumplimientoProtegido !== null ? `${metrics.cumplimientoProtegido}%` : 'Conecta Calendar'}
              </span>
            </div>
            {metrics.cumplimientoProtegido !== null && (
              <p className="mt-1 text-xs text-slate-500">{metrics.bloquesInvadidos} de {metrics.bloquesProtegidos} con evento externo encima.</p>
            )}
          </div>

          {metrics.porOwner.length > 0 && (
            <div className="card mt-2 p-3">
              <p className="mb-2 text-sm font-semibold">Redirigidas por owner</p>
              <div className="space-y-1.5">
                {metrics.porOwner.map((o) => (
                  <div key={o.owner} className="flex items-center gap-2">
                    <span className="w-20 shrink-0 truncate text-xs text-slate-400">{o.owner}</span>
                    <div className="h-2 flex-1 overflow-hidden rounded-full bg-ink-700">
                      <div className="h-full bg-brand" style={{ width: `${(o.count / Math.max(...metrics.porOwner.map((x) => x.count), 1)) * 100}%` }} />
                    </div>
                    <span className="w-6 text-right text-xs text-slate-300">{o.count}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </section>
      )}

      {/* Coach de alineación */}
      <section>
        <h2 className="mb-2 text-sm font-bold uppercase tracking-wide text-slate-400">Coach de alineación</h2>
        <p className="mb-2 text-sm text-slate-400">¿Tu tiempo va alineado a tus prioridades y tu objetivo?</p>
        <button onClick={runCoach} disabled={coachLoading} className="btn-primary w-full">
          {coachLoading ? 'Analizando…' : coach ? '↻ Volver a analizar' : '🧭 Analizar mi alineación'}
        </button>
        {coachError && <p className="mt-2 text-sm text-urgent">{coachError}</p>}
        {coach && <CoachCard coach={coach} />}
      </section>
    </div>
  );
}

function CoachCard({ coach }: { coach: CoachResult }) {
  const tone =
    coach.veredicto === 'alineado' ? 'bg-ok/20 text-ok' : coach.veredicto === 'parcial' ? 'bg-warn/20 text-warn' : 'bg-urgent/20 text-urgent';
  const emoji = coach.veredicto === 'alineado' ? '✅' : coach.veredicto === 'parcial' ? '🟡' : '🔴';
  return (
    <div className="card mt-3 space-y-3 p-4">
      <div className="flex items-center gap-2">
        <span className="text-xl">{emoji}</span>
        <span className={`chip ${tone} capitalize`}>{coach.veredicto}</span>
      </div>
      <p className="text-sm text-slate-200">{coach.resumen}</p>
      {coach.bien?.length > 0 && (
        <div>
          <p className="text-[10px] uppercase tracking-wide text-slate-500">Vas bien en</p>
          <ul className="mt-1 space-y-1">
            {coach.bien.map((x, i) => (
              <li key={i} className="text-sm text-slate-300">✅ {x}</li>
            ))}
          </ul>
        </div>
      )}
      {coach.ajusta?.length > 0 && (
        <div>
          <p className="text-[10px] uppercase tracking-wide text-slate-500">Ajusta</p>
          <ul className="mt-1 space-y-1">
            {coach.ajusta.map((x, i) => (
              <li key={i} className="text-sm text-slate-300">⚠️ {x}</li>
            ))}
          </ul>
        </div>
      )}
      {coach.siguiente_paso && (
        <div className="rounded-lg border border-brand/40 bg-brand-deep/20 p-3">
          <p className="text-[10px] uppercase tracking-wide text-brand-soft">Siguiente paso</p>
          <p className="mt-0.5 text-sm text-slate-100">🎯 {coach.siguiente_paso}</p>
        </div>
      )}
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
