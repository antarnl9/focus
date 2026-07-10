import type { SupabaseClient } from '@supabase/supabase-js';
import type { PersonaTipo, EventAttendee } from '@/lib/types';

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

// Asegura que exista una persona por cada invitado de una junta (crea las que
// falten) y devuelve sus ids. Los del dominio T1 quedan 'interno'; los externos
// (entrevistas, clientes, etc.) quedan 'otro' con su correo real — se pueden
// re-etiquetar después en el directorio.
export async function ensurePersonasFromAttendees(
  supabase: SupabaseClient,
  userId: string,
  attendees: EventAttendee[]
): Promise<string[]> {
  const uniq = new Map<string, EventAttendee>();
  for (const a of attendees) {
    const email = (a.email ?? '').toLowerCase();
    if (email) uniq.set(email, a);
  }
  const emails = [...uniq.keys()];
  if (!emails.length) return [];

  const { data: existing } = await supabase.from('personas').select('id, correo').in('correo', emails);
  const byEmail = new Map((existing ?? []).map((p) => [(p.correo ?? '').toLowerCase(), p.id as string]));

  const ids: string[] = [];
  const toCreate: { user_id: string; nombre: string; correo: string; tipo: PersonaTipo }[] = [];
  for (const [email, a] of uniq) {
    const found = byEmail.get(email);
    if (found) {
      ids.push(found);
    } else {
      toCreate.push({
        user_id: userId,
        nombre: a.nombre || email.split('@')[0],
        correo: a.email,
        tipo: email.endsWith(`@${DOMAIN}`) ? 'interno' : 'otro',
      });
    }
  }
  if (toCreate.length) {
    const { data: created } = await supabase.from('personas').insert(toCreate).select('id');
    for (const c of created ?? []) ids.push(c.id as string);
  }
  return ids;
}
