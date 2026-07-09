import { createSupabaseAdmin } from './supabase/admin';
import { getCooUserId, getCooSlackId } from './bootstrap';
import { triageDuda } from './anthropic';
import { hasAnthropic } from './env';
import { dudaMessageBlocks, postToDudasChannel, dmUser, userDisplayName } from './slack';
import { sendPush } from './push';
import { env } from './env';

export interface DudaSubmission {
  autorId: string; // slack_user_id
  autorNombre?: string;
  contexto: string;
  decision: string;
  opciones: string;
  recomendacion: string;
  impacto: string;
  urgente_marcado: boolean;
}

// Triage IA + publicación + almacenamiento + notificación (spec §3.2).
// Se ejecuta en el worker (o inline si no hay cola). Diseñado para no bloquear
// el webhook de Slack (<3 s) — aquí puede tardar lo que necesite.
export async function handleDudaTriage(sub: DudaSubmission): Promise<void> {
  const admin = createSupabaseAdmin();
  const cooId = await getCooUserId();
  if (!cooId) {
    console.error('[dudas] no hay COO configurado');
    return;
  }

  const autorNombre = sub.autorNombre || (await userDisplayName(sub.autorId));

  // Triage IA (urgencia + validación de formato).
  let completa = true;
  let urgente = sub.urgente_marcado;
  let motivo = sub.urgente_marcado ? 'Marcada como urgencia real por el autor.' : 'Clasificada para la próxima ventana.';
  let mensajeCompletar = '';

  if (hasAnthropic()) {
    try {
      const t = await triageDuda({
        contexto: sub.contexto,
        decision: sub.decision,
        opciones: sub.opciones,
        recomendacion: sub.recomendacion,
        impacto: sub.impacto,
        urgente_marcado: sub.urgente_marcado,
      });
      completa = t.completa;
      urgente = t.urgente;
      motivo = t.motivo;
      mensajeCompletar = t.mensaje_para_completar;
    } catch (e) {
      console.error('[dudas] triage IA falló, se acepta la duda tal cual', e);
    }
  }

  // Si falta info: NO llega a la cola del COO (spec §10). Se le pide al autor completar.
  if (!completa) {
    await admin.from('dudas').insert({
      user_id: cooId,
      autor_id: sub.autorId,
      autor_nombre: autorNombre,
      contexto: sub.contexto,
      decision: sub.decision,
      opciones: sub.opciones,
      recomendacion: sub.recomendacion,
      impacto: sub.impacto,
      urgente,
      triage_motivo: motivo,
      estado: 'incompleta',
    });
    try {
      await dmUser(
        sub.autorId,
        `📝 Tu duda necesita más contexto antes de llegar al COO:\n${mensajeCompletar || 'Completa contexto, opciones e impacto.'}\n\nVuelve a enviarla con */duda*.`
      );
    } catch (e) {
      console.error('[dudas] DM completar', e);
    }
    return;
  }

  // Publica en #dudas-coo (crea el hilo) y guarda con slack_ts.
  let slackTs: string | null = null;
  try {
    const res = await postToDudasChannel(
      dudaMessageBlocks({
        autor: autorNombre,
        contexto: sub.contexto,
        decision: sub.decision,
        opciones: sub.opciones,
        recomendacion: sub.recomendacion,
        impacto: sub.impacto,
        urgente,
      }),
      `${urgente ? '🚨 Duda urgente' : 'Nueva duda'} de ${autorNombre}`
    );
    slackTs = (res.ts as string) ?? null;
  } catch (e) {
    console.error('[dudas] postToDudasChannel', e);
  }

  await admin.from('dudas').insert({
    user_id: cooId,
    slack_ts: slackTs,
    slack_channel: env.slackDudasChannel || null,
    autor_id: sub.autorId,
    autor_nombre: autorNombre,
    contexto: sub.contexto,
    decision: sub.decision,
    opciones: sub.opciones,
    recomendacion: sub.recomendacion,
    impacto: sub.impacto,
    urgente,
    triage_motivo: motivo,
    estado: 'pendiente',
  });

  // Urgente → notificación inmediata al COO (push + DM de respaldo, spec §3.2/§5.5).
  if (urgente) {
    await sendPush(cooId, {
      title: '🚨 Duda urgente',
      body: `${autorNombre}: ${sub.decision}`,
      url: '/',
      tag: 'duda-urgente',
      urgent: true,
    }).catch(() => {});
    const cooSlack = await getCooSlackId();
    if (cooSlack) {
      await dmUser(cooSlack, `🚨 *Duda urgente de ${autorNombre}:* ${sub.decision}\nÁbrela en Focus para resolver.`).catch(() => {});
    }
  }
}
