// Conteúdo contextual do paywall por feature key (do 402 needs_upgrade do billing-core).
// Lógica pura → testável sem RN. A tela app/paywall.tsx só renderiza o resultado.

import type { Role } from '@/lib/purchaseSelection';
import { tierAtLeast } from './tier';
import { storeKind } from './store';

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
    'Chat IA pra tirar dúvidas de treino e dieta',
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
    'Pro: até 5 alunos',
    'Premium: até 20 alunos',
    'Elite: até 50 alunos',
    'Seus alunos atuais continuam sem mudança',
  ],
  planLabel: 'Plano Professor Pro / Premium / Elite',
  priceHint: PRICE_HINT,
};

/** Upgrade voluntário (origin 'upgrade'): mesmo paywall, sem a mensagem de limite atingido. */
const STUDENT_LIMIT_UPGRADE: PaywallContent = {
  ...STUDENT_LIMIT,
  subtitle: 'Acompanhe mais alunos com um plano maior.',
};

const COACH_DISCOVERY: PaywallContent = {
  title: 'Encontre um professor',
  subtitle: 'Busque professores no app e peça para ser acompanhado.',
  bullets: [
    'Busca de professores dentro do app',
    'Tudo do Pro incluído',
    '20 mensagens e 15 análises de prato por dia',
  ],
  planLabel: 'Plano Pessoal Premium',
  priceHint: PRICE_HINT,
};

/** 'upgrade' = o usuário abriu o paywall por conta própria (não bateu no limite). */
export type PaywallOrigin = 'upgrade';

/** Feature key do atalho de upgrade do professor: pro+ esbarra em alunos, os demais em IA. */
export function coachUpgradeFeature(tier: string): 'student_limit' | 'coach_generate_plan' {
  return tierAtLeast(tier, 'pro') ? 'student_limit' : 'coach_generate_plan';
}

export function paywallContent(
  feature: string | undefined,
  origin?: PaywallOrigin,
): PaywallContent {
  switch (feature) {
    case 'chat':
    case 'sanity_check':
      return PERSONAL;
    case 'coach_generate_plan':
    case 'coach_import_workout':
      return COACH;
    case 'student_limit':
      return origin === 'upgrade' ? STUDENT_LIMIT_UPGRADE : STUDENT_LIMIT;
    case 'coach_discovery':
      return COACH_DISCOVERY;
    default:
      // Fallback seguro: trata como upsell pessoal (caso mais comum) sem quebrar a tela.
      return PERSONAL;
  }
}

export type PlanContent = { name: string; bullets: string[] };

/**
 * Conteúdo do CARD de um plano (nome + bullets). Preço real vem do package do
 * RevenueCat na tela, e o "Recomendado" vem de selectProductId — não daqui.
 */
export function planContent(tier: 'pro' | 'premium' | 'elite', role: Role): PlanContent {
  if (role === 'professor') {
    if (tier === 'elite') {
      return { name: 'Elite', bullets: ['Até 50 alunos', 'Tudo do Premium'] };
    }
    if (tier === 'premium') {
      return {
        name: 'Premium',
        bullets: [
          'Até 20 alunos',
          'Tudo do Pro',
          'Apareça na busca de professores',
          'Crie exercícios próprios',
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
  // comum (IA pessoal)
  if (tier === 'premium' || tier === 'elite') {
    return {
      name: 'Premium',
      bullets: [
        'Tudo do Pro',
        'Encontre um professor no app',
        '20 mensagens e 15 análises de prato por dia',
      ],
    };
  }
  return {
    name: 'Pro',
    bullets: [
      '10 mensagens e 8 análises de prato por dia',
      'Análise de prato por foto',
      'Respostas ancoradas no seu perfil e metas',
    ],
  };
}

/**
 * Texto de renovação automática exigido pela diretriz 3.1.2 da Apple (e equivalente na Play).
 * Recebe `Platform.OS`; tudo que não é 'ios' usa o texto Google.
 */
export function renewalNotice(os: string): string {
  if (storeKind(os) === 'apple') {
    return 'Assinatura mensal com renovação automática. A cobrança é feita na sua conta Apple ao confirmar a compra, e a assinatura renova sozinha, salvo se for cancelada até 24 horas antes do fim do período. Gerencie ou cancele em Ajustes > seu nome > Assinaturas.';
  }
  return 'Assinatura mensal com renovação automática. A cobrança é feita na sua conta Google Play, e a assinatura renova sozinha até você cancelar. Gerencie ou cancele na Play Store, em Pagamentos e assinaturas.';
}

export const TERMS_FALLBACK_URL = 'https://apppersonafit.vercel.app/legal/termos-de-uso';
export const PRIVACY_FALLBACK_URL = 'https://apppersonafit.vercel.app/legal/privacidade';

/** URLs dos links legais do paywall; sem URL do catálogo (carregando/offline), usa o hotsite. */
export function legalLinks(urls: { termos_uso?: string | null; privacidade?: string | null }): {
  termos: string;
  privacidade: string;
} {
  return {
    termos: urls.termos_uso || TERMS_FALLBACK_URL,
    privacidade: urls.privacidade || PRIVACY_FALLBACK_URL,
  };
}
