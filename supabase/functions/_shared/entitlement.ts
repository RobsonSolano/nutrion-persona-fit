// Persona Fit — helper de entitlement (billing-core, [BILL]-07)
// Fonte de verdade = RPC resolve_entitlement no Supabase. As edge functions de IA
// chamam getEntitlement() após getUser() e, sem o direito, retornam needsUpgrade().

import type { SupabaseClient } from '@supabase/supabase-js';

export type Entitlement = {
  tier: 'free' | 'pro' | 'premium';
  source: 'store_play' | 'store_apple' | 'stripe' | 'server_trial' | 'grandfather' | 'partner' | 'external' | 'none';
  ai_personal: boolean; // chat IA + sanity check
  ai_coach: boolean; // coach-generate-plan + coach-import-workout-ai (só professor)
  student_limit: number | null; // null = ilimitado (só professor)
  trial_end: string | null;
};

/**
 * Lê o entitlement do usuário autenticado via RPC. O client deve ter sido criado
 * com o Authorization do request (mesmo padrão das functions) — a RPC usa auth.uid().
 */
export async function getEntitlement(
  supabase: SupabaseClient,
): Promise<Entitlement> {
  const { data, error } = await supabase.rpc('resolve_entitlement');
  if (error) throw error;
  return data as Entitlement;
}

/**
 * Resposta padrão de bloqueio por falta de direito (paywall). A UI (spec #2)
 * traduz `402 needs_upgrade` no upsell "seja Pro". `corsHeaders` deve ser o
 * mesmo objeto CORS usado pela function chamadora.
 */
export function needsUpgrade(
  feature: string,
  corsHeaders: Record<string, string> = { 'Access-Control-Allow-Origin': '*' },
): Response {
  return new Response(JSON.stringify({ error: 'needs_upgrade', feature }), {
    status: 402,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}
