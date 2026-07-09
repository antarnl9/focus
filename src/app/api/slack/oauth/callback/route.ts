import { NextResponse } from 'next/server';
import { requireUser } from '@/lib/auth';
import { env } from '@/lib/env';
import { saveSlackUserToken } from '@/lib/slack';

// Callback del OAuth de Slack: intercambia el code por el token de usuario.
export async function GET(request: Request) {
  const auth = await requireUser();
  const origin = env.appUrl;
  if (!auth.ok) return NextResponse.redirect(`${origin}/login`);

  const code = new URL(request.url).searchParams.get('code');
  if (!code) return NextResponse.redirect(`${origin}/?slack=error`);

  try {
    const body = new URLSearchParams({
      client_id: env.slackClientId,
      client_secret: env.slackClientSecret,
      code,
      redirect_uri: `${origin}/api/slack/oauth/callback`,
    });
    const res = await fetch('https://slack.com/api/oauth.v2.access', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body,
    });
    const json = (await res.json()) as { ok: boolean; authed_user?: { access_token?: string }; error?: string };
    const token = json.authed_user?.access_token;
    if (!json.ok || !token) throw new Error(json.error || 'sin token');
    await saveSlackUserToken(auth.user.id, token);
    return NextResponse.redirect(`${origin}/?slack=connected`);
  } catch (e) {
    console.error('[slack] oauth callback', e);
    return NextResponse.redirect(`${origin}/?slack=error`);
  }
}
