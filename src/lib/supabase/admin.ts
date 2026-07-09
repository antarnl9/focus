import { createClient } from '@supabase/supabase-js';
import { env } from '../env';

// Cliente con service role — OMITE RLS. Úsalo SOLO en servidor/worker para
// escribir dudas que llegan de Slack, jobs, etc. Nunca en el cliente.
export function createSupabaseAdmin() {
  return createClient(env.supabaseUrl(), env.supabaseServiceKey(), {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
