import { NextResponse } from 'next/server';
import { requireUser } from '@/lib/auth';
import { env } from '@/lib/env';

// Inicia el OAuth de Slack (token de usuario) para leer DMs/canales del COO.
export async function GET() {
  const auth = await requireUser();
  if (!auth.ok) return auth.response;
  if (!env.slackClientId) return NextResponse.json({ error: 'SLACK_CLIENT_ID no configurado' }, { status: 400 });

  const userScopes = [
    'channels:history',
    'groups:history',
    'im:history',
    'mpim:history',
    'channels:read',
    'groups:read',
    'im:read',
    'mpim:read',
    'users:read',
  ].join(',');

  const redirectUri = `${env.appUrl}/api/slack/oauth/callback`;
  const url =
    `https://slack.com/oauth/v2/authorize?client_id=${encodeURIComponent(env.slackClientId)}` +
    `&user_scope=${encodeURIComponent(userScopes)}` +
    `&redirect_uri=${encodeURIComponent(redirectUri)}`;

  return NextResponse.redirect(url);
}
