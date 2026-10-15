// Suporte e sugestões — regras puras (testáveis sem RN). Espelham as
// validações de send_support_message no banco, pra avisar antes de enviar.

export type SupportKind = 'suporte' | 'sugestao';
export type SupportStatus = 'aberta' | 'respondida' | 'resolvida';

export const SUPPORT_TITLE_MAX = 120;
export const SUPPORT_BODY_MAX = 2000;

export const SUPPORT_KIND_LABEL: Record<SupportKind, string> = {
  suporte: 'Suporte',
  sugestao: 'Sugestão',
};

export const SUPPORT_STATUS_LABEL: Record<SupportStatus, string> = {
  aberta: 'Aguardando resposta',
  respondida: 'Respondida',
  resolvida: 'Resolvida',
};

const TITLE_TOO_SHORT = 'Escreva um título com pelo menos 3 letras.';
const BODY_EMPTY = 'Conte o que aconteceu na descrição.';

export function validateSupportMessage(m: { title: string; body: string }): string | null {
  const title = m.title.trim();
  const body = m.body.trim();
  if (title.length < 3) return TITLE_TOO_SHORT;
  if (title.length > SUPPORT_TITLE_MAX) return `O título passou de ${SUPPORT_TITLE_MAX} caracteres.`;
  if (!body) return BODY_EMPTY;
  if (body.length > SUPPORT_BODY_MAX) return `A descrição passou de ${SUPPORT_BODY_MAX} caracteres.`;
  return null;
}

const ERRORS: Record<string, string> = {
  daily_limit: 'Você chegou ao limite de mensagens de hoje. Tenta de novo amanhã.',
  title_too_short: TITLE_TOO_SHORT,
  body_empty: BODY_EMPTY,
};

export function supportErrorMessage(code: string): string {
  return ERRORS[code] ?? 'Não consegui enviar agora. Tenta de novo em instantes.';
}

type ReplyState = { reply: string | null; reply_seen_at: string | null };

/** Tem resposta que a pessoa ainda não abriu. */
export function hasUnseenReply(m: ReplyState): boolean {
  return !!m.reply && !m.reply_seen_at;
}

/** Respostas que a pessoa ainda não abriu (badge no Perfil). */
export function unreadReplies(rows: ReplyState[]): number {
  return rows.filter(hasUnseenReply).length;
}
