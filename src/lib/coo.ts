import type { SupabaseClient } from '@supabase/supabase-js';
import type { CooProfile } from './types';

// Perfil del COO (quién es + su objetivo). Alimenta al Daily y al coach.
export async function getCooProfile(client: SupabaseClient, userId: string): Promise<CooProfile> {
  const { data } = await client.from('users').select('nombre, titulo, objetivo, bio').eq('id', userId).maybeSingle();
  return {
    nombre: data?.nombre ?? null,
    titulo: data?.titulo ?? null,
    objetivo: data?.objetivo ?? null,
    bio: data?.bio ?? null,
  };
}

// Texto compacto para inyectar como contexto en los prompts de IA.
export function cooContextString(p: CooProfile): string {
  const parts: string[] = [];
  if (p.nombre || p.titulo) parts.push(`Eres el asistente de ${p.nombre ?? 'el COO'}${p.titulo ? `, ${p.titulo} de T1` : ' de T1'}.`);
  if (p.objetivo) parts.push(`Su objetivo en la empresa: ${p.objetivo}`);
  if (p.bio) parts.push(`Contexto: ${p.bio}`);
  return parts.join('\n');
}
