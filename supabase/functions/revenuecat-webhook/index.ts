// Persona Fit — Edge Function revenuecat-webhook (revenuecat-integration #5a, [RC]-01)
//
// Recebe eventos do RevenueCat e mantém public.subscriptions em dia (fonte de verdade
// lida por resolve_entitlement). Autentica por header secreto (RevenueCat não manda JWT
// do Supabase) — deploy com `--no-verify-jwt`. A lógica de mapeamento é pura em mapEvent.ts.

import { serve } from 'std/http/server.ts';
import { createClient } from '@supabase/supabase-js';
import { mapRevenueCatEvent } from './mapEvent.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const RC_WEBHOOK_SECRET = Deno.env.get('RC_WEBHOOK_SECRET') ?? '';

serve(async (req: Request) => {
  if (req.method !== 'POST') {
    return new Response('method_not_allowed', { status: 405 });
  }
  // Auth: header secreto configurado no RevenueCat (manual-2).
  if (!RC_WEBHOOK_SECRET || req.headers.get('Authorization') !== `Bearer ${RC_WEBHOOK_SECRET}`) {
    return new Response('unauthorized', { status: 401 });
  }

  const payload = await req.json().catch(() => null);
  const mapped = mapRevenueCatEvent(payload);
  // Evento sem app_user_id ou tipo não tratado → ack (não re-tentar à toa).
  if (!mapped) {
    return new Response('ignored', { status: 200 });
  }

  const supa = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  // Upsert por user_id (= app_user_id). NÃO toca trial_consumed (anti-abuso do #3).
  const { error } = await supa.from('subscriptions').upsert(
    {
      user_id: mapped.userId,
      source: mapped.source,
      rc_app_user_id: mapped.userId,
      tier: mapped.state.tier,
      status: mapped.state.status,
      period_end: mapped.state.period_end,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'user_id' },
  );

  if (error) {
    // FK (user inexistente) ou outro erro: loga e dá ack 200 pra não travar o RevenueCat.
    console.error('[revenuecat-webhook] upsert falhou:', error.message);
    return new Response('ok', { status: 200 });
  }

  // Reconcilia acesso dos alunos se o assinante for professor (no-op caso contrário).
  // Downgrade -> suspende excedente; upgrade -> reativa todos. Best-effort (não trava o ack).
  const { error: syncErr } = await supa.rpc('sync_coach_student_access', {
    p_coach_id: mapped.userId,
  });
  if (syncErr) {
    console.error('[revenuecat-webhook] sync_coach_student_access:', syncErr.message);
  }

  return new Response('ok', { status: 200 });
});
