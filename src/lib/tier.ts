// Lugar único da ordem dos tiers no app: free < pro < premium < elite.
// Espelha `public._tier_rank` do SQL e `supabase/functions/_shared/tier.ts`. Todo gate "premium ou acima" usa `tierAtLeast`.
import type { Tier } from '../types/billing';

const TIER_ORDER: readonly Tier[] = ['free', 'pro', 'premium', 'elite'];

export const TIER_LABEL: Record<Tier, string> = {
  free: 'Free',
  pro: 'Pro',
  premium: 'Premium',
  elite: 'Elite',
};

/** Posição do tier na ordem. null, undefined ou desconhecido = free (0). */
function tierRank(tier: string | null | undefined): number {
  const i = TIER_ORDER.indexOf(tier as Tier);
  return i < 0 ? 0 : i;
}

/** true quando `tier` é `min` ou um plano acima. */
export function tierAtLeast(
  tier: string | null | undefined,
  min: Tier,
): boolean {
  return tierRank(tier) >= tierRank(min);
}
