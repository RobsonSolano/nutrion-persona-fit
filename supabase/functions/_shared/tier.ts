// Ordem dos tiers para as edge functions — TS PURO, sem imports Deno.
// Espelha `src/lib/tier.ts` (app) e `public._tier_rank` (SQL): free < pro < premium < elite.
// Um tier novo entra aqui, lá e no SQL.

export type Tier = 'free' | 'pro' | 'premium' | 'elite';

const TIER_ORDER: readonly Tier[] = ['free', 'pro', 'premium', 'elite'];

function tierRank(tier: string | null | undefined): number {
  const i = TIER_ORDER.indexOf(tier as Tier);
  return i < 0 ? 0 : i;
}

/** true quando `tier` é `min` ou um plano acima. null/undefined/desconhecido = free. */
export function tierAtLeast(
  tier: string | null | undefined,
  min: Tier,
): boolean {
  return tierRank(tier) >= tierRank(min);
}
