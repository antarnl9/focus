import { createSupabaseAdmin } from './supabase/admin';
import { getCooUserId, getCooSlackId } from './bootstrap';
import { preWindowSummary } from './anthropic';
import { generateAndSaveDaily } from './daily';
import { dmUser } from './slack';
import { sendPush } from './push';
import { hasAnthropic, hasSlack, env } from './env';
import { localDateStr } from './time';

async function pendingDudas(cooId: string) {
  const admin = createSupabaseAdmin();
  const { data } = await admin
    .from('dudas')
    .select('autor_nombre, decision, urgente')
    .eq('user_id', cooId)
    .eq('estado', 'pendiente')
    .order('urgente', { ascending: false });
  return (data ?? []).map((d) => ({ autor: d.autor_nombre || 'equipo', decision: d.decision || '', urgente: !!d.urgente }));
}

// Resumen pre-ventana (15 min antes) por DM + push (spec §3.2 / §5.5).
export async function runPreWindowReminder(ventanaLabel: string): Promise<void> {
  const cooId = await getCooUserId();
  if (!cooId) return;
  const dudas = await pendingDudas(cooId);

  let texto = `⏰ ${ventanaLabel} en 15 min. Tienes ${dudas.length} duda(s).`;
  if (hasAnthropic()) {
    try {
      texto = await preWindowSummary(ventanaLabel, dudas);
    } catch (e) {
      console.error('[reminders] preWindowSummary', e);
    }
  }

  await sendPush(cooId, {
    title: `⏰ ${ventanaLabel}`,
    body: dudas.length ? `${dudas.length} duda(s) acumuladas` : 'Sin dudas acumuladas',
    url: '/',
    tag: 'pre-ventana',
  }).catch(() => {});

  if (hasSlack()) {
    const cooSlack = await getCooSlackId();
    if (cooSlack) await dmUser(cooSlack, texto).catch(() => {});
  }
}

// Prompt del Daily (20:45): genera un borrador y avisa (spec §3.6).
export async function runDailyPrompt(): Promise<void> {
  const cooId = await getCooUserId();
  if (!cooId) return;
  const admin = createSupabaseAdmin();
  const fecha = localDateStr();

  if (hasAnthropic()) {
    try {
      await generateAndSaveDaily(admin, cooId, fecha);
    } catch (e) {
      console.error('[reminders] pre-generar Daily', e);
    }
  }

  await sendPush(cooId, {
    title: '📊 Genera tu Daily',
    body: 'Tu borrador está listo para revisar y enviar a #daily-coo.',
    url: '/',
    tag: 'daily',
  }).catch(() => {});

  if (hasSlack()) {
    const cooSlack = await getCooSlackId();
    if (cooSlack) await dmUser(cooSlack, '📊 Es hora del Daily. Tu borrador está listo en Focus para revisar y enviar.').catch(() => {});
  }
}

export { env };
