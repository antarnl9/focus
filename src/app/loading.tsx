// Se muestra al instante mientras el home carga (evita la pantalla en blanco).
export default function Loading() {
  return (
    <div className="flex min-h-dvh animate-pulse flex-col bg-ink-950">
      <header className="border-b border-ink-800 px-4 pb-3 pt-3 safe-top">
        <div className="h-3 w-24 rounded bg-ink-800" />
        <div className="mt-2 h-6 w-44 rounded bg-ink-800" />
        <div className="mt-3 grid grid-cols-2 gap-2">
          <div className="h-14 rounded-xl bg-ink-900" />
          <div className="h-14 rounded-xl bg-ink-900" />
        </div>
      </header>

      <main className="flex-1 space-y-2 px-4 pt-4">
        <div className="mb-1 h-3 w-28 rounded bg-ink-800" />
        {[0, 1, 2, 3, 4, 5].map((i) => (
          <div key={i} className="h-14 rounded-xl bg-ink-900/70" />
        ))}
      </main>

      <div className="grid place-items-center gap-2 pb-10">
        <span className="grid h-10 w-10 place-items-center rounded-2xl bg-gradient-to-br from-brand to-brand-deep text-xl text-white">✦</span>
        <span className="text-xs text-slate-600">Cargando tu día…</span>
      </div>
    </div>
  );
}
