import type { PersonaTipo } from '@/lib/types';

export const DOMAIN = process.env.NEXT_PUBLIC_GOOGLE_HOSTED_DOMAIN || 't1.com';

export const TIPO_META: Record<PersonaTipo, { label: string; icon: string; tone: string }> = {
  interno: { label: 'T1', icon: '🏢', tone: 'bg-brand/20 text-brand-soft' },
  cliente: { label: 'Cliente', icon: '🤝', tone: 'bg-ok/20 text-ok' },
  proveedor: { label: 'Proveedor', icon: '📦', tone: 'bg-warn/20 text-warn' },
  otro: { label: 'Otro', icon: '•', tone: 'bg-ink-700 text-slate-400' },
};

// Si es interno y escribió solo el usuario, completa @dominio.
export function normalizeCorreo(correo: string, tipo: PersonaTipo): string | null {
  const c = correo.trim();
  if (!c) return null;
  if (tipo === 'interno' && !c.includes('@')) return `${c}@${DOMAIN}`;
  return c;
}
