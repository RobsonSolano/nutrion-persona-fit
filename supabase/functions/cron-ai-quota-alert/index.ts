// NutriOn — Edge Function cron-ai-quota-alert
// Roda de hora em hora. Conta rate_limits e falhas de IA da última hora em
// ai_usage_log. Se passar dos limites (ver alertRule.ts), dispara push pra
// todos os admins (admin_users + profile com expo_push_token).
//
// Anti-spam: só envia se NÃO existir alerta enviado na última 1h
// em push_history com data->>kind = 'ai_quota_alert'.
//
// Como agendar:
//   schedule '0 * * * *'  (a cada hora cheia, UTC)

import { serve } from 'std/http/server.ts';
import { createClient } from '@supabase/supabase-js';
import { sendExpoPush } from '../_shared/expoPush.ts';
import { emailAdmins, listAdminIds } from '../_shared/adminAlert.ts';
import { FAILURE_CODES, aiAlertFor } from './alertRule.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const CRON_SECRET = Deno.env.get('CRON_SECRET');

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type, x-cron-secret',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);
  if (!CRON_SECRET) return json({ error: 'missing_cron_secret' }, 500);
  if (req.headers.get('X-Cron-Secret') !== CRON_SECRET) {
    return json({ error: 'forbidden' }, 403);
  }
  if (!SERVICE_ROLE_KEY) return json({ error: 'missing_service_role' }, 500);

  try {
    const supa = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const sinceIso = new Date(Date.now() - 3600 * 1000).toISOString();

    // 1. Conta rate_limits e falhas de IA da última hora
    const countSince = (codes: string[]) =>
      supa
        .from('ai_usage_log')
        .select('id', { count: 'exact', head: true })
        .in('error_code', codes)
        .gte('created_at', sinceIso);
    const [rl, fl] = await Promise.all([
      countSince(['rate_limit']),
      countSince(FAILURE_CODES),
    ]);
    if (rl.error || fl.error) {
      return json(
        { error: 'count_failed', detail: (rl.error ?? fl.error)!.message },
        500,
      );
    }

    const counts = { rateLimits: rl.count ?? 0, failures: fl.count ?? 0 };
    // `{"test": true}` no body força um alerta de teste: valida e-mail e push
    // ponta a ponta sem esperar um incidente. Grava com kind próprio para não
    // acionar o anti-spam dos alertas reais.
    const isTest = await req
      .json()
      .then((b) => b?.test === true)
      .catch(() => false);
    const alert = isTest
      ? {
          title: 'Persona Fit: teste do alerta de IA',
          body: `Teste. Agora: ${counts.failures} falhas e ${counts.rateLimits} rate_limits na última hora.`,
        }
      : aiAlertFor(counts);
    if (!alert) {
      return json({ ok: true, ...counts, sent: false });
    }
    const kind = isTest ? 'ai_quota_alert_test' : 'ai_quota_alert';

    // 2. Verifica se já alertamos na última hora (anti-spam)
    const { data: recentAlerts } = await supa
      .from('push_history')
      .select('id')
      .gte('sent_at', sinceIso)
      .contains('data', { kind })
      .limit(1);
    if (!isTest && recentAlerts && recentAlerts.length > 0) {
      return json({
        ok: true,
        ...counts,
        sent: false,
        reason: 'already_alerted_in_last_hour',
      });
    }

    // 3. Lista admins. NÃO existe FK direta entre admin_users e profiles
    //    (ambas referenciam auth.users) — então PostgREST não consegue
    //    inferir o join. Faz em 2 etapas: IDs dos admins, depois profiles.
    const { ids: adminIds, error: admErr } = await listAdminIds(supa);
    if (admErr) {
      return json({ error: 'admins_fetch_failed', detail: admErr }, 500);
    }
    if (adminIds.length === 0) {
      return json({ ok: true, ...counts, sent: false, reason: 'no_admins' });
    }

    const { data: adminsWithToken, error: profErr } = await supa
      .from('profiles')
      .select('id')
      .in('id', adminIds)
      .not('expo_push_token', 'is', null);
    if (profErr) {
      return json(
        { error: 'admin_profiles_fetch_failed', detail: profErr.message },
        500,
      );
    }
    const withToken = new Set(
      (adminsWithToken ?? []).map((p: { id: string }) => p.id as string),
    );

    // 4. E-mail para todos os admins: é o canal que chega mesmo sem push
    //    habilitado no celular (em 2026-11-10 o único admin não tinha token,
    //    e este alerta nunca tinha sido entregue a ninguém).
    const { title, body } = alert;
    const { emailed, emailError } = await emailAdmins(supa, adminIds, title, body);

    // 5. Push direto (sem sendPushAi: alerta crítico, sem opt-out, sem
    //    cooldown, sem IA). Toda linha vai para push_history, com ou sem
    //    token, para o anti-spam valer também quando só o e-mail saiu.
    let sent = 0;
    for (const userId of adminIds) {
      const result = withToken.has(userId)
        ? await sendExpoPush(supa, userId, {
            title,
            body,
            data: { kind, ...counts },
          })
        : null;
      const delivered = !!result && result.ok && !('skipped' in result);
      if (delivered) sent++;
      await supa.from('push_history').insert({
        user_id: userId,
        type: 'coach_adherence_alert', // reuso de tipo existente
        title,
        body,
        data: { kind, ...counts, emailed },
        ai_generated: false,
        status: delivered ? 'sent' : 'failed',
        skip_reason: delivered ? null : 'no_token',
      });
    }

    return json({
      ok: true,
      ...counts,
      sent: true,
      test: isTest,
      emailed,
      emailError,
      pushed: sent,
    });
  } catch (err) {
    console.error('[cron-ai-quota-alert] unexpected:', err);
    return json(
      { error: 'internal', detail: err instanceof Error ? err.message : String(err) },
      500,
    );
  }
});

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  });
}
