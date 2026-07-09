import type { SupabaseClient, User } from '@supabase/supabase-js';
import { createSupabaseAdmin } from './supabase/admin';
import { DEFAULT_BLOCKS, DEFAULT_PRIORIDADES } from './defaults';

// Crea la fila de usuario y siembra la plantilla del día + prioridades
// la primera vez que el COO entra (spec §3.1 / §3.3).
export async function ensureUserBootstrap(supabase: SupabaseClient, user: User): Promise<void> {
  const admin = createSupabaseAdmin();
  const email = (user.email ?? '').toLowerCase();
  const nombre = (user.user_metadata?.full_name as string) || (user.user_metadata?.name as string) || email;

  // 1. Perfil de usuario.
  await admin.from('users').upsert(
    { id: user.id, email, nombre, rol: 'coo' },
    { onConflict: 'id' }
  );

  // 2. Bloques del día (solo si no tiene).
  const { count: blockCount } = await admin
    .from('day_blocks')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', user.id);

  if (!blockCount) {
    await admin.from('day_blocks').insert(
      DEFAULT_BLOCKS.map((b, i) => ({
        user_id: user.id,
        hora_ini: b.hora_ini,
        hora_fin: b.hora_fin,
        label: b.label,
        tipo: b.tipo,
        orden: i,
      }))
    );
  }

  // 3. Prioridades (solo si no tiene).
  const { count: prioCount } = await admin
    .from('prioridades')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', user.id);

  if (!prioCount) {
    await admin.from('prioridades').insert(
      DEFAULT_PRIORIDADES.map((p, i) => ({
        user_id: user.id,
        tier: p.tier,
        texto: p.texto,
        orden: i,
      }))
    );
  }
}

// Devuelve el user_id del COO (para contextos sin sesión: Slack, worker, cron).
export async function getCooUserId(): Promise<string | null> {
  const admin = createSupabaseAdmin();
  const { data } = await admin.from('users').select('id').eq('rol', 'coo').limit(1).maybeSingle();
  return data?.id ?? null;
}

// Devuelve el slack_user_id del COO (para DMs de recordatorios).
export async function getCooSlackId(): Promise<string | null> {
  const admin = createSupabaseAdmin();
  const { data } = await admin.from('users').select('slack_user_id').eq('rol', 'coo').limit(1).maybeSingle();
  return data?.slack_user_id ?? null;
}
