'use client';

export type Tab = 'hoy' | 'dudas' | 'bitacora' | 'juntas' | 'daily';

const TABS: { id: Tab; label: string; icon: string }[] = [
  { id: 'hoy', label: 'Hoy', icon: '🗓️' },
  { id: 'dudas', label: 'Dudas', icon: '❓' },
  { id: 'juntas', label: 'Juntas', icon: '🎙️' },
  { id: 'bitacora', label: 'Bitácora', icon: '📖' },
  { id: 'daily', label: 'Daily', icon: '📊' },
];

export function BottomNav({
  tab,
  setTab,
  pendientes,
  urgentes,
}: {
  tab: Tab;
  setTab: (t: Tab) => void;
  pendientes: number;
  urgentes: number;
}) {
  return (
    <nav className="fixed inset-x-0 bottom-0 z-30 border-t border-ink-800 bg-ink-950/95 backdrop-blur safe-bottom">
      <div className="mx-auto grid max-w-lg grid-cols-5">
        {TABS.map((t) => {
          const active = tab === t.id;
          return (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`relative flex flex-col items-center gap-0.5 py-2.5 text-[10px] font-medium transition ${
                active ? 'text-brand-soft' : 'text-slate-500'
              }`}
            >
              <span className="text-xl leading-none">{t.icon}</span>
              <span>{t.label}</span>
              {t.id === 'dudas' && pendientes > 0 && (
                <span
                  className={`absolute right-[22%] top-1 grid h-4 min-w-4 place-items-center rounded-full px-1 text-[9px] font-bold text-white ${
                    urgentes > 0 ? 'bg-urgent' : 'bg-brand'
                  }`}
                >
                  {pendientes}
                </span>
              )}
              {active && <span className="absolute -top-px h-0.5 w-8 rounded-full bg-brand-soft" />}
            </button>
          );
        })}
      </div>
    </nav>
  );
}
