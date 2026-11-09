// Aviso "recursos de IA temporariamente gratuitos" (perfil e chat). Só faz sentido para
// quem não tem plano pago: quem é pro ou acima já paga e tem a cota do plano.
import { tierAtLeast } from './tier';
import type { AiQuota } from './aiQuota';

/** Sem entitlement resolvido (tier undefined) não mostra, para o aviso não piscar. */
export function showTemporaryFreeNotice(tier: string | null | undefined): boolean {
  return tier != null && !tierAtLeast(tier, 'pro');
}

const FREE_NOTICE_HIGHLIGHT = 'temporariamente gratuitos';

export type AiFreeNoticeText = { before: string; highlight: string; after: string };

/** Texto do card do perfil, em partes (o trecho em destaque vai em outro estilo). */
export function aiFreeNoticeText(p: {
  quota: AiQuota;
  maxChars: number;
  earlyAdopter: boolean;
}): AiFreeNoticeText {
  const tail = p.earlyAdopter
    ? ' Como early adopter, você continua com acesso quando virarem premium.'
    : ' Aproveita enquanto está aberto.';
  return {
    before: `Chat (${p.quota.chat}/dia · ${p.maxChars} caracteres), Análise de prato (${p.quota.sanity}/dia) e onboarding inteligente são `,
    highlight: FREE_NOTICE_HIGHLIGHT,
    after: `.${tail}`,
  };
}
