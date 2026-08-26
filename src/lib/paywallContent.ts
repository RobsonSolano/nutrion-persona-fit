// Conteúdo contextual do paywall por feature key (do 402 needs_upgrade do billing-core).
// Lógica pura → testável sem RN. A tela app/paywall.tsx só renderiza o resultado.

import type { Role } from '@/lib/purchaseSelection';

export type PaywallContent = {
  title: string;
  subtitle: string;
  bullets: string[];
  planLabel: string;
  /**
   * Preço INDICATIVO — placeholder. A offering real (preço, oferta, trial da loja) vem
   * da spec #5 (RevenueCat). NÃO usar como fonte de verdade de preço.
   */
  priceHint: string;
};

// Placeholder único pra não espalhar string de preço (substituído pela offering real na #5).
const PRICE_HINT = 'a partir de R$ 15,99/mês';

const PERSONAL: PaywallContent = {
  title: 'Desbloqueie a IA pessoal',
  subtitle: 'Tenha um nutricionista e coach de IA no seu bolso.',
  bullets: [
    'Chat IA ilimitado pra tirar dúvidas de treino e dieta',
    'Sanity check: valide seu prato por foto na hora',
    'Respostas ancoradas no seu perfil e nas suas metas',
  ],
  planLabel: 'Plano Pessoal Pro',
  priceHint: PRICE_HINT,
};

const COACH: PaywallContent = {
  title: 'Desbloqueie a IA de professor',
  subtitle: 'Monte e importe treinos dos seus alunos em segundos.',
  bullets: [
    'Geração de plano completo do aluno com IA',
    'Importação de treinos por texto ou foto com IA',
    'Mais tempo pra acompanhar, menos digitação',
  ],
  planLabel: 'Plano Professor Pro',
  priceHint: PRICE_HINT,
};

const STUDENT_LIMIT: PaywallContent = {
  title: 'Adicione mais alunos',
  subtitle: 'Você atingiu o limite de alunos do seu plano atual.',
  bullets: [
    'Pro: gerencie até 5 alunos',
    'Premium: alunos ilimitados',
    'Seus alunos atuais continuam sem mudança',
  ],
  planLabel: 'Plano Professor Pro / Premium',
  priceHint: PRICE_HINT,
};

export function paywallContent(feature: string | undefined): PaywallContent {
  switch (feature) {
    case 'chat':
    case 'sanity_check':
      return PERSONAL;
    case 'coach_generate_plan':
    case 'coach_import_workout':
      return COACH;
    case 'student_limit':
      return STUDENT_LIMIT;
    default:
      // Fallback seguro: trata como upsell pessoal (caso mais comum) sem quebrar a tela.
      return PERSONAL;
  }
}

export type PlanContent = { name: string; highlight?: boolean; bullets: string[] };

/**
 * Conteúdo do CARD de um plano (nome + bullets). Preço real vem do package do
 * RevenueCat na tela — não aqui. Professor tem Pro e Premium; comum só Pro.
 */
export function planContent(tier: 'pro' | 'premium', role: Role): PlanContent {
  if (role === 'professor') {
    if (tier === 'premium') {
      return {
        name: 'Premium',
        highlight: true,
        bullets: [
          'Alunos ilimitados',
          'Tudo do Pro incluído',
          'IA de professor completa (gerar + importar treino)',
        ],
      };
    }
    return {
      name: 'Pro',
      bullets: [
        'Até 5 alunos',
        'IA de professor: gerar plano completo',
        'IA de professor: importar treino por texto ou foto',
      ],
    };
  }
  // comum só tem Pro (IA pessoal)
  return {
    name: 'Pro',
    bullets: [
      'Chat IA ilimitado pra treino e dieta',
      'Sanity check: valide seu prato por foto',
      'Respostas ancoradas no seu perfil e metas',
    ],
  };
}
