// Acceso centralizado a variables de entorno (server-side).
// Lanza en tiempo de uso solo si una variable requerida falta.

function required(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Falta la variable de entorno: ${name}`);
  return v;
}

function optional(name: string, fallback = ''): string {
  return process.env[name] ?? fallback;
}

export const env = {
  appUrl: optional('NEXT_PUBLIC_APP_URL', 'http://localhost:3000').replace(/\/$/, ''),
  tz: optional('TZ', 'America/Mexico_City'),

  supabaseUrl: () => required('NEXT_PUBLIC_SUPABASE_URL'),
  supabaseAnonKey: () => required('NEXT_PUBLIC_SUPABASE_ANON_KEY'),
  supabaseServiceKey: () => required('SUPABASE_SERVICE_ROLE_KEY'),
  databaseUrl: () => required('DATABASE_URL'),

  allowedEmails: () =>
    optional('ALLOWED_EMAILS', 'antar@t1.com')
      .split(',')
      .map((e) => e.trim().toLowerCase())
      .filter(Boolean),
  hostedDomain: optional('GOOGLE_HOSTED_DOMAIN', 't1.com'),

  anthropicKey: () => required('ANTHROPIC_API_KEY'),
  anthropicModel: optional('ANTHROPIC_MODEL', 'claude-opus-4-8'),

  slackBotToken: () => required('SLACK_BOT_TOKEN'),
  slackSigningSecret: () => required('SLACK_SIGNING_SECRET'),
  slackDudasChannel: optional('SLACK_DUDAS_CHANNEL_ID'),
  slackDailyChannel: optional('SLACK_DAILY_CHANNEL_ID'),
  slackClientId: optional('SLACK_CLIENT_ID'),
  slackClientSecret: optional('SLACK_CLIENT_SECRET'),

  googleClientId: optional('GOOGLE_CLIENT_ID'),
  googleClientSecret: optional('GOOGLE_CLIENT_SECRET'),
  googleCalendarId: optional('GOOGLE_CALENDAR_ID', 'primary'),

  deepgramKey: optional('DEEPGRAM_API_KEY'),

  tokenEncryptionKey: optional('TOKEN_ENCRYPTION_KEY'),

  vapidPublic: optional('NEXT_PUBLIC_VAPID_PUBLIC_KEY'),
  vapidPrivate: optional('VAPID_PRIVATE_KEY'),
  vapidSubject: optional('VAPID_SUBJECT', 'mailto:antar@t1.com'),

  cronSecret: optional('CRON_SECRET'),
};

export const hasAnthropic = () => !!process.env.ANTHROPIC_API_KEY;
export const hasSlack = () => !!process.env.SLACK_BOT_TOKEN && !!process.env.SLACK_SIGNING_SECRET;
export const hasDeepgram = () => !!process.env.DEEPGRAM_API_KEY;
export const hasPush = () => !!process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY && !!process.env.VAPID_PRIVATE_KEY;
