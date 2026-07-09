import { loadEnv } from './loadenv';
loadEnv();

import cron from 'node-cron';
import { getBoss, QUEUES } from '../src/lib/queue';
import { processTranscription } from '../src/lib/transcription';
import { runPreWindowReminder, runDailyPrompt } from '../src/lib/reminders';

const TZ = process.env.TZ || 'America/Mexico_City';

async function main() {
  console.log('[worker] iniciando Focus worker…');

  // --- Cola de jobs (pg-boss) ---
  const boss = await getBoss();

  await boss.work(QUEUES.transcribe, async (jobs: any) => {
    const list = Array.isArray(jobs) ? jobs : [jobs];
    for (const job of list) {
      console.log('[worker] transcribe', job.data?.grabacionId);
      await processTranscription(job.data);
    }
  });

  console.log('[worker] cola lista. Escuchando jobs.');

  // --- Tareas programadas (cron, hora local CDMX) ---
  // Recordatorio 15 min antes de cada ventana de dudas (spec §3.2, cron §6).
  cron.schedule('0 15 * * 1-5', () => run('Ventana de dudas 1', () => runPreWindowReminder('Ventana de dudas 1')), { timezone: TZ });
  cron.schedule('45 18 * * 1-5', () => run('Ventana de dudas 2', () => runPreWindowReminder('Ventana de dudas 2')), { timezone: TZ });

  // Prompt del Daily a las 20:45 (spec §3.6).
  cron.schedule('45 20 * * 1-5', () => run('Daily prompt', () => runDailyPrompt()), { timezone: TZ });

  console.log(`[worker] cron programado (${TZ}): 15:00, 18:45 (pre-ventana) y 20:45 (Daily).`);
}

function run(nombre: string, fn: () => Promise<void>) {
  console.log(`[cron] ${nombre} @ ${new Date().toISOString()}`);
  fn().catch((e) => console.error(`[cron] ${nombre} falló`, e));
}

main().catch((e) => {
  console.error('[worker] fatal', e);
  process.exit(1);
});

process.on('SIGTERM', () => process.exit(0));
process.on('SIGINT', () => process.exit(0));
