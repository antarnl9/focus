import { NextResponse, after } from 'next/server';
import { verifySlackSignature, dmUser } from '@/lib/slack';
import { env } from '@/lib/env';

// Events API: verificación de URL + redirigir DMs al canal (spec §3.2/§5.1).
export async function POST(request: Request) {
  const raw = await request.text();
  const ts = request.headers.get('x-slack-request-timestamp');
  const sig = request.headers.get('x-slack-signature');
  if (!verifySlackSignature(raw, ts, sig)) {
    return new NextResponse('firma inválida', { status: 401 });
  }

  const body = JSON.parse(raw);

  // Handshake de Slack.
  if (body.type === 'url_verification') {
    return NextResponse.json({ challenge: body.challenge });
  }

  // Ignora reintentos para evitar duplicados.
  if (request.headers.get('x-slack-retry-num')) {
    return new NextResponse('', { status: 200 });
  }

  if (body.type === 'event_callback') {
    const ev = body.event;
    // DM directo al bot (no de otro bot, no cambios) → redirigir al canal de dudas.
    if (ev?.type === 'message' && ev.channel_type === 'im' && !ev.bot_id && !ev.subtype && ev.user) {
      const canal = env.slackDudasChannel ? `<#${env.slackDudasChannel}>` : '#dudas-coo';
      after(async () => {
        try {
          await dmUser(
            ev.user,
            `Las dudas van al canal ${canal} usando el comando */duda* (con contexto, decisión, opciones, recomendación e impacto). Ahí el COO las resuelve en la ventana correspondiente.`
          );
        } catch (e) {
          console.error('[slack] redirect DM', e);
        }
      });
    }
  }

  return new NextResponse('', { status: 200 });
}
