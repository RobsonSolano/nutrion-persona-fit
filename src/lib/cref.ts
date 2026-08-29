// Validação do registro CREF — fonte única de verdade, usada no cadastro de
// professor e na edição do perfil do coach. Espelhada em
// supabase/functions/_shared/cref.ts (o servidor não confia no cliente).
//
// O QUE ISSO É: validação ESTRUTURAL. Formato oficial do registro profissional
// (Resolução CONFEF): 6 dígitos, hífen, categoria, barra, UF —
// ex. `CREF 012345-G/SP`. `G` = graduado, `P` = provisionado.
//
// O QUE ISSO NÃO É: prova de que o registro existe. Não há API pública de
// consulta — o CONFEF só expõe busca web e cada regional tem seu portal
// próprio (verificado em 2026-08-29). Um número bem formado e inventado passa
// aqui. A rejeição de números degenerados (repetidos/sequenciais) reduz o lixo
// óbvio, não a fraude deliberada. Validação de fato exige revisão humana contra
// o portal do regional — próximo passo registrado no STATE.md.

const UFS = [
  'AC', 'AL', 'AP', 'AM', 'BA', 'CE', 'DF', 'ES', 'GO', 'MA', 'MT', 'MS',
  'MG', 'PA', 'PB', 'PR', 'PE', 'PI', 'RJ', 'RN', 'RS', 'RO', 'RR', 'SC',
  'SP', 'SE', 'TO',
] as const;

/** Categorias do registro: G = graduado, P = provisionado. */
const CATEGORIAS = ['G', 'P'] as const;

export const CREF_EXAMPLE = '045821-G/SP';

export type CrefValidation =
  | { ok: true; value: string; reason?: never }
  | { ok: false; value?: never; reason: string };

/**
 * Põe o registro na forma canônica `NNNNNN-C/UF`. Tolera o que o professor
 * digita de verdade: prefixo "CREF", espaços no meio, caixa baixa, e número
 * sem os zeros à esquerda. Entrada irreconhecível volta só aparada — quem
 * decide se presta é o validateCref.
 */
export function normalizeCref(raw: string): string {
  const trimmed = raw.trim();
  const compact = trimmed.replace(/\s+/g, '').replace(/^cref/i, '');
  const m = compact.match(/^(\d{1,6})-?([A-Za-z])\/?([A-Za-z]{2})$/);
  if (!m) return trimmed;
  const [, digits, categoria, uf] = m;
  return `${digits.padStart(6, '0')}-${categoria.toUpperCase()}/${uf.toUpperCase()}`;
}

/** Todos os dígitos iguais (`111111`) — não existe registro assim. */
function isRepeated(digits: string): boolean {
  return new Set(digits).size === 1;
}

/** Sequência estrita crescente ou decrescente (`123456`, `654321`). */
function isSequential(digits: string): boolean {
  let up = true;
  let down = true;
  for (let i = 1; i < digits.length; i++) {
    const delta = Number(digits[i]) - Number(digits[i - 1]);
    if (delta !== 1) up = false;
    if (delta !== -1) down = false;
  }
  return up || down;
}

/**
 * O campo de credencial aceita CREF (educação física) ou CRN (nutrição) desde
 * o cadastro original de professor — validar só CREF barraria nutricionista.
 *
 * CRN: `CRN-<região>/<número>`, região de 1 a 11, com sufixo opcional `/P`
 * (provisória) ou `/S` (secundária). O tamanho do número varia por regional
 * (4 a 6 dígitos na prática), então só o intervalo é exigido.
 */
const CRN_REGIOES_MAX = 11;

function normalizeCrn(raw: string): string | null {
  const compact = raw.trim().replace(/\s+/g, '').toUpperCase();
  const m = compact.match(/^CRN-?(\d{1,2})\/?(\d{4,6})(?:\/([PS]))?$/);
  if (!m) return null;
  const [, regiao, numero, sufixo] = m;
  return `CRN-${Number(regiao)}/${numero}${sufixo ? `/${sufixo}` : ''}`;
}

export type CredentialKind = 'cref' | 'crn';

export type CredentialValidation =
  | { ok: true; value: string; kind: CredentialKind; reason?: never }
  | { ok: false; kind?: CredentialKind; value?: never; reason: string };

export function validateCredential(raw: string): CredentialValidation {
  const trimmed = raw.trim();
  if (!trimmed) {
    return {
      ok: false,
      reason: `Informe seu CREF ou CRN (ex: ${CREF_EXAMPLE}).`,
    };
  }

  if (/^crn/i.test(trimmed)) {
    const value = normalizeCrn(trimmed);
    if (!value) {
      return {
        ok: false,
        kind: 'crn',
        reason: 'CRN em formato inválido. Use o formato CRN-3/45821.',
      };
    }
    const [, regiao, numero] = value.match(/^CRN-(\d{1,2})\/(\d{4,6})/)!;
    if (Number(regiao) < 1 || Number(regiao) > CRN_REGIOES_MAX) {
      return {
        ok: false,
        kind: 'crn',
        reason: `Região do CRN inválida: use de 1 a ${CRN_REGIOES_MAX}.`,
      };
    }
    if (isRepeated(numero) || isSequential(numero)) {
      return {
        ok: false,
        kind: 'crn',
        reason: 'Número de CRN inválido. Confira sua carteira.',
      };
    }
    return { ok: true, value, kind: 'crn' };
  }

  const cref = validateCref(trimmed);
  if (!cref.ok) return { ...cref, kind: 'cref' };
  return { ok: true, value: cref.value, kind: 'cref' };
}

export function validateCref(raw: string): CrefValidation {
  const value = normalizeCref(raw);
  if (!value) {
    return { ok: false, reason: `Informe seu CREF (ex: ${CREF_EXAMPLE}).` };
  }

  const m = value.match(/^(\d{6})-([A-Z])\/([A-Z]{2})$/);
  if (!m) {
    return {
      ok: false,
      reason: `CREF em formato inválido. Use o formato ${CREF_EXAMPLE}.`,
    };
  }

  const [, digits, categoria, uf] = m;

  if (!CATEGORIAS.includes(categoria as (typeof CATEGORIAS)[number])) {
    return {
      ok: false,
      reason: `Categoria inválida: use G (graduado) ou P (provisionado). Ex: ${CREF_EXAMPLE}.`,
    };
  }
  if (!UFS.includes(uf as (typeof UFS)[number])) {
    return { ok: false, reason: `UF inválida no CREF: "${uf}".` };
  }
  if (isRepeated(digits)) {
    return {
      ok: false,
      reason: 'Número de CREF inválido (dígitos repetidos). Confira sua carteira.',
    };
  }
  if (isSequential(digits)) {
    return {
      ok: false,
      reason: 'Número de CREF inválido (sequência). Confira sua carteira.',
    };
  }

  return { ok: true, value };
}
