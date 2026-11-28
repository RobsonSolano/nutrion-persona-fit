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

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * TRANSFER: a compra da loja passou de uma conta do app para outra. Acontece quando o
 * mesmo Apple ID/conta Google assina (ou restaura) logado numa conta nova — a loja
 * reaproveita a assinatura antiga e o RevenueCat a move. O evento não traz plano nem
 * validade, só quem perdeu e quem ganhou. Ids anônimos do RevenueCat ficam de fora.
 */
export function transferIds(payload: unknown): { from: string[]; to: string[] } | null {
  const e = (payload as { event?: Record<string, unknown> })?.event;
  if (e?.type !== 'TRANSFER') return null;
  const ids = (v: unknown) =>
    (Array.isArray(v) ? v : []).filter((x): x is string => typeof x === 'string' && UUID_RE.test(x));
  const to = ids(e.transferred_to);
  if (to.length === 0) return null;
  return { from: ids(e.transferred_from), to };
}

type RcEntitlement = { expires_date?: string | null; product_identifier?: string };
type RcSubscription = {
  store?: string;
  period_type?: string;
  unsubscribe_detected_at?: string | null;
};
export type RcSubscriber = {
  entitlements?: Record<string, RcEntitlement>;
  subscriptions?: Record<string, RcSubscription>;
};

/**
 * Estado de subscriptions a partir do assinante do RevenueCat (GET /v1/subscribers).
 * Usado no TRANSFER, que não traz o plano no evento. Mesmas regras dos eventos:
 * elite > premium > pro, cancelada mantém acesso até period_end, sem ativo = free.
 */
export function stateFromSubscriber(
  sub: RcSubscriber,
  nowMs: number,
  fallbackSource: SubSource = 'store_play',
): { state: SubState; source: SubSource } {
  const ents = sub.entitlements ?? {};
  const isActive = (e: RcEntitlement) => !e.expires_date || Date.parse(e.expires_date) > nowMs;
  const tier = (['elite', 'premium', 'pro'] as const).find((t) => ents[t] && isActive(ents[t]));
  if (!tier) {
    const lastEnd = Object.values(ents)
      .map((e) => e.expires_date)
      .filter((d): d is string => !!d)
      .sort()
      .pop();
    return {
      source: fallbackSource,
      state: { tier: 'free', status: 'expired', period_end: lastEnd ? new Date(lastEnd).toISOString() : null },
    };
  }
  const ent = ents[tier];
  const s = (ent.product_identifier && sub.subscriptions?.[ent.product_identifier]) || {};
  const status: SubState['status'] = s.unsubscribe_detected_at
    ? 'canceled'
    : s.period_type === 'trial'
      ? 'in_trial'
      : 'active';
  return {
    source: s.store === 'app_store' || s.store === 'mac_app_store' ? 'store_apple' : 'store_play',
    state: { tier, status, period_end: ent.expires_date ? new Date(ent.expires_date).toISOString() : null },
  };
}
