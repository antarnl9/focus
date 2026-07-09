import { NextResponse } from 'next/server';
import { env } from '@/lib/env';
import { runPreWindowReminder, runDailyPrompt } from '@/lib/reminders';

// Endpoint de cron protegido — alternativa a node-cron del worker (spec §6).
// Configúralo en Railway Cron para pegarle en los horarios (hora CDMX):
//   15:00  → /api/cron?task=ventana1
//   18:45  → /api/cron?task=ventana2
//   20:45  → /api/cron?task=daily
// Autoriza con header 'x-cron-secret: <CRON_SECRET>' o ?secret=<CRON_SECRET>.
export async function GET(request: Request) {
  const url = new URL(request.url);
  const secret = request.headers.get('x-cron-secret') || url.searchParams.get('secret');
  if (!env.cronSecret || secret !== env.cronSecret) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const task = url.searchParams.get('task');
  try {
    switch (task) {
      case 'ventana1':
        await runPreWindowReminder('Ventana de dudas 1');
        break;
      case 'ventana2':
        await runPreWindowReminder('Ventana de dudas 2');
        break;
      case 'daily':
        await runDailyPrompt();
        break;
      default:
        return NextResponse.json({ error: 'task inválida (ventana1|ventana2|daily)' }, { status: 400 });
    }
    return NextResponse.json({ ok: true, task });
  } catch (e) {
    console.error('[cron] endpoint', e);
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}

export const POST = GET;
