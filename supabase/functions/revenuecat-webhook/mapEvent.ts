// Mapa de evento do RevenueCat → estado de subscriptions (revenuecat-integration #5a).
// TS PURO (sem imports Deno) — testável por vitest. O index.ts (Deno) importa daqui.
import type { Tier } from '../_shared/tier.ts';

export type SubState = {
  tier: Tier;
  status: 'active' | 'in_trial' | 'canceled' | 'expired';
  period_end: string | null;
};

export type SubSource = 'store_apple' | 'store_play';

/** Origem da assinatura a partir de event.store. Ausente/desconhecido → store_play (comportamento antigo). */
export function storeToSource(store: unknown): SubSource {
  return store === 'APP_STORE' || store === 'MAC_APP_STORE' ? 'store_apple' : 'store_play';
}

/**
 * Traduz o payload do webhook do RevenueCat. Retorna null quando o evento não deve
 * escrever em subscriptions (sem app_user_id ou tipo não tratado) — o caller dá ack 200.
 */
export function mapRevenueCatEvent(
  payload: unknown,
): { userId: string; state: SubState; source: SubSource } | null {
  const e = (payload as { event?: Record<string, unknown> })?.event;
  const userId = e?.app_user_id as string | undefined;
  if (!userId) return null;

  const ents = (e?.entitlement_ids as string[] | undefined) ?? [];
  // Prioridade: elite > premium > pro.
  const baseTier = (['elite', 'premium'] as const).find((t) => ents.includes(t)) ?? 'pro';
  const expMs = e?.expiration_at_ms as number | undefined;
  const source = storeToSource(e?.store);
  const periodEnd = expMs ? new Date(expMs).toISOString() : null;

  switch (e?.type) {
    case 'INITIAL_PURCHASE':
    case 'RENEWAL':
    case 'PRODUCT_CHANGE':
    case 'UNCANCELLATION':
      return {
        userId,
        source,
        state: {
          tier: baseTier,
          status: e?.period_type === 'TRIAL' ? 'in_trial' : 'active',
          period_end: periodEnd,
        },
      };
    case 'CANCELLATION':
      // Cancelou: acesso mantido até period_end (§3.6).
      return { userId, source, state: { tier: baseTier, status: 'canceled', period_end: periodEnd } };
    case 'BILLING_ISSUE':
      // Grace period — não derruba na hora; mantém até period_end.
      return { userId, source, state: { tier: baseTier, status: 'active', period_end: periodEnd } };
    case 'EXPIRATION':
      return { userId, source, state: { tier: 'free', status: 'expired', period_end: periodEnd } };
    default:
      return null; // TRANSFER, SUBSCRIPTION_PAUSED, etc. — não tratados aqui
  }
}
