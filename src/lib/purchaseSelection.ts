// Seleção de produto de assinatura no paywall (#5b). Lógica pura → testável sem RN/SDK.
// Decide QUAL product ID comprar a partir do papel do usuário, da feature que disparou o
// 402 e do tier atual. O paywall (app/paywall.tsx) então acha o package correspondente
// nas offerings do RevenueCat e chama purchasePackage.

import type { Tier } from '@/types/billing';
import { tierAtLeast } from './tier';

/** Product IDs das assinaturas no Play (imutáveis; precisam bater com o console + RevenueCat). */
export type ProductId =
  | 'nutrion_comum_pro'
  | 'nutrion_comum_premium'
  | 'nutrion_prof_pro'
  | 'nutrion_prof_premium'
  | 'nutrion_prof_elite';

export type Role = 'aluno' | 'comum' | 'professor';

type Params = {
  role: Role | null | undefined;
  feature: string | undefined;
  currentTier: Tier;
};

/**
 * Retorna o product ID que o usuário deve comprar, ou `null` quando não há compra a oferecer
 * (aluno — IA herdada do professor; ou já está no maior plano do seu papel).
 */
export function selectProductId({ role, feature, currentTier }: Params): ProductId | null {
  if (role === 'comum') {
    if (currentTier === 'free') {
      return feature === 'coach_discovery' ? 'nutrion_comum_premium' : 'nutrion_comum_pro';
    }
    return currentTier === 'pro' ? 'nutrion_comum_premium' : null;
  }

  if (role === 'professor') {
    if (currentTier === 'elite') return null; // maior plano
    // Estourou o limite de alunos: sobe um degrau (pro → premium, premium → elite).
    if (feature === 'student_limit') {
      const next = PROFESSOR_PLANS.find((p) => !tierAtLeast(currentTier, p.tier));
      if (next) return next.productId;
    }
    // Free (IA de coach ou limite) → pro cobre (IA + até 5 alunos).
    if (currentTier === 'free') return 'nutrion_prof_pro';
    // Plano pago pedindo feature que ele já cobre → nada a fazer (defensivo).
    return null;
  }

  // Aluno não compra: acesso à IA vem do plano do professor (C4).
  return null;
}

// Estrutura mínima do que precisamos das offerings do RevenueCat (subconjunto de
// PurchasesOfferings) — mantém o helper puro/testável sem depender do SDK.
type MinimalPackage = { product: { identifier: string } };
type MinimalOfferings<P extends MinimalPackage> = {
  all: Record<string, { availablePackages: P[] }>;
};

/**
 * Acha o package correspondente a um product ID nas offerings. No Google, o identifier do
 * produto vem como `productId:basePlanId` (ex: `nutrion_comum_pro:mensal`), então casamos por
 * igualdade OU prefixo `productId:`. Retorna null se não achar (defensivo).
 */
export function findPackage<P extends MinimalPackage>(
  offerings: MinimalOfferings<P> | null | undefined,
  productId: string,
): P | null {
  if (!offerings) return null;
  for (const offering of Object.values(offerings.all)) {
    for (const pkg of offering.availablePackages) {
      const id = pkg.product.identifier;
      if (id === productId || id.startsWith(`${productId}:`)) return pkg;
    }
  }
  return null;
}

/** Um plano comprável a ser exibido no paywall. */
export type Plan = { tier: 'pro' | 'premium' | 'elite'; productId: ProductId };

const PROFESSOR_PLANS: Plan[] = [
  { tier: 'pro', productId: 'nutrion_prof_pro' },
  { tier: 'premium', productId: 'nutrion_prof_premium' },
  { tier: 'elite', productId: 'nutrion_prof_elite' },
];
const COMUM_PLANS: Plan[] = [
  { tier: 'pro', productId: 'nutrion_comum_pro' },
  { tier: 'premium', productId: 'nutrion_comum_premium' },
];

/**
 * Lista ordenada de planos acima do tier atual (upgrade). Professor: Pro, Premium e
 * Elite; comum: Pro e Premium. Aluno nunca compra (IA herdada do professor, C4).
 */
export function availablePlans({
  role,
  currentTier,
}: {
  role: Role | null | undefined;
  currentTier: Tier;
}): Plan[] {
  const ladder =
    role === 'professor' ? PROFESSOR_PLANS : role === 'comum' ? COMUM_PLANS : [];
  return ladder.filter((p) => !tierAtLeast(currentTier, p.tier));
}
