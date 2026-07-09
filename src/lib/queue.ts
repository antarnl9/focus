import PgBoss from 'pg-boss';
import { env } from './env';

// Cola de jobs con pg-boss sobre el mismo Postgres de Supabase (sin Redis).
// El servicio web encola; el worker procesa (spec §6).

export const QUEUES = {
  triageDuda: 'triage-duda',
  transcribe: 'transcribe',
  summarizeMeeting: 'summarize-meeting',
  slackResolve: 'slack-resolve',
} as const;

let _boss: PgBoss | null = null;
let _starting: Promise<PgBoss> | null = null;

export async function getBoss(): Promise<PgBoss> {
  if (_boss) return _boss;
  if (_starting) return _starting;

  _starting = (async () => {
    const boss = new PgBoss({
      connectionString: env.databaseUrl(),
      // Supabase requiere SSL.
      ssl: { rejectUnauthorized: false },
      schema: 'pgboss',
    });
    boss.on('error', (e) => console.error('[pg-boss]', e));
    await boss.start();
    for (const q of Object.values(QUEUES)) {
      await boss.createQueue(q).catch(() => {});
    }
    _boss = boss;
    return boss;
  })();

  return _starting;
}

// Encolar un job. Seguro llamar desde route handlers.
export async function enqueue<T extends object>(queue: string, data: T): Promise<void> {
  try {
    const boss = await getBoss();
    await boss.send(queue, data, { retryLimit: 3, retryBackoff: true });
  } catch (err) {
    console.error('[queue] enqueue falló', queue, err);
  }
}
