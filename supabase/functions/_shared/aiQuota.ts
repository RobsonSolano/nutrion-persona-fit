// Cotas diárias de IA (chat e análise de prato) — TS PURO, sem imports Deno,
// testável por vitest. Fonte única das cotas para as edge functions.
// Regra [PREM]-03: quem tem assinatura PRÓPRIA premium ou acima ganha a cota maior;
// aluno que só herda do professor (own_tier free/pro) fica na base.

import { tierAtLeast } from './tier.ts';

export type AiQuota = { chat: number; sanity: number };

const BASE: AiQuota = { chat: 10, sanity: 8 };
const PREMIUM: AiQuota = { chat: 20, sanity: 15 };

export function dailyAiQuota(ent: { own_tier?: string | null }): AiQuota {
  return tierAtLeast(ent.own_tier, 'premium') ? PREMIUM : BASE;
}
