export default function AccesoRestringido() {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center px-6 text-center safe-top safe-bottom">
      <div className="card w-full max-w-sm p-8 animate-slideUp">
        <div className="mx-auto mb-4 text-4xl">🔒</div>
        <h1 className="text-xl font-bold">Acceso restringido</h1>
        <p className="mt-3 text-sm text-slate-400">
          Esta plataforma es una herramienta personal del COO de T1. Tu cuenta no está en la lista de
          acceso.
        </p>
        <a href="/login" className="btn-ghost mt-6 w-full">
          Volver
        </a>
      </div>
    </main>
  );
}
