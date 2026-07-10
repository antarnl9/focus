'use client';

export type Tab = 'hoy' | 'dudas' | 'juntas' | 'slack' | 'bitacora' | 'daily';

const TABS: { id: Tab; label: string; icon: string }[] = [
  { id: 'hoy', label: 'Hoy', icon: '🗓️' },
  { id: 'dudas', label: 'Dudas', icon: '❓' },
  { id: 'juntas', label: 'Juntas', icon: '🎙️' },
  { id: 'slack', label: 'Slack', icon: '💬' },
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
      <div className="mx-auto flex max-w-lg items-stretch justify-around px-1 pt-1.5">
        {TABS.map((t) => {
          const active = tab === t.id;
          return (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              aria-label={t.label}
              aria-current={active ? 'page' : undefined}
              className="flex flex-1 flex-col items-center gap-1 pb-1.5 pt-1 transition active:scale-90"
            >
              <span
                className={`relative grid h-9 w-14 place-items-center rounded-2xl text-2xl leading-none transition ${
                  active ? 'bg-brand-deep/40 text-brand-soft shadow-pop' : 'text-slate-500'
                }`}
              >
                {t.icon}
                {t.id === 'dudas' && pendientes > 0 && (
                  <span
                    className={`absolute right-1.5 top-0.5 grid h-4 min-w-4 place-items-center rounded-full px-1 text-[9px] font-bold text-white ring-2 ring-ink-950 ${
                      urgentes > 0 ? 'bg-urgent' : 'bg-brand'
                    }`}
                  >
                    {pendientes}
                  </span>
                )}
              </span>
              <span className={`text-[10px] font-semibold leading-none ${active ? 'text-brand-soft' : 'text-slate-500'}`}>
                {t.label}
              </span>
            </button>
          );
        })}
      </div>
    </nav>
  );
}
