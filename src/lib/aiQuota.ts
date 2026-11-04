// Cotas diárias de IA no app (chat e análise de prato). ESPELHA
// supabase/functions/_shared/aiQuota.ts (o servidor é a autoridade; o teste
// aiQuota.test.ts garante que os números batem). Regra [PREM]-03: assinatura
// PRÓPRIA premium ou acima ganha a cota maior; aluno que só herda fica na base.
import { tierAtLeast } from './tier';

export type AiQuota = { chat: number; sanity: number };

export const AI_QUOTA_BASE: AiQuota = { chat: 10, sanity: 8 };
export const AI_QUOTA_PREMIUM: AiQuota = { chat: 20, sanity: 15 };

export function dailyAiQuota(ownTier: string | null | undefined): AiQuota {
  return tierAtLeast(ownTier, 'premium') ? AI_QUOTA_PREMIUM : AI_QUOTA_BASE;
}

/** Sem entitlement resolvido (`resolved` false) nunca bloqueia: o 402/429 do servidor decide. */
export function quotaState(used: number, limit: number, resolved: boolean) {
  return {
    limit,
    remaining: Math.max(0, limit - used),
    limitReached: resolved && used >= limit,
  };
}
