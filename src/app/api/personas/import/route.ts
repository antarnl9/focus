import { NextResponse } from 'next/server';
import { requireUser } from '@/lib/auth';
import { env } from '@/lib/env';
import { listAttendees } from '@/lib/google';
import { localDateStr, addDaysStr } from '@/lib/time';
import type { PersonaTipo } from '@/lib/types';

export interface Candidato {
  nombre: string;
  correo: string | null;
  slack_user_id: string | null;
  tipo: PersonaTipo;
  fuente: 'calendar' | 'slack';
}

// GET: candidatos para importar (invitados de Calendar + autores de dudas de Slack),
// descartando los que ya están en el directorio.
export async function GET() {
  const auth = await requireUser();
  if (!auth.ok) return auth.response;
  const { supabase, user } = auth;
  const domain = env.hostedDomain;
  const miCorreo = (user.email ?? '').toLowerCase();

  // Existentes (para deduplicar).
  const { data: existentes } = await supabase.from('personas').select('correo, slack_user_id, nombre').eq('user_id', user.id);
  const correos = new Set((existentes ?? []).map((p) => (p.correo ?? '').toLowerCase()).filter(Boolean));
  const slacks = new Set((existentes ?? []).map((p) => p.slack_user_id).filter(Boolean));
  const nombres = new Set((existentes ?? []).map((p) => (p.nombre ?? '').toLowerCase()));

  const candidatos: Candidato[] = [];
  const vistosCorreo = new Set<string>();
  const vistosSlack = new Set<string>();

  // Calendar: invitados de los últimos 60 días.
  const hoy = localDateStr();
  const attendees = await listAttendees(user.id, addDaysStr(hoy, -60), hoy).catch(() => []);
  for (const a of attendees) {
    const email = a.email.toLowerCase();
    if (email === miCorreo || correos.has(email) || vistosCorreo.has(email)) continue;
    vistosCorreo.add(email);
    candidatos.push({
      nombre: a.nombre,
      correo: a.email,
      slack_user_id: null,
      tipo: email.endsWith(`@${domain}`) ? 'interno' : 'cliente',
      fuente: 'calendar',
    });
  }

  // Slack: autores de dudas que aún no son personas.
  const { data: dudas } = await supabase
    .from('dudas')
    .select('autor_id, autor_nombre')
    .eq('user_id', user.id)
    .not('autor_id', 'is', null);
  for (const d of dudas ?? []) {
    const sid = d.autor_id as string;
    if (!sid || slacks.has(sid) || vistosSlack.has(sid)) continue;
    if (d.autor_nombre && nombres.has(d.autor_nombre.toLowerCase())) continue;
    vistosSlack.add(sid);
    candidatos.push({
      nombre: d.autor_nombre || sid,
      correo: null,
      slack_user_id: sid,
      tipo: 'interno',
      fuente: 'slack',
    });
  }

  return NextResponse.json({ candidatos });
}

// POST: importa los seleccionados.
export async function POST(request: Request) {
  const auth = await requireUser();
  if (!auth.ok) return auth.response;
  const { supabase, user } = auth;

  const { personas } = (await request.json()) as { personas: Candidato[] };
  if (!personas?.length) return NextResponse.json({ imported: 0 });

  const rows = personas.map((p) => ({
    user_id: user.id,
    nombre: p.nombre,
    correo: p.correo,
    slack_user_id: p.slack_user_id,
    tipo: p.tipo,
  }));
  const { error } = await supabase.from('personas').insert(rows);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ imported: rows.length });
}
