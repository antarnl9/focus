import { NextResponse } from 'next/server';
import { createSupabaseServer } from '@/lib/supabase/server';
import { env } from '@/lib/env';

export async function POST(request: Request) {
  const supabase = await createSupabaseServer();
  await supabase.auth.signOut();
  const origin = env.appUrl || new URL(request.url).origin;
  return NextResponse.redirect(`${origin}/login`, { status: 303 });
}
