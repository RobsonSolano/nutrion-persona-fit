// Persona Fit — Edge Function revenuecat-webhook (revenuecat-integration #5a, [RC]-01)
//
// Recebe eventos do RevenueCat e mantém public.subscriptions em dia (fonte de verdade
// lida por resolve_entitlement). Autentica por header secreto (RevenueCat não manda JWT
// do Supabase) — deploy com `--no-verify-jwt`. A lógica de mapeamento é pura em mapEvent.ts.

import { serve } from 'std/http/server.ts';
import { createClient } from '@supabase/supabase-js';
import {
  mapRevenueCatEvent,
  stateFromSubscriber,
  storeToSource,
  transferIds,
  type RcSubscriber,
  type SubSource,
  type SubState,
} from './mapEvent.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const RC_WEBHOOK_SECRET = Deno.env.get('RC_WEBHOOK_SECRET') ?? '';
// Chave secreta (v1) da API do RevenueCat: só para o TRANSFER, que não traz o plano.
const RC_SECRET_API_KEY = Deno.env.get('RC_SECRET_API_KEY') ?? '';

// deno-lint-ignore no-explicit-any
type Supa = any;

async function writeState(supa: Supa, userId: string, source: SubSource, state: SubState) {
  const { error } = await supa.from('subscriptions').upsert(
    {
      user_id: userId,
      source,
      rc_app_user_id: userId,
      tier: state.tier,
      status: state.status,
      period_end: state.period_end,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'user_id' },
  );
  // FK (conta já excluída) ou outro erro: loga e segue, o ack continua 200.
  if (error) console.error('[revenuecat-webhook] upsert falhou:', userId, error.message);
  // Reconcilia acesso dos alunos se for professor (no-op caso contrário).
  const { error: syncErr } = await supa.rpc('sync_coach_student_access', { p_coach_id: userId });
  if (syncErr) console.error('[revenuecat-webhook] sync_coach_student_access:', syncErr.message);
}

async function fetchSubscriber(userId: string): Promise<RcSubscriber | null> {
  const res = await fetch(
    `https://api.revenuecat.com/v1/subscribers/${encodeURIComponent(userId)}`,
    { headers: { Authorization: `Bearer ${RC_SECRET_API_KEY}` } },
  );
  if (!res.ok) {
    console.error('[revenuecat-webhook] GET subscriber', userId, res.status);
    return null;
  }
  return (await res.json())?.subscriber ?? null;
}

/**
 * TRANSFER: a assinatura da loja mudou de conta (mesmo Apple ID/Google numa conta nova
 * do app, na compra ou no "Restaurar compras"). Sem isto a conta nova pagava e ficava
 * sem o plano. Com a chave da API, o estado de cada conta vem do RevenueCat; sem ela,
 * copia o plano da conta de origem, se ela ainda existir, e encerra o da origem.
 */
async function handleTransfer(supa: Supa, ids: { from: string[]; to: string[] }, fallback: SubSource) {
  const now = Date.now();
  if (RC_SECRET_API_KEY) {
    for (const userId of [...ids.to, ...ids.from]) {
      const sub = await fetchSubscriber(userId);
      if (!sub) continue;
      const { state, source } = stateFromSubscriber(sub, now, fallback);
      await writeState(supa, userId, source, state);
    }
    return;
  }
  console.warn('[revenuecat-webhook] TRANSFER sem RC_SECRET_API_KEY: copiando da conta de origem');
  const { data: origin } = await supa
    .from('subscriptions')
    .select('tier, status, period_end, source')
    .in('user_id', ids.from)
    .in('source', ['store_apple', 'store_play'])
    .neq('tier', 'free')
    .limit(1)
    .maybeSingle();
  if (!origin) return;
  for (const userId of ids.to) {
    await writeState(supa, userId, origin.source, {
      tier: origin.tier,
      status: origin.status,
      period_end: origin.period_end,
    });
  }
  for (const userId of ids.from) {
    await writeState(supa, userId, origin.source, {
      tier: 'free',
      status: 'expired',
      period_end: new Date(now).toISOString(),
    });
  }
}

serve(async (req: Request) => {
  if (req.method !== 'POST') {
    return new Response('method_not_allowed', { status: 405 });
  }
  // Auth: header secreto configurado no RevenueCat (manual-2).
  if (!RC_WEBHOOK_SECRET || req.headers.get('Authorization') !== `Bearer ${RC_WEBHOOK_SECRET}`) {
    return new Response('unauthorized', { status: 401 });
  }

  const payload = await req.json().catch(() => null);

  const transfer = transferIds(payload);
  if (transfer) {
    const supa = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    // deno-lint-ignore no-explicit-any
    await handleTransfer(supa, transfer, storeToSource((payload as any)?.event?.store));
    return new Response('ok', { status: 200 });
  }

  const mapped = mapRevenueCatEvent(payload);
  // Evento sem app_user_id ou tipo não tratado → ack (não re-tentar à toa).
  if (!mapped) {
    return new Response('ignored', { status: 200 });
  }

  const supa = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  // Upsert por user_id (= app_user_id). NÃO toca trial_consumed (anti-abuso do #3).
  // Downgrade -> suspende alunos excedentes; upgrade -> reativa todos (dentro do writeState).
  await writeState(supa, mapped.userId, mapped.source, mapped.state);

  return new Response('ok', { status: 200 });
});
