export default function Offline() {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center px-6 text-center safe-top safe-bottom">
      <div className="card w-full max-w-sm p-8">
        <div className="mx-auto mb-4 text-4xl">📡</div>
        <h1 className="text-xl font-bold">Sin conexión</h1>
        <p className="mt-3 text-sm text-slate-400">
          No hay internet. Focus volverá cuando recuperes la señal.
        </p>
      </div>
    </main>
  );
}
